const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

const resultCache = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour — match status changes infrequently

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) return cachedToken;
  const token = execSync(
    'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  cachedToken = token;
  tokenExpiry = now + 55 * 60 * 1000;
  return token;
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    requestTimeout: 60000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false }
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

async function accountMatches(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const escaped = account.replace(/'/g, "''");
    const rows = await queryLakehouse(`
      SELECT TOP 1
        mdm.has_zd_org,
        mdm.has_pb_company,
        CASE WHEN EXISTS (
          SELECT 1 FROM dbo.v_silver_posthog_account_activity ph
          WHERE ph.ph_tenant = mdm.sf_website_domain
             OR (mdm.sf_eos_access_domains   IS NOT NULL AND ';'+mdm.sf_eos_access_domains+';'   LIKE '%;'+ph.ph_tenant+';%')
             OR (mdm.sf_eos_access_domains_2 IS NOT NULL AND ';'+mdm.sf_eos_access_domains_2+';' LIKE '%;'+ph.ph_tenant+';%')
             OR (ph.ph_tenant_format = 'short_code' AND ph.ph_tenant = LOWER(mdm.sf_account_code))
        ) THEN 1 ELSE 0 END AS has_ph
      FROM dbo.v_silver_mdm_account mdm
      WHERE mdm.sf_account_name = '${escaped}'
    `);

    const r = rows[0];
    const payload = r
      ? { hasZd: !!r.has_zd_org, hasPb: !!r.has_pb_company, hasPh: !!r.has_ph }
      : { hasZd: false, hasPb: false, hasPh: false };

    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[account-matches]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = accountMatches;
