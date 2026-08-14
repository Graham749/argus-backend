const { query, cacheGet, cacheSet } = require('../lib/db');
const { getMdmRow } = require('../lib/mdm-cache');

const resultCache = {};
const CACHE_TTL   = 10 * 60 * 1000;
const MDM_TTL     = 10 * 60 * 1000;

// Build lowercase domain set from MDM row, splitting semicolon-separated EOS lists in JS.
// Avoids cross-view OR+LIKE joins that mssql npm evaluates incorrectly vs System.Data.SqlClient.
function buildDomainSet(mdm) {
  const domains = new Set();
  const add = v => { if (v) domains.add(v.trim().toLowerCase()); };
  add(mdm.sf_website_domain);
  if (mdm.sf_eos_access_domains)   mdm.sf_eos_access_domains.split(';').forEach(add);
  if (mdm.sf_eos_access_domains_2) mdm.sf_eos_access_domains_2.split(';').forEach(add);
  add(mdm.zd_primary_email_domain);
  if (mdm.sf_account_code) add(mdm.sf_account_code);
  if (mdm.sf_eos_tenant)   add(mdm.sf_eos_tenant);
  domains.delete('');
  return domains;
}

function matchMethod(mdm, tenant) {
  if ((mdm.sf_website_domain || '').toLowerCase() === tenant) return 'Website Domain';
  if ((mdm.sf_account_code   || '').toLowerCase() === tenant) return 'Account Code';
  if ((mdm.sf_eos_tenant     || '').toLowerCase() === tenant) return 'EOS Tenant';
  return 'EOS Domain';
}

// Resolve MDM domains → tenant list. Cached across all ph-*.js modules via shared db cache.
async function resolveTenants(account) {
  const cacheKey = 'tenants:' + account;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const mdm = await getMdmRow(account);
  if (!mdm) return null;
  const domains = buildDomainSet(mdm);
  if (!domains.size) return null;

  const inList = [...domains].map(d => `'${d.replace(/'/g, "''")}'`).join(',');
  const summaryRows = await query(`
    SELECT
      ph_tenant, ph_total_events, ph_unique_users,
      ph_first_seen, ph_last_seen,
      ph_events_last_30d, ph_events_last_7d,
      ph_investment_cases, ph_leaderboards, ph_benchmarks
    FROM dbo.gold_posthog_account_activity
    WHERE ph_tenant IN (${inList})
  `);
  if (!summaryRows || !summaryRows.length) return null;

  const result = { mdm, summaryRows };
  cacheSet(cacheKey, result, MDM_TTL);
  return result;
}

const mapWeekly = r => ({
  weekStart:            r.week_start ? new Date(r.week_start).toISOString().slice(0, 10) : null,
  events:               Number(r.events)            || 0,
  users:                Number(r.users)             || 0,
  investmentCases:      Number(r.investment_cases)  || 0,
  leaderboards:         Number(r.leaderboards)      || 0,
  benchmarks:           Number(r.benchmarks)        || 0,
  untagged:             Number(r.untagged)          || 0,
  investmentCasesUsers: Number(r.ic_users)          || 0,
  leaderboardsUsers:    Number(r.lb_users)          || 0,
  benchmarksUsers:      Number(r.bm_users)          || 0,
  untaggedUsers:        Number(r.untagged_users)    || 0,
});
const mapDaily = r => ({
  dayStart:             r.day_start ? new Date(r.day_start).toISOString().slice(0, 10) : null,
  events:               Number(r.events)            || 0,
  users:                Number(r.users)             || 0,
  investmentCases:      Number(r.investment_cases)  || 0,
  leaderboards:         Number(r.leaderboards)      || 0,
  benchmarks:           Number(r.benchmarks)        || 0,
  untagged:             Number(r.untagged)          || 0,
  investmentCasesUsers: Number(r.ic_users)          || 0,
  leaderboardsUsers:    Number(r.lb_users)          || 0,
  benchmarksUsers:      Number(r.bm_users)          || 0,
  untaggedUsers:        Number(r.untagged_users)    || 0,
});

