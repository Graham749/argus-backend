const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000;

const DELIVERED = ['Released', 'Internally released'];
const PIPELINE  = ['In progress', 'Planned', 'Shaping', 'Active priorities', 'Quick win'];

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

function bucket(status) {
  if (DELIVERED.includes(status)) return 'delivered';
  if (PIPELINE.includes(status))  return 'pipeline';
  return 'review';
}

async function pbInsights(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const escaped = account.replace(/'/g, "''");

    // 1. Resolve pb_company_id from MDM
    const mdmRows = await queryLakehouse(`
      SELECT TOP 1 pb_company_id, pb_company_name
      FROM v_silver_mdm_account
      WHERE sf_account_name = '${escaped}'
        AND has_pb_company = 1
        AND pb_company_id IS NOT NULL
    `);

    if (!mdmRows || mdmRows.length === 0) {
      return res.json({ pbCompanyId: null, pbCompanyName: null, summary: null, features: [] });
    }

    const pbCompanyId   = mdmRows[0].pb_company_id;
    const pbCompanyName = mdmRows[0].pb_company_name;
    const esc2 = pbCompanyId.replace(/'/g, "''");

    // 2. Features + notes + unlinked notes in parallel
    const [featureRows, noteRows, unlinkedRows] = await Promise.all([
      queryLakehouse(`
        SELECT
          f.feature_id,
          f.feature_name,
          f.[Status]        AS feature_status,
          f.Description     AS feature_description,
          COUNT(DISTINCT n.note_id) AS note_count,
          MAX(n.note_created_at)    AS latest_note_at
        FROM v_gold_pb_note_company_feature n
        INNER JOIN v_silver_pb_features f ON f.feature_id = n.feature_id
        WHERE LOWER(n.pb_company_id) = LOWER('${esc2}')
          AND n.is_archived = 0
        GROUP BY f.feature_id, f.feature_name, f.[Status], f.Description
        ORDER BY note_count DESC, latest_note_at DESC
      `),
      queryLakehouse(`
        SELECT
          note_id,
          note_name,
          LEFT(note_content, 300) AS note_excerpt,
          note_html_url,
          note_created_at,
          feature_id,
          is_processed
        FROM v_gold_pb_note_company_feature
        WHERE LOWER(pb_company_id) = LOWER('${esc2}')
          AND is_archived = 0
        ORDER BY note_created_at DESC
      `),
      queryLakehouse(`
        SELECT pnc.note_id,
               n.note_name,
               LEFT(n.note_content, 300) AS note_excerpt,
               n.note_html_url,
               n.note_created_at
        FROM v_silver_pb_path_note_company pnc
        INNER JOIN v_silver_pb_notes n ON n.note_id = pnc.note_id
        WHERE LOWER(pnc.pb_company_id) = LOWER('${esc2}')
          AND NOT EXISTS (
            SELECT 1 FROM v_gold_pb_note_company_feature f2
            WHERE LOWER(f2.pb_company_id) = LOWER('${esc2}')
              AND f2.note_id = pnc.note_id
          )
        ORDER BY n.note_created_at DESC
      `),
    ]);

    // Group notes by feature_id
    const notesByFeature = {};
    for (const n of noteRows) {
      if (!notesByFeature[n.feature_id]) notesByFeature[n.feature_id] = [];
      notesByFeature[n.feature_id].push({
        noteId:      n.note_id,
        noteName:    n.note_name,
        noteExcerpt: n.note_excerpt,
        noteUrl:     n.note_html_url,
        createdAt:   n.note_created_at,
        processed:   !!n.is_processed,
      });
    }

    const features = featureRows.map(f => ({
      featureId:   f.feature_id,
      featureName: f.feature_name,
      status:      f.feature_status || 'Unknown',
      bucket:      bucket(f.feature_status || ''),
      description: f.feature_description,
      noteCount:   Number(f.note_count),
      latestNoteAt: f.latest_note_at,
      notes:       notesByFeature[f.feature_id] || [],
    }));

    const delivered   = features.filter(f => f.bucket === 'delivered');
    const pipeline    = features.filter(f => f.bucket === 'pipeline');
    const review      = features.filter(f => f.bucket === 'review');

    const unlinkedNotes = (unlinkedRows || []).map(r => ({
      noteId:      r.note_id,
      noteName:    r.note_name,
      noteExcerpt: r.note_excerpt,
      noteUrl:     r.note_html_url,
      createdAt:   r.note_created_at,
    }));

    const payload = {
      pbCompanyId,
      pbCompanyName,
      summary: {
        totalNotes:        noteRows.length,
        totalFeatures:     features.length,
        deliveredFeatures: delivered.length,
        pipelineFeatures:  pipeline.length,
        reviewFeatures:    review.length,
        unlinkedNotes:     unlinkedNotes.length,
      },
      features,
      unlinkedNotes,
    };

    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[pb-insights]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = pbInsights;
