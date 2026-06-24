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
    const query = `
SELECT
    feature_id AS featureId,
    feature_name AS featureName,
    product_name AS productName,
    efficiency_label AS criticalityLabel,
    efficiency_impact AS efficiencyImpact,
    prioritization_score AS prioritizationScore,
    priority_rank AS priorityRank,
    strategic_region_count AS strategicRegionCount
FROM dbo.v_gold_pb_feature_prioritization_final
ORDER BY prioritization_score DESC
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
