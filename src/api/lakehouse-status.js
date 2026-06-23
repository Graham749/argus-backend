const { execSync } = require('child_process');
const sql = require('mssql');

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
    tokenExpiry = now + 55 * 60 * 1000;
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
      options: { token }
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

function getSourceFromName(name) {
  if (name.includes('_sf')) return 'Salesforce';
  if (name.includes('_pb')) return 'Productboard';
  if (name.includes('_lookup')) return 'Product Operations';
  return 'Unknown';
}

async function lakelzouseStatus(req, res) {
  try {
    // Count all bronze tables
    const bronzeQuery = `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'`;
    const bronzeCount = await queryLakehouse(bronzeQuery);

    // Get all silver views with source derived from naming convention
    const silverQuery = `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_silver_%' ORDER BY TABLE_NAME`;
    const silverViews = await queryLakehouse(silverQuery);

    // Get all gold views with source derived from naming convention
    const goldQuery = `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_gold_%' ORDER BY TABLE_NAME`;
    const goldViews = await queryLakehouse(goldQuery);

    // Get bronze table details
    const bronzeDetailsQuery = `SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`;
    const bronzeDetails = await queryLakehouse(bronzeDetailsQuery);

    // Build views with source from naming convention
    const silverViewsWithSource = silverViews.map(v => ({
      name: v.TABLE_NAME,
      source: getSourceFromName(v.TABLE_NAME),
      purpose: `${v.TABLE_NAME} transformation view`
    }));

    const goldViewsWithSource = goldViews.map(v => ({
      name: v.TABLE_NAME,
      source: getSourceFromName(v.TABLE_NAME),
      purpose: `${v.TABLE_NAME} analytical view`
    }));

    const bronzeTablesWithSource = bronzeDetails.map(b => ({
      name: b.name,
      source: getSourceFromName(b.name)
    }));

    // Calculate counts by source
    const silverBySource = {};
    const goldBySource = {};
    const bronzeBySource = {};

    silverViewsWithSource.forEach(v => {
      silverBySource[v.source] = (silverBySource[v.source] || 0) + 1;
    });

    goldViewsWithSource.forEach(v => {
      goldBySource[v.source] = (goldBySource[v.source] || 0) + 1;
    });

    bronzeTablesWithSource.forEach(b => {
      bronzeBySource[b.source] = (bronzeBySource[b.source] || 0) + 1;
    });

    const status = {
      bronze: {
        layer: 'Bronze',
        count: bronzeCount[0].count,
        totalRows: null,
        countBySource: bronzeBySource,
        label: 'Bronze Layer',
        description: 'Raw data tables landed by data team. Source of truth, minimal transformation.',
        tables: bronzeTablesWithSource
      },
      silver: {
        layer: 'Silver',
        count: silverViews.length,
        totalRows: null,
        countBySource: silverBySource,
        label: 'Silver Layer',
        description: 'PoC transformation views. Data validation and business logic.',
        status: 'proof-of-concept',
        views: silverViewsWithSource
      },
      gold: {
        layer: 'Gold',
        count: goldViews.length,
        totalRows: null,
        countBySource: goldBySource,
        label: 'Gold Layer',
        description: 'Materialized analytical tables and views.',
        status: 'production-ready',
        views: goldViewsWithSource
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
