const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

let cachedResult = null;
let cacheTs = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) {
    console.log('[token] Using cached token');
    return cachedToken;
  }

  try {
    console.log('[token] Fetching fresh token via az CLI...');
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    cachedToken = token;
    tokenExpiry = now + 55 * 60 * 1000; // 55 minutes
    console.log('[token] Got fresh token, expires in ~55min');
    return token;
  } catch (err) {
    console.error('[token] Failed to get token:', err.message);
    throw new Error(`Failed to authenticate: ${err.message}. Make sure 'az login' has been run.`);
  }
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: {
      type: 'azure-active-directory-access-token',
      options: {
        token: token
      }
    },
    requestTimeout: 120000,
    options: { encrypt: true, trustServerCertificate: false, connectionTimeout: 30000 }
  });

  try {
    await conn.connect();
    const result = await conn.request().query(query);
    return result.recordset;
  } catch (err) {
    if (err.message && (err.message.includes('Could not login') || err.message.includes('authentication failed') || err.message.includes('token'))) {
      cachedToken = null;
      tokenExpiry = null;
    }
    throw err;
  } finally {
    await conn.close();
  }
}

async function features(req, res) {
  try {
    if (cachedResult && cacheTs && Date.now() - cacheTs < CACHE_TTL) {
      return res.json(cachedResult);
    }

    const query = `
SELECT
    feature_id              AS featureId,
    feature_name            AS featureName,
    product_name            AS productName,
    efficiency_label        AS criticalityLabel,
    efficiency_impact       AS efficiencyImpact,
    raw_regional_priority   AS rawRegionalPriority,
    rank_score              AS rankScore,
    criticality_score       AS criticalityScore,
    efficiency_score        AS efficiencyScore,
    strategic_region_score  AS strategicRegionScore,
    rank_weighted           AS rankWeighted,
    criticality_weighted    AS criticalityWeighted,
    efficiency_weighted     AS efficiencyWeighted,
    strategic_region_weighted AS strategicRegionWeighted,
    region_multiplier       AS regionMultiplier,
    strategic_region_count  AS strategicRegionCount,
    feature_score           AS featureScore,
    best_subfeature_score   AS bestSubfeatureScore,
    subfeature_count        AS subfeatureCount,
    prioritization_score    AS prioritizationScore,
    score_source            AS scoreSource,
    priority_rank           AS priorityRank,
    matched_booster_detail  AS matchedBoosterDetail,
    matched_region_detail   AS matchedRegionDetail,
    best_subfeature_id      AS bestSubfeatureId,
    best_subfeature_name    AS bestSubfeatureName,
    sub_raw_regional_priority AS subRawRegionalPriority,
    sub_rank_score          AS subRankScore,
    sub_criticality_score   AS subCriticalityScore,
    sub_efficiency_score    AS subEfficiencyScore,
    sub_strategic_region_score AS subStrategicRegionScore,
    sub_rank_weighted       AS subRankWeighted,
    sub_criticality_weighted AS subCriticalityWeighted,
    sub_efficiency_weighted AS subEfficiencyWeighted,
    sub_strategic_region_weighted AS subStrategicRegionWeighted,
    sub_region_market_count AS subRegionMarketCount,
    sub_region_multiplier   AS subRegionMultiplier,
    sub_criticality         AS subCriticality,
    sub_efficiency          AS subEfficiency,
    sub_region_text         AS subRegionText
FROM dbo.v_gold_pb_feature_prioritization_final
ORDER BY prioritization_score DESC
    `;

    const [rows, noteCounts] = await Promise.all([
      queryLakehouse(query),
      queryLakehouse(`
        SELECT feature_id, COUNT(DISTINCT note_id) AS note_count, MAX(note_created_at) AS latest_note_at
        FROM v_gold_pb_note_company_feature
        WHERE is_archived = 0
        GROUP BY feature_id
      `)
    ]);
    const noteMap = {};
    (noteCounts || []).forEach(r => { noteMap[r.feature_id] = { noteCount: Number(r.note_count) || 0, latestNoteAt: r.latest_note_at }; });
    const features = rows.map(f => ({ ...f, noteCount: noteMap[f.featureId]?.noteCount || 0, latestNoteAt: noteMap[f.featureId]?.latestNoteAt || null }));

    const payload = { features, syncedAt: new Date().toISOString(), rowCount: features.length };
    cachedResult = payload;
    cacheTs = Date.now();
    res.json(payload);
  } catch (err) {
    console.error('[features]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = features;
