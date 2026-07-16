const { query } = require('../lib/db');

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

module.exports = async function phBenchmark(req, res) {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return res.json(_cache);

  try {
    const rows = await query(`
      WITH per_account AS (
        SELECT
          g.sf_account_name,
          SUM(a.ph_total_events)     AS total_events,
          SUM(a.ph_unique_users)     AS unique_users,
          SUM(a.ph_events_last_30d)  AS events_30d,
          SUM(a.ph_investment_cases) AS investment_cases,
          SUM(a.ph_leaderboards)     AS leaderboards,
          SUM(a.ph_benchmarks)       AS benchmarks
        FROM dbo.v_silver_posthog_account_activity a
        INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = a.ph_tenant
        WHERE g.sf_account_name IS NOT NULL AND g.sf_account_name != ''
        GROUP BY g.sf_account_name
      )
      SELECT TOP 1
        (SELECT COUNT(*) FROM per_account)                                               AS account_count,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY total_events)    OVER(), 0)  AS p25_events,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_events)    OVER(), 0)  AS p50_events,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY total_events)    OVER(), 0)  AS p75_events,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY total_events)    OVER(), 0)  AS p90_events,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY unique_users)    OVER(), 0)  AS p25_users,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY unique_users)    OVER(), 0)  AS p50_users,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY unique_users)    OVER(), 0)  AS p75_users,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY unique_users)    OVER(), 0)  AS p90_users,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY events_30d)      OVER(), 0)  AS p25_30d,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY events_30d)      OVER(), 0)  AS p50_30d,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY events_30d)      OVER(), 0)  AS p75_30d,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY events_30d)      OVER(), 0)  AS p90_30d,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY investment_cases) OVER(), 0) AS p25_ic,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY investment_cases) OVER(), 0) AS p50_ic,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY investment_cases) OVER(), 0) AS p75_ic,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY investment_cases) OVER(), 0) AS p90_ic,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY leaderboards)    OVER(), 0)  AS p25_lb,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY leaderboards)    OVER(), 0)  AS p50_lb,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY leaderboards)    OVER(), 0)  AS p75_lb,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY leaderboards)    OVER(), 0)  AS p90_lb,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY benchmarks)      OVER(), 0)  AS p25_bm,
        ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY benchmarks)      OVER(), 0)  AS p50_bm,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY benchmarks)      OVER(), 0)  AS p75_bm,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY benchmarks)      OVER(), 0)  AS p90_bm
      FROM per_account
    `);

    if (!rows.length) return res.status(500).json({ error: 'No data' });
    const r = rows[0];

    const data = {
      accountCount: Number(r.account_count),
      totalEvents:      { p25: Number(r.p25_events), p50: Number(r.p50_events), p75: Number(r.p75_events), p90: Number(r.p90_events) },
      uniqueUsers:      { p25: Number(r.p25_users),  p50: Number(r.p50_users),  p75: Number(r.p75_users),  p90: Number(r.p90_users)  },
      events30d:        { p25: Number(r.p25_30d),    p50: Number(r.p50_30d),    p75: Number(r.p75_30d),    p90: Number(r.p90_30d)    },
      investmentCases:  { p25: Number(r.p25_ic),     p50: Number(r.p50_ic),     p75: Number(r.p75_ic),     p90: Number(r.p90_ic)     },
      leaderboards:     { p25: Number(r.p25_lb),     p50: Number(r.p50_lb),     p75: Number(r.p75_lb),     p90: Number(r.p90_lb)     },
      benchmarks:       { p25: Number(r.p25_bm),     p50: Number(r.p50_bm),     p75: Number(r.p75_bm),     p90: Number(r.p90_bm)     },
    };

    _cache = data;
    _cacheTs = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[ph-benchmark]', err.message);
    res.status(500).json({ error: err.message });
  }
};
