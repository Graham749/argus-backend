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

const stripHtml = (s) => {
  if (!s) return null;
  const lines = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|td|th|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);

  // Detect email header block — English (From/Subject) or German Outlook (Von/Betreff)
  const FROM_RE    = /^(From|Von):\s/i;
  const SUBJECT_RE = /\b(Subject|Betreff):\s/i;
  const fromIdx = lines.findIndex(l => FROM_RE.test(l));
  if (fromIdx >= 0) {
    const subjectIdx = lines.findIndex(l => SUBJECT_RE.test(l));
    if (subjectIdx < 0) return null; // headers fill entire excerpt; no body visible
    const subjectLine = lines[subjectIdx];
    let relevant;
    if (SUBJECT_RE.test(subjectLine) && lines.indexOf(subjectLine) === subjectIdx && /^(Subject|Betreff):\s/i.test(subjectLine)) {
      // Subject on its own line — body starts on next line
      relevant = lines.slice(subjectIdx + 1);
    } else {
      // Subject embedded in a combined header line — extract content after the subject value
      const afterSubject = subjectLine
        .replace(/^.*?(Subject|Betreff):\s*/i, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();
      relevant = [...(afterSubject ? [afterSubject] : []), ...lines.slice(subjectIdx + 1)];
    }
    return relevant.join(' ').replace(/\s+/g, ' ').trim() || null;
  }

  return lines.join(' ').replace(/\s+/g, ' ').trim() || null;
};

async function featureInsights(req, res) {
  const featureId = (req.query.featureId || '').trim();
  if (!featureId) return res.status(400).json({ error: 'featureId required' });

  const cached = resultCache[featureId];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const esc = featureId.replace(/'/g, "''");
    const rows = await queryLakehouse(`
      WITH feature_notes AS (
        SELECT n.note_id, n.note_name, n.note_html_url, n.note_created_at,
               NULLIF(n.pb_company_id, '')  AS pb_company_id,
               -- Prefer creator_email, fall back to note_user_email for domain inference
               NULLIF(COALESCE(NULLIF(n.creator_email,''), NULLIF(n.note_user_email,'')), '') AS note_email,
               LEFT(n.note_content, 1200)   AS note_excerpt
        FROM v_gold_pb_note_company_feature n
        WHERE n.feature_id = '${esc}' AND n.is_archived = 0
      ),
      resolved AS (
        SELECT
          fn.note_id, fn.note_name, fn.note_html_url, fn.note_created_at, fn.note_excerpt,
          COALESCE(fn.pb_company_id,  pc_d.pb_company_id)         AS pb_company_id,
          COALESCE(pc_e.company_name, pc_d.company_name)           AS pb_company_name,
          COALESCE(pc_e.normalised_domain, pc_d.normalised_domain) AS pb_company_domain
        FROM feature_notes fn
        LEFT JOIN v_silver_pb_companies pc_e ON pc_e.pb_company_id = fn.pb_company_id
        LEFT JOIN v_silver_pb_companies pc_d ON fn.pb_company_id IS NULL
          AND fn.note_email IS NOT NULL
          AND pc_d.normalised_domain = LOWER(
            SUBSTRING(fn.note_email, CHARINDEX('@', fn.note_email) + 1, 100))
      ),
      company_totals AS (
        SELECT n.pb_company_id,
          COUNT(DISTINCT n.note_id)    AS total_notes,
          COUNT(DISTINCT n.feature_id) AS total_features
        FROM v_gold_pb_note_company_feature n
        WHERE n.pb_company_id IN (SELECT DISTINCT pb_company_id FROM resolved WHERE pb_company_id IS NOT NULL)
          AND n.is_archived = 0
        GROUP BY n.pb_company_id
      )
      SELECT
        r.note_id, r.note_name, r.note_html_url, r.note_created_at, r.note_excerpt,
        r.pb_company_id, r.pb_company_name, r.pb_company_domain,
        ct.total_notes    AS company_total_notes,
        ct.total_features AS company_total_features
      FROM resolved r
      LEFT JOIN company_totals ct ON ct.pb_company_id = r.pb_company_id
      ORDER BY r.pb_company_id, r.note_created_at DESC
    `);

    // Group by company, dedupe notes within each company
    const companyMap = {};
    const seenPerCompany = {};
    for (const r of rows) {
      const key = r.pb_company_id || '__unknown';
      if (!companyMap[key]) {
        companyMap[key] = {
          companyId:      r.pb_company_id || null,
          companyName:    r.pb_company_name || null,
          companyDomain:  r.pb_company_domain || null,
          totalNotes:     Number(r.company_total_notes)    || 0,
          totalFeatures:  Number(r.company_total_features) || 0,
          notes: []
        };
        seenPerCompany[key] = new Set();
      }
      if (!seenPerCompany[key].has(r.note_id)) {
        seenPerCompany[key].add(r.note_id);
        companyMap[key].notes.push({ noteId: r.note_id, noteName: r.note_name, noteExcerpt: stripHtml(r.note_excerpt), noteUrl: r.note_html_url, createdAt: r.note_created_at });
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
