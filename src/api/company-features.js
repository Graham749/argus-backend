const { query } = require('../lib/db');

const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000;

async function companyFeatures(req, res) {
  const companyId = (req.query.companyId || '').trim();
  const excludeFeatureId = (req.query.excludeFeatureId || '').trim();
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  const cacheKey = companyId + '|' + excludeFeatureId;
  const cached = resultCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const esc = companyId.replace(/'/g, "''");
    const escExclude = excludeFeatureId.replace(/'/g, "''");

    const rows = await query(`
      SELECT
        n.feature_id,
        COALESCE(f.feature_name, n.feature_id) AS feature_name,
        COUNT(DISTINCT n.note_id) AS note_count
      FROM gold_pb_note_company_feature n
      LEFT JOIN gold_pb_features f ON f.feature_id = n.feature_id
      WHERE n.pb_company_id = '${esc}'
        AND n.is_archived = 0
        ${escExclude ? `AND n.feature_id != '${escExclude}'` : ''}
      GROUP BY n.feature_id, COALESCE(f.feature_name, n.feature_id)
      ORDER BY COUNT(DISTINCT n.note_id) DESC, COALESCE(f.feature_name, n.feature_id)
    `);

    const features = rows.map(r => ({
      featureId:   r.feature_id,
      featureName: r.feature_name,
      noteCount:   Number(r.note_count) || 0
    }));

    const payload = { companyId, features };
    resultCache[cacheKey] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[company-features]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = companyFeatures;
