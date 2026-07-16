const { query } = require('../lib/db');

const resultCache  = {};
const RESULT_TTL   = 5 * 60 * 1000;  // 5 min full-response cache
const accountCache = {};
const ACCOUNT_TTL  = 5 * 60 * 1000;  // 5 min lookup sub-cache

async function getAccountSubscriptions(req, res) {
  try {
    const { accountName } = req.params;
    if (!accountName) return res.status(400).json({ error: 'accountName parameter required' });

    // Full-response cache
    const cached = resultCache[accountName];
    if (cached && Date.now() - cached.ts < RESULT_TTL) {
      return res.json(cached.data);
    }

    const now = Date.now();
    let accountLookup = accountCache[accountName];

    if (!accountLookup || now - accountLookup.cachedAt >= ACCOUNT_TTL) {
      const rows = await query(`
        WITH account_info AS (
          SELECT TOP 1 account_id, account_name, parent_account_id
          FROM [dbo].[v_silver_sf_customer_accounts]
          WHERE account_name = '${accountName.replace(/'/g, "''")}'
        ),
        parent_info AS (
          SELECT TOP 1 account_id, account_name
          FROM [dbo].[v_silver_sf_customer_accounts]
          WHERE account_id = (SELECT parent_account_id FROM account_info WHERE parent_account_id IS NOT NULL)
        )
        SELECT
          (SELECT account_id   FROM account_info) as account_id,
          (SELECT account_name FROM account_info) as account_name,
          (SELECT parent_account_id FROM account_info) as parent_account_id,
          (SELECT account_name FROM parent_info) as parent_account_name
      `);
      if (!rows || rows.length === 0 || !rows[0].account_id) {
        return res.status(404).json({ error: `Account not found: ${accountName}` });
      }
      accountLookup = {
        accountId:         rows[0].account_id,
        parentAccountId:   rows[0].parent_account_id,
        parentAccountName: rows[0].parent_account_name,
        cachedAt: now,
      };
      accountCache[accountName] = accountLookup;
    }

    const reportingAccountId = accountLookup.parentAccountId || accountLookup.accountId;
    const queryAccountName   = accountLookup.parentAccountName || accountName;

    const detailRows = await query(`
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
          WHEN DATEDIFF(DAY, GETDATE(), s.renewal_date) < 30 THEN 'AT_RISK'
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
    `);

    const summaryData = {
      total_subscriptions:   detailRows.length,
      active_subscriptions:  detailRows.filter(s => s.status === 'Active').length,
      total_arr_gbp:         Math.round(detailRows.reduce((sum, s) => sum + s.arr_gbp, 0) * 100) / 100,
      renewals_next_30_days: detailRows.filter(s => s.days_to_renewal < 30 && s.days_to_renewal >= 0).length,
      renewals_next_90_days: detailRows.filter(s => s.days_to_renewal < 90 && s.days_to_renewal >= 0).length,
      health_status: 'HEALTHY',
    };

    if (detailRows.some(s => s.days_to_renewal < 30 && s.days_to_renewal >= 0)) {
      summaryData.health_status = 'URGENT';
    } else if (detailRows.some(s => s.status === 'Termination in Progress')) {
      summaryData.health_status = 'AT_RISK';
    }

    const contractMap = {};
    detailRows.forEach(sub => {
      const ct = sub.contract_type || 'Unknown';
      if (!contractMap[ct]) contractMap[ct] = { contract_type: ct, total: 0, overdue: 0, at_risk: 0, to_watch: 0, healthy: 0, arr_gbp: 0 };
      contractMap[ct].total++;
      contractMap[ct].arr_gbp += sub.status === 'Active' ? sub.arr_gbp : 0;
      if (sub.days_to_renewal < -365)       contractMap[ct].overdue++;
      else if (sub.days_to_renewal < 0)     contractMap[ct].at_risk++;
      else if (sub.days_to_renewal < 90)    contractMap[ct].to_watch++;
      else                                  contractMap[ct].healthy++;
    });

    const contract_cards = Object.values(contractMap).sort((a, b) => b.total - a.total);
    contract_cards.forEach(c => { c.arr_gbp = Math.round(c.arr_gbp); });

    const data = { account: queryAccountName, summary: summaryData, contract_cards, subscriptions: detailRows };
    resultCache[accountName] = { ts: Date.now(), data };
    res.json(data);
  } catch (err) {
    console.error('[accounts]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getAccountSubscriptions;
