const { query } = require('../lib/db');
const { getMdmRow } = require('../lib/mdm-cache');

const cache = {};
const CACHE_TTL   = 60 * 60 * 1000;      // 1 hour  — serve fresh
const CACHE_STALE = 4  * 60 * 60 * 1000; // 4 hours — serve stale while refreshing in background

const _refreshing = {};

async function runQueries(code, codeEsc, account) {
  // Phase 1: gold check + KPIs + trends in parallel. Drill queries run in phase 2
  // only for accounts in the gold table (external clients). Internal accounts (e.g. Aurora)
  // are not in the gold table and have too many runs to drill sensibly.
  const [goldRows, runsKpiRows, dlKpiRows, trendRunsRows, trendDlRows] = await Promise.all([
    // 1. Gold table — used only for api/video/flex KPIs (computed with is_internal=0, don't use for runs/dl)
    query(`
      SELECT
        sf_account_name,
        api_calls_total, api_calls_30d, api_calls_7d, api_distinct_services,
        CONVERT(varchar(10), api_last_seen, 120) AS api_last_seen,
        vid_total, vid_watch_secs_total, vid_watch_secs_12m,
        CONVERT(varchar(10), vid_last_date, 120) AS vid_last_date,
        vid_distinct_users,
        ph_events_total, ph_events_30d, ph_events_7d, ph_engaged_minutes,
        CONVERT(varchar(10), ph_last_seen, 120) AS ph_last_seen,
        ph_top_feature
      FROM dbo.gold_mdm_eos_engagement
      WHERE sf_account_code = '${codeEsc}'
    `).catch(() => []),

    // 2. Runs KPIs — always from raw table, no is_internal filter
    query(`
      SELECT
        COUNT(DISTINCT r.simulation_id) AS total,
        COUNT(DISTINCT CASE WHEN r.launch_time >= DATEADD(MONTH,-3,GETUTCDATE())  THEN r.simulation_id END) AS last_3m,
        COUNT(DISTINCT CASE WHEN r.launch_time >= DATEADD(MONTH,-12,GETUTCDATE()) THEN r.simulation_id END) AS last_12m,
        COUNT(DISTINCT CASE WHEN r.launch_time >= DATEADD(MONTH,-3,GETUTCDATE())  THEN r.user_email END)    AS active_users,
        COUNT(DISTINCT r.software_product)                    AS distinct_products,
        CONVERT(varchar(10), MAX(r.launch_time), 120)         AS last_run,
        CONVERT(varchar(10), MIN(r.launch_time), 120)         AS first_run
      FROM dbo.gold_eos_runs r
      WHERE r.account_id = '${codeEsc}'
        AND r.launch_time IS NOT NULL
        AND r.execution_status = 'Complete'
    `).catch(() => [{}]),

    // 3. Downloads KPIs — always from raw table
    query(`
      SELECT
        COUNT(DISTINCT d.tracking_id) AS total,
        COUNT(DISTINCT CASE WHEN d.download_date >= DATEADD(MONTH,-3,GETUTCDATE())  THEN d.tracking_id END) AS last_3m,
        COUNT(DISTINCT CASE WHEN d.download_date >= DATEADD(MONTH,-12,GETUTCDATE()) THEN d.tracking_id END) AS last_12m,
        CONVERT(varchar(10), MAX(d.download_date), 120) AS last_date,
        COUNT(DISTINCT d.user_email)                    AS distinct_users
      FROM dbo.gold_eos_downloads d
      WHERE d.sf_account_code = '${codeEsc}'
        AND d.download_date IS NOT NULL
        AND COALESCE(d.product, '') != 'scenarioExplorer'
    `).catch(() => [{}]),

    // 4. Runs trend by month — last 24 months, completed only
    query(`
      SELECT
        FORMAT(r.launch_time, 'yyyy-MM')   AS month,
        COUNT(DISTINCT r.simulation_id)    AS cnt,
        COUNT(DISTINCT r.user_email)       AS users
      FROM dbo.gold_eos_runs r
      WHERE r.account_id = '${codeEsc}'
        AND r.execution_status = 'Complete'
        AND r.launch_time IS NOT NULL
        AND r.launch_time >= DATEADD(MONTH, -24, GETUTCDATE())
      GROUP BY FORMAT(r.launch_time, 'yyyy-MM')
      ORDER BY month
    `).catch(e => { console.warn('[eos-eng-acct] runs-trend:', e.message); return []; }),

    // 3. Downloads trend by month — last 24 months
    query(`
      SELECT
        FORMAT(CAST(d.download_date AS DATE), 'yyyy-MM') AS month,
        COUNT(DISTINCT d.tracking_id)                    AS cnt,
        COUNT(DISTINCT d.user_email)                     AS users
      FROM dbo.gold_eos_downloads d
      WHERE d.sf_account_code = '${codeEsc}'
        AND d.download_date IS NOT NULL
        AND d.download_date >= DATEADD(MONTH, -24, GETUTCDATE())
        AND COALESCE(d.product, '') != 'scenarioExplorer'
      GROUP BY FORMAT(CAST(d.download_date AS DATE), 'yyyy-MM')
      ORDER BY month
    `).catch(e => { console.warn('[eos-eng-acct] dl-trend:', e.message); return []; }),

  ]);

  const rr = runsKpiRows[0] || {};
  const rd = dlKpiRows[0]   || {};
  const g  = goldRows[0]    || {};
  const isInternal = !goldRows.length; // not in gold table = internal account, suppress drill

  // Phase 2: drill queries — only for external client accounts
  let drillRunsRows = [], drillDlRows = [];
  if (!isInternal) {
    [drillRunsRows, drillDlRows] = await Promise.all([
      query(`
        SELECT TOP 500
          CONVERT(varchar(10), r.launch_time, 120) AS date,
          r.user_email,
          r.software_product,
          COALESCE(r.title, '')                    AS title,
          r.execution_status
        FROM dbo.gold_eos_runs r
        WHERE r.account_id = '${codeEsc}'
          AND r.launch_time IS NOT NULL
          AND r.execution_status = 'Complete'
          AND r.launch_time >= DATEADD(MONTH, -18, DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1))
        ORDER BY r.launch_time DESC
      `).catch(e => { console.warn('[eos-eng-acct] runs-drill:', e.message); return []; }),
      query(`
        SELECT TOP 500
          CONVERT(varchar(10), d.download_date, 120) AS date,
          d.user_email,
          d.product,
          COALESCE(d.filename, '')                   AS filename
        FROM dbo.gold_eos_downloads d
        WHERE d.sf_account_code = '${codeEsc}'
          AND d.download_date IS NOT NULL
          AND COALESCE(d.product, '') != 'scenarioExplorer'
          AND d.download_date >= DATEADD(MONTH, -18, DATEFROMPARTS(YEAR(GETUTCDATE()), MONTH(GETUTCDATE()), 1))
        ORDER BY d.download_date DESC
      `).catch(e => { console.warn('[eos-eng-acct] dl-drill:', e.message); return []; }),
    ]);
  }

  const hasAnyData = (Number(rr.total)||0) > 0 || (Number(rd.total)||0) > 0
                  || (Number(g.api_calls_total)||0) > 0 || (Number(g.vid_total)||0) > 0
                  || (Number(g.ph_events_total)||0) > 0;
  if (!hasAnyData) return { matched: true, sf_account_code: code, has_data: false };

  return {
    matched:          true,
    has_data:         true,
    sf_account_code:  code,
    sf_account_name:  g.sf_account_name || account,
    runs: {
      total:             Number(rr.total)             || 0,
      last_3m:           Number(rr.last_3m)           || 0,
      last_12m:          Number(rr.last_12m)          || 0,
      failed_3m:         0,
      active_users:      Number(rr.active_users)      || 0,
      distinct_products: Number(rr.distinct_products) || 0,
      last_run:          rr.last_run  || null,
      first_run:         rr.first_run || null,
    },
    api: {
      calls_total:       Number(g.api_calls_total)       || 0,
      calls_30d:         Number(g.api_calls_30d)         || 0,
      calls_7d:          Number(g.api_calls_7d)          || 0,
      distinct_services: Number(g.api_distinct_services) || 0,
      last_seen:         g.api_last_seen || null,
    },
    downloads: {
      total:          Number(rd.total)          || 0,
      last_3m:        Number(rd.last_3m)        || 0,
      last_12m:       Number(rd.last_12m)       || 0,
      last_date:      rd.last_date              || null,
      distinct_users: Number(rd.distinct_users) || 0,
    },
    videos: {
      total:            Number(g.vid_total)               || 0,
      watch_mins_total: Math.round((Number(g.vid_watch_secs_total) || 0) / 60),
      watch_mins_12m:   Math.round((Number(g.vid_watch_secs_12m)   || 0) / 60),
      last_date:        g.vid_last_date                   || null,
      distinct_users:   Number(g.vid_distinct_users)      || 0,
    },
    flex: {
      events_total:    Number(g.ph_events_total)    || 0,
      events_30d:      Number(g.ph_events_30d)      || 0,
      events_7d:       Number(g.ph_events_7d)       || 0,
      engaged_minutes: Number(g.ph_engaged_minutes) || 0,
      last_seen:       g.ph_last_seen               || null,
      top_feature:     g.ph_top_feature             || null,
    },
    trends: {
      runs:      trendRunsRows.map(x => ({ month: x.month, cnt: Number(x.cnt)||0, users: Number(x.users)||0 })),
      downloads: trendDlRows.map(x => ({ month: x.month, cnt: Number(x.cnt)||0, users: Number(x.users)||0 })),
    },
    drill: isInternal ? { runs: [], downloads: [] } : {
      runs: drillRunsRows.map(x => ({
        date:    x.date,
        user:    x.user_email,
        product: x.software_product,
        title:   x.title,
        status:  x.execution_status,
      })),
      downloads: drillDlRows.map(x => ({
        date:     x.date,
        user:     x.user_email,
        product:  x.product,
        filename: x.filename,
      })),
    },
  };
}

