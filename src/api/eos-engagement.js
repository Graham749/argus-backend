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
  'Slovakia': 'EMEA', 'Slovenia': 'EMEA', 'South Africa': 'EMEA', 'Pan-European': 'EMEA',
  'Global Energy': 'EMEA', 'Hydrogen': 'EMEA', 'Commodities': 'EMEA',
  'Western Balkans': 'EMEA', 'Banking Roundtable': 'EMEA',
  'EU Hydrogen': 'EMEA', 'Pan-European': 'EMEA',
  'SEE': 'EMEA', 'Benelux': 'EMEA',
  // APAC
  'Australia (NEM)': 'APAC', 'Australia (WEM)': 'APAC', 'Japan': 'APAC',
  'Australia NEM': 'APAC', 'Australia WEM': 'APAC',
  'India': 'APAC', 'South Korea': 'APAC', 'Philippines': 'APAC',
  'Singapore': 'APAC', 'Malaysia': 'APAC', 'APAC': 'APAC', 'Taiwan': 'APAC',
  'APAC Hydrogen': 'APAC',
  // NORAM
  'ERCOT': 'NORAM', 'PJM': 'NORAM', 'CAISO': 'NORAM', 'MISO': 'NORAM',
  'WECC': 'NORAM', 'Alberta': 'NORAM', 'NYISO': 'NORAM', 'ISO-NE': 'NORAM',
  'NYISO/ISO-NE': 'NORAM', 'SPP': 'NORAM', 'Pan-NORAM': 'NORAM',
  'SERC': 'NORAM', 'Ontario': 'NORAM', 'AIES': 'NORAM',
  // LATAM
  'Brazil': 'LATAM', 'Chile': 'LATAM', 'Mexico': 'LATAM', 'Peru': 'LATAM',
};

// Normalise market names from alternate spellings/abbreviations used across systems
const MARKET_NORM = {
  'GB': 'Great Britain', 'UK': 'Great Britain', 'United Kingdom': 'Great Britain',
  'Aus NEM': 'Australia NEM', 'AUS NEM': 'Australia NEM', 'AUS-NEM': 'Australia NEM',
  'Aus WEM': 'Australia WEM', 'AUS WEM': 'Australia WEM', 'AUS-WEM': 'Australia WEM',
  // Webinar/GM abbreviations → canonical SF product market names
  'PanEU': 'Pan-European', 'Pan EU': 'Pan-European',
  'PanNORAM': 'Pan-NORAM', 'Pan NORAM': 'Pan-NORAM', 'Pan-USA': 'Pan-NORAM',
  'Hydrogen': 'EU Hydrogen',
  'AIES': 'Alberta',
  'Melbourne (or other AUS city)': 'Australia NEM',
  'Sydney': 'Australia NEM',
  'ISO-NE, NYISO': 'ISO-NE',
};

const VALID_REGIONS = new Set(['EMEA', 'APAC', 'NORAM', 'LATAM']);

function normalizeMarket(m) {
  if (!m) return m;
  const t = m.trim();
  return MARKET_NORM[t] || t;
}

function regionOf(market) {
  if (!market) return 'Other';
  return MARKET_TO_REGION[normalizeMarket(market)] || 'Other';
}

// Determine region from a raw region string (may be 'EMEA', 'APAC', etc.)
// Falls back to market-name lookup if region string is not a valid region code.
function regionFromRaw(regionRaw, marketRaw) {
  if (regionRaw && VALID_REGIONS.has(regionRaw.trim())) return regionRaw.trim();
  return regionOf(marketRaw);
}

// Workshop case types (everything else = email/analyst support)
const WORKSHOP_TYPES = new Set(['Workshop', 'Content_workshop']);

