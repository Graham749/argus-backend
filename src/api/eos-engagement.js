const { query, cacheGet, cacheSet } = require('../lib/db');

const CACHE_KEY = 'eos_engagement_agg';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Maps product_region / market_raw values to region codes
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

function buildMonthMap(rows, monthField, countField) {
  // Returns { 'YYYY-MM': count }
  const out = {};
  for (const r of rows) {
    const m = r[monthField];
    if (m) out[m] = (out[m] || 0) + (Number(r[countField]) || 0);
  }
  return out;
}

module.exports = async function eosEngagement(req, res) {
  try {
    const cached = cacheGet(CACHE_KEY);
    if (cached && !req.query.bust) return res.json(cached);

    const [runsRows, dlRows, vidRows, caseRows, webinarRows, gmRows] = await Promise.all([
      // 1. Software runs by product_region + software_product (windowed totals)
      query(`
        SELECT
          product_region,
          software_product,
          SUM(total_runs)    AS total,
          SUM(runs_last_3m)  AS last_3m,
          SUM(runs_last_12m) AS last_12m,
          COUNT(DISTINCT sf_account_code) AS accounts
        FROM dbo.v_gold_mdm_eos_runs
        GROUP BY product_region, software_product
        ORDER BY total DESC
      `),

      // 2. EOS downloads by month — all time (no date cutoff)
      query(`
        SELECT
          FORMAT(CAST(download_date AS DATE), 'yyyy-MM') AS month,
          COUNT(*) AS cnt,
          COUNT(DISTINCT sf_account_code) AS accounts
        FROM dbo.v_silver_eos_downloads
        WHERE download_date IS NOT NULL
        GROUP BY FORMAT(CAST(download_date AS DATE), 'yyyy-MM')
        ORDER BY month
      `),

      // 3. Video plays by month — all time
      query(`
        SELECT
          FORMAT(CAST(watch_date AS DATE), 'yyyy-MM') AS month,
          COUNT(*) AS plays,
          SUM(watch_time_secs) AS watch_secs
        FROM dbo.v_silver_eos_videos
        WHERE watch_date IS NOT NULL
        GROUP BY FORMAT(CAST(watch_date AS DATE), 'yyyy-MM')
        ORDER BY month
      `),

      // 4. SF cases by month and type — all time
      query(`
        SELECT
          FORMAT(TRY_CAST(created_date AS DATE), 'yyyy-MM') AS month,
          COALESCE(case_type, 'Other') AS case_type,
          COUNT(*) AS cnt
        FROM dbo.v_silver_sf_cases
        WHERE TRY_CAST(created_date AS DATE) IS NOT NULL
          AND account_id IS NOT NULL
        GROUP BY
          FORMAT(TRY_CAST(created_date AS DATE), 'yyyy-MM'),
          COALESCE(case_type, 'Other')
        ORDER BY month
      `),

      // 5. Webinars by market + year + month
      query(`
        SELECT
          market_raw,
          FORMAT(event_date, 'yyyy-MM') AS month,
          YEAR(event_date) AS yr,
          SUM(COALESCE(attendees, 0)) AS attendees,
          COUNT(*) AS event_count
        FROM dbo.v_silver_webinar_schedule
        WHERE event_date IS NOT NULL
          AND COALESCE(attendees, 0) > 0
        GROUP BY market_raw, FORMAT(event_date, 'yyyy-MM'), YEAR(event_date)
        ORDER BY month DESC
      `),

      // 6. Group meetings by market + year + month
      query(`
        SELECT
          market_raw,
          FORMAT(event_date, 'yyyy-MM') AS month,
          YEAR(event_date) AS yr,
          SUM(COALESCE(attendees, 0)) AS attendees,
          COUNT(*) AS event_count
        FROM dbo.v_silver_gm_annual_plan
        WHERE event_date IS NOT NULL
          AND COALESCE(attendees, 0) > 0
        GROUP BY market_raw, FORMAT(event_date, 'yyyy-MM'), YEAR(event_date)
        ORDER BY month DESC
      `),
    ]);

    // ── Process runs ─────────────────────────────────────────────────────────
    const runsByRegion = {};
    const runsByMarket = {};
    let runsTotal = 0, runs3m = 0, runs12m = 0;
    for (const r of runsRows) {
      const region = regionOf(r.product_region);
      const mkt    = r.product_region || 'Unmapped';
      const t = Number(r.total) || 0;
      const m3 = Number(r.last_3m) || 0;
      const m12 = Number(r.last_12m) || 0;
      runsTotal += t; runs3m += m3; runs12m += m12;
      runsByRegion[region] = (runsByRegion[region] || 0) + t;
      if (!runsByMarket[mkt]) runsByMarket[mkt] = { total: 0, last_3m: 0, last_12m: 0, region };
      runsByMarket[mkt].total   += t;
      runsByMarket[mkt].last_3m += m3;
      runsByMarket[mkt].last_12m += m12;
    }

    // ── Process downloads ─────────────────────────────────────────────────────
    const dlByMonth = buildMonthMap(dlRows, 'month', 'cnt');
    const dlTotal   = Object.values(dlByMonth).reduce((s, v) => s + v, 0);
    const nowStr    = new Date().toISOString().slice(0, 7);
    const m3Start   = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3);  return d.toISOString().slice(0, 7); })();
    const m12Start  = (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d.toISOString().slice(0, 7); })();
    const dl3m  = Object.entries(dlByMonth).filter(([m]) => m >= m3Start  && m <= nowStr).reduce((s, [, v]) => s + v, 0);
    const dl12m = Object.entries(dlByMonth).filter(([m]) => m >= m12Start && m <= nowStr).reduce((s, [, v]) => s + v, 0);

    // ── Process videos ────────────────────────────────────────────────────────
    const vidByMonth    = buildMonthMap(vidRows, 'month', 'plays');
    const secsTotal     = vidRows.reduce((s, r) => s + (Number(r.watch_secs) || 0), 0);
    const vidTotal      = Object.values(vidByMonth).reduce((s, v) => s + v, 0);
    const vid3m  = Object.entries(vidByMonth).filter(([m]) => m >= m3Start  && m <= nowStr).reduce((s, [, v]) => s + v, 0);
    const vid12m = Object.entries(vidByMonth).filter(([m]) => m >= m12Start && m <= nowStr).reduce((s, [, v]) => s + v, 0);

    // ── Process cases ─────────────────────────────────────────────────────────
    const caseByMonth   = buildMonthMap(caseRows, 'month', 'cnt');
    const caseByType    = {};
    for (const r of caseRows) {
      caseByType[r.case_type] = (caseByType[r.case_type] || 0) + (Number(r.cnt) || 0);
    }
    const caseTotal = Object.values(caseByMonth).reduce((s, v) => s + v, 0);
    const case3m  = Object.entries(caseByMonth).filter(([m]) => m >= m3Start  && m <= nowStr).reduce((s, [, v]) => s + v, 0);
    const case12m = Object.entries(caseByMonth).filter(([m]) => m >= m12Start && m <= nowStr).reduce((s, [, v]) => s + v, 0);

    // ── Process webinars ──────────────────────────────────────────────────────
    const webByMonth  = {};
    const webByRegion = {};
    const webByMarket = {};
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
    const web3m  = Object.entries(webByMonth).filter(([m]) => m >= m3Start  && m <= nowStr).reduce((s, [, v]) => s + v, 0);
    const web12m = Object.entries(webByMonth).filter(([m]) => m >= m12Start && m <= nowStr).reduce((s, [, v]) => s + v, 0);

    // ── Process group meetings ────────────────────────────────────────────────
    const gmByMonth  = {};
    const gmByRegion = {};
    const gmByMarket = {};
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
    const gm3m  = Object.entries(gmByMonth).filter(([m]) => m >= m3Start  && m <= nowStr).reduce((s, [, v]) => s + v, 0);
    const gm12m = Object.entries(gmByMonth).filter(([m]) => m >= m12Start && m <= nowStr).reduce((s, [, v]) => s + v, 0);

    // ── Regional totals per stream (for distribution table) ───────────────────
    const REGIONS = ['EMEA', 'APAC', 'NORAM', 'LATAM', 'Other'];
    const regionTotals = {};
    for (const reg of REGIONS) {
      regionTotals[reg] = {
        software:  runsByRegion[reg]  || 0,
        webinars:  webByRegion[reg]   || 0,
        gm:        gmByRegion[reg]    || 0,
      };
    }

    const toMonthArr = (obj, valKey) =>
      Object.entries(obj).map(([month, v]) => ({ month, [valKey]: v })).sort((a, b) => a.month.localeCompare(b.month));

    const runsMktArr = Object.entries(runsByMarket)
      .map(([market, v]) => ({ market, ...v })).sort((a, b) => b.total - a.total);
    const webMktArr  = Object.entries(webByMarket)
      .map(([market, v]) => ({ market, ...v })).sort((a, b) => b.attendees - a.attendees);
    const gmMktArr   = Object.entries(gmByMarket)
      .map(([market, v]) => ({ market, ...v })).sort((a, b) => b.attendees - a.attendees);

    const payload = {
      snapshot: new Date().toISOString().slice(0, 10),
      streams: [
        { key: 'software',  label: 'Software Runs',             unit: 'runs',      total: runsTotal, last_3m: runs3m,  last_12m: runs12m,  regional: true,  by_region: runsByRegion, by_market: runsMktArr },
        { key: 'downloads', label: 'EOS Downloads',             unit: 'downloads', total: dlTotal,   last_3m: dl3m,    last_12m: dl12m,    regional: false, by_month: toMonthArr(dlByMonth,  'cnt') },
        { key: 'videos',    label: 'Video Plays',               unit: 'plays',     total: vidTotal,  last_3m: vid3m,   last_12m: vid12m,   regional: false, by_month: toMonthArr(vidByMonth, 'plays'), watch_mins_total: Math.round(secsTotal / 60) },
        { key: 'cases',     label: 'Support Cases',             unit: 'cases',     total: caseTotal, last_3m: case3m,  last_12m: case12m,  regional: false, by_month: toMonthArr(caseByMonth,'cnt'), by_type: caseByType },
        { key: 'webinars',  label: 'Webinar Attendance',        unit: 'attendees', total: webTotal,  last_3m: web3m,   last_12m: web12m,   regional: true,  by_region: webByRegion,  by_market: webMktArr,  by_month: toMonthArr(webByMonth, 'attendees') },
        { key: 'gm',        label: 'Group Meeting Attendance',  unit: 'attendees', total: gmTotal,   last_3m: gm3m,    last_12m: gm12m,    regional: true,  by_region: gmByRegion,   by_market: gmMktArr,   by_month: toMonthArr(gmByMonth,  'attendees') },
      ],
      region_totals: regionTotals,
    };

    cacheSet(CACHE_KEY, payload, CACHE_TTL);
    res.json(payload);
  } catch (err) {
    console.error('[eos-engagement]', err.message);
    res.status(500).json({ error: err.message });
  }
};
