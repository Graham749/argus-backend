const { query } = require('../lib/db');

const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = async function phSankey(req, res) {
  const account  = req.query.account;
  const region   = req.query.region   || null;
  const personId = req.query.personId || null;
  if (!account) return res.status(400).json({ error: 'account param required' });

  const cacheKey = `${account}:${region || ''}:${personId || ''}`;
  const cached = resultCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  const sa = account.replace(/'/g, "''");
  const pf = personId ? `AND e.person_id = '${personId.replace(/'/g, "''")}'` : '';

  try {
    let rows;

    if (!region) {
      // Mode 1: User → Region
      rows = await query(`
        SELECT TOP 300
          COALESCE(NULLIF(e.person_name,''), e.email, e.person_id) AS user_label,
          e.region,
          COALESCE(e.feature, 'other') AS feature,
          COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
        WHERE g.sf_account_name = '${sa}'
          AND e.region IS NOT NULL AND e.region != ''
          ${pf}
        GROUP BY COALESCE(NULLIF(e.person_name,''), e.email, e.person_id),
          e.region, COALESCE(e.feature, 'other')
        ORDER BY runs DESC
      `);
    } else {
      // Mode 2: User → Price Zone (within selected region)
      const sr = region.replace(/'/g, "''");
      rows = await query(`
        SELECT TOP 300
          COALESCE(NULLIF(e.person_name,''), e.email, e.person_id) AS user_label,
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,''), 'unspecified') AS price_zone,
          COALESCE(e.sensitivity, 'Central') AS sensitivity,
          COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
        WHERE g.sf_account_name = '${sa}'
          AND e.region = '${sr}'
          ${pf}
        GROUP BY COALESCE(NULLIF(e.person_name,''), e.email, e.person_id),
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,''), 'unspecified'),
          COALESCE(e.sensitivity, 'Central')
        ORDER BY runs DESC
      `);
    }

    const data = buildSankeyGraph(rows, region);
    resultCache[cacheKey] = { ts: Date.now(), data };
    res.json(data);
  } catch (err) {
    console.error('[ph-sankey]', err.message);
    res.status(500).json({ error: err.message });
  }
};

function buildSankeyGraph(rows, region) {
  if (!rows || rows.length === 0) return { nodes: [], links: [], mode: region ? 'user-zone' : 'user-region' };

  const MAX_USERS = 15;

  if (!region) {
    // Keep top MAX_USERS by total runs
    const userTotals = {};
    rows.forEach(r => { userTotals[r.user_label] = (userTotals[r.user_label] || 0) + Number(r.runs); });
    const topUsers = new Set(
      Object.entries(userTotals).sort((a, b) => b[1] - a[1]).slice(0, MAX_USERS).map(([u]) => u)
    );

    const userIdx  = new Map();
    const regionIdx = new Map();

    rows.filter(r => topUsers.has(r.user_label)).forEach(r => {
      if (!userIdx.has(r.user_label)) userIdx.set(r.user_label, userIdx.size);
      if (!regionIdx.has(r.region))   regionIdx.set(r.region,    regionIdx.size);
    });

    const regionOffset = userIdx.size;
    const nodes = [
      ...[...userIdx.keys()].map(id => ({ id, name: id, type: 'user' })),
      ...[...regionIdx.keys()].map(id => ({ id: `R:${id}`, name: id.toUpperCase(), type: 'region', region: id })),
    ];

    const agg = {};
    rows.filter(r => topUsers.has(r.user_label)).forEach(r => {
      const k = `${r.user_label}||${r.region}`;
      agg[k] = (agg[k] || 0) + Number(r.runs);
    });

    const links = Object.entries(agg).map(([k, value]) => {
      const [u, reg] = k.split('||');
      return { source: userIdx.get(u), target: regionOffset + regionIdx.get(reg), value };
    });

    return { nodes, links, mode: 'user-region' };
  } else {
    // User → Price Zone
    const userTotals = {};
    rows.forEach(r => { userTotals[r.user_label] = (userTotals[r.user_label] || 0) + Number(r.runs); });
    const topUsers = new Set(
      Object.entries(userTotals).sort((a, b) => b[1] - a[1]).slice(0, MAX_USERS).map(([u]) => u)
    );

    const userIdx = new Map();
    const zoneIdx = new Map();

    rows.filter(r => topUsers.has(r.user_label)).forEach(r => {
      if (!userIdx.has(r.user_label)) userIdx.set(r.user_label, userIdx.size);
      if (!zoneIdx.has(r.price_zone)) zoneIdx.set(r.price_zone, zoneIdx.size);
    });

    const zoneOffset = userIdx.size;
    const nodes = [
      ...[...userIdx.keys()].map(id => ({ id, name: id, type: 'user' })),
      ...[...zoneIdx.keys()].map(id => ({ id: `Z:${id}`, name: id, type: 'zone' })),
    ];

    const agg = {};
    rows.filter(r => topUsers.has(r.user_label)).forEach(r => {
      const k = `${r.user_label}||${r.price_zone}`;
      agg[k] = (agg[k] || 0) + Number(r.runs);
    });

    const links = Object.entries(agg).map(([k, value]) => {
      const [u, zone] = k.split('||');
      return { source: userIdx.get(u), target: zoneOffset + zoneIdx.get(zone), value };
    });

    return { nodes, links, mode: 'user-zone', region };
  }
}
