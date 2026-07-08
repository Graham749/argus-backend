const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

// Account lookup cache: { accountName: { accountId, parentAccountId, parentAccountName, cachedAt } }
const accountCache = {};
const ACCOUNT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) {
    console.log('[token] Using cached token');
    return cachedToken;
  }

  try {
    console.log('[token] Fetching fresh token via az CLI...');
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    cachedToken = token;
    tokenExpiry = now + 55 * 60 * 1000; // 55 minutes
    console.log('[token] Got fresh token, expires in ~55min');
    return token;
  } catch (err) {
    console.error('[token] Failed to get token:', err.message);
    throw new Error(`Failed to authenticate: ${err.message}. Make sure 'az login' has been run.`);
  }
}

async function queryFabric(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    database: 'LH_ProdOps_Dev',
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: token
      }
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectionTimeout: 30000
    }
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

async function getAccountSubscriptions(req, res) {
  try {
    const { accountName } = req.params;

    if (!accountName) {
      return res.status(400).json({ error: 'accountName parameter required' });
    }

    const now = Date.now();
    let accountLookup = accountCache[accountName];

    // Check if cached result is still valid
    if (accountLookup && (now - accountLookup.cachedAt) < ACCOUNT_CACHE_TTL) {
      console.log(`[accounts] Using cached account lookup for ${accountName}`);
    } else {
      // Cache miss or expired - query the database
      console.log(`[accounts] Cache ${accountLookup ? 'expired' : 'miss'} for ${accountName}, querying...`);
      const accountLookupQuery = `
        WITH account_info AS (
          SELECT TOP 1
            account_id,
            account_name,
            parent_account_id
          FROM [dbo].[v_silver_sf_customer_accounts]
          WHERE account_name = '${accountName.replace(/'/g, "''")}'
        ),
        parent_info AS (
          SELECT TOP 1
            account_id,
            account_name
          FROM [dbo].[v_silver_sf_customer_accounts]
          WHERE account_id = (SELECT parent_account_id FROM account_info WHERE parent_account_id IS NOT NULL)
        )
        SELECT
          (SELECT account_id FROM account_info) as account_id,
          (SELECT account_name FROM account_info) as account_name,
          (SELECT parent_account_id FROM account_info) as parent_account_id,
          (SELECT account_name FROM parent_info) as parent_account_name
      `;

      const rows = await queryFabric(accountLookupQuery);
      if (!rows || rows.length === 0 || !rows[0].account_id) {
        return res.status(404).json({ error: `Account not found: ${accountName}` });
      }

      accountLookup = {
        accountId: rows[0].account_id,
        parentAccountId: rows[0].parent_account_id,
        parentAccountName: rows[0].parent_account_name,
        cachedAt: now
      };
      accountCache[accountName] = accountLookup;
    }

    const reportingAccountId = accountLookup.parentAccountId || accountLookup.accountId;
    const queryAccountName = accountLookup.parentAccountName || accountName;

    // Single query to get all subscription data + calculated fields
    const detailsQuery = `
      SELECT
        s.subscription_id,
        s.account_name,
        s.Service__c as product_category,
        s.Service_Type__c as service_type,
        s.status,
        CAST(s.currency AS VARCHAR(3)) as currency,
        ROUND(s.arr_gbp, 2) as arr_gbp,
        s.subscription_start_date,
        s.subscription_end_date,
        s.renewal_date,
        s.renewal_date_source,
        s.contract_type,
        s.product_development_opt_out_clause,
        DATEDIFF(DAY, GETDATE(), s.renewal_date) as days_to_renewal,
        CASE
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) < 0 THEN 'OVERDUE'
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) >= 0 AND DATEDIFF(DAY, GETDATE(), s.renewal_date) < 30 THEN 'AT_RISK'
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) >= 30 AND DATEDIFF(DAY, GETDATE(), s.renewal_date) < 90 THEN 'TO_WATCH'
          ELSE 'HEALTHY'
        END as renewal_status
      FROM [dbo].[v_silver_sf_subscriptions] s
      WHERE s.account_id IN (
        SELECT account_id FROM [dbo].[v_silver_sf_customer_accounts]
        WHERE account_id = '${reportingAccountId.replace(/'/g, "''")}'
          OR parent_account_id = '${reportingAccountId.replace(/'/g, "''")}'
      )
        AND s.status IN ('Active', 'Termination in Progress')
      ORDER BY days_to_renewal ASC
    `;

    const detailRows = await queryFabric(detailsQuery);

    // Calculate summary and contract data from the detail rows in application code
    const summaryData = {
      total_subscriptions: detailRows.length,
      active_subscriptions: detailRows.filter(s => s.status === 'Active').length,
      total_arr_gbp: Math.round(detailRows.reduce((sum, s) => sum + s.arr_gbp, 0) * 100) / 100,
      renewals_next_30_days: detailRows.filter(s => s.days_to_renewal < 30 && s.days_to_renewal >= 0).length,
      renewals_next_90_days: detailRows.filter(s => s.days_to_renewal < 90 && s.days_to_renewal >= 0).length,
      health_status: 'HEALTHY'
    };

    // Calculate health status
    if (detailRows.some(s => s.days_to_renewal < 30 && s.days_to_renewal >= 0)) {
      summaryData.health_status = 'URGENT';
    } else if (detailRows.some(s => s.status === 'Termination in Progress')) {
      summaryData.health_status = 'AT_RISK';
    }

    // Group by contract type for contract summary cards
    const contractMap = {};
    detailRows.forEach(sub => {
      const ct = sub.contract_type || 'Unknown';
      if (!contractMap[ct]) {
        contractMap[ct] = {
          contract_type: ct,
          total: 0,
          overdue: 0,
          at_risk: 0,
          to_watch: 0,
          healthy: 0,
          arr_gbp: 0
        };
      }
      contractMap[ct].total++;
      contractMap[ct].arr_gbp += sub.status === 'Active' ? sub.arr_gbp : 0;

      if (sub.days_to_renewal < -365) contractMap[ct].overdue++;
      else if (sub.days_to_renewal >= -365 && sub.days_to_renewal < 0) contractMap[ct].at_risk++;
      else if (sub.days_to_renewal >= 0 && sub.days_to_renewal < 90) contractMap[ct].to_watch++;
      else contractMap[ct].healthy++;
    });

    const contractSummaryRows = Object.values(contractMap).sort((a, b) => b.total - a.total);
    contractSummaryRows.forEach(card => {
      card.arr_gbp = Math.round(card.arr_gbp);
    });

    res.json({
      account: queryAccountName,
      summary: summaryData,
      contract_cards: contractSummaryRows,
      subscriptions: detailRows
    });
  } catch (err) {
    console.error('[accounts]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getAccountSubscriptions;
