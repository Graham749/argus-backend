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

async function features(req, res) {
  try {
    // TODO: Join with product name once data team provides bronze_pb_entity_fields_config
    const query = `
SELECT
    feature_id AS featureId,
    feature_name AS featureName,
    criticality,
    criticality_score AS criticalityScore,
    efficiency,
    efficiency_score AS efficiencyScore,
    rank_score AS rankScore,
    regional_priority AS regionalPriority,
    strategic_region_score AS strategicRegionScore,
    region_market_count AS regionMarketCount,
    region_factor AS regionFactor,
    subfeature_count AS subfeatureCount,
    max_subfeature_priority_score AS maxSubfeaturePriorityScore,
    score_source AS scoreSource,
    -- Compute final priority score (matches Argus frontend formula)
    GREATEST(
      (rank_score * 0.5 + criticality_score * 0.2 + efficiency_score * 0.2 + strategic_region_score * 0.1),
      ISNULL(max_subfeature_priority_score, 0)
    ) AS finalPriorityScore
FROM dbo.v_gold_pb_feature_prioritization_final
ORDER BY finalPriorityScore DESC
    `;

    const rows = await queryLakehouse(query);

    res.json({
      features: rows,
      syncedAt: new Date().toISOString(),
      rowCount: rows.length
    });
  } catch (err) {
    console.error('[features]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = features;