function pivotRuns(rows, dateField, dateOutKey) {
  const map = {};
  (rows || []).forEach(r => {
    const k = r[dateField] ? new Date(r[dateField]).toISOString().slice(0, 10) : null;
    if (!k) return;
    if (!map[k]) map[k] = { [dateOutKey]: k, icRuns: 0, lbRuns: 0, bmRuns: 0 };
    const n = Number(r.runs) || 0;
    if      (r.feature === 'investment-cases') map[k].icRuns += n;
    else if (r.feature === 'leaderboards')     map[k].lbRuns += n;
    else if (r.feature === 'benchmarks')       map[k].bmRuns += n;
  });
  return Object.values(map).sort((a, b) => a[dateOutKey].localeCompare(b[dateOutKey]));
}

async function phTrends(req, res) {
  const account  = (req.query.account  || '').trim();
  const personId = (req.query.personId || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  // Single-user cross-filter: return weekly/daily for one person_id only (no cache)
  if (personId) {
    try {
      const escapedPid = personId.replace(/'/g, "''");
      const pf = `WHERE e.person_id = '${escapedPid}' AND e.timestamp IS NOT NULL AND e.event = '$pageview'`;
      const [weeklyRows, dailyRows] = await Promise.all([
        query(`
          SELECT
            CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE) AS week_start,
            COUNT(*) AS events, COUNT(DISTINCT e.person_id) AS users,
            SUM(CASE WHEN e.pathname LIKE '%/investment-cases%' THEN 1 ELSE 0 END) AS investment_cases,
            SUM(CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN 1 ELSE 0 END) AS leaderboards,
            SUM(CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN 1 ELSE 0 END) AS benchmarks,
            SUM(CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN 1 ELSE 0 END) AS untagged,
            COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/investment-cases%' THEN e.person_id END) AS ic_users,
            COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN e.person_id END) AS lb_users,
            COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN e.person_id END) AS bm_users,
            COUNT(DISTINCT CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN e.person_id END) AS untagged_users
          FROM dbo.posthog_notebook_events e
          ${pf}
          GROUP BY CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE)
          ORDER BY week_start
        `),
        query(`
          SELECT
            CAST(e.timestamp AS DATE) AS day_start,
            COUNT(*) AS events, COUNT(DISTINCT e.person_id) AS users,
            SUM(CASE WHEN e.pathname LIKE '%/investment-cases%' THEN 1 ELSE 0 END) AS investment_cases,
            SUM(CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN 1 ELSE 0 END) AS leaderboards,
            SUM(CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN 1 ELSE 0 END) AS benchmarks,
            SUM(CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN 1 ELSE 0 END) AS untagged,
            COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/investment-cases%' THEN e.person_id END) AS ic_users,
            COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN e.person_id END) AS lb_users,
            COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN e.person_id END) AS bm_users,
            COUNT(DISTINCT CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN e.person_id END) AS untagged_users
          FROM dbo.posthog_notebook_events e
          ${pf}
          GROUP BY CAST(e.timestamp AS DATE)
          ORDER BY day_start
        `),
      ]);
      return res.json({ weekly: (weeklyRows || []).map(mapWeekly), daily: (dailyRows || []).map(mapDaily) });
    } catch (err) {
      console.error('[ph-trends/personId]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const resolved = await resolveTenants(account);
    if (!resolved) return res.json({ tenants: [], summary: null, weekly: [], daily: [], weeklyRuns: [], dailyRuns: [] });

    const { mdm, summaryRows } = resolved;
    const tenants     = summaryRows.map(r => r.ph_tenant);
    const method      = matchMethod(mdm, tenants[0]);
    const tenantInList = tenants.map(t => `'${t.replace(/'/g, "''")}'`).join(',');

    const tenantsCte = `WITH tenants AS (
      SELECT ph_tenant FROM dbo.gold_posthog_account_activity
      WHERE ph_tenant IN (${tenantInList})
    )`;

    const [weeklyRows, dailyRows, weeklyRunRows, dailyRunRows] = await Promise.all([
      query(tenantsCte + `
        SELECT
          CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE) AS week_start,
          COUNT(*) AS events, COUNT(DISTINCT e.person_id) AS users,
          SUM(CASE WHEN e.pathname LIKE '%/investment-cases%' THEN 1 ELSE 0 END) AS investment_cases,
          SUM(CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN 1 ELSE 0 END) AS leaderboards,
          SUM(CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN 1 ELSE 0 END) AS benchmarks,
          SUM(CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN 1 ELSE 0 END) AS untagged,
          COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/investment-cases%' THEN e.person_id END) AS ic_users,
          COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN e.person_id END) AS lb_users,
          COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN e.person_id END) AS bm_users,
          COUNT(DISTINCT CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN e.person_id END) AS untagged_users
        FROM dbo.posthog_notebook_events e
        INNER JOIN tenants t ON LOWER(LTRIM(RTRIM(e.tenant))) = t.ph_tenant
        WHERE e.timestamp IS NOT NULL AND e.event = '$pageview'
        GROUP BY CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE)
        ORDER BY week_start
      `),
      query(tenantsCte + `
        SELECT
          CAST(e.timestamp AS DATE) AS day_start,
          COUNT(*) AS events, COUNT(DISTINCT e.person_id) AS users,
          SUM(CASE WHEN e.pathname LIKE '%/investment-cases%' THEN 1 ELSE 0 END) AS investment_cases,
          SUM(CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN 1 ELSE 0 END) AS leaderboards,
          SUM(CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN 1 ELSE 0 END) AS benchmarks,
          SUM(CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN 1 ELSE 0 END) AS untagged,
          COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/investment-cases%' THEN e.person_id END) AS ic_users,
          COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN e.person_id END) AS lb_users,
          COUNT(DISTINCT CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN e.person_id END) AS bm_users,
          COUNT(DISTINCT CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN e.person_id END) AS untagged_users
        FROM dbo.posthog_notebook_events e
        INNER JOIN tenants t ON LOWER(LTRIM(RTRIM(e.tenant))) = t.ph_tenant
        WHERE e.timestamp IS NOT NULL AND e.event = '$pageview'
        GROUP BY CAST(e.timestamp AS DATE)
        ORDER BY day_start
      `),
      query(tenantsCte + `
        SELECT
          CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE) AS week_start,
          e.feature, COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        INNER JOIN tenants t ON LOWER(LTRIM(RTRIM(e.tenant))) = t.ph_tenant
        WHERE e.timestamp IS NOT NULL AND e.feature IS NOT NULL AND e.feature != ''
        GROUP BY CAST(DATEADD(DAY, DATEDIFF(DAY,'2000-01-03',e.timestamp)/7*7, '2000-01-03') AS DATE), e.feature
        ORDER BY week_start
      `),
      query(tenantsCte + `
        SELECT CAST(e.timestamp AS DATE) AS day_start, e.feature, COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        INNER JOIN tenants t ON LOWER(LTRIM(RTRIM(e.tenant))) = t.ph_tenant
        WHERE e.timestamp IS NOT NULL AND e.feature IS NOT NULL AND e.feature != ''
        GROUP BY CAST(e.timestamp AS DATE), e.feature
        ORDER BY day_start
      `),
    ]);

    const totalEvents     = summaryRows.reduce((s, r) => s + (Number(r.ph_total_events)    || 0), 0);
    const uniqueUsers     = summaryRows.reduce((s, r) => s + (Number(r.ph_unique_users)    || 0), 0);
    const events30d       = summaryRows.reduce((s, r) => s + (Number(r.ph_events_last_30d) || 0), 0);
    const events7d        = summaryRows.reduce((s, r) => s + (Number(r.ph_events_last_7d)  || 0), 0);
    const investmentCases = summaryRows.reduce((s, r) => s + (Number(r.ph_investment_cases)|| 0), 0);
    const leaderboards    = summaryRows.reduce((s, r) => s + (Number(r.ph_leaderboards)    || 0), 0);
    const benchmarks      = summaryRows.reduce((s, r) => s + (Number(r.ph_benchmarks)      || 0), 0);
    const firstDates = summaryRows.map(r => r.ph_first_seen).filter(Boolean).sort();
    const lastDates  = summaryRows.map(r => r.ph_last_seen).filter(Boolean).sort();
    const firstSeen  = firstDates.length ? new Date(firstDates[0]).toISOString().slice(0, 10) : null;
    const lastSeen   = lastDates.length  ? new Date(lastDates[lastDates.length - 1]).toISOString().slice(0, 10) : null;

    const payload = {
      tenants,
      matchMethod: method,
      summary: { totalEvents, uniqueUsers, events30d, events7d, firstSeen, lastSeen, investmentCases, leaderboards, benchmarks },
      weekly:     (weeklyRows || []).map(mapWeekly),
      daily:      (dailyRows  || []).map(mapDaily),
      weeklyRuns: pivotRuns(weeklyRunRows, 'week_start', 'weekStart'),
      dailyRuns:  pivotRuns(dailyRunRows,  'day_start',  'dayStart'),
    };

    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[ph-trends]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = phTrends;
