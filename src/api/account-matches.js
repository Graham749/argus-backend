const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

const resultCache = {};
const CACHE_TTL = 60 * 60 * 1000;

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
    requestTimeout: 60000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false }
  });
  try {
    await conn.connect();
    const result = await conn.request().query(query);
    return result.recordset;
  } catch (err) {
    if (err.message && (err.message.includes('Could not login') || err.message.includes('token'))) {
      cachedToken = null; tokenExpiry = null;
    }
    throw err;
  } finally {
    await conn.close();
  }
}

// Build a SET of lowercase domains from an MDM row, splitting semicolon-separated lists in JS.
// This avoids cross-view OR+LIKE joins that mssql npm evaluates incorrectly vs System.Data.SqlClient.
function buildDomainSet(mdm) {
  const domains = new Set();
  const add = v => { if (v) domains.add(v.trim().toLowerCase()); };
  add(mdm.sf_website_domain);
  if (mdm.sf_eos_access_domains)   mdm.sf_eos_access_domains.split(';').forEach(add);
  if (mdm.sf_eos_access_domains_2) mdm.sf_eos_access_domains_2.split(';').forEach(add);
  add(mdm.zd_primary_email_domain);
  if (mdm.sf_account_code) add(mdm.sf_account_code);
  domains.delete('');
  return domains;
}

async function accountMatches(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const escaped = account.replace(/'/g, "''");

    // Step 1: get MDM record
    const mdmRows = await queryLakehouse(`
      SELECT TOP 1
        has_zd_org, has_pb_company,
        sf_website_domain, sf_eos_access_domains, sf_eos_access_domains_2,
        zd_primary_email_domain, sf_account_code
      FROM dbo.v_silver_mdm_account
      WHERE sf_account_name = '${escaped}'
    `);

    if (!mdmRows.length) {
      const payload = { hasZd: false, hasPb: false, hasPh: false };
      resultCache[account] = { ts: Date.now(), data: payload };
      return res.json(payload);
    }

    const mdm = mdmRows[0];
    const domains = buildDomainSet(mdm);

    // Step 2: check PostHog view with simple IN — avoids the OR+LIKE cross-view join issue
    let hasPh = false;
    if (domains.size > 0) {
      const inList = [...domains].map(d => `'${d.replace(/'/g, "''")}'`).join(',');
      const phRows = await queryLakehouse(`
        SELECT TOP 1 ph_tenant
        FROM dbo.v_silver_posthog_account_activity
        WHERE ph_tenant IN (${inList})
      `);
      hasPh = phRows.length > 0;
    }

    const payload = { hasZd: !!mdm.has_zd_org, hasPb: !!mdm.has_pb_company, hasPh };
    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[account-matches]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = accountMatches;
