const { execSync } = require('child_process');
const sql = require('mssql');
const medallion = require('../metadata/medallion-catalog');

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) {
    console.log('[token] Using cached token');
    return cachedToken;
  }

  try {
    console.log('[token] Fetching fresh token via az CLI...');
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    cachedToken = token;
    tokenExpiry = now + 55 * 60 * 1000; // 55 minutes
    console.log('[token] Got fresh token, expires in ~55min');
    return token;
  } catch (err) {
    console.error('[token] Failed to get token:', err.message);
    throw new Error(`Failed to authenticate: ${err.message}. Make sure 'az login' has been run.`);
  }
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: token
      }
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectionTimeout: 30000
    }
  });

  try {
    await conn.connect();
    const result = await conn.request().query(query);
    return result.recordset;
  } finally {
    await conn.close();
  }
}

async function lakelzouseStatus(req, res) {
  try {
    const countQuery = `
SELECT
    'Bronze' AS layer,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE 'bronze_%') AS count,
    (SELECT SUM(CAST(p.rows AS BIGINT)) FROM sys.partitions p WHERE p.index_id IN (0, 1)) AS totalRows

UNION ALL

SELECT
    'Silver' AS layer,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_silver_%') AS count,
    NULL AS totalRows

UNION ALL

SELECT
    'Gold' AS layer,
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_gold_%') AS count,
    NULL AS totalRows
    `;

    const rows = await queryLakehouse(countQuery);

    // Get actual Gold view names from database to filter catalog
    const goldViewQuery = `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_gold_%' ORDER BY TABLE_NAME`;
    const actualGoldViews = await queryLakehouse(goldViewQuery);
    const actualGoldViewNames = new Set(actualGoldViews.map(v => v.TABLE_NAME));

    // Get live timestamps and load counts from bronze tables (skip bronze_pb_relationships_raw which lacks the column)
    const bronzeMetadataQuery = `
SELECT
    TABLE_NAME as name,
    MAX(CAST(_bronze_ingestion_timestamp AS VARCHAR(19))) as lastRefresh,
    COUNT(DISTINCT _bronze_ingestion_timestamp) as loadCount
FROM (
    SELECT 'bronze_pb_companies' as TABLE_NAME, _bronze_ingestion_timestamp FROM dbo.bronze_pb_companies UNION ALL
    SELECT 'bronze_pb_components', _bronze_ingestion_timestamp FROM dbo.bronze_pb_components UNION ALL
    SELECT 'bronze_pb_entities', _bronze_ingestion_timestamp FROM dbo.bronze_pb_entities UNION ALL
    SELECT 'bronze_pb_entity_fields_config', _bronze_ingestion_timestamp FROM dbo.bronze_pb_entity_fields_config UNION ALL
    SELECT 'bronze_pb_features', _bronze_ingestion_timestamp FROM dbo.bronze_pb_features UNION ALL
    SELECT 'bronze_pb_initiatives', _bronze_ingestion_timestamp FROM dbo.bronze_pb_initiatives UNION ALL
    SELECT 'bronze_pb_key_results', _bronze_ingestion_timestamp FROM dbo.bronze_pb_key_results UNION ALL
    SELECT 'bronze_pb_notes', _bronze_ingestion_timestamp FROM dbo.bronze_pb_notes UNION ALL
    SELECT 'bronze_pb_objectives', _bronze_ingestion_timestamp FROM dbo.bronze_pb_objectives UNION ALL
    SELECT 'bronze_pb_products', _bronze_ingestion_timestamp FROM dbo.bronze_pb_products UNION ALL
    SELECT 'bronze_pb_release_groups', _bronze_ingestion_timestamp FROM dbo.bronze_pb_release_groups UNION ALL
    SELECT 'bronze_pb_releases', _bronze_ingestion_timestamp FROM dbo.bronze_pb_releases UNION ALL
    SELECT 'bronze_pb_subfeatures', _bronze_ingestion_timestamp FROM dbo.bronze_pb_subfeatures UNION ALL
    SELECT 'bronze_pb_users', _bronze_ingestion_timestamp FROM dbo.bronze_pb_users UNION ALL
    SELECT 'bronze_sfapi_account', _bronze_ingestion_timestamp FROM dbo.bronze_sfapi_account UNION ALL
    SELECT 'bronze_sfapi_opportunity', _bronze_ingestion_timestamp FROM dbo.bronze_sfapi_opportunity UNION ALL
    SELECT 'bronze_sfapi_opportunitylineitem', _bronze_ingestion_timestamp FROM dbo.bronze_sfapi_opportunitylineitem UNION ALL
    SELECT 'bronze_sfapi_product2', _bronze_ingestion_timestamp FROM dbo.bronze_sfapi_product2 UNION ALL
    SELECT 'bronze_sfapi_subscripton__c', _bronze_ingestion_timestamp FROM dbo.bronze_sfapi_subscripton__c
) AS src
GROUP BY TABLE_NAME
    `;

    const bronzeMetadata = await queryLakehouse(bronzeMetadataQuery);

    // Merge live timestamps and load counts with metadata
    const tablesWithMetadata = medallion.bronze.tables.map(t => {
      const meta = bronzeMetadata.find(m => m.name === t.name);
      return {
        ...t,
        lastRefresh: meta ? meta.lastRefresh : t.lastRefresh || 'Unknown',
        rowCount: meta ? meta.loadCount : 0
      };
    });

    const bronzeData = rows.find(r => r.layer === 'Bronze') || { layer: 'Bronze', count: 0, totalRows: 0 };
    const silverData = rows.find(r => r.layer === 'Silver') || { layer: 'Silver', count: 0, totalRows: null };
    const goldData = rows.find(r => r.layer === 'Gold') || { layer: 'Gold', count: 0, totalRows: null };

    const status = {
      bronze: {
        ...bronzeData,
        label: medallion.bronze.label,
        description: medallion.bronze.description,
        tables: tablesWithMetadata
      },
      silver: {
        ...silverData,
        label: medallion.silver.label,
        description: medallion.silver.description,
        status: medallion.silver.status,
        views: medallion.silver.views
      },
      gold: {
        ...goldData,
        label: medallion.gold.label,
        description: medallion.gold.description,
        status: medallion.gold.status,
        views: medallion.gold.views.filter(v => actualGoldViewNames.has(v.name))
      },
      lastUpdated: new Date().toISOString()
    };

    res.json(status);
  } catch (err) {
    console.error('[lakehouse-status]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = lakelzouseStatus;
