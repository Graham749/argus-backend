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

async function getPool() {
  const token = await getAccessToken();
  if (_pool && _poolToken === token) return _pool;
  // Token rotated — drain old pool and recreate.
  if (_pool) { try { await _pool.close(); } catch (_) {} }
  _pool = new sql.ConnectionPool({
    server: SERVER,
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    pool: { max: 6, min: 1, idleTimeoutMillis: 60000 },
    requestTimeout: 120000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false },
  });
  await _pool.connect();
  _poolToken = token;
  console.log('[db] ConnectionPool (re)created');
  return _pool;
}

async function query(sqlText) {
  const pool = await getPool();
  const result = await pool.request().query(sqlText);
  return result.recordset;
}

// Simple TTL cache for expensive repeated lookups (MDM domain/tenant resolution).
const _cache = {};
function cacheGet(key)         { const e = _cache[key]; return e && Date.now() < e.exp ? e.val : null; }
function cacheSet(key, val, ttlMs) { _cache[key] = { val, exp: Date.now() + ttlMs }; }

module.exports = { query, getAccessToken, cacheGet, cacheSet };
