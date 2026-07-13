const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000;

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
    requestTimeout: 120000,
    options: { encrypt: true, trustServerCertificate: false }
  });
  try {
    await conn.connect();
    return (await conn.request().query(query)).recordset;
  } catch (err) {
    if (err.message && (err.message.includes('Could not login') || err.message.includes('token'))) {
      cachedToken = null; tokenExpiry = null;
    }
    throw err;
  } finally {
    await conn.close();
  }
}

async function featureInsights(req, res) {
  const featureId = (req.query.featureId || '').trim();
  if (!featureId) return res.status(400).json({ error: 'featureId required' });

  const cached = resultCache[featureId];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const esc = featureId.replace(/'/g, "''");
    const rows = await queryLakehouse(`
      SELECT
        n.note_id,
        n.note_name,
        n.note_html_url,
        n.note_created_at,
        n.pb_company_id,
        pc.company_name AS pb_company_name
      FROM v_gold_pb_note_company_feature n
      LEFT JOIN v_silver_pb_companies pc ON pc.pb_company_id = n.pb_company_id
      WHERE n.feature_id = '${esc}'
        AND n.is_archived = 0
      ORDER BY n.pb_company_id, n.note_created_at DESC
    `);

    // Group by company, dedupe notes within each company
    const companyMap = {};
    const seenPerCompany = {};
    for (const r of rows) {
      const key = r.pb_company_id || '__unknown';
      if (!companyMap[key]) {
        companyMap[key] = { companyId: r.pb_company_id, companyName: r.pb_company_name || r.pb_company_id || 'Unknown', notes: [] };
        seenPerCompany[key] = new Set();
      }
      if (!seenPerCompany[key].has(r.note_id)) {
        seenPerCompany[key].add(r.note_id);
        companyMap[key].notes.push({ noteId: r.note_id, noteName: r.note_name, noteUrl: r.note_html_url, createdAt: r.note_created_at });
      }
    }

    const companies = Object.values(companyMap).sort((a, b) => b.notes.length - a.notes.length);
    const noteCount = companies.reduce((s, c) => s + c.notes.length, 0);
    const payload = { featureId, noteCount, companies };
    resultCache[featureId] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[feature-insights]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = featureInsights;
