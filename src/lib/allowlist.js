const { query } = require('./db');

const CACHE_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes

let _cache = null;       // Set of lowercase email strings (all active users)
let _adminCache = null;  // Set of lowercase email strings (admin users)
let _cacheTime = 0;
let _tableExists = null; // null = unknown, true/false once checked

function envAllowlist() {
  const val = process.env.ALLOWED_EMAILS;
  if (!val) return null;
  return new Set(val.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
}

async function loadAllowlist() {
  try {
    const rows = await query(`SELECT email, access_level FROM dbo.gold_argus_access WHERE is_active = 1`);
    _cache      = new Set(rows.map(r => r.email.trim().toLowerCase()));
    _adminCache = new Set(rows.filter(r => (r.access_level||'').toLowerCase() === 'admin').map(r => r.email.trim().toLowerCase()));
    _cacheTime = Date.now();
    _tableExists = true;
    console.log(`[allowlist] Loaded ${_cache.size} users (${_adminCache.size} admin) from Fabric`);
  } catch (err) {
    if (_tableExists === null) {
      const env = envAllowlist();
      if (env) {
        _cache = env;
        _cacheTime = Date.now();
        _tableExists = true;
        console.warn(`[allowlist] Fabric table not found — using ALLOWED_EMAILS env var (${env.size} users)`);
      } else {
        console.warn('[allowlist] gold_argus_access table not found and ALLOWED_EMAILS not set — guard disabled');
        _tableExists = false;
      }
    } else {
      // Subsequent failure — keep stale cache rather than locking everyone out
      console.warn('[allowlist] Refresh failed, keeping stale cache:', err.message);
    }
  }
}

async function isAllowed(email) {
  if (_tableExists === false) return true;

  if (!_cache || Date.now() - _cacheTime > CACHE_TTL_MS) {
    await loadAllowlist();
  }

  if (_tableExists === false) return true;

  return _cache ? _cache.has(email.toLowerCase()) : true;
}

async function isAdmin(email) {
  if (!_cache || Date.now() - _cacheTime > CACHE_TTL_MS) await loadAllowlist();
  return _adminCache ? _adminCache.has(email.toLowerCase()) : false;
}

module.exports = { isAllowed, loadAllowlist, isAdmin };
