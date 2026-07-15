const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry  = null;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) return cachedToken;
  const token = execSync(
    'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  cachedToken = token;
  tokenExpiry  = now + 55 * 60 * 1000;
  return token;
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn  = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    requestTimeout: 120000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false }
  });
  await conn.connect();
  const result = await conn.request().query(query);
  await conn.close();
  return result.recordset;
}

module.exports = async function phRegions(req, res) {
  const account  = req.query.account;
  const personId = req.query.personId || null;
  if (!account) return res.status(400).json({ error: 'account param required' });

  try {
    const personFilter = personId
      ? `AND e.person_id = '${personId.replace(/'/g, "''")}'`
      : '';

    const rows = await queryLakehouse(`
      SELECT
        e.region,
        COALESCE(e.feature, 'other') AS feature,
        COUNT(*)                     AS runs
      FROM dbo.posthog_notebook_events e
      INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
      WHERE g.sf_account_name = '${account.replace(/'/g, "''")}'
        AND e.region IS NOT NULL AND e.region != ''
        ${personFilter}
      GROUP BY e.region, e.feature
      ORDER BY runs DESC
    `);

    res.json(rows.map(r => ({
      region:  r.region,
      feature: r.feature,
      runs:    Number(r.runs) || 0,
    })));
  } catch (err) {
    console.error('[ph-regions]', err.message);
    res.status(500).json({ error: err.message });
  }
};
