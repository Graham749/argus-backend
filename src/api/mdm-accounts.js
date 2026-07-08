const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) return cachedToken;
  const token = execSync(
    'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  cachedToken = token;
  tokenExpiry = now + 55 * 60 * 1000;
  return token;
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    options: { encrypt: true, trustServerCertificate: false, connectionTimeout: 30000, requestTimeout: 180000 }
  });
  try {
    await conn.connect();
    const result = await conn.request().query(query);
    return result.recordset;
  } finally {
    await conn.close();
  }
}

async function mdmAccounts(req, res) {
  try {
    const search = (req.query.search || '').trim();

    const [summaryRows, accountRows] = await Promise.all([
      queryLakehouse(`
        SELECT
          COUNT(*)                                                              AS total,
          SUM(CASE WHEN zd_match_confidence = 'HIGH'         THEN 1 ELSE 0 END) AS highCount,
          SUM(CASE WHEN zd_match_confidence = 'MEDIUM'       THEN 1 ELSE 0 END) AS mediumCount,
          SUM(CASE WHEN zd_match_confidence = 'NO_ZD_MATCH'  THEN 1 ELSE 0 END) AS noZdCount,
          SUM(has_zd_org)                                                       AS zdLinked,
          SUM(zd_domain_confirmed)                                              AS zdDomainConfirmed,
          SUM(has_pb_company)                                                   AS pbLinked,
          SUM(CASE WHEN pb_match_method = 'website_domain'   THEN 1 ELSE 0 END) AS pbWebsite,
          SUM(CASE WHEN pb_match_method = 'eos_domain'       THEN 1 ELSE 0 END) AS pbEos,
          SUM(CASE WHEN pb_match_method = 'name'             THEN 1 ELSE 0 END) AS pbName,
          SUM(sf_name_collision)                                                AS nameCollisions
        FROM v_silver_mdm_account
      `),
      queryLakehouse(`
        SELECT TOP 500
          sf_account_id,
          sf_account_name,
          sf_account_status,
          sf_account_arr,
          sf_website_domain,
          zd_org_id,
          zd_org_name,
          zd_primary_email_domain,
          zd_match_confidence,
          zd_domain_confirmed,
          has_zd_org,
          pb_company_id,
          pb_company_name,
          pb_company_domain,
          pb_match_method,
          has_pb_company,
          sf_name_collision
        FROM v_silver_mdm_account
        WHERE sf_account_name IS NOT NULL
          ${search ? `AND LOWER(sf_account_name) LIKE '%${search.toLowerCase().replace(/'/g, "''")}%'` : ''}
        ORDER BY COALESCE(TRY_CAST(sf_account_arr AS FLOAT), 0) DESC
      `)
    ]);

    const summary = summaryRows[0] || {};
    const accounts = accountRows.map(r => ({
      sfAccountId:        r.sf_account_id,
      sfAccountName:      r.sf_account_name,
      sfAccountStatus:    r.sf_account_status,
      sfAccountArr:       r.sf_account_arr ? Number(r.sf_account_arr) : null,
      sfWebsiteDomain:    r.sf_website_domain,
      zdOrgId:            r.zd_org_id,
      zdOrgName:          r.zd_org_name,
      zdPrimaryDomain:    r.zd_primary_email_domain,
      zdMatchConfidence:  r.zd_match_confidence,
      zdDomainConfirmed:  r.zd_domain_confirmed === true || r.zd_domain_confirmed === 1,
      hasZdOrg:           r.has_zd_org === true || r.has_zd_org === 1,
      pbCompanyId:        r.pb_company_id,
      pbCompanyName:      r.pb_company_name,
      pbCompanyDomain:    r.pb_company_domain,
      pbMatchMethod:      r.pb_match_method,
      hasPbCompany:       r.has_pb_company === true || r.has_pb_company === 1,
      sfNameCollision:    r.sf_name_collision === true || r.sf_name_collision === 1
    }));

    res.json({
      summary: {
        total:             Number(summary.total)            || 0,
        highCount:         Number(summary.highCount)        || 0,
        mediumCount:       Number(summary.mediumCount)      || 0,
        noZdCount:         Number(summary.noZdCount)        || 0,
        zdLinked:          Number(summary.zdLinked)         || 0,
        zdDomainConfirmed: Number(summary.zdDomainConfirmed)|| 0,
        pbLinked:          Number(summary.pbLinked)         || 0,
        pbWebsite:         Number(summary.pbWebsite)        || 0,
        pbEos:             Number(summary.pbEos)            || 0,
        pbName:            Number(summary.pbName)           || 0,
        nameCollisions:    Number(summary.nameCollisions)   || 0
      },
      accounts,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[mdm-accounts]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = mdmAccounts;
