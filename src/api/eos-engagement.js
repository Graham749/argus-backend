const { query, cacheGet, cacheSet } = require('../lib/db');

const CACHE_KEY = 'eos_engagement_agg';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const MARKET_TO_REGION = {
  // EMEA
  'Great Britain': 'EMEA', 'Germany': 'EMEA', 'France': 'EMEA', 'Iberia': 'EMEA',
  'Italy': 'EMEA', 'Netherlands': 'EMEA', 'Nordics': 'EMEA', 'Poland': 'EMEA',
  'Ireland': 'EMEA', 'Belgium': 'EMEA', 'Romania': 'EMEA', 'Greece': 'EMEA',
  'Baltics': 'EMEA', 'Bulgaria': 'EMEA', 'Hungary': 'EMEA', 'Croatia': 'EMEA',
  'Serbia': 'EMEA', 'Switzerland': 'EMEA', 'Austria': 'EMEA', 'Czechia': 'EMEA',
  'Slovakia': 'EMEA', 'South Africa': 'EMEA', 'Pan-European': 'EMEA',
  'Global Energy': 'EMEA', 'Hydrogen': 'EMEA', 'Commodities': 'EMEA',
  'Western Balkans': 'EMEA', 'Banking Roundtable': 'EMEA',
  // APAC
  'Australia (NEM)': 'APAC', 'Australia (WEM)': 'APAC', 'Japan': 'APAC',
  'Australia NEM': 'APAC', 'Australia WEM': 'APAC',
  'India': 'APAC', 'South Korea': 'APAC', 'Philippines': 'APAC',
  'Singapore': 'APAC', 'Malaysia': 'APAC', 'APAC': 'APAC',
  // NORAM
  'ERCOT': 'NORAM', 'PJM': 'NORAM', 'CAISO': 'NORAM', 'MISO': 'NORAM',
  'WECC': 'NORAM', 'Alberta': 'NORAM', 'NYISO': 'NORAM', 'ISO-NE': 'NORAM',
  'SPP': 'NORAM', 'Pan-NORAM': 'NORAM', 'SERC': 'NORAM', 'Ontario': 'NORAM',
  // LATAM
  'Brazil': 'LATAM', 'Chile': 'LATAM', 'Mexico': 'LATAM',
};

function regionOf(market) {
  if (!market) return 'Other';
  return MARKET_TO_REGION[market] || 'Other';
}

// Workshop case types (everything else = email/analyst support)
const WORKSHOP_TYPES = new Set(['Workshop', 'Content_workshop']);

