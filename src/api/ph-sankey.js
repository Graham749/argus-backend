const { query } = require('../lib/db');

const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = async function phSankey(req, res) {
  const account     = req.query.account;
  const region      = req.query.region      || null;
  const personId    = req.query.personId    || null;
  const features    = req.query.features    || null;   // comma-sep active features (if some deactivated)
  const zoneRegions = req.query.zoneRegions || null;   // comma-sep region codes for zone filter
  if (!account) return res.status(400).json({ error: 'account param required' });

  const cacheKey = `${account}:${region || ''}:${personId || ''}:${features || ''}:${zoneRegions || ''}`;
  const cached = resultCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  const sa = account.replace(/'/g, "''");
  const pf = personId ? `AND e.person_id = '${personId.replace(/'/g, "''")}'` : '';
  const ff = features
    ? `AND e.feature IN (${features.split(',').map(f => `'${f.trim().replace(/'/g, "''")}'`).join(',')})`
    : '';
  const zf = zoneRegions
    ? `AND e.region IN (${zoneRegions.split(',').map(r => `'${r.trim().replace(/'/g, "''")}'`).join(',')})`
    : '';

  try {
    let rows;

    if (!region) {
      // Mode 1: Country → Market Region
      rows = await query(`
        SELECT TOP 300
          COALESCE(NULLIF(e.geo_country_name,''), e.geo_country_code, 'Unknown') AS country,
          e.region,
          COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        INNER JOIN dbo.gold_mdm_posthog g ON g.ph_tenant = e.tenant
        WHERE g.sf_account_name = '${sa}'
          AND e.event = 'url_state_change'
          AND e.region IS NOT NULL AND e.region != ''
          AND e.geo_country_name IS NOT NULL AND e.geo_country_name != ''
          ${pf} ${ff} ${zf}
        GROUP BY COALESCE(NULLIF(e.geo_country_name,''), e.geo_country_code, 'Unknown'), e.region
        ORDER BY runs DESC
      `);
    } else {
      // Mode 2: Countries → single selected market region node (fan-in)
      const sr = region.replace(/'/g, "''");
      rows = await query(`
        SELECT TOP 300
          COALESCE(NULLIF(e.geo_country_name,''), e.geo_country_code, 'Unknown') AS country,
          COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        INNER JOIN dbo.gold_mdm_posthog g ON g.ph_tenant = e.tenant
        WHERE g.sf_account_name = '${sa}'
          AND e.event = 'url_state_change'
          AND e.region = '${sr}'
          AND e.geo_country_name IS NOT NULL AND e.geo_country_name != ''
          ${pf} ${ff}
        GROUP BY COALESCE(NULLIF(e.geo_country_name,''), e.geo_country_code, 'Unknown')
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

function cleanZone(val) {
  if (!val || val === '[]') return 'unspecified';
  const m = val.match(/^\["(.+)"\]$/);
  return m ? m[1] : val;
}

function buildSankeyGraph(rows, region) {
  if (!rows || rows.length === 0) return { nodes: [], links: [], mode: region ? 'country-region-filtered' : 'country-region' };

  const MAX_COUNTRIES = 20;

  if (region) {
    // Mode 2: fan-in — multiple country nodes → single selected region node
    // rows are already sorted by runs DESC; take top 20 countries
    const topRows = rows.slice(0, MAX_COUNTRIES);
    const rightIdx = topRows.length; // single right node at this index

    const nodes = [
      ...topRows.map(r => ({ id: r.country, name: r.country, type: 'country' })),
      { id: 'region:' + region, name: region.toUpperCase(), type: 'region', region },
    ];

    const links = topRows.map((r, i) => ({
      source: i,
      target: rightIdx,
      value: Number(r.runs),
    }));

    return { nodes, links, mode: 'country-region-filtered', region };
  }

  // Mode 1: Country → Market Region (all regions, overview)
  const countryTotals = {};
  rows.forEach(r => { countryTotals[r.country] = (countryTotals[r.country] || 0) + Number(r.runs); });
  const topCountries = new Set(
    Object.entries(countryTotals).sort((a, b) => b[1] - a[1]).slice(0, MAX_COUNTRIES).map(([c]) => c)
  );

  const countryIdx = new Map();
  const rightIdx   = new Map();

  rows.filter(r => topCountries.has(r.country)).forEach(r => {
    if (!countryIdx.has(r.country)) countryIdx.set(r.country, countryIdx.size);
    if (!rightIdx.has(r.region))    rightIdx.set(r.region, rightIdx.size);
  });

  const rightOffset = countryIdx.size;

  const nodes = [
    ...[...countryIdx.keys()].map(id => ({ id, name: id, type: 'country' })),
    ...[...rightIdx.keys()].map(id => ({
      id: 'region:' + id,
      name: id.toUpperCase(),
      type: 'region',
      region: id,
    })),
  ];

  const agg = {};
  rows.filter(r => topCountries.has(r.country)).forEach(r => {
    const k = `${r.country}||${r.region}`;
    agg[k] = (agg[k] || 0) + Number(r.runs);
  });

  const links = Object.entries(agg).map(([k, value]) => {
    const sep = k.indexOf('||');
    const country = k.slice(0, sep);
    const right   = k.slice(sep + 2);
    return { source: countryIdx.get(country), target: rightOffset + rightIdx.get(right), value };
  });

  return { nodes, links, mode: 'country-region' };
}
