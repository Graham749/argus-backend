const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

let cachedResult = null;
let cacheTs = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour — account list changes infrequently

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) return cachedToken;
  try {
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();
    cachedToken = token;
    tokenExpiry = now + 55 * 60 * 1000;
    return token;
  } catch (err) {
    console.error('[accounts-list] Failed to get token:', err.message);
    throw new Error(`Failed to authenticate: ${err.message}`);
  }
}

async function queryFabric(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    database: 'LH_ProdOps_Dev',
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    requestTimeout: 120000,
    options: { encrypt: true, trustServerCertificate: false, connectionTimeout: 30000 }
  });
  try {
    await conn.connect();
    const result = await conn.request().query(query);
    return result.recordset;
  } catch (err) {
    if (err.message && (err.message.includes('Could not login') || err.message.includes('token'))) {
      cachedToken = null; tokenExpiry = null;
    }
    throw err;
  } finally {
    await conn.close();
  }
}

async function getAccountsList(req, res) {
  try {
    if (cachedResult && cacheTs && Date.now() - cacheTs < CACHE_TTL) {
      return res.json(cachedResult);
    }

    const results = await queryFabric(`
      SELECT DISTINCT ca.account_name
      FROM [dbo].[v_silver_sf_subscriptions] s
      INNER JOIN [dbo].[v_silver_sf_customer_accounts] ca ON s.account_id = ca.account_id
      WHERE ca.parent_account_id IS NULL
        AND s.account_name IS NOT NULL
      ORDER BY ca.account_name ASC
    `);

    const payload = { accounts: results.map(r => ({ name: r.account_name, value: r.account_name })) };
    cachedResult = payload;
    cacheTs = Date.now();
    res.json(payload);
  } catch (err) {
    console.error('[accounts-list]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getAccountsList;
