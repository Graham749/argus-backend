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

// MDM join condition shared between both queries
const MDM_JOIN = `
  ph.ph_tenant = mdm.sf_website_domain
  OR (mdm.sf_eos_access_domains IS NOT NULL AND ';'+mdm.sf_eos_access_domains+';' LIKE '%;'+ph.ph_tenant+';%')
  OR (mdm.sf_eos_access_domains_2 IS NOT NULL AND ';'+mdm.sf_eos_access_domains_2+';' LIKE '%;'+ph.ph_tenant+';%')
  OR (ph.ph_tenant_format = 'short_code' AND ph.ph_tenant = LOWER(mdm.sf_account_code))
`;

async function phTrends(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const escaped = account.replace(/'/g, "''");

    const [summaryRows, weeklyRows] = await Promise.all([
      // Summary — one row per matched tenant, aggregated in JS
      queryLakehouse(`
        SELECT
          ph.ph_tenant,
          ph.ph_total_events,
          ph.ph_unique_users,
          ph.ph_first_seen,
          ph.ph_last_seen,
          ph.ph_events_last_30d,
          ph.ph_events_last_7d,
          ph.ph_investment_cases,
          ph.ph_leaderboards,
          ph.ph_benchmarks,
          CASE
            WHEN ph.ph_tenant_format = 'short_code' THEN 'Account Code'
            WHEN ph.ph_tenant = mdm.sf_website_domain THEN 'Website Domain'
            ELSE 'EOS Domain'
          END AS match_method
        FROM dbo.v_silver_posthog_account_activity ph
        INNER JOIN dbo.v_silver_mdm_account mdm ON (${MDM_JOIN})
        WHERE mdm.sf_account_name = '${escaped}'
      `),
      // Weekly trend — from raw events table, grouped by ISO Monday
      // '2000-01-03' is a known Monday; DATEDIFF/7*7 integer arithmetic gives week offset
      queryLakehouse(`
        WITH tenants AS (
          SELECT ph.ph_tenant
          FROM dbo.v_silver_posthog_account_activity ph
          INNER JOIN dbo.v_silver_mdm_account mdm ON (${MDM_JOIN})
          WHERE mdm.sf_account_name = '${escaped}'
        )
        SELECT
          CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE) AS week_start,
          COUNT(*)                                                                               AS events,
          COUNT(DISTINCT e.person_id)                                                            AS users,
          SUM(CASE WHEN e.feature = 'investment-cases' THEN 1 ELSE 0 END)                       AS investment_cases,
          SUM(CASE WHEN e.feature = 'leaderboards'     THEN 1 ELSE 0 END)                       AS leaderboards,
          SUM(CASE WHEN e.feature = 'benchmarks'       THEN 1 ELSE 0 END)                       AS benchmarks
        FROM dbo.posthog_notebook_events e
        INNER JOIN tenants t ON LOWER(LTRIM(RTRIM(e.tenant))) = t.ph_tenant
        WHERE e.timestamp IS NOT NULL
        GROUP BY CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE)
        ORDER BY week_start
      `)
    ]);

    if (!summaryRows || summaryRows.length === 0) {
      return res.json({ tenants: [], summary: null, weekly: [] });
    }

    const tenants     = summaryRows.map(r => r.ph_tenant);
    const matchMethod = summaryRows[0].match_method;

    const totalEvents    = summaryRows.reduce((s, r) => s + (Number(r.ph_total_events)    || 0), 0);
    const uniqueUsers    = summaryRows.reduce((s, r) => s + (Number(r.ph_unique_users)    || 0), 0);
    const events30d      = summaryRows.reduce((s, r) => s + (Number(r.ph_events_last_30d) || 0), 0);
    const events7d       = summaryRows.reduce((s, r) => s + (Number(r.ph_events_last_7d)  || 0), 0);
    const investmentCases= summaryRows.reduce((s, r) => s + (Number(r.ph_investment_cases)|| 0), 0);
    const leaderboards   = summaryRows.reduce((s, r) => s + (Number(r.ph_leaderboards)    || 0), 0);
    const benchmarks     = summaryRows.reduce((s, r) => s + (Number(r.ph_benchmarks)      || 0), 0);

    const firstDates = summaryRows.map(r => r.ph_first_seen).filter(Boolean).sort();
    const lastDates  = summaryRows.map(r => r.ph_last_seen).filter(Boolean).sort();
    const firstSeen  = firstDates.length ? new Date(firstDates[0]).toISOString().slice(0, 10) : null;
    const lastSeen   = lastDates.length  ? new Date(lastDates[lastDates.length - 1]).toISOString().slice(0, 10) : null;

    const weekly = (weeklyRows || []).map(r => ({
      weekStart:       r.week_start ? new Date(r.week_start).toISOString().slice(0, 10) : null,
      events:          Number(r.events)           || 0,
      users:           Number(r.users)            || 0,
      investmentCases: Number(r.investment_cases) || 0,
      leaderboards:    Number(r.leaderboards)     || 0,
      benchmarks:      Number(r.benchmarks)       || 0,
    }));

    const payload = {
      tenants,
      matchMethod,
      summary: { totalEvents, uniqueUsers, events30d, events7d, firstSeen, lastSeen, investmentCases, leaderboards, benchmarks },
      weekly,
    };

    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[ph-trends]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = phTrends;
