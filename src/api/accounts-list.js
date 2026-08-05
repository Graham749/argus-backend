const { query } = require('../lib/db');

let cachedResult = null;
let cacheTs = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour — account list changes infrequently

async function getAccountsList(req, res) {
  try {
    if (cachedResult && cacheTs && Date.now() - cacheTs < CACHE_TTL) {
      return res.json(cachedResult);
    }

    const results = await query(`
      SELECT DISTINCT ca.account_name
      FROM [dbo].[gold_sf_subscriptions] s
      INNER JOIN [dbo].[gold_sf_customer_accounts] ca ON s.account_id = ca.account_id
      WHERE ca.parent_account_id IS NULL
        AND s.account_name IS NOT NULL
      ORDER BY ca.account_name ASC
    `);

    const payload = { accounts: results.map(r => ({ name: r.account_name, value: r.account_name })) };
    cachedResult = payload;
    cacheTs = Date.now();
    res.json(payload);
  } catch (err) {
    console.error('[accounts-list]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getAccountsList;
