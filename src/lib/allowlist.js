const { query } = require('./db');

const CACHE_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes

let _cache = null;      // Set of lowercase email strings
let _cacheTime = 0;
let _tableExists = null; // null = unknown, true/false once checked

async function loadAllowlist() {
  try {
    const rows = await query(`SELECT email FROM dbo.argus_allowed_users WHERE is_active = 1`);
    _cache = new Set(rows.map(r => r.email.trim().toLowerCase()));
    _cacheTime = Date.now();
    _tableExists = true;
    console.log(`[allowlist] Loaded ${_cache.size} authorised users`);
  } catch (err) {
    if (_tableExists === null) {
      // First attempt — table probably doesn't exist yet, disable guard
      console.warn('[allowlist] argus_allowed_users table not found — allowlist guard disabled');
      _tableExists = false;
    } else {
      // Subsequent failure — keep stale cache rather than locking everyone out
      console.warn('[allowlist] Refresh failed, keeping stale cache:', err.message);
    }
  }
}

async function isAllowed(email) {
  // Guard disabled if table doesn't exist
  if (_tableExists === false) return true;

  // Load on first call or refresh if stale
  if (!_cache || Date.now() - _cacheTime > CACHE_TTL_MS) {
    await loadAllowlist();
  }

  // If still no table after load attempt, fail open
  if (_tableExists === false) return true;

  // If cache is populated, check it; otherwise fail open to avoid locking out on DB hiccup
  return _cache ? _cache.has(email.toLowerCase()) : true;
}

module.exports = { isAllowed, loadAllowlist };
