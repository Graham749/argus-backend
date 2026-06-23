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

async function lakelzouseStatus(req, res) {
  try {
    const query = `
SELECT
    'Bronze' AS layer,
    COUNT(DISTINCT TABLE_NAME) AS count,
    SUM(CAST(ISNULL(p.rows, 0) AS BIGINT)) AS totalRows
FROM INFORMATION_SCHEMA.TABLES t
LEFT JOIN sys.partitions p ON OBJECT_NAME(p.object_id) = t.TABLE_NAME
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE'

UNION ALL

SELECT
    'Silver' AS layer,
    COUNT(*) AS count,
    NULL AS totalRows
FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_silver_%'

UNION ALL

SELECT
    'Gold' AS layer,
    COUNT(*) AS count,
    NULL AS totalRows
FROM INFORMATION_SCHEMA.VIEWS
WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_gold_%'
    `;

    const rows = await queryLakehouse(query);

    const status = {
      bronze: rows.find(r => r.layer === 'Bronze') || { layer: 'Bronze', count: 0, totalRows: 0 },
      silver: rows.find(r => r.layer === 'Silver') || { layer: 'Silver', count: 0, totalRows: null },
      gold: rows.find(r => r.layer === 'Gold') || { layer: 'Gold', count: 0, totalRows: null },
      lastUpdated: new Date().toISOString()
    };

    res.json(status);
  } catch (err) {
    console.error('[lakehouse-status]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = lakelzouseStatus;
