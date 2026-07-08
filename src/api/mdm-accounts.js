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
  } catch (err) {
    if (err.message && (err.message.includes('Could not login') || err.message.includes('authentication failed') || err.message.includes('token'))) {
      cachedToken = null;
      tokenExpiry = null;
    }
    throw err;
  } finally {
    await conn.close();
  }
}

async function mdmAccounts(req, res) {
  try {
    const search = (req.query.search || '').trim();

    const [summaryRows, accountRows, dupRows] = await Promise.all([
      queryLakehouse(`
        SELECT
          COUNT(*)                                                              AS total,
          SUM(CASE WHEN zd_match_confidence = 'HIGH'         THEN 1 ELSE 0 END) AS highCount,
          SUM(CASE WHEN zd_match_confidence = 'MEDIUM'       THEN 1 ELSE 0 END) AS mediumCount,
          SUM(CASE WHEN zd_match_confidence = 'NO_ZD_MATCH'  THEN 1 ELSE 0 END) AS noZdCount,
          SUM(has_zd_org)                                                       AS zdLinked,
          SUM(zd_domain_confirmed)                                              AS zdDomainConfirmed,
          SUM(has_pb_company)                                                   AS pbLinked,
          COUNT(DISTINCT pb_company_id)                                         AS pbCompaniesMatched,
          SUM(CASE WHEN pb_match_method = 'website_domain'   THEN 1 ELSE 0 END) AS pbWebsite,
          SUM(CASE WHEN pb_match_method = 'eos_domain'       THEN 1 ELSE 0 END) AS pbEos,
          SUM(CASE WHEN pb_match_method = 'name'             THEN 1 ELSE 0 END) AS pbName,
          SUM(sf_name_collision)                                                AS nameCollisions,
          (SELECT COUNT(*) FROM v_silver_pb_companies)                                                    AS pbTotalAll,
          (SELECT COUNT(*) FROM v_silver_pb_companies WHERE silver_entity_classification = 'External')  AS pbTotal
        FROM v_silver_mdm_account
      `),
      queryLakehouse(`
        SELECT TOP 500
          a.sf_account_id,
          a.sf_account_name,
          a.sf_account_status,
          a.sf_account_arr,
          a.sf_active_subscriptions,
          a.sf_website_domain,
          a.zd_org_id,
          a.zd_org_name,
          a.zd_primary_email_domain,
          a.zd_match_confidence,
          a.zd_domain_confirmed,
          a.has_zd_org,
          a.pb_company_id,
          a.pb_company_name,
          a.pb_company_domain,
          a.pb_match_method,
          a.has_pb_company,
          a.sf_name_collision,
          ca.parent_account_id,
          parent_ca.account_name AS parent_account_name,
          COALESCE(ch.child_count, 0) AS child_count
        FROM v_silver_mdm_account a
        LEFT JOIN v_silver_sf_customer_accounts ca ON ca.account_id = a.sf_account_id
        LEFT JOIN v_silver_sf_customer_accounts parent_ca ON parent_ca.account_id = ca.parent_account_id
        LEFT JOIN (
          SELECT parent_account_id, COUNT(*) AS child_count
          FROM v_silver_sf_customer_accounts
          WHERE parent_account_id IS NOT NULL
          GROUP BY parent_account_id
        ) ch ON ch.parent_account_id = a.sf_account_id
        WHERE a.sf_account_name IS NOT NULL
          ${search ? `AND (
            LOWER(a.sf_account_name) LIKE '%${search.toLowerCase().replace(/'/g, "''")}%'
            OR LOWER(a.sf_account_id) LIKE '%${search.toLowerCase().replace(/'/g, "''")}%'
            OR LOWER(a.zd_org_name) LIKE '%${search.toLowerCase().replace(/'/g, "''")}%'
            OR LOWER(a.pb_company_name) LIKE '%${search.toLowerCase().replace(/'/g, "''")}%'
          )` : ''}
        ORDER BY COALESCE(TRY_CAST(a.sf_account_arr AS FLOAT), 0) DESC
      `),
      queryLakehouse(`
        SELECT
          sf_account_id,
          sf_account_name,
          sf_account_status,
          sf_website_domain,
          zd_match_confidence,
          zd_domain_confirmed,
          pb_company_name,
          pb_match_method
        FROM v_silver_mdm_account
        WHERE sf_name_collision = 1
          AND sf_account_name IS NOT NULL
        ORDER BY sf_account_name,
                 CASE WHEN sf_website_domain IS NOT NULL THEN 0 ELSE 1 END,
                 CASE zd_match_confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END
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
      sfNameCollision:    r.sf_name_collision === true || r.sf_name_collision === 1,
      sfActiveSubscriptions: r.sf_active_subscriptions ? Number(r.sf_active_subscriptions) : 0,
      parentAccountId:    r.parent_account_id || null,
      parentAccountName:  r.parent_account_name || null,
      childCount:         Number(r.child_count) || 0,
      sfAccountType:      (Number(r.child_count) > 0) ? 'parent' : (r.parent_account_id ? 'child' : 'lone'),
    }));

    // Group collision rows by name and determine resolution
    const dupGroups = {};
    dupRows.forEach(r => {
      const name = r.sf_account_name;
      if (!dupGroups[name]) dupGroups[name] = [];
      dupGroups[name].push({
        sfAccountId:       r.sf_account_id,
        sfAccountStatus:   r.sf_account_status,
        sfWebsiteDomain:   r.sf_website_domain || null,
        zdMatchConfidence: r.zd_match_confidence,
        zdDomainConfirmed: r.zd_domain_confirmed === true || r.zd_domain_confirmed === 1,
        pbCompanyName:     r.pb_company_name || null,
        pbMatchMethod:     r.pb_match_method || null
      });
    });

    const duplicates = Object.entries(dupGroups).map(([name, accs]) => {
      const withDomain  = accs.filter(a => a.sfWebsiteDomain);
      const noDomain    = accs.filter(a => !a.sfWebsiteDomain);
      const allSameDomain = withDomain.length === accs.length &&
        new Set(accs.map(a => a.sfWebsiteDomain)).size === 1;

      let resolution;
      if (withDomain.length > 0 && noDomain.length > 0) resolution = 'domain_rule';
      else if (allSameDomain)                             resolution = 'identical';
      else                                                resolution = 'manual';

      return { name, accounts: accs, resolution };
    }).sort((a, b) => {
      const order = { domain_rule: 0, manual: 1, identical: 2 };
      return order[a.resolution] - order[b.resolution] || a.name.localeCompare(b.name);
    });

    res.json({
      summary: {
        total:             Number(summary.total)            || 0,
        highCount:         Number(summary.highCount)        || 0,
        mediumCount:       Number(summary.mediumCount)      || 0,
        noZdCount:         Number(summary.noZdCount)        || 0,
        zdLinked:          Number(summary.zdLinked)         || 0,
        zdDomainConfirmed: Number(summary.zdDomainConfirmed)|| 0,
        pbLinked:          Number(summary.pbLinked)          || 0,
        pbCompaniesMatched:Number(summary.pbCompaniesMatched)|| 0,
        pbTotalAll:        Number(summary.pbTotalAll)         || 0,
        pbTotal:           Number(summary.pbTotal)           || 0,
        pbWebsite:         Number(summary.pbWebsite)         || 0,
        pbEos:             Number(summary.pbEos)             || 0,
        pbName:            Number(summary.pbName)            || 0,
        nameCollisions:    Number(summary.nameCollisions)   || 0
      },
      accounts,
      duplicates,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[mdm-accounts]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = mdmAccounts;
