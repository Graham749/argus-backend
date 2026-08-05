const { query, cacheGet, cacheSet } = require('../lib/db');

const resultCache = {};
const CACHE_TTL   = 10 * 60 * 1000;
const MDM_TTL     = 10 * 60 * 1000;

// Build lowercase domain set from MDM row, splitting semicolon-separated EOS lists in JS.
function buildDomainSet(mdm) {
  const domains = new Set();
  const add = v => { if (v) domains.add(v.trim().toLowerCase()); };
  add(mdm.sf_website_domain);
  if (mdm.sf_eos_access_domains)   mdm.sf_eos_access_domains.split(';').forEach(add);
  if (mdm.sf_eos_access_domains_2) mdm.sf_eos_access_domains_2.split(';').forEach(add);
  add(mdm.zd_primary_email_domain);
  if (mdm.sf_account_code) add(mdm.sf_account_code);
  domains.delete('');
  return domains;
}

// Resolve MDM domains → tenant IN-list string. Cached across modules via shared db cache.
async function resolveTenantInList(account) {
  const cacheKey = 'tenantInList:' + account;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const escaped = account.replace(/'/g, "''");
  const mdmRows = await query(`
    SELECT TOP 1
      sf_website_domain, sf_eos_access_domains, sf_eos_access_domains_2,
      zd_primary_email_domain, sf_account_code
    FROM dbo.gold_mdm_account
    WHERE sf_account_name = '${escaped}'
  `);
  if (!mdmRows.length) return null;

  const mdm = mdmRows[0];
  const domains = buildDomainSet(mdm);
  if (!domains.size) return null;

  const inList = [...domains].map(d => `'${d.replace(/'/g, "''")}'`).join(',');
  const tenantRows = await query(`
    SELECT ph_tenant FROM dbo.gold_posthog_account_activity
    WHERE ph_tenant IN (${inList})
  `);
  if (!tenantRows.length) return null;

  const tenantInList = tenantRows.map(r => `'${r.ph_tenant.replace(/'/g, "''")}'`).join(',');
  cacheSet(cacheKey, tenantInList, MDM_TTL);
  return tenantInList;
}

async function phUsers(req, res) {
  const account = (req.query.account || '').trim();
  const region  = (req.query.region  || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cacheKey = account + (region ? ':' + region : '');
  const cached = resultCache[cacheKey];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const tenantInList = await resolveTenantInList(account);
    if (!tenantInList) return res.json({ account, users: [] });

    // Region data lives on non-pageview events, so filter by person_id subquery
    // rather than adding e.region to the pageview query (which would return 0 rows).
    const regionFilter = region
      ? `AND e.person_id IN (
          SELECT DISTINCT person_id FROM dbo.posthog_notebook_events
          WHERE LOWER(LTRIM(RTRIM(tenant))) IN (${tenantInList})
          AND region = '${region.replace(/'/g, "''")}'
        )`
      : '';

    const [rows, regionRows] = await Promise.all([
      query(`
        SELECT TOP 200
          e.person_id,
          MAX(e.person_name)                                                              AS person_name,
          COUNT(*)                                                                        AS total_events,
          CAST(MAX(e.timestamp) AS DATE)                                                  AS last_seen,
          SUM(CASE WHEN e.pathname LIKE '%/investment-cases%' THEN 1 ELSE 0 END) AS investment_cases,
          SUM(CASE WHEN e.pathname LIKE '%/leaderboards%'     THEN 1 ELSE 0 END) AS leaderboards,
          SUM(CASE WHEN e.pathname LIKE '%/benchmarks%'       THEN 1 ELSE 0 END) AS benchmarks,
          SUM(CASE WHEN e.pathname NOT LIKE '%/investment-cases%' AND e.pathname NOT LIKE '%/leaderboards%' AND e.pathname NOT LIKE '%/benchmarks%' THEN 1 ELSE 0 END) AS untagged
        FROM dbo.posthog_notebook_events e
        WHERE LOWER(LTRIM(RTRIM(e.tenant))) IN (${tenantInList})
          AND e.person_id IS NOT NULL AND e.event = '$pageview'
          ${regionFilter}
        GROUP BY e.person_id
        ORDER BY total_events DESC
      `),
      query(`
        SELECT e.person_id, e.region, COUNT(*) AS runs
        FROM dbo.posthog_notebook_events e
        WHERE LOWER(LTRIM(RTRIM(e.tenant))) IN (${tenantInList})
          AND e.person_id IS NOT NULL
          AND e.region IS NOT NULL AND e.region != ''
        GROUP BY e.person_id, e.region
        ORDER BY e.person_id, runs DESC
      `),
    ]);

    const regionByPerson = {};
    (regionRows || []).forEach(r => {
      if (!regionByPerson[r.person_id]) regionByPerson[r.person_id] = [];
      regionByPerson[r.person_id].push({ region: r.region, runs: Number(r.runs) });
    });

    const users = (rows || []).map(r => ({
      personId:        r.person_id || '',
      personName:      r.person_name || '',
      totalEvents:     Number(r.total_events)     || 0,
      lastSeen:        r.last_seen ? new Date(r.last_seen).toISOString().slice(0, 10) : null,
      investmentCases: Number(r.investment_cases) || 0,
      leaderboards:    Number(r.leaderboards)     || 0,
      benchmarks:      Number(r.benchmarks)       || 0,
      untagged:        Number(r.untagged)         || 0,
      regions:         regionByPerson[r.person_id] || [],
    }));

    const payload = { account, users, regionFilter: region || null };
    resultCache[cacheKey] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[ph-users]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = phUsers;