// Exported so cache-warmer can pre-heat top accounts on startup
async function fetchAndCache(account) {
  const mdm = await getMdmRow(account);
  const code = mdm?.sf_account_code;
  if (!code) {
    const empty = { matched: false };
    cache[account] = { ts: Date.now(), data: empty };
    return empty;
  }
  const codeEsc = code.replace(/'/g, "''");
  const data = await runQueries(code, codeEsc, account);
  cache[account] = { ts: Date.now(), data };
  return data;
}

module.exports = async function eosEngagementAccount(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const hit = cache[account];
  const age = hit ? Date.now() - hit.ts : Infinity;

  if (hit && age < CACHE_TTL) return res.json(hit.data);  // fresh

  if (hit && age < CACHE_STALE) {
    // Stale — respond immediately, refresh in background
    res.json(hit.data);
    if (!_refreshing[account]) {
      _refreshing[account] = true;
      fetchAndCache(account)
        .catch(err => console.warn('[eos-eng-acct] bg refresh failed:', account, err.message))
        .finally(() => { delete _refreshing[account]; });
    }
    return;
  }

  // Cache miss — first ever request for this account, fetch synchronously
  try {
    const data = await fetchAndCache(account);
    res.json(data);
  } catch (err) {
    console.error('[eos-engagement-account]', err.message);
    res.status(500).json({ error: err.message });
  }
};

module.exports.fetchAndCache = fetchAndCache;
