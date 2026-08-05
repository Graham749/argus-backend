// Shared Fabric SQL connection pool + token cache.
// All ph-*.js handlers import query() from here instead of creating
// a new ConnectionPool per call (which costs 1-3s TCP/TLS handshake each time).
const { execSync } = require('child_process');
const sql = require('mssql');

const SERVER = process.env.FABRIC_SERVER ||
  'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com';

let _cachedToken  = null;
let _tokenExpiry  = null;
let _pool         = null;
let _poolToken    = null;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && _tokenExpiry && _tokenExpiry > now + 60000) return _cachedToken;
  const token = execSync(
    'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  _cachedToken = token;
  _tokenExpiry  = now + 55 * 60 * 1000;
  return token;
}

let _poolCreating = null; // in-flight promise guard against concurrent recreation

async function getPool(forceNew = false) {
  const token = await getAccessToken();
  if (!forceNew && _pool && _poolToken === token) return _pool;

  // Serialise pool creation — if already rebuilding, wait for that instead.
  if (_poolCreating) return _poolCreating;

  _poolCreating = (async () => {
    if (_pool) { try { await _pool.close(); } catch (_) {} }
    const p = new sql.ConnectionPool({
      server: SERVER,
      authentication: { type: 'azure-active-directory-access-token', options: { token } },
      pool: { max: 15, min: 2, idleTimeoutMillis: 120000 },
      requestTimeout: 120000,
      connectionTimeout: 30000,
      options: { encrypt: true, trustServerCertificate: false },
    });
    // Prevent pool errors from crashing the process.
    p.on('error', err => {
      console.error('[db] pool error (will reconnect on next query):', err.message);
      _pool = null;
      _poolToken = null;
    });
    await p.connect();
    _pool = p;
    _poolToken = token;
    console.log('[db] ConnectionPool (re)created');
    return _pool;
  })().finally(() => { _poolCreating = null; });

  return _poolCreating;
}

async function query(sqlText) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(sqlText);
    return result.recordset;
  } catch (err) {
    const isAuthErr = err.code === 'ECONNCLOSED' || err.code === 'ENOTOPEN' ||
      (err.message && /authentication failed|login failed|token.*invalid|invalid.*token/i.test(err.message));
    if (isAuthErr) {
      // Expired token or stale pool — clear everything and retry once with a fresh token.
      console.warn('[db] auth/connection error, clearing token cache and reconnecting…', err.message);
      _cachedToken = null;
      _tokenExpiry  = null;
      _pool = null;
      _poolToken = null;
      const pool = await getPool(true);
      const result = await pool.request().query(sqlText);
      return result.recordset;
    }
    throw err;
  }
}

// Simple TTL cache for expensive repeated lookups (MDM domain/tenant resolution).
const _cache = {};
function cacheGet(key)         { const e = _cache[key]; return e && Date.now() < e.exp ? e.val : null; }
function cacheSet(key, val, ttlMs) { _cache[key] = { val, exp: Date.now() + ttlMs }; }

module.exports = { query, getAccessToken, cacheGet, cacheSet };
