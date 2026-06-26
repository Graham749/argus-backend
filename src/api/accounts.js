const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

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

    // Step 1: Look up account by exact name and check if it's a child account
    const accountLookupQuery = `
      SELECT TOP 1
        account_id,
        account_name,
        parent_account_id
      FROM [dbo].[v_silver_sf_customer_accounts]
      WHERE account_name = '${accountName.replace(/'/g, "''")}'
    `;

    const accountLookupRows = await queryFabric(accountLookupQuery);

    if (accountLookupRows.length === 0) {
      return res.status(404).json({ error: `Account not found: ${accountName}` });
    }

    const account = accountLookupRows[0];

    // Determine the reporting account (parent if child, else self)
    let reportingAccountId = account.account_id;
    let queryAccountName = accountName;

    if (account.parent_account_id) {
      reportingAccountId = account.parent_account_id;
      // Look up parent's name
      const parentLookupQuery = `
        SELECT TOP 1 account_name
        FROM [dbo].[v_silver_sf_customer_accounts]
        WHERE account_id = '${account.parent_account_id.replace(/'/g, "''")}'
      `;
      const parentLookupRows = await queryFabric(parentLookupQuery);
      if (parentLookupRows.length > 0) {
        queryAccountName = parentLookupRows[0].account_name;
      }
    }

    // Step 2: Query subscriptions for the reporting account and its children
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT subscription_id) as total_subscriptions,
        COUNT(DISTINCT CASE WHEN status = 'Active' THEN subscription_id END) as active_subscriptions,
        ROUND(SUM(arr_gbp), 2) as total_arr_gbp,
        COUNT(DISTINCT CASE WHEN DATEDIFF(DAY, GETDATE(), subscription_end_date) < 30 THEN subscription_id END) as renewals_next_30_days,
        COUNT(DISTINCT CASE WHEN DATEDIFF(DAY, GETDATE(), subscription_end_date) < 90 THEN subscription_id END) as renewals_next_90_days,
        CASE
          WHEN COUNT(DISTINCT CASE WHEN DATEDIFF(DAY, GETDATE(), subscription_end_date) < 30 THEN subscription_id END) > 0 THEN 'URGENT'
          WHEN COUNT(DISTINCT CASE WHEN status = 'Termination in Progress' THEN subscription_id END) > 0 THEN 'AT_RISK'
          ELSE 'HEALTHY'
        END as health_status
      FROM [dbo].[v_silver_sf_subscriptions]
      WHERE account_id IN (
        SELECT account_id FROM [dbo].[v_silver_sf_customer_accounts]
        WHERE account_id = '${reportingAccountId.replace(/'/g, "''")}'
          OR parent_account_id = '${reportingAccountId.replace(/'/g, "''")}'
      )
        AND status IN ('Active', 'Termination in Progress')
    `;

    // Get subscription details (show actual account: parent or child)
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
        DATEDIFF(DAY, GETDATE(), s.renewal_date) as days_to_renewal,
        CASE
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) < -7 THEN 'OVERDUE'
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) < 0 THEN 'AT_RISK'
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) < 90 THEN 'TO_WATCH'
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

    // Get contract type summary with risk counts
    const contractSummaryQuery = `
      SELECT
        contract_type,
        COUNT(*) as total,
        SUM(CASE WHEN DATEDIFF(DAY, GETDATE(), renewal_date) < -365 THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN DATEDIFF(DAY, GETDATE(), renewal_date) >= -365 AND DATEDIFF(DAY, GETDATE(), renewal_date) < 0 THEN 1 ELSE 0 END) as at_risk_count,
        SUM(CASE WHEN DATEDIFF(DAY, GETDATE(), renewal_date) >= 0 AND DATEDIFF(DAY, GETDATE(), renewal_date) < 90 THEN 1 ELSE 0 END) as to_watch_count,
        SUM(CASE WHEN DATEDIFF(DAY, GETDATE(), renewal_date) >= 90 THEN 1 ELSE 0 END) as healthy_count,
        CAST(ROUND(SUM(CASE WHEN status = 'Active' THEN arr_gbp ELSE 0 END), 0) AS INT) as arr_gbp
      FROM [dbo].[v_silver_sf_subscriptions]
      WHERE account_id IN (
        SELECT account_id FROM [dbo].[v_silver_sf_customer_accounts]
        WHERE account_id = '${reportingAccountId.replace(/'/g, "''")}'
          OR parent_account_id = '${reportingAccountId.replace(/'/g, "''")}'
      )
        AND status IN ('Active', 'Termination in Progress')
      GROUP BY contract_type
      ORDER BY total DESC
    `;

    const summaryRows = await queryFabric(summaryQuery);
    const detailRows = await queryFabric(detailsQuery);
    const contractSummaryRows = await queryFabric(contractSummaryQuery);

    const summary = summaryRows[0] || {
      total_subscriptions: 0,
      active_subscriptions: 0,
      total_arr_gbp: 0,
      renewals_next_30_days: 0,
      renewals_next_90_days: 0,
      health_status: 'HEALTHY'
    };

    res.json({
      account: queryAccountName,
      summary: {
        total_subscriptions: summary.total_subscriptions,
        active_subscriptions: summary.active_subscriptions,
        total_arr_gbp: summary.total_arr_gbp,
        renewals_next_30_days: summary.renewals_next_30_days,
        renewals_next_90_days: summary.renewals_next_90_days,
        health_status: summary.health_status
      },
      contract_cards: contractSummaryRows.map(card => ({
        contract_type: card.contract_type || 'Unknown',
        total: card.total,
        overdue: card.overdue_count || 0,
        at_risk: card.at_risk_count || 0,
        to_watch: card.to_watch_count || 0,
        healthy: card.healthy_count || 0,
        arr_gbp: card.arr_gbp
      })),
      subscriptions: detailRows
    });
  } catch (err) {
    console.error('[accounts]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getAccountSubscriptions;
