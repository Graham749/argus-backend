const { query } = require('../lib/db');
const { getMdmRow } = require('../lib/mdm-cache');

const cache = {};
const CACHE_TTL = 15 * 60 * 1000;

module.exports = async function eosEngagementAccount(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const hit = cache[account];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return res.json(hit.data);

  try {
    const mdm = await getMdmRow(account);
    const code = mdm?.sf_account_code;
    if (!code) return res.json({ matched: false });

    const codeEsc = code.replace(/'/g, "''");

    const [kpiRows, trendRunsRows, trendDlRows, drillRunsRows, drillDlRows] = await Promise.all([
      // 1. Aggregate KPIs from gold view
      query(`
        SELECT
          sf_account_id,
          sf_account_name,
          sf_account_code,
          eos_runs_total,
          eos_runs_3m,
          eos_runs_12m,
          eos_failed_3m,
          eos_active_users,
          eos_distinct_products,
          CONVERT(varchar(10), eos_last_run,  120) AS eos_last_run,
          CONVERT(varchar(10), eos_first_run, 120) AS eos_first_run,
          api_calls_total,
          api_calls_30d,
          api_calls_7d,
          api_distinct_services,
          CONVERT(varchar(10), api_last_seen, 120) AS api_last_seen,
          dl_total,
          dl_3m,
          dl_12m,
          CONVERT(varchar(10), dl_last_date, 120) AS dl_last_date,
          dl_distinct_users,
          vid_total,
          vid_watch_secs_total,
          vid_watch_secs_12m,
          CONVERT(varchar(10), vid_last_date, 120) AS vid_last_date,
          vid_distinct_users,
          ph_events_total,
          ph_events_30d,
          ph_events_7d,
          ph_engaged_minutes,
          CONVERT(varchar(10), ph_last_seen, 120) AS ph_last_seen,
          ph_top_feature
        FROM dbo.v_gold_mdm_eos_engagement
        WHERE sf_account_code = '${codeEsc}'
      `),

      // 2. Runs trend by month — last 24 months, completed only
      query(`
        SELECT
          FORMAT(r.launch_time, 'yyyy-MM')   AS month,
          COUNT(DISTINCT r.simulation_id)    AS cnt,
          COUNT(DISTINCT r.user_email)       AS users
        FROM dbo.v_silver_eos_runs r
        WHERE r.account_id = '${codeEsc}'
          AND r.is_internal = 0
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
        FROM dbo.v_silver_eos_downloads d
        WHERE d.sf_account_code = '${codeEsc}'
          AND d.download_date IS NOT NULL
          AND d.download_date >= DATEADD(MONTH, -24, GETUTCDATE())
          AND COALESCE(d.product, '') != 'scenarioExplorer'
        GROUP BY FORMAT(CAST(d.download_date AS DATE), 'yyyy-MM')
        ORDER BY month
      `).catch(e => { console.warn('[eos-eng-acct] dl-trend:', e.message); return []; }),

      // 4. Runs drill — 100 most recent (all statuses for full picture)
      query(`
        SELECT TOP 100
          CONVERT(varchar(10), r.launch_time, 120) AS date,
          r.user_email,
          r.software_product,
          COALESCE(r.title, '')                    AS title,
          r.execution_status
        FROM dbo.v_silver_eos_runs r
        WHERE r.account_id = '${codeEsc}'
          AND r.is_internal = 0
          AND r.launch_time IS NOT NULL
        ORDER BY r.launch_time DESC
      `).catch(e => { console.warn('[eos-eng-acct] runs-drill:', e.message); return []; }),

      // 5. Downloads drill — 100 most recent
      query(`
        SELECT TOP 100
          CONVERT(varchar(10), d.download_date, 120) AS date,
          d.user_email,
          d.product,
          COALESCE(d.filename, '')                   AS filename
        FROM dbo.v_silver_eos_downloads d
        WHERE d.sf_account_code = '${codeEsc}'
          AND d.download_date IS NOT NULL
          AND COALESCE(d.product, '') != 'scenarioExplorer'
        ORDER BY d.download_date DESC
      `).catch(e => { console.warn('[eos-eng-acct] dl-drill:', e.message); return []; }),
    ]);

    if (!kpiRows.length) {
      const empty = { matched: true, sf_account_code: code, has_data: false };
      cache[account] = { ts: Date.now(), data: empty };
      return res.json(empty);
    }

    const r = kpiRows[0];
    const payload = {
      matched:          true,
      has_data:         true,
      sf_account_code:  r.sf_account_code,
      sf_account_name:  r.sf_account_name,
      runs: {
        total:             Number(r.eos_runs_total)        || 0,
        last_3m:           Number(r.eos_runs_3m)           || 0,
        last_12m:          Number(r.eos_runs_12m)          || 0,
        failed_3m:         Number(r.eos_failed_3m)         || 0,
        active_users:      Number(r.eos_active_users)      || 0,
        distinct_products: Number(r.eos_distinct_products) || 0,
        last_run:          r.eos_last_run  || null,
        first_run:         r.eos_first_run || null,
      },
      api: {
        calls_total:       Number(r.api_calls_total)       || 0,
        calls_30d:         Number(r.api_calls_30d)         || 0,
        calls_7d:          Number(r.api_calls_7d)          || 0,
        distinct_services: Number(r.api_distinct_services) || 0,
        last_seen:         r.api_last_seen || null,
      },
      downloads: {
        total:          Number(r.dl_total)          || 0,
        last_3m:        Number(r.dl_3m)             || 0,
        last_12m:       Number(r.dl_12m)            || 0,
        last_date:      r.dl_last_date              || null,
        distinct_users: Number(r.dl_distinct_users) || 0,
      },
      videos: {
        total:            Number(r.vid_total)               || 0,
        watch_mins_total: Math.round((Number(r.vid_watch_secs_total) || 0) / 60),
        watch_mins_12m:   Math.round((Number(r.vid_watch_secs_12m)   || 0) / 60),
        last_date:        r.vid_last_date                   || null,
        distinct_users:   Number(r.vid_distinct_users)      || 0,
      },
      flex: {
        events_total:    Number(r.ph_events_total)    || 0,
        events_30d:      Number(r.ph_events_30d)      || 0,
        events_7d:       Number(r.ph_events_7d)       || 0,
        engaged_minutes: Number(r.ph_engaged_minutes) || 0,
        last_seen:       r.ph_last_seen               || null,
        top_feature:     r.ph_top_feature             || null,
      },
      trends: {
        runs:      trendRunsRows.map(x => ({ month: x.month, cnt: Number(x.cnt)||0, users: Number(x.users)||0 })),
        downloads: trendDlRows.map(x => ({ month: x.month, cnt: Number(x.cnt)||0, users: Number(x.users)||0 })),
      },
      drill: {
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

    cache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[eos-engagement-account]', err.message);
    res.status(500).json({ error: err.message });
  }
};
