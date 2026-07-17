const { query } = require('../lib/db');

let cachedResult = null;
let cacheTs = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getSourceFromName(name) {
  if (name.includes('_lookup')) return 'Product Operations';
  if (name.includes('_sf')) return 'Salesforce';
  if (name.includes('_pb')) return 'Productboard';
  return 'Unknown';
}

async function lakelzouseStatus(req, res) {
  try {
    if (cachedResult && cacheTs && Date.now() - cacheTs < CACHE_TTL) {
      return res.json(cachedResult);
    }

    // All 5 schema queries are independent — run in parallel
    const [bronzeCount, silverViews, goldViews, goldTables, bronzeDetails] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT LIKE 'gold_%'`),
      query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_silver_%' ORDER BY TABLE_NAME`),
      query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME LIKE 'v_gold_%' ORDER BY TABLE_NAME`),
      query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME LIKE 'gold_%' ORDER BY TABLE_NAME`),
      query(`SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT LIKE 'gold_%' ORDER BY TABLE_NAME`),
    ]);

    const silverViewsWithSource = silverViews.map(v => ({
      name: v.TABLE_NAME,
      source: getSourceFromName(v.TABLE_NAME),
      purpose: `${v.TABLE_NAME} transformation view`
    }));

    const goldViewsWithSource = goldViews.map(v => ({
      name: v.TABLE_NAME,
      source: getSourceFromName(v.TABLE_NAME),
      purpose: `${v.TABLE_NAME} analytical view`
    }));

    const goldTablesWithSource = goldTables.map(t => ({
      name: t.TABLE_NAME,
      source: getSourceFromName(t.TABLE_NAME) === 'Unknown' && t.TABLE_NAME === 'gold_exchangeratetable' ? 'Finance' : getSourceFromName(t.TABLE_NAME)
    }));

    const bronzeTablesWithSource = bronzeDetails.map(b => ({
      name: b.name,
      source: getSourceFromName(b.name)
    }));

    const silverBySource = {};
    const goldBySource = {};
    const bronzeBySource = {};

    silverViewsWithSource.forEach(v => { silverBySource[v.source] = (silverBySource[v.source] || 0) + 1; });
    goldViewsWithSource.forEach(v => { goldBySource[v.source] = (goldBySource[v.source] || 0) + 1; });
    goldTablesWithSource.forEach(t => { goldBySource[t.source] = (goldBySource[t.source] || 0) + 1; });
    bronzeTablesWithSource.forEach(b => { bronzeBySource[b.source] = (bronzeBySource[b.source] || 0) + 1; });

    const status = {
      bronze: {
        layer: 'Bronze',
        count: bronzeCount[0].count,
        totalRows: null,
        countBySource: bronzeBySource,
        label: 'Bronze Layer',
        description: 'Raw data tables landed by data team. Source of truth, minimal transformation.',
        tables: bronzeTablesWithSource
      },
      silver: {
        layer: 'Silver',
        count: silverViews.length,
        totalRows: null,
        countBySource: silverBySource,
        label: 'Silver Layer',
        description: 'PoC transformation views. Data validation and business logic.',
        status: 'proof-of-concept',
        views: silverViewsWithSource
      },
      gold: {
        layer: 'Gold',
        count: goldViews.length + goldTables.length,
        totalRows: null,
        countBySource: goldBySource,
        label: 'Gold Layer',
        description: 'Materialized analytical tables and views.',
        status: 'production-ready',
        views: goldViewsWithSource,
        tables: goldTablesWithSource
      },
      lastUpdated: new Date().toISOString()
    };

    cachedResult = status;
    cacheTs = Date.now();
    res.json(status);
  } catch (err) {
    console.error('[lakehouse-status]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = lakelzouseStatus;