module.exports = async function eosEngagement(req, res) {
  try {
    const cached = cacheGet(CACHE_KEY);
    if (cached && !req.query.bust) return res.json(cached);

    const [runsRows, dlRows, vidRows, caseRows, webinarRows, gmRows, acctRegionRows, dlAcctRows, caseAcctRows, dlMktRows, caseMktRows, subRegionRows, productTrendRows, dlProductRows] = await Promise.all([
      // 1. Software runs by year + product_region — DISTINCT simulation_id (matches PBI DAX measure)
      query(`
        SELECT YEAR(r.launch_time) AS yr, r.product_region, COUNT(DISTINCT r.simulation_id) AS cnt
        FROM dbo.gold_eos_runs r
        INNER JOIN dbo.gold_mdm_account mdm ON mdm.sf_account_code = r.account_id
        WHERE r.is_internal = 0
          AND r.launch_time IS NOT NULL
        GROUP BY YEAR(r.launch_time), r.product_region
        ORDER BY yr
      `),

      // 2. EOS downloads by month — excl scenarioExplorer, COUNT DISTINCT tracking_id (matches PBI 840K)
      //    tracking_id IS NOT NULL removed from WHERE: COUNT(DISTINCT) ignores NULLs so cnt stays the
      //    same, but removing the filter lets user_email count include records where tracking_id is NULL.
      query(`
        SELECT FORMAT(CAST(download_date AS DATE), 'yyyy-MM') AS month,
               COUNT(DISTINCT tracking_id) AS cnt,
               COUNT(DISTINCT user_email)  AS users
        FROM dbo.gold_eos_downloads
        WHERE download_date IS NOT NULL
          AND COALESCE(product, '') != 'scenarioExplorer'
        GROUP BY FORMAT(CAST(download_date AS DATE), 'yyyy-MM')
        ORDER BY month
      `),

      // 3. Video plays by month — DISTINCT tracking_id matches PBI Watch Count DAX measure
      query(`
        SELECT FORMAT(CAST(time AS DATE), 'yyyy-MM') AS month,
               COUNT(DISTINCT tracking_id) AS plays,
               SUM(watch_time_secs) AS watch_secs
        FROM dbo.sp_raw_eos2_videos
        WHERE time IS NOT NULL
          AND tracking_id IS NOT NULL
        GROUP BY FORMAT(CAST(time AS DATE), 'yyyy-MM')
        ORDER BY month
      `),

      // 4. Cases by month + type — date_of_work = "delivered date" per reference notes
      query(`
        SELECT
          FORMAT(TRY_CAST(date_of_work AS DATE), 'yyyy-MM') AS month,
          COALESCE(case_type, 'Other') AS case_type,
          COUNT(*) AS cnt
        FROM dbo.gold_sf_cases
        WHERE TRY_CAST(date_of_work AS DATE) IS NOT NULL
          AND account_id IS NOT NULL
        GROUP BY FORMAT(TRY_CAST(date_of_work AS DATE), 'yyyy-MM'), COALESCE(case_type, 'Other')
        ORDER BY month
      `),

      // 5. Webinars by market + month (region_raw for direct region assignment)
      query(`
        SELECT market_raw, region_raw, FORMAT(event_date, 'yyyy-MM') AS month, SUM(COALESCE(attendees, 0)) AS attendees, COUNT(*) AS event_count
        FROM dbo.gold_webinar_schedule
        WHERE event_date IS NOT NULL AND COALESCE(attendees, 0) > 0
        GROUP BY market_raw, region_raw, FORMAT(event_date, 'yyyy-MM')
        ORDER BY month DESC
      `),

      // 6. Group meetings by market + month (region for direct region assignment)
      query(`
        SELECT market_raw, region AS region_raw, FORMAT(event_date, 'yyyy-MM') AS month, SUM(COALESCE(attendees, 0)) AS attendees, COUNT(*) AS event_count
        FROM dbo.gold_gm_annual_plan
        WHERE event_date IS NOT NULL AND COALESCE(attendees, 0) > 0
        GROUP BY market_raw, region, FORMAT(event_date, 'yyyy-MM')
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

      // 8. Downloads by region — derived from product code (what was downloaded), not account region
      //    NORAM evaluated before APAC so wec% (WECC) is caught before wem%/waa% (Australia WEM)
      query(`
        SELECT
          CASE
            WHEN LOWER(product) LIKE 'bra%' OR LOWER(product) LIKE 'chl%' OR LOWER(product) LIKE 'mex%' THEN 'LATAM'
            WHEN LOWER(product) LIKE 'erc%'   OR LOWER(product) LIKE 'pjm%'
              OR LOWER(product) LIKE 'cai%'   OR LOWER(product) LIKE 'cas%'
              OR LOWER(product) LIKE 'sp15%'  OR LOWER(product) LIKE 'zp26%' OR LOWER(product) LIKE 'np15%'
              OR LOWER(product) LIKE 'mis%'   OR LOWER(product) LIKE 'isone%'
              OR LOWER(product) LIKE 'ny%'    OR LOWER(product) LIKE 'ne%'
              OR LOWER(product) LIKE 'alb%'   OR LOWER(product) LIKE 'abt%'  OR LOWER(product) LIKE 'ont%'
              OR LOWER(product) LIKE 'spp%'   OR LOWER(product) LIKE 'wec%'   OR LOWER(product) LIKE 'aies%' THEN 'NORAM'
            WHEN LOWER(product) LIKE 'aus%'   OR LOWER(product) LIKE 'ais%'
              OR LOWER(product) LIKE 'nsw%'   OR LOWER(product) LIKE 'vic%'
              OR LOWER(product) LIKE 'saa%'   OR LOWER(product) LIKE 'qld%'  OR LOWER(product) LIKE 'tas%'
              OR LOWER(product) LIKE 'waa%'   OR LOWER(product) LIKE 'wem%'
              OR LOWER(product) LIKE 'jpn%'   OR LOWER(product) LIKE 'jap%'
              OR LOWER(product) LIKE 'phl%'   OR LOWER(product) LIKE 'sin%'  OR LOWER(product) LIKE 'sgp%'
              OR LOWER(product) LIKE 'kor%'   OR LOWER(product) LIKE 'tw%'
              OR LOWER(product) LIKE 'ind%'   OR LOWER(product) LIKE 'mys%' THEN 'APAC'
            WHEN product IS NULL THEN 'Other'
            ELSE 'EMEA'
          END AS region,
          COUNT(DISTINCT tracking_id) AS cnt
        FROM dbo.gold_eos_downloads
        WHERE download_date IS NOT NULL
          AND tracking_id IS NOT NULL
          AND COALESCE(product, '') != 'scenarioExplorer'
        GROUP BY
          CASE
            WHEN LOWER(product) LIKE 'bra%' OR LOWER(product) LIKE 'chl%' OR LOWER(product) LIKE 'mex%' THEN 'LATAM'
            WHEN LOWER(product) LIKE 'erc%'   OR LOWER(product) LIKE 'pjm%'
              OR LOWER(product) LIKE 'cai%'   OR LOWER(product) LIKE 'cas%'
              OR LOWER(product) LIKE 'sp15%'  OR LOWER(product) LIKE 'zp26%' OR LOWER(product) LIKE 'np15%'
              OR LOWER(product) LIKE 'mis%'   OR LOWER(product) LIKE 'isone%'
              OR LOWER(product) LIKE 'ny%'    OR LOWER(product) LIKE 'ne%'
              OR LOWER(product) LIKE 'alb%'   OR LOWER(product) LIKE 'abt%'  OR LOWER(product) LIKE 'ont%'
              OR LOWER(product) LIKE 'spp%'   OR LOWER(product) LIKE 'wec%'   OR LOWER(product) LIKE 'aies%' THEN 'NORAM'
            WHEN LOWER(product) LIKE 'aus%'   OR LOWER(product) LIKE 'ais%'
              OR LOWER(product) LIKE 'nsw%'   OR LOWER(product) LIKE 'vic%'
              OR LOWER(product) LIKE 'saa%'   OR LOWER(product) LIKE 'qld%'  OR LOWER(product) LIKE 'tas%'
              OR LOWER(product) LIKE 'waa%'   OR LOWER(product) LIKE 'wem%'
              OR LOWER(product) LIKE 'jpn%'   OR LOWER(product) LIKE 'jap%'
              OR LOWER(product) LIKE 'phl%'   OR LOWER(product) LIKE 'sin%'  OR LOWER(product) LIKE 'sgp%'
              OR LOWER(product) LIKE 'kor%'   OR LOWER(product) LIKE 'tw%'
              OR LOWER(product) LIKE 'ind%'   OR LOWER(product) LIKE 'mys%' THEN 'APAC'
            WHEN product IS NULL THEN 'Other'
            ELSE 'EMEA'
          END
      `),

      // 9. Cases by account + type — date_of_work consistent with query 4
      query(`
        SELECT mdm.sf_account_code, COALESCE(c.case_type, 'Other') AS case_type, COUNT(*) AS cnt
        FROM dbo.gold_sf_cases c
        JOIN dbo.gold_mdm_account mdm ON mdm.sf_account_id = c.account_id
        WHERE TRY_CAST(c.date_of_work AS DATE) IS NOT NULL AND c.account_id IS NOT NULL
        GROUP BY mdm.sf_account_code, COALESCE(c.case_type, 'Other')
      `),

      // 10. Downloads by market — product code prefix → market name
      //     LATAM/NORAM/APAC mapped directly; EMEA broken out to individual markets.
      //     NORAM checked before APAC (wecc% before wec%/wem%); ita_nor% before ita%.
      //     NULL market = unrecognised code → excluded from market drill via WHERE.
      query(`
        WITH dl AS (
          SELECT
            CASE
              -- LATAM
              WHEN LOWER(product) LIKE 'bra%' THEN 'Brazil'
              WHEN LOWER(product) LIKE 'chl%' THEN 'Chile'
              WHEN LOWER(product) LIKE 'mex%' THEN 'Mexico'
              WHEN LOWER(product) LIKE 'per%' THEN 'Peru'
              -- NORAM (wec% before wem%/waa% to avoid Australia WEM cross-match)
              WHEN LOWER(product) LIKE 'erc%'   THEN 'ERCOT'
              WHEN LOWER(product) LIKE 'pjm%'   THEN 'PJM'
              WHEN LOWER(product) LIKE 'cai%' OR LOWER(product) LIKE 'cas%'
                OR LOWER(product) LIKE 'sp15%' OR LOWER(product) LIKE 'zp26%'
                OR LOWER(product) LIKE 'np15%' THEN 'CAISO'
              WHEN LOWER(product) LIKE 'mis%'   THEN 'MISO'
              WHEN LOWER(product) LIKE 'isone%' OR LOWER(product) LIKE 'ne%' THEN 'ISO-NE'
              WHEN LOWER(product) LIKE 'ny%'    THEN 'NYISO'
              WHEN LOWER(product) LIKE 'alb%' OR LOWER(product) LIKE 'abt%' THEN 'Alberta'
              WHEN LOWER(product) LIKE 'ont%' OR LOWER(product) LIKE 'ieso%' THEN 'Ontario'
              WHEN LOWER(product) LIKE 'spp%'   THEN 'SPP'
              WHEN LOWER(product) LIKE 'serc%'  THEN 'SERC'
              WHEN LOWER(product) LIKE 'wec%'   THEN 'WECC'
              -- APAC (waa%/wem% before aus% to avoid NEM cross-match)
              WHEN LOWER(product) LIKE 'waa%' OR LOWER(product) LIKE 'wem%' THEN 'Australia WEM'
              WHEN LOWER(product) LIKE 'aus%' OR LOWER(product) LIKE 'ais%'
                OR LOWER(product) LIKE 'nsw%' OR LOWER(product) LIKE 'vic%'
                OR LOWER(product) LIKE 'saa%' OR LOWER(product) LIKE 'qld%'
                OR LOWER(product) LIKE 'tas%' THEN 'Australia NEM'
              WHEN LOWER(product) LIKE 'jpn%' OR LOWER(product) LIKE 'jap%' THEN 'Japan'
              WHEN LOWER(product) LIKE 'phl%'   THEN 'Philippines'
              WHEN LOWER(product) LIKE 'sin%' OR LOWER(product) LIKE 'sgp%' THEN 'Singapore'
              WHEN LOWER(product) LIKE 'kor%'   THEN 'South Korea'
              WHEN LOWER(product) LIKE 'tw%'    THEN 'Taiwan'
              WHEN LOWER(product) LIKE 'ind%'   THEN 'India'
              WHEN LOWER(product) LIKE 'mys%'   THEN 'Malaysia'
              -- EMEA — market-level (ita_nor% before ita%)
              WHEN LOWER(product) LIKE 'gbr%'   THEN 'Great Britain'
              WHEN LOWER(product) LIKE 'deu%'   THEN 'Germany'
              WHEN LOWER(product) LIKE 'ita_nor%' OR LOWER(product) LIKE 'ita_cnor%' THEN 'Nordics'
              WHEN LOWER(product) LIKE 'ita%'   THEN 'Italy'
              WHEN LOWER(product) LIKE 'fra%'   THEN 'France'
              WHEN LOWER(product) LIKE 'esp%' OR LOWER(product) LIKE 'ibe%'
                OR LOWER(product) LIKE 'ibr%' OR LOWER(product) LIKE 'prt%' THEN 'Iberia'
              WHEN LOWER(product) LIKE 'nld%'   THEN 'Netherlands'
              WHEN LOWER(product) LIKE 'nor%' OR LOWER(product) LIKE 'swe%'
                OR LOWER(product) LIKE 'fin%' OR LOWER(product) LIKE 'den%'
                OR LOWER(product) LIKE 'dnk%' OR LOWER(product) LIKE 'nod%' THEN 'Nordics'
              WHEN LOWER(product) LIKE 'pol%'   THEN 'Poland'
              WHEN LOWER(product) LIKE 'irl%' OR LOWER(product) LIKE 'irx%' THEN 'Ireland'
              WHEN LOWER(product) LIKE 'bel%'   THEN 'Belgium'
              WHEN LOWER(product) LIKE 'rou%'   THEN 'Romania'
              WHEN LOWER(product) LIKE 'grc%'   THEN 'Greece'
              WHEN LOWER(product) LIKE 'est%' OR LOWER(product) LIKE 'ltu%'
                OR LOWER(product) LIKE 'lva%' OR LOWER(product) LIKE 'bal%' THEN 'Baltics'
              WHEN LOWER(product) LIKE 'bgr%'   THEN 'Bulgaria'
              WHEN LOWER(product) LIKE 'hun%'   THEN 'Hungary'
              WHEN LOWER(product) LIKE 'hrv%'   THEN 'Croatia'
              WHEN LOWER(product) LIKE 'srb%'   THEN 'Serbia'
              WHEN LOWER(product) LIKE 'che%'   THEN 'Switzerland'
              WHEN LOWER(product) LIKE 'aut%'   THEN 'Austria'
              WHEN LOWER(product) LIKE 'cze%'   THEN 'Czechia'
              WHEN LOWER(product) LIKE 'svk%'   THEN 'Slovakia'
              WHEN LOWER(product) LIKE 'svn%'   THEN 'Slovenia'
              WHEN LOWER(product) LIKE 'zaf%'   THEN 'South Africa'
              WHEN LOWER(product) LIKE 'see%'   THEN 'SEE'
              WHEN LOWER(product) LIKE 'wbl%' OR LOWER(product) LIKE 'wbal%' THEN 'Western Balkans'
              WHEN LOWER(product) LIKE 'glo%'   THEN 'Global Energy'
              -- NORAM — AIES (Alberta Interconnected Electrical System)
              WHEN LOWER(product) LIKE 'aies%'  THEN 'Alberta'
              -- Hydrogen products
              WHEN LOWER(product) LIKE 'eurhydrogen%' THEN 'EU Hydrogen'
              WHEN LOWER(product) LIKE 'apachydrogen%' THEN 'APAC Hydrogen'
              ELSE NULL
            END AS market,
            tracking_id,
            user_email,
            FORMAT(CAST(download_date AS DATE), 'yyyy-MM') AS month
          FROM dbo.gold_eos_downloads
          WHERE download_date IS NOT NULL
            AND COALESCE(product, '') != 'scenarioExplorer'
        )
        SELECT market, month, COUNT(DISTINCT tracking_id) AS cnt, COUNT(DISTINCT user_email) AS users
        FROM dl
        WHERE market IS NOT NULL
        GROUP BY market, month
        ORDER BY market, month
      `),

      // 11. Cases by product market+region — joins via product_id_sf (SF record ID)
      query(`
        SELECT
          COALESCE(c.case_type, 'Other') AS case_type,
          COALESCE(p.Energy_Market__c, 'Other') AS market,
          COALESCE(p.Energy_Market_Region__c, 'Other') AS region,
          FORMAT(TRY_CAST(c.date_of_work AS DATE), 'yyyy-MM') AS month,
          COUNT(*) AS cnt
        FROM dbo.gold_sf_cases c
        LEFT JOIN dbo.gold_sf_products p ON p.product_id_sf = c.product_id
        WHERE TRY_CAST(c.date_of_work AS DATE) IS NOT NULL
          AND c.account_id IS NOT NULL
        GROUP BY COALESCE(c.case_type, 'Other'), COALESCE(p.Energy_Market__c, 'Other'), COALESCE(p.Energy_Market_Region__c, 'Other'), FORMAT(TRY_CAST(c.date_of_work AS DATE), 'yyyy-MM')
        ORDER BY cnt DESC
      `).catch(e => {
        console.warn('[eos-engagement] cases-by-mkt (product join) skipped:', e.message);
        return [];
      }),

      // 12. Subscription-based primary region per account — fallback for LATAM and other
      //     accounts that have few/no EOS runs (Brazil, Chile accounts don't run EOS heavily)
      query(`
        WITH sub_region AS (
          SELECT mdm.sf_account_code, sub.energy_region, COUNT(*) AS cnt
          FROM dbo.gold_sf_subscriptions sub
          INNER JOIN dbo.gold_mdm_account mdm ON mdm.sf_account_name = sub.account_name
          WHERE sub.energy_region IN ('EMEA','APAC','NORAM','LATAM')
            AND sub.status IN ('Active', 'Termination in Progress')
            AND mdm.sf_account_code IS NOT NULL
          GROUP BY mdm.sf_account_code, sub.energy_region
        ),
        primary_region AS (
          SELECT sf_account_code, energy_region,
            ROW_NUMBER() OVER (PARTITION BY sf_account_code ORDER BY cnt DESC) AS rn
          FROM sub_region
        )
        SELECT sf_account_code, energy_region AS region FROM primary_region WHERE rn = 1
      `).catch(e => { console.warn('[eos-engagement] sub-region fallback skipped:', e.message); return []; }),

      // 13. Completed runs + unique active users by product + market + month
      //     market = product_region from v_silver_eos_runs (already mapped to canonical names)
      query(`
        SELECT
          r.software_product,
          COALESCE(r.product_region, 'Other') AS market,
          FORMAT(r.launch_time, 'yyyy-MM')    AS month,
          COUNT(DISTINCT r.simulation_id)     AS runs,
          COUNT(DISTINCT r.user_email)        AS users
        FROM dbo.gold_eos_runs r
        INNER JOIN dbo.gold_mdm_account mdm ON mdm.sf_account_code = r.account_id
        WHERE r.is_internal = 0
          AND r.execution_status = 'Complete'
          AND r.launch_time IS NOT NULL
        GROUP BY r.software_product, COALESCE(r.product_region, 'Other'), FORMAT(r.launch_time, 'yyyy-MM')
        ORDER BY r.software_product, market, month
      `).catch(e => { console.warn('[eos-engagement] product-trends skipped:', e.message); return []; }),

      // 14. Downloads by raw content product code × month — top products by volume.
      //     product field contains content identifiers like 'ausflex', 'gbr_power', etc.
      //     Capped at top 100 products by all-time downloads to keep payload manageable.
      query(`
        WITH ranked AS (
          SELECT product, COUNT(DISTINCT tracking_id) AS total_cnt
          FROM dbo.gold_eos_downloads
          WHERE download_date IS NOT NULL
            AND product IS NOT NULL
            AND COALESCE(product, '') != 'scenarioExplorer'
          GROUP BY product
        ),
        top_products AS (
          SELECT TOP 100 product FROM ranked ORDER BY total_cnt DESC
        )
        SELECT d.product,
               FORMAT(CAST(d.download_date AS DATE), 'yyyy-MM') AS month,
               COUNT(DISTINCT d.tracking_id) AS cnt,
               COUNT(DISTINCT d.user_email)  AS users
        FROM dbo.gold_eos_downloads d
        INNER JOIN top_products tp ON tp.product = d.product
        WHERE d.download_date IS NOT NULL
          AND COALESCE(d.product, '') != 'scenarioExplorer'
        GROUP BY d.product, FORMAT(CAST(d.download_date AS DATE), 'yyyy-MM')
        ORDER BY d.product, month
      `).catch(e => { console.warn('[eos-engagement] dl-by-product skipped:', e.message); return []; }),
    ]);

    // ── Build account → primary region + market lookup ───────────────────────
    const accountRegion = {}, accountMarket = {};
    for (const r of acctRegionRows) {
      accountRegion[r.sf_account_code] = regionOf(r.product_region);
      accountMarket[r.sf_account_code] = r.product_region || 'Other';
    }
    // Supplement with subscription-based region for accounts not in EOS runs (e.g. LATAM clients)
    for (const r of subRegionRows) {
      if (!accountRegion[r.sf_account_code] && VALID_REGIONS.has(r.region)) {
        accountRegion[r.sf_account_code] = r.region;
      }
    }

    // ── Process runs ─────────────────────────────────────────────────────────
    // Yearly grain from v_silver_eos_runs — distribute each year evenly across
    // 12 synthetic months so the existing month-window filter logic works.
    const runsByRegion = {}, runsByMarket = {}, runsByMonth = {};
    let runsTotal = 0;
    for (const r of runsRows) {
      const region = regionOf(r.product_region);
      const mkt    = r.product_region || 'Unmapped';
      const yr     = String(r.yr);
      const cnt    = Number(r.cnt) || 0;
      runsTotal += cnt;
      runsByRegion[region] = (runsByRegion[region] || 0) + cnt;
      if (!runsByMarket[mkt]) runsByMarket[mkt] = { total: 0, region, by_month: {} };
      runsByMarket[mkt].total += cnt;
      // Distribute yearly total across 12 months; remainder goes to month 12 so sum is exact
      const perMonth = Math.floor(cnt / 12);
      const remainder = cnt - perMonth * 12;
      for (let m = 1; m <= 12; m++) {
        const key = yr + '-' + String(m).padStart(2, '0');
        const val = m === 12 ? perMonth + remainder : perMonth;
        runsByMonth[key] = (runsByMonth[key] || 0) + val;
        runsByMarket[mkt].by_month[key] = (runsByMarket[mkt].by_month[key] || 0) + val;
      }
    }
    const runsMktArr = Object.entries(runsByMarket)
      .map(([market, v]) => ({ market, ...v }))
      .sort((a, b) => b.total - a.total);

    // ── Process downloads ─────────────────────────────────────────────────────
    const dlByMonth = {}, dlByMonthUsers = {};
    const dlByRegion = {};
    for (const r of dlRows) {
      const m = r.month;
      const cnt = Number(r.cnt) || 0;
      const users = Number(r.users) || 0;
      if (m) {
        dlByMonth[m]      = (dlByMonth[m]      || 0) + cnt;
        dlByMonthUsers[m] = (dlByMonthUsers[m] || 0) + users;
      }
    }
    for (const r of dlAcctRows) {
      dlByRegion[r.region || 'Other'] = (dlByRegion[r.region || 'Other'] || 0) + (Number(r.cnt) || 0);
    }
    const dlTotal = Object.values(dlByMonth).reduce((s, v) => s + v, 0);

    // ── Downloads by market (product code → market name) ─────────────────────
    const dlByMarket = {};
    for (const r of dlMktRows) {
      if (!r.market) continue;
      const cnt   = Number(r.cnt)   || 0;
      const users = Number(r.users) || 0;
      if (!dlByMarket[r.market]) dlByMarket[r.market] = { total: 0, total_users: 0, region: regionOf(r.market), by_month: {}, by_month_users: {} };
      dlByMarket[r.market].total       += cnt;
      dlByMarket[r.market].total_users += users;
      if (r.month) {
        dlByMarket[r.market].by_month[r.month]       = (dlByMarket[r.market].by_month[r.month]       || 0) + cnt;
        dlByMarket[r.market].by_month_users[r.month] = (dlByMarket[r.market].by_month_users[r.month] || 0) + users;
      }
    }
    const dlMktArr = Object.entries(dlByMarket)
      .map(([market, v]) => ({ market, ...v }))
      .sort((a, b) => b.total - a.total);

    // ── Downloads by raw content product code × month ────────────────────────
    // Structure: { 'ausflex': { '2025-01': { cnt, users }, ... }, ... }
    const dlByProduct = {};
    for (const r of dlProductRows) {
      const prod  = r.product;
      const month = r.month;
      if (!prod || !month) continue;
      if (!dlByProduct[prod]) dlByProduct[prod] = {};
      dlByProduct[prod][month] = { cnt: Number(r.cnt) || 0, users: Number(r.users) || 0 };
    }

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

    // ── Cases by market (account's primary market from runs) ──────────────────
    const workshopByMarket = {}, emailByMarket = {};
    for (const r of caseAcctRows) {
      const mkt = accountMarket[r.sf_account_code] || 'Other';
      if (mkt === 'Other') continue; // skip accounts with no EOS run market
      const region = regionOf(mkt);
      const cnt = Number(r.cnt) || 0;
      if (WORKSHOP_TYPES.has(r.case_type)) {
        if (!workshopByMarket[mkt]) workshopByMarket[mkt] = { total: 0, region };
        workshopByMarket[mkt].total += cnt;
      } else {
        if (!emailByMarket[mkt]) emailByMarket[mkt] = { total: 0, region };
        emailByMarket[mkt].total += cnt;
      }
    }
    let workshopMktArr = Object.entries(workshopByMarket)
      .map(([market, v]) => ({ market, ...v })).sort((a, b) => b.total - a.total);
    let emailMktArr = Object.entries(emailByMarket)
      .map(([market, v]) => ({ market, ...v })).sort((a, b) => b.total - a.total);

    // ── Cases by product market+region (query 11) — preferred over account-based ────
    // product_id_sf join gives both Energy_Market__c and Energy_Market_Region__c directly from SF.
    if (caseMktRows.length > 0) {
      const wsByMkt = {}, emByMkt = {}, wsByReg = {}, emByReg = {};
      for (const r of caseMktRows) {
        const mkt = normalizeMarket(r.market || 'Other');
        const region = VALID_REGIONS.has(r.region) ? r.region : regionOf(mkt);
        const cnt = Number(r.cnt) || 0;
        const mo = r.month;
        // Regional totals — track all regions including Other (so KPI / distribution bar work)
        const regKey = VALID_REGIONS.has(region) ? region : 'Other';
        if (WORKSHOP_TYPES.has(r.case_type)) {
          wsByReg[regKey] = (wsByReg[regKey] || 0) + cnt;
        } else {
          emByReg[regKey] = (emByReg[regKey] || 0) + cnt;
        }
        // Market breakdown — skip rows with no product (market=Other)
        if (mkt === 'Other') continue;
        if (WORKSHOP_TYPES.has(r.case_type)) {
          if (!wsByMkt[mkt]) wsByMkt[mkt] = { total: 0, region, by_month: {} };
          wsByMkt[mkt].total += cnt;
          if (mo) wsByMkt[mkt].by_month[mo] = (wsByMkt[mkt].by_month[mo] || 0) + cnt;
        } else {
          if (!emByMkt[mkt]) emByMkt[mkt] = { total: 0, region, by_month: {} };
          emByMkt[mkt].total += cnt;
          if (mo) emByMkt[mkt].by_month[mo] = (emByMkt[mkt].by_month[mo] || 0) + cnt;
        }
      }
      const wsArr = Object.entries(wsByMkt).map(([market, v]) => ({ market, ...v })).sort((a, b) => b.total - a.total);
      const emArr = Object.entries(emByMkt).map(([market, v]) => ({ market, ...v })).sort((a, b) => b.total - a.total);
      if (wsArr.length > 0) workshopMktArr = wsArr;
      if (emArr.length > 0) emailMktArr    = emArr;
      // Replace account-based regional breakdown with product-based (matches PBI exactly)
      if (Object.keys(wsByReg).length > 0) {
        Object.keys(workshopByRegion).forEach(k => delete workshopByRegion[k]);
        Object.assign(workshopByRegion, wsByReg);
      }
      if (Object.keys(emByReg).length > 0) {
        Object.keys(emailByRegion).forEach(k => delete emailByRegion[k]);
        Object.assign(emailByRegion, emByReg);
      }
    }

    // ── Process webinars ──────────────────────────────────────────────────────
    // market_raw can be pipe-separated (e.g. "Great Britain|France"); split for
    // by_market but keep totals/months un-split to avoid double-counting.
    const webByMonth = {}, webByRegion = {}, webByMarket = {};
    for (const r of webinarRows) {
      const m = r.month; const att = Number(r.attendees) || 0; const evCnt = Number(r.event_count) || 0;
      const region = regionFromRaw(r.region_raw, r.market_raw);
      if (m) webByMonth[m] = (webByMonth[m] || 0) + att;
      webByRegion[region] = (webByRegion[region] || 0) + att;
      // Split pipe-separated markets for the drill-down table
      const mkts = (r.market_raw || '').split('|').map(s => normalizeMarket(s.trim())).filter(Boolean);
      const mktList = mkts.length ? mkts : ['Other'];
      mktList.forEach(function(mkt) {
        const mktReg = regionOf(mkt) !== 'Other' ? regionOf(mkt) : region;
        if (!webByMarket[mkt]) webByMarket[mkt] = { attendees: 0, event_count: 0, region: mktReg, by_month: {} };
        webByMarket[mkt].attendees   += att;
        webByMarket[mkt].event_count += evCnt;
        if (m) webByMarket[mkt].by_month[m] = (webByMarket[mkt].by_month[m] || 0) + att;
      });
    }
    const webTotal = Object.values(webByMonth).reduce((s, v) => s + v, 0);

    // ── Process group meetings ────────────────────────────────────────────────
    const gmByMonth = {}, gmByRegion = {}, gmByMarket = {};
    for (const r of gmRows) {
      const m = r.month; const att = Number(r.attendees) || 0; const evCnt = Number(r.event_count) || 0;
      const region = regionFromRaw(r.region_raw, r.market_raw);
      if (m) gmByMonth[m] = (gmByMonth[m] || 0) + att;
      gmByRegion[region] = (gmByRegion[region] || 0) + att;
      const mkts = (r.market_raw || '').split('|').map(s => normalizeMarket(s.trim())).filter(Boolean);
      const mktList = mkts.length ? mkts : ['Other'];
      mktList.forEach(function(mkt) {
        const mktReg = regionOf(mkt) !== 'Other' ? regionOf(mkt) : region;
        if (!gmByMarket[mkt]) gmByMarket[mkt] = { attendees: 0, event_count: 0, region: mktReg, by_month: {} };
        gmByMarket[mkt].attendees   += att;
        gmByMarket[mkt].event_count += evCnt;
        if (m) gmByMarket[mkt].by_month[m] = (gmByMarket[mkt].by_month[m] || 0) + att;
      });
    }
    const gmTotal = Object.values(gmByMonth).reduce((s, v) => s + v, 0);

    const toMonthArr = (obj, valKey) =>
      Object.entries(obj).map(([month, v]) => ({ month, [valKey]: v })).sort((a, b) => a.month.localeCompare(b.month));
    const webMktArr = Object.entries(webByMarket).map(([market, v]) => ({ market, ...v })).sort((a, b) => b.attendees - a.attendees);
    const gmMktArr  = Object.entries(gmByMarket).map(([market, v]) => ({ market, ...v })).sort((a, b) => b.attendees - a.attendees);

    // ── Product trend charts (query 13) ──────────────────────────────────────
    // prodTrends:  { product → { month → { runs, users } } }  (monthly totals)
    // prodMarkets: { product → { market → { region, total_runs, by_month: { month → runs } } } }
    const prodTrends = {}, prodMarkets = {};
    for (const r of productTrendRows) {
      const p  = r.software_product || 'Other';
      const mk = r.market || 'Other';
      const m  = r.month;
      const runs  = Number(r.runs)  || 0;
      const users = Number(r.users) || 0;
      // Monthly totals (sum over all markets)
      if (!prodTrends[p]) prodTrends[p] = {};
      if (m) {
        if (!prodTrends[p][m]) prodTrends[p][m] = { runs: 0, users: 0 };
        prodTrends[p][m].runs  += runs;
        prodTrends[p][m].users += users;
      }
      // Per-market breakdown
      if (!prodMarkets[p]) prodMarkets[p] = {};
      if (!prodMarkets[p][mk]) prodMarkets[p][mk] = { region: regionOf(mk), total_runs: 0, total_users: 0, by_month: {}, by_month_users: {} };
      prodMarkets[p][mk].total_runs  += runs;
      prodMarkets[p][mk].total_users += users;
      if (m) {
        prodMarkets[p][mk].by_month[m]       = (prodMarkets[p][mk].by_month[m]       || 0) + runs;
        prodMarkets[p][mk].by_month_users[m]  = (prodMarkets[p][mk].by_month_users[m]  || 0) + users;
      }
    }

    // Streams in display order: downloads, software, webinars, gm, videos, workshops, email_cases
    const payload = {
      snapshot: new Date().toISOString().slice(0, 10),
      product_trends: prodTrends,
      product_markets: prodMarkets,
      streams: [
        { key: 'downloads',   label: 'EOS Report Downloads',              unit: 'downloads', source: 'EOS Usage',                  total: dlTotal,       regional: true,  by_region: dlByRegion,       by_month: toMonthArr(dlByMonth, 'cnt'), by_month_users: toMonthArr(dlByMonthUsers, 'cnt'), by_market: dlMktArr, by_product: dlByProduct },
        { key: 'software',    label: 'Software Usage (Runs)',               unit: 'runs',   source: 'Software Usage',              total: runsTotal,     regional: true,  by_region: runsByRegion,     by_month: toMonthArr(runsByMonth, 'cnt'), by_market: runsMktArr },
        { key: 'webinars',    label: 'Webinar Attendance',                unit: 'attendees', source: 'Integrated Research Tracker', total: webTotal,      regional: true,  by_region: webByRegion,      by_month: toMonthArr(webByMonth,      'attendees'), by_market: webMktArr },
        { key: 'gm',          label: 'Group Meeting Attendance',          unit: 'attendees', source: 'Integrated Research Tracker', total: gmTotal,       regional: true,  by_region: gmByRegion,       by_month: toMonthArr(gmByMonth,       'attendees'), by_market: gmMktArr },
        { key: 'videos',      label: 'EOS Video Plays',                   unit: 'plays',     source: 'EOS Usage',                  total: vidTotal,      regional: false,                              by_month: toMonthArr(vidByMonth,      'plays'), watch_mins_total: Math.round(secsTotal / 60) },
        { key: 'workshops',   label: 'Workshops (Support)',               unit: 'workshops', source: 'Cases',                      total: workshopTotal, regional: true,  by_region: workshopByRegion, by_month: toMonthArr(workshopByMonth, 'cnt'), by_market: workshopMktArr },
        { key: 'email_cases', label: 'Email Support Cases',              unit: 'cases',     source: 'Cases',                      total: emailTotal,    regional: true,  by_region: emailByRegion,    by_month: toMonthArr(emailByMonth,    'cnt'), by_market: emailMktArr },
      ],
    };

    cacheSet(CACHE_KEY, payload, CACHE_TTL);
    res.json(payload);
  } catch (err) {
    console.error('[eos-engagement]', err.message);
    res.status(500).json({ error: err.message });
  }
};
