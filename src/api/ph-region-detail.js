const { query } = require('../lib/db');

const resultCache = {};
const CACHE_TTL   = 10 * 60 * 1000;

module.exports = async function phRegionDetail(req, res) {
  const account  = req.query.account;
  const region   = req.query.region;
  const personId = req.query.personId || null;
  if (!account || !region) return res.status(400).json({ error: 'account and region required' });

  const cacheKey = account + ':' + region + (personId ? ':' + personId : '');
  const cached = resultCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  const pf = personId ? `AND e.person_id = '${personId.replace(/'/g, "''")}'` : '';
  const sa = account.replace(/'/g, "''");
  const sr = region.replace(/'/g, "''");
  const join = `FROM dbo.posthog_notebook_events e
    INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
    WHERE g.sf_account_name = '${sa}' AND e.region = '${sr}' ${pf}`;

  try {
    // mssql npm mis-evaluates string equality on computed columns in cross-view JOINs,
    // so both queries fetch all features unfiltered; JS filters to the right feature.
    const [detail, icDetail] = await Promise.all([
      query(`
        SELECT
          ISNULL(e.feature, 'other') AS feature,
          e.scenario AS scenario,
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')) AS price_zone,
          e.sensitivity AS sensitivity,
          COUNT(*) AS runs
        ${join}
        GROUP BY ISNULL(e.feature, 'other'), e.scenario,
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')), e.sensitivity
        ORDER BY runs DESC
      `),
      query(`
        SELECT TOP 100
          e.feature, e.tenant, e.scenario, e.region,
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')) AS price_zone,
          MIN(e.currency) AS currency,
          e.sensitivity,
          COUNT(*) AS runs
        ${join}
        GROUP BY e.feature, e.tenant, e.scenario, e.region,
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')), e.sensitivity
        ORDER BY runs DESC
      `),
    ]);

    const data = {
      detail: detail.map(r => ({
        feature:     r.feature || 'other',
        scenario:    r.scenario    || null,
        price_zone:  r.price_zone  || null,
        sensitivity: r.sensitivity || null,
        runs:        Number(r.runs),
      })),
      richDetail: icDetail.slice(0, 100).map(r => ({
        feature:     r.feature     || 'other',
        tenant:      r.tenant      || null,
        scenario:    r.scenario    || null,
        region:      r.region      || null,
        price_zone:  r.price_zone  || null,
        currency:    r.currency    || null,
        sensitivity: r.sensitivity || null,
        runs:        Number(r.runs),
      })),
    };

    resultCache[cacheKey] = { ts: Date.now(), data };
    res.json(data);
  } catch (err) {
    console.error('[ph-region-detail]', err.message);
    res.status(500).json({ error: err.message });
  }
};
