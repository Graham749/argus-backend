// Pre-warms ph-trends and ph-regions caches for the top N most-active PostHog accounts.
// Runs once after server startup, staggered so Fabric isn't hit with concurrent queries.
const http = require('http');
const { query } = require('./db');

const TOP_N        = 30;    // accounts to pre-warm
const STAGGER_MS   = 2500;  // delay between each account
const START_DELAY  = 5000;  // wait for server to be fully ready

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchLocal(port, path) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: 'localhost', port, path, timeout: 60000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

async function getTopAccounts() {
  const rows = await query(`
    SELECT TOP ${TOP_N}
      g.sf_account_name,
      SUM(a.ph_total_events) AS total_events
    FROM dbo.v_silver_posthog_account_activity a
    INNER JOIN dbo.v_gold_mdm_posthog g ON g.ph_tenant = a.ph_tenant
    WHERE g.sf_account_name IS NOT NULL AND g.sf_account_name != ''
    GROUP BY g.sf_account_name
    ORDER BY total_events DESC
  `);
  return (rows || []).map(r => r.sf_account_name);
}

async function warmAccount(port, account, idx, total) {
  const enc = encodeURIComponent(account);
  const [t, r] = await Promise.all([
    fetchLocal(port, `/api/ph-trends?account=${enc}`),
    fetchLocal(port, `/api/ph-regions?account=${enc}`),
  ]);
  const ok = t === 200 && r === 200;
  console.log(`[cache-warmer] (${idx}/${total}) ${account} — trends:${t} regions:${r} ${ok ? '✓' : '✗'}`);
}

async function run(port) {
  await sleep(START_DELAY);
  console.log('[cache-warmer] Starting — fetching top accounts...');

  let accounts;
  try {
    accounts = await getTopAccounts();
  } catch (err) {
    console.error('[cache-warmer] Failed to fetch accounts:', err.message);
    return;
  }

  console.log(`[cache-warmer] Pre-warming ${accounts.length} accounts...`);
  for (let i = 0; i < accounts.length; i++) {
    try {
      await warmAccount(port, accounts[i], i + 1, accounts.length);
    } catch (err) {
      console.error(`[cache-warmer] Error on ${accounts[i]}:`, err.message);
    }
    if (i < accounts.length - 1) await sleep(STAGGER_MS);
  }
  console.log('[cache-warmer] Done.');
}

module.exports = { run };
