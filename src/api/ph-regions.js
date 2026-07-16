const { query } = require('../lib/db');

const resultCache = {};
const CACHE_TTL   = 10 * 60 * 1000;

module.exports = async function phRegions(req, res) {
  const account  = req.query.account;
  const personId = req.query.personId || null;
  if (!account) return res.status(400).json({ error: 'account param required' });

  const cacheKey = account + (personId ? ':' + personId : '');
  const cached = resultCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const personFilter = personId
      ? `AND e.person_id = '${personId.replace(/'/g, "''")}'`
      : '';

    const sa = account.replace(/'/g, "''");
    const base = `FROM dbo.posthog_notebook_events e
      INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
      WHERE g.sf_account_name = '${sa}'
        AND e.region IS NOT NULL AND e.region != ''
        ${personFilter}`;

    const [rows, userRows] = await Promise.all([
      query(`
        SELECT e.region, COALESCE(e.feature, 'other') AS feature, COUNT(*) AS runs
        ${base}
        GROUP BY e.region, e.feature ORDER BY runs DESC
      `),
      query(`
        SELECT e.region, COUNT(DISTINCT e.person_id) AS unique_users
        ${base}
        GROUP BY e.region
      `),
    ]);

    const usersByRegion = {};
    (userRows || []).forEach(r => { usersByRegion[r.region] = Number(r.unique_users) || 0; });

    const data = rows.map(r => ({
      region:       r.region,
      feature:      r.feature,
      runs:         Number(r.runs) || 0,
      unique_users: usersByRegion[r.region] || 0,
    }));

    resultCache[cacheKey] = { ts: Date.now(), data };
    res.json(data);
  } catch (err) {
    console.error('[ph-regions]', err.message);
    res.status(500).json({ error: err.message });
  }
};