module.exports = async function eosEngagement(req, res) {
  try {
    const cached = cacheGet(CACHE_KEY);
    if (cached && !req.query.bust) return res.json(cached);

    const [runsRows, dlRows, vidRows, caseRows, webinarRows, gmRows, acctRegionRows, dlAcctRows, caseAcctRows] = await Promise.all([
      // 1. Software runs by product_region (all-time — no monthly grain in source)
      query(`
        SELECT product_region, SUM(total_runs) AS total, SUM(runs_last_3m) AS last_3m, SUM(runs_last_12m) AS last_12m
        FROM dbo.v_gold_mdm_eos_runs
        WHERE sf_account_code IS NOT NULL
        GROUP BY product_region
        ORDER BY total DESC
      `),

      // 2. EOS downloads by month (all-time)
      query(`
        SELECT FORMAT(CAST(download_date AS DATE), 'yyyy-MM') AS month, COUNT(*) AS cnt
        FROM dbo.v_silver_eos_downloads
        WHERE download_date IS NOT NULL
        GROUP BY FORMAT(CAST(download_date AS DATE), 'yyyy-MM')
        ORDER BY month
      `),

      // 3. Video plays by month (all-time, no regional breakdown)
      query(`
        SELECT FORMAT(CAST(watch_date AS DATE), 'yyyy-MM') AS month, COUNT(*) AS plays, SUM(watch_time_secs) AS watch_secs
        FROM dbo.v_silver_eos_videos
        WHERE watch_date IS NOT NULL
        GROUP BY FORMAT(CAST(watch_date AS DATE), 'yyyy-MM')
        ORDER BY month
      `),

      // 4. Cases by month + type (for time series)
      query(`
        SELECT
          FORMAT(TRY_CAST(created_date AS DATE), 'yyyy-MM') AS month,
          COALESCE(case_type, 'Other') AS case_type,
          COUNT(*) AS cnt
        FROM dbo.v_silver_sf_cases
        WHERE TRY_CAST(created_date AS DATE) IS NOT NULL
          AND account_id IS NOT NULL
        GROUP BY FORMAT(TRY_CAST(created_date AS DATE), 'yyyy-MM'), COALESCE(case_type, 'Other')
        ORDER BY month
      `),

      // 5. Webinars by market + month
      query(`
        SELECT market_raw, FORMAT(event_date, 'yyyy-MM') AS month, SUM(COALESCE(attendees, 0)) AS attendees, COUNT(*) AS event_count
        FROM dbo.v_silver_webinar_schedule
        WHERE event_date IS NOT NULL AND COALESCE(attendees, 0) > 0
        GROUP BY market_raw, FORMAT(event_date, 'yyyy-MM')
        ORDER BY month DESC
      `),

      // 6. Group meetings by market + month
      query(`
        SELECT market_raw, FORMAT(event_date, 'yyyy-MM') AS month, SUM(COALESCE(attendees, 0)) AS attendees, COUNT(*) AS event_count
        FROM dbo.v_silver_gm_annual_plan
        WHERE event_date IS NOT NULL AND COALESCE(attendees, 0) > 0
        GROUP BY market_raw, FORMAT(event_date, 'yyyy-MM')
        ORDER BY month DESC
      `),

      // 7. Primary region per account (from runs — used for regional breakdowns)
      query(`
        SELECT sf_account_code, product_region
        FROM (
          SELECT sf_account_code, product_region,
                 ROW_NUMBER() OVER (PARTITION BY sf_account_code ORDER BY SUM(total_runs) DESC) AS rn
          FROM dbo.v_gold_mdm_eos_runs
          WHERE sf_account_code IS NOT NULL
          GROUP BY sf_account_code, product_region
        ) x WHERE rn = 1
      `),

      // 8. Downloads by account (for regional split)
      query(`
        SELECT sf_account_code, COUNT(*) AS cnt
        FROM dbo.v_silver_eos_downloads
        WHERE download_date IS NOT NULL AND sf_account_code IS NOT NULL
        GROUP BY sf_account_code
      `),

      // 9. Cases by account + type (for regional split)
      query(`
        SELECT mdm.sf_account_code, COALESCE(c.case_type, 'Other') AS case_type, COUNT(*) AS cnt
        FROM dbo.v_silver_sf_cases c
        JOIN dbo.gold_mdm_account mdm ON mdm.sf_account_id = c.account_id
        WHERE TRY_CAST(c.created_date AS DATE) IS NOT NULL AND c.account_id IS NOT NULL
        GROUP BY mdm.sf_account_code, COALESCE(c.case_type, 'Other')
      `),
    ]);

    // ── Build account → primary region lookup ─────────────────────────────────
    const accountRegion = {};
    for (const r of acctRegionRows) {
      accountRegion[r.sf_account_code] = regionOf(r.product_region);
    }

    // ── Process runs ─────────────────────────────────────────────────────────
    const runsByRegion = {}, runsByMarket = {};
    let runsTotal = 0;
    for (const r of runsRows) {
      const region = regionOf(r.product_region);
      const mkt    = r.product_region || 'Unmapped';
      const t = Number(r.total) || 0;
      runsTotal += t;
      runsByRegion[region] = (runsByRegion[region] || 0) + t;
      if (!runsByMarket[mkt]) runsByMarket[mkt] = { total: 0, last_3m: 0, last_12m: 0, region };
      runsByMarket[mkt].total    += t;
      runsByMarket[mkt].last_3m  += Number(r.last_3m)  || 0;
      runsByMarket[mkt].last_12m += Number(r.last_12m) || 0;
    }
    const runsMktArr = Object.entries(runsByMarket)
      .map(([market, v]) => ({ market, ...v }))
      .sort((a, b) => b.total - a.total);

    // ── Process downloads ─────────────────────────────────────────────────────
    const dlByMonth = {};
    const dlByRegion = {};
    for (const r of dlRows) {
      const m = r.month; const cnt = Number(r.cnt) || 0;
      if (m) dlByMonth[m] = (dlByMonth[m] || 0) + cnt;
    }
    for (const r of dlAcctRows) {
      const region = accountRegion[r.sf_account_code] || 'Other';
      dlByRegion[region] = (dlByRegion[region] || 0) + (Number(r.cnt) || 0);
    }
    const dlTotal = Object.values(dlByMonth).reduce((s, v) => s + v, 0);

    // ── Process videos ────────────────────────────────────────────────────────
    const vidByMonth = {};
    let secsTotal = 0, vidTotal = 0;
    for (const r of vidRows) {
      const m = r.month; const plays = Number(r.plays) || 0;
      secsTotal += Number(r.watch_secs) || 0;
      vidTotal  += plays;
      if (m) vidByMonth[m] = (vidByMonth[m] || 0) + plays;
    }

    // ── Process cases → workshops + email support ─────────────────────────────
    const workshopByMonth = {}, workshopByRegion = {};
    const emailByMonth    = {}, emailByRegion    = {};
    for (const r of caseRows) {
      const m = r.month; const cnt = Number(r.cnt) || 0;
      const isWS = WORKSHOP_TYPES.has(r.case_type);
      if (isWS) { if (m) workshopByMonth[m] = (workshopByMonth[m] || 0) + cnt; }
      else       { if (m) emailByMonth[m]    = (emailByMonth[m]    || 0) + cnt; }
    }
    for (const r of caseAcctRows) {
      const region = accountRegion[r.sf_account_code] || 'Other';
      const cnt = Number(r.cnt) || 0;
      if (WORKSHOP_TYPES.has(r.case_type)) {
        workshopByRegion[region] = (workshopByRegion[region] || 0) + cnt;
      } else {
        emailByRegion[region] = (emailByRegion[region] || 0) + cnt;
      }
    }
    const workshopTotal = Object.values(workshopByMonth).reduce((s, v) => s + v, 0);
    const emailTotal    = Object.values(emailByMonth).reduce((s, v) => s + v, 0);

    // ── Process webinars ──────────────────────────────────────────────────────
    const webByMonth = {}, webByRegion = {}, webByMarket = {};
    for (const r of webinarRows) {
      const m = r.month; const att = Number(r.attendees) || 0; const evCnt = Number(r.event_count) || 0;
      const region = regionOf(r.market_raw);
      const mkt    = r.market_raw || 'Other';
      if (m) webByMonth[m] = (webByMonth[m] || 0) + att;
      webByRegion[region] = (webByRegion[region] || 0) + att;
      if (!webByMarket[mkt]) webByMarket[mkt] = { attendees: 0, event_count: 0, region };
      webByMarket[mkt].attendees   += att;
      webByMarket[mkt].event_count += evCnt;
    }
    const webTotal = Object.values(webByMonth).reduce((s, v) => s + v, 0);

    // ── Process group meetings ────────────────────────────────────────────────
    const gmByMonth = {}, gmByRegion = {}, gmByMarket = {};
    for (const r of gmRows) {
      const m = r.month; const att = Number(r.attendees) || 0; const evCnt = Number(r.event_count) || 0;
      const region = regionOf(r.market_raw);
      const mkt    = r.market_raw || 'Other';
      if (m) gmByMonth[m] = (gmByMonth[m] || 0) + att;
      gmByRegion[region] = (gmByRegion[region] || 0) + att;
      if (!gmByMarket[mkt]) gmByMarket[mkt] = { attendees: 0, event_count: 0, region };
      gmByMarket[mkt].attendees   += att;
      gmByMarket[mkt].event_count += evCnt;
    }
    const gmTotal = Object.values(gmByMonth).reduce((s, v) => s + v, 0);

    const toMonthArr = (obj, valKey) =>
      Object.entries(obj).map(([month, v]) => ({ month, [valKey]: v })).sort((a, b) => a.month.localeCompare(b.month));
    const webMktArr = Object.entries(webByMarket).map(([market, v]) => ({ market, ...v })).sort((a, b) => b.attendees - a.attendees);
    const gmMktArr  = Object.entries(gmByMarket).map(([market, v]) => ({ market, ...v })).sort((a, b) => b.attendees - a.attendees);

    // Streams in display order: downloads, software, webinars, gm, videos, workshops, email_cases
    const payload = {
      snapshot: new Date().toISOString().slice(0, 10),
      streams: [
        { key: 'downloads',   label: 'EOS Report Downloads',              unit: 'downloads', source: 'EOS Usage',                  total: dlTotal,       regional: true,  by_region: dlByRegion,       by_month: toMonthArr(dlByMonth,       'cnt') },
        { key: 'software',    label: 'Software Usage (Runs) excl internal', unit: 'runs',   source: 'Software Usage',              total: runsTotal,     regional: true,  by_region: runsByRegion,     by_market: runsMktArr, static: true },
        { key: 'webinars',    label: 'Webinar Attendance',                unit: 'attendees', source: 'Integrated Research Tracker', total: webTotal,      regional: true,  by_region: webByRegion,      by_month: toMonthArr(webByMonth,      'attendees'), by_market: webMktArr },
        { key: 'gm',          label: 'Group Meeting Attendance',          unit: 'attendees', source: 'Integrated Research Tracker', total: gmTotal,       regional: true,  by_region: gmByRegion,       by_month: toMonthArr(gmByMonth,       'attendees'), by_market: gmMktArr },
        { key: 'videos',      label: 'EOS Video Plays',                   unit: 'plays',     source: 'EOS Usage',                  total: vidTotal,      regional: false,                              by_month: toMonthArr(vidByMonth,      'plays'), watch_mins_total: Math.round(secsTotal / 60) },
        { key: 'workshops',   label: 'Workshops (Support)',               unit: 'workshops', source: 'Cases',                      total: workshopTotal, regional: true,  by_region: workshopByRegion, by_month: toMonthArr(workshopByMonth, 'cnt') },
        { key: 'email_cases', label: 'Email Support Cases',              unit: 'cases',     source: 'Cases',                      total: emailTotal,    regional: true,  by_region: emailByRegion,    by_month: toMonthArr(emailByMonth,    'cnt') },
      ],
    };

    cacheSet(CACHE_KEY, payload, CACHE_TTL);
    res.json(payload);
  } catch (err) {
    console.error('[eos-engagement]', err.message);
    res.status(500).json({ error: err.message });
  }
};
