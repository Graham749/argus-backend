const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry  = null;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) return cachedToken;
  const token = execSync(
    'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  cachedToken = token;
  tokenExpiry  = now + 55 * 60 * 1000;
  return token;
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn  = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    requestTimeout: 120000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false }
  });
  await conn.connect();
  const result = await conn.request().query(query);
  await conn.close();
  return result.recordset;
}

module.exports = async function phRegionDetail(req, res) {
  const account  = req.query.account;
  const region   = req.query.region;
  const personId = req.query.personId || null;
  if (!account || !region) return res.status(400).json({ error: 'account and region required' });

  const pf = personId ? `AND e.person_id = '${personId.replace(/'/g, "''")}'` : '';
  const sa = account.replace(/'/g, "''");
  const sr = region.replace(/'/g, "''");
  const join = `FROM dbo.posthog_notebook_events e
    INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
    WHERE g.sf_account_name = '${sa}' AND e.region = '${sr}' ${pf}`;

  try {
    const [scenarios, priceZones, sensitivities, detail, icDetail, totalUsers] = await Promise.all([
      queryLakehouse(`SELECT TOP 8 e.scenario AS val, COUNT(*) AS runs ${join}
        AND e.scenario IS NOT NULL AND e.scenario != ''
        GROUP BY e.scenario ORDER BY runs DESC`),

      queryLakehouse(`SELECT TOP 8 COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')) AS val, COUNT(*) AS runs ${join}
        AND (NULLIF(e.price_zone,'') IS NOT NULL OR NULLIF(e.zone,'') IS NOT NULL)
        GROUP BY COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')) ORDER BY runs DESC`),

      queryLakehouse(`SELECT TOP 6 e.sensitivity AS val, COUNT(*) AS runs ${join}
        AND e.sensitivity IS NOT NULL AND e.sensitivity != ''
        GROUP BY e.sensitivity ORDER BY runs DESC`),

      queryLakehouse(`SELECT TOP 50
        ISNULL(e.feature, 'other') AS feature,
        e.scenario AS scenario,
        COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')) AS price_zone,
        e.sensitivity AS sensitivity,
        COUNT(*) AS runs
        ${join}
        GROUP BY e.feature, e.scenario, COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')), e.sensitivity
        ORDER BY runs DESC`),

      // Note: mssql npm mis-evaluates string equality on feature in cross-view JOINs.
      // Workaround: fetch all features unfiltered, filter to 'investment-cases' in JS.
      // Region is excluded from GROUP BY (already fixed in WHERE clause — all rows same region).
      queryLakehouse(`SELECT TOP 100
        e.feature,
        e.tenant,
        COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')) AS price_zone,
        e.ic AS ic_id,
        e.sensitivity,
        COUNT(*) AS runs,
        COUNT(DISTINCT e.person_id) AS unique_users
        ${join}
        GROUP BY e.feature, e.tenant,
          COALESCE(NULLIF(e.price_zone,''), NULLIF(e.zone,'')),
          e.ic, e.sensitivity
        ORDER BY runs DESC`),

      // Total users = account-wide (all regions), not region-filtered — gives correct % denominator
      queryLakehouse(`SELECT COUNT(DISTINCT e.person_id) AS total_users
        FROM dbo.posthog_notebook_events e
        INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = e.tenant
        WHERE g.sf_account_name = '${sa}' ${pf}`),
    ]);

    res.json({
      scenarios:     scenarios.map(r => ({ val: r.val, runs: Number(r.runs) })),
      priceZones:    priceZones.filter(r => r.val).map(r => ({ val: r.val, runs: Number(r.runs) })),
      sensitivities: sensitivities.map(r => ({ val: r.val, runs: Number(r.runs) })),
      detail:        detail.map(r => ({
        feature:     r.feature || 'other',
        scenario:    r.scenario,
        price_zone:  r.price_zone || null,
        sensitivity: r.sensitivity || null,
        runs:        Number(r.runs),
      })),
      totalUsers: Number(totalUsers[0]?.total_users || 0),
      icDetail:   icDetail
        .filter(r => r.feature === 'investment-cases')
        .slice(0, 50)
        .map(r => ({
          tenant:       r.tenant || null,
          price_zone:   r.price_zone || null,
          ic_id:        r.ic_id || null,
          sensitivity:  r.sensitivity || null,
          runs:         Number(r.runs),
          unique_users: Number(r.unique_users),
        })),
    });
  } catch (err) {
    console.error('[ph-region-detail]', err.message);
    res.status(500).json({ error: err.message });
  }
};
