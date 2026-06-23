const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) {
    return cachedToken;
  }

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
    authentication: {
      type: 'azure-active-directory-access-token',
      options: { token: token }
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

async function getAccountsList(req, res) {
  try {
    const query = `
      SELECT DISTINCT account_name
      FROM [dbo].[v_silver_sf_subscriptions]
      WHERE account_name IS NOT NULL
      ORDER BY account_name ASC
    `;

    const results = await queryFabric(query);
    const accounts = results.map(r => ({
      name: r.account_name,
      value: r.account_name
    }));

    res.json({ accounts });
  } catch (err) {
    console.error('[accounts-list]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getAccountsList;
