const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000;

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
    requestTimeout: 120000,
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

const MDM_JOIN = `
  ph.ph_tenant = mdm.sf_website_domain
  OR (mdm.sf_eos_access_domains IS NOT NULL AND ';'+mdm.sf_eos_access_domains+';' LIKE '%;'+ph.ph_tenant+';%')
  OR (mdm.sf_eos_access_domains_2 IS NOT NULL AND ';'+mdm.sf_eos_access_domains_2+';' LIKE '%;'+ph.ph_tenant+';%')
  OR (ph.ph_tenant_format = 'short_code' AND ph.ph_tenant = LOWER(mdm.sf_account_code))
`;

async function phUsers(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const escaped = account.replace(/'/g, "''");

    const rows = await queryLakehouse(`
      WITH tenants AS (
        SELECT ph.ph_tenant
        FROM dbo.v_silver_posthog_account_activity ph
        INNER JOIN dbo.v_silver_mdm_account mdm ON (${MDM_JOIN})
        WHERE mdm.sf_account_name = '${escaped}'
      )
      SELECT TOP 200
        e.person_id,
        MAX(e.person_name)                                                              AS person_name,
        COUNT(*)                                                                        AS total_events,
        CAST(MAX(e.timestamp) AS DATE)                                                  AS last_seen,
        SUM(CASE WHEN e.feature = 'investment-cases'                               THEN 1 ELSE 0 END) AS investment_cases,
        SUM(CASE WHEN e.feature = 'leaderboards'                                   THEN 1 ELSE 0 END) AS leaderboards,
        SUM(CASE WHEN e.feature = 'benchmarks'                                     THEN 1 ELSE 0 END) AS benchmarks,
        SUM(CASE WHEN e.feature IS NULL OR e.feature NOT IN ('investment-cases','leaderboards','benchmarks') THEN 1 ELSE 0 END) AS untagged
      FROM dbo.posthog_notebook_events e
      INNER JOIN tenants t ON LOWER(LTRIM(RTRIM(e.tenant))) = t.ph_tenant
      WHERE e.person_id IS NOT NULL
      GROUP BY e.person_id
      ORDER BY total_events DESC
    `);

    const users = (rows || []).map(r => ({
      personId:        r.person_id || '',
      personName:      r.person_name || '',
      totalEvents:     Number(r.total_events)     || 0,
      lastSeen:        r.last_seen ? new Date(r.last_seen).toISOString().slice(0, 10) : null,
      investmentCases: Number(r.investment_cases) || 0,
      leaderboards:    Number(r.leaderboards)     || 0,
      benchmarks:      Number(r.benchmarks)       || 0,
      untagged:        Number(r.untagged)         || 0,
    }));

    const payload = { account, users };
    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[ph-users]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = phUsers;
