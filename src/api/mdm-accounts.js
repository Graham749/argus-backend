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
    requestTimeout: 180000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false }
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
    const [summaryRows, accountRows, hierarchyRows, dupRows, pbOnlyRows, zdUserRows, zdTicketRows, pbNoteRows, sfSubRows, phCovRows, phRows] = await Promise.all([
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
          COUNT(DISTINCT CASE WHEN pb_match_method = 'website_domain' THEN pb_company_id END) AS pbWebsite,
          COUNT(DISTINCT CASE WHEN pb_match_method = 'eos_domain'     THEN pb_company_id END) AS pbEos,
          COUNT(DISTINCT CASE WHEN pb_match_method = 'name'           THEN pb_company_id END) AS pbName,
          SUM(sf_name_collision)                                                AS nameCollisions,
          (SELECT COUNT(*) FROM v_silver_pb_companies)                                                   AS pbTotalAll,
          (SELECT COUNT(*) FROM v_silver_pb_companies WHERE silver_entity_classification = 'External')  AS pbTotal
        FROM v_silver_mdm_account
      `),
      // Simple flat query — no JOINs, returns all 12k accounts reliably
      queryLakehouse(`
        SELECT
          sf_account_id, sf_account_name, sf_account_status, sf_account_arr,
          sf_active_subscriptions, sf_website_domain,
          zd_org_id, zd_org_name, zd_primary_email_domain,
          zd_match_confidence, zd_domain_confirmed, has_zd_org,
          pb_company_id, pb_company_name, pb_company_domain, pb_match_method, has_pb_company,
          sf_name_collision
        FROM v_silver_mdm_account
        WHERE sf_account_name IS NOT NULL
        ORDER BY COALESCE(TRY_CAST(sf_account_arr AS FLOAT), 0) DESC
      `),
      // Hierarchy lookup — small table, fast
      queryLakehouse(`
        SELECT account_id, parent_account_id, account_name
        FROM v_silver_sf_customer_accounts
        WHERE account_id IS NOT NULL AND LEN(TRIM(account_id)) > 0
      `),
      queryLakehouse(`
        SELECT
          sf_account_id, sf_account_name, sf_account_status, sf_website_domain,
          zd_match_confidence, zd_domain_confirmed, pb_company_name, pb_match_method
        FROM v_silver_mdm_account
        WHERE sf_name_collision = 1 AND sf_account_name IS NOT NULL
        ORDER BY sf_account_name,
                 CASE WHEN sf_website_domain IS NOT NULL THEN 0 ELSE 1 END,
                 CASE zd_match_confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END
      `),
      // PB companies with no SF match — 96 rows
      queryLakehouse(`
        SELECT pb_company_id, company_name AS pb_company_name, normalised_domain AS pb_company_domain
        FROM v_silver_pb_companies
        WHERE silver_entity_classification = 'External'
        AND pb_company_id NOT IN (
          SELECT DISTINCT pb_company_id FROM v_silver_mdm_account WHERE pb_company_id IS NOT NULL
        )
        ORDER BY company_name
      `),
      // ZD users per org
      queryLakehouse(`
        SELECT CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20)) AS zd_org_id,
               COUNT(DISTINCT id) AS user_count
        FROM zd_notebook_users
        WHERE organization_id IS NOT NULL
        GROUP BY CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20))
      `),
      // ZD tickets per org (open = open/new/pending)
      queryLakehouse(`
        SELECT CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20)) AS zd_org_id,
               COUNT(*) AS ticket_count,
               SUM(CASE WHEN status IN ('open','new','pending') THEN 1 ELSE 0 END) AS open_count
        FROM zd_notebook_tickets
        WHERE organization_id IS NOT NULL AND status != 'deleted'
        GROUP BY CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20))
      `),
      // PB notes per company: direct company links + notes linked to contacts at that company
      // pb_notebook_relationships maps user→parent→company cleanly (no JSON parsing needed)
      queryLakehouse(`
        WITH user_company_map AS (
          SELECT [source.id] AS user_id, [target.id] AS company_id
          FROM pb_notebook_relationships
          WHERE [source.type] = 'user'
            AND [relationship.type] = 'parent'
            AND [target.type] = 'company'
        ),
        company_direct AS (
          SELECT target_id AS company_id, note_id
          FROM pb_notebook_note_relationships
          WHERE relationship_type = 'customer' AND target_type = 'company'
        ),
        user_mediated AS (
          SELECT ucm.company_id, nr.note_id
          FROM pb_notebook_note_relationships nr
          JOIN user_company_map ucm ON LOWER(nr.target_id) = LOWER(ucm.user_id)
          WHERE nr.relationship_type = 'customer' AND nr.target_type = 'user'
        ),
        all_notes AS (
          SELECT company_id, note_id FROM company_direct
          UNION
          SELECT company_id, note_id FROM user_mediated
        )
        SELECT company_id AS pb_company_id, COUNT(*) AS note_count
        FROM all_notes
        GROUP BY company_id
      `),
      // SF subscription counts per account (matches subscription widget: Active + Termination in Progress)
      queryLakehouse(`
        SELECT account_id, COUNT(*) AS sub_count
        FROM v_silver_sf_subscriptions
        GROUP BY account_id
      `),
      // PostHog tenant → SF match coverage (PostHog-side view)
      // Uses DISTINCT tenant in aggregations to avoid double-counting when one tenant matches multiple SF accounts
      queryLakehouse(`
        WITH ph_classified AS (
          SELECT
            ph.ph_tenant,
            ph.ph_tenant_format,
            MAX(CASE WHEN mdm.sf_account_id IS NOT NULL AND ph.ph_tenant = mdm.sf_website_domain           THEN 1 ELSE 0 END) AS is_website_match,
            MAX(CASE WHEN mdm.sf_account_id IS NOT NULL
                          AND ph.ph_tenant != ISNULL(mdm.sf_website_domain,'')
                          AND mdm.sf_eos_access_domains IS NOT NULL
                          AND ';'+mdm.sf_eos_access_domains+';' LIKE '%;'+ph.ph_tenant+';%'               THEN 1 ELSE 0 END) AS is_eos_match,
            MAX(CASE WHEN mdm.sf_account_id IS NOT NULL                                                    THEN 1 ELSE 0 END) AS is_any_match
          FROM dbo.v_silver_posthog_account_activity ph
          LEFT JOIN dbo.v_silver_mdm_account mdm
            ON ph.ph_tenant = mdm.sf_website_domain
            OR (mdm.sf_eos_access_domains IS NOT NULL AND ';'+mdm.sf_eos_access_domains+';' LIKE '%;'+ph.ph_tenant+';%')
            OR (mdm.sf_eos_access_domains_2 IS NOT NULL AND ';'+mdm.sf_eos_access_domains_2+';' LIKE '%;'+ph.ph_tenant+';%')
            OR (ph.ph_tenant_format = 'short_code' AND UPPER(ph.ph_tenant) = UPPER(mdm.sf_account_code))
          GROUP BY ph.ph_tenant, ph.ph_tenant_format
        )
        SELECT
          COUNT(*)                                                                               AS ph_total_tenants,
          SUM(CASE WHEN ph_tenant_format = 'domain'     THEN 1 ELSE 0 END)                     AS ph_domain_tenants,
          SUM(CASE WHEN ph_tenant_format = 'uuid'       THEN 1 ELSE 0 END)                     AS ph_uuid_tenants,
          SUM(CASE WHEN ph_tenant_format = 'short_code' THEN 1 ELSE 0 END)                     AS ph_shortcode_tenants,
          SUM(CASE WHEN is_website_match = 1            THEN 1 ELSE 0 END)                     AS ph_website_match,
          SUM(CASE WHEN is_eos_match     = 1            THEN 1 ELSE 0 END)                     AS ph_eos_match,
          SUM(CASE WHEN ph_tenant_format = 'short_code' AND is_any_match = 1 THEN 1 ELSE 0 END) AS ph_acct_code_match,
          SUM(CASE WHEN is_any_match = 0 AND ph_tenant_format = 'domain'    THEN 1 ELSE 0 END) AS ph_no_sf_match
        FROM ph_classified
      `),
      // PostHog EOS usage per SF account — domain-joined via website_domain and eos_access_domains
      queryLakehouse(`
        SELECT
          mdm.sf_account_id,
          SUM(ph.ph_total_events)     AS ph_total_events,
          SUM(ph.ph_unique_users)     AS ph_unique_users,
          MAX(ph.ph_last_seen)        AS ph_last_seen,
          SUM(ph.ph_events_last_30d)  AS ph_events_last_30d,
          SUM(ph.ph_events_last_7d)   AS ph_events_last_7d,
          SUM(ph.ph_investment_cases) AS ph_investment_cases,
          SUM(ph.ph_leaderboards)     AS ph_leaderboards,
          SUM(ph.ph_benchmarks)       AS ph_benchmarks,
          MAX(ph.ph_top_feature)      AS ph_top_feature,
          STRING_AGG(ph.ph_tenant, '; ') AS ph_tenants
        FROM dbo.v_silver_mdm_account mdm
        JOIN dbo.v_silver_posthog_account_activity ph
          ON ph.ph_tenant = mdm.sf_website_domain
          OR (mdm.sf_eos_access_domains IS NOT NULL
              AND ';' + mdm.sf_eos_access_domains + ';' LIKE '%;' + ph.ph_tenant + ';%')
          OR (mdm.sf_eos_access_domains_2 IS NOT NULL
              AND ';' + mdm.sf_eos_access_domains_2 + ';' LIKE '%;' + ph.ph_tenant + ';%')
          OR (ph.ph_tenant_format = 'short_code'
              AND UPPER(ph.ph_tenant) = UPPER(mdm.sf_account_code))
        WHERE mdm.sf_account_id IS NOT NULL
        GROUP BY mdm.sf_account_id
      `)
    ]);

    // Build metric lookup maps — keyed by org/company ID for O(1) row renderer access
    const zdUsers = {};
    zdUserRows.forEach(r => { zdUsers[r.zd_org_id] = Number(r.user_count) || 0; });

    const zdTickets = {};
    zdTicketRows.forEach(r => {
      zdTickets[r.zd_org_id] = { total: Number(r.ticket_count) || 0, open: Number(r.open_count) || 0 };
    });

    const pbNotes = {};
    pbNoteRows.forEach(r => { pbNotes[r.pb_company_id.toLowerCase()] = Number(r.note_count) || 0; });

    const sfSubCounts = {};
    sfSubRows.forEach(r => { sfSubCounts[r.account_id] = Number(r.sub_count) || 0; });

    const phMetrics = {};
    (phRows || []).forEach(r => {
      phMetrics[r.sf_account_id] = {
        totalEvents:      Number(r.ph_total_events)     || 0,
        uniqueUsers:      Number(r.ph_unique_users)     || 0,
        lastSeen:         r.ph_last_seen ? new Date(r.ph_last_seen).toISOString().slice(0, 10) : null,
        eventsLast30d:    Number(r.ph_events_last_30d)  || 0,
        eventsLast7d:     Number(r.ph_events_last_7d)   || 0,
        investmentCases:  Number(r.ph_investment_cases) || 0,
        leaderboards:     Number(r.ph_leaderboards)     || 0,
        benchmarks:       Number(r.ph_benchmarks)       || 0,
        topFeature:       r.ph_top_feature || null,
        tenants:          r.ph_tenants || null,
      };
    });

    // Build hierarchy maps in JavaScript — O(1) lookup, no DB join needed
    const hierById = {};
    hierarchyRows.forEach(r => {
      hierById[r.account_id] = {
        parentAccountId: (r.parent_account_id && r.parent_account_id.trim()) ? r.parent_account_id.trim() : null,
        accountName: r.account_name
      };
    });
    const childCounts = {};
    hierarchyRows.forEach(r => {
      const pid = r.parent_account_id && r.parent_account_id.trim();
      if (pid) childCounts[pid] = (childCounts[pid] || 0) + 1;
    });

    const summary = summaryRows[0] || {};
    const accounts = accountRows.map(r => {
      const hier = hierById[r.sf_account_id] || {};
      const parentAccountId = hier.parentAccountId || null;
      const parentInfo = parentAccountId ? (hierById[parentAccountId] || null) : null;
      const childCount = childCounts[r.sf_account_id] || 0;
      return {
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
        sfActiveSubscriptions: Number(r.sf_active_subscriptions) || 0,
        parentAccountId:    parentAccountId,
        parentAccountName:  parentInfo ? parentInfo.accountName : null,
        childCount:         childCount,
        sfAccountType:      childCount > 0 ? 'parent' : (parentAccountId ? 'child' : 'lone'),
      };
    });

    const pbOnlyAccounts = (pbOnlyRows || []).map(r => ({
      pbOnly:             true,
      sfAccountId:        null,
      sfAccountName:      null,
      sfAccountStatus:    null,
      sfAccountArr:       null,
      sfWebsiteDomain:    null,
      sfActiveSubscriptions: 0,
      sfNameCollision:    false,
      sfAccountType:      'lone',
      parentAccountId:    null,
      parentAccountName:  null,
      childCount:         0,
      zdOrgId:            null,
      zdOrgName:          null,
      zdPrimaryDomain:    null,
      zdMatchConfidence:  'NO_ZD_MATCH',
      zdDomainConfirmed:  false,
      hasZdOrg:           false,
      pbCompanyId:        r.pb_company_id,
      pbCompanyName:      r.pb_company_name,
      pbCompanyDomain:    r.pb_company_domain,
      pbMatchMethod:      null,
      hasPbCompany:       true,
    }));
    accounts.push(...pbOnlyAccounts);

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
      const allSameDomain = withDomain.length === accs.length &&
        new Set(accs.map(a => a.sfWebsiteDomain)).size === 1;
      let resolution;
      if (withDomain.length > 0 && accs.length > withDomain.length) resolution = 'domain_rule';
      else if (allSameDomain) resolution = 'identical';
      else resolution = 'manual';
      return { name, accounts: accs, resolution };
    }).sort((a, b) => {
      const order = { domain_rule: 0, manual: 1, identical: 2 };
      return order[a.resolution] - order[b.resolution] || a.name.localeCompare(b.name);
    });

    res.json({
      summary: {
        total:             Number(summary.total)             || 0,
        highCount:         Number(summary.highCount)         || 0,
        mediumCount:       Number(summary.mediumCount)       || 0,
        noZdCount:         Number(summary.noZdCount)         || 0,
        zdLinked:          Number(summary.zdLinked)          || 0,
        zdDomainConfirmed: Number(summary.zdDomainConfirmed) || 0,
        pbLinked:          Number(summary.pbLinked)          || 0,
        pbCompaniesMatched:Number(summary.pbCompaniesMatched)|| 0,
        pbTotalAll:        Number(summary.pbTotalAll)         || 0,
        pbTotal:           Number(summary.pbTotal)           || 0,
        pbWebsite:         Number(summary.pbWebsite)         || 0,
        pbEos:             Number(summary.pbEos)             || 0,
        pbName:            Number(summary.pbName)            || 0,
        nameCollisions:    Number(summary.nameCollisions)    || 0,
        phLinked:          Object.keys(phMetrics).length,
        phTotalTenants:    Number((phCovRows[0] || {}).ph_total_tenants)    || 0,
        phDomainTenants:   Number((phCovRows[0] || {}).ph_domain_tenants)  || 0,
        phUuidTenants:     Number((phCovRows[0] || {}).ph_uuid_tenants)    || 0,
        phShortcodeTenants:Number((phCovRows[0] || {}).ph_shortcode_tenants)|| 0,
        phWebsiteMatch:    Number((phCovRows[0] || {}).ph_website_match)    || 0,
        phEosDomainMatch:  Number((phCovRows[0] || {}).ph_eos_match)        || 0,
        phAcctCodeMatch:   Number((phCovRows[0] || {}).ph_acct_code_match)  || 0,
        phNoMatch:         Number((phCovRows[0] || {}).ph_no_sf_match)      || 0
      },
      accounts,
      duplicates,
      zdMetrics: zdUsers,
      zdTickets,
      pbNotes,
      sfSubCounts,
      phMetrics,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[mdm-accounts]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = mdmAccounts;
