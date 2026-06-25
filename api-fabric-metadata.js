const express = require('express');
const sql = require('mssql');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

// Fabric connection config
let connPool = null;

async function initConnection() {
  if (connPool) return connPool;

  try {
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    connPool = new sql.ConnectionPool({
      server: 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: { token }
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectionTimeout: 30000,
        requestTimeout: 120000
      }
    });

    await connPool.connect();
    console.log('[API] Connected to Fabric');
    return connPool;
  } catch (err) {
    console.error('[API] Connection error:', err.message);
    throw err;
  }
}

// Data source categorization — returns { layer, source } where layer is 'silver'|'gold' and source is the data source
function categorizeView(viewName) {
  // Determine medallion layer first
  let layer = 'other';
  if (viewName.startsWith('v_silver_')) layer = 'silver';
  else if (viewName.startsWith('v_gold_')) layer = 'gold';

  // Determine source system
  let source = 'Other';
  if (viewName.includes('_pb_')) source = 'Productboard';
  else if (viewName.includes('_sf_')) source = 'Salesforce';
  else if (viewName.includes('_lookup_') || viewName.includes('_prioritization')) source = 'Product Operations';
  else if (viewName.includes('_posthog_')) source = 'Posthog';
  else if (viewName.includes('_zendesk_')) source = 'Zendesk';
  else if (viewName.includes('_jira_')) source = 'Jira';

  return { layer, source };
}

// Categorize tables (bronze and gold tables, not views)
function categorizeTable(tableName) {
  let source = 'Other';
  if (tableName === 'gold_exchangeratetable') source = 'Finance';
  else if (tableName.includes('_pb')) source = 'Productboard';
  else if (tableName.includes('_sfapi')) source = 'Salesforce';

  return source;
}

// Get all views and tables with metadata (combined for performance)
async function getMetadata() {
  try {
    const conn = await initConnection();

    // Get basic table/view structure
    const structResult = await conn.request().query(`
      SELECT
        TABLE_NAME as name,
        TABLE_SCHEMA as schema_name,
        TABLE_TYPE as type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
      ORDER BY TABLE_NAME
    `);

    // Get row counts and modification times for base tables
    const statsResult = await conn.request().query(`
      SELECT
        t.name,
        SUM(p.rows) as row_count,
        MAX(t.modify_date) as last_modified
      FROM sys.tables t
      LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
      WHERE t.schema_id = SCHEMA_ID('dbo')
      GROUP BY t.object_id, t.name, t.modify_date
    `);

    // Create lookup for stats
    const statsMap = {};
    statsResult.recordset.forEach(stat => {
      statsMap[stat.name] = {
        rowCount: stat.row_count || 0,
        lastModified: stat.last_modified || null
      };
    });

    const silverViews = [];
    const goldViews = [];
    const secondaryViews = [];
    const tables = [];

    structResult.recordset.forEach(item => {
      if (item.type === 'VIEW') {
        const { layer, source } = categorizeView(item.name);
        const view = {
          name: item.name,
          schema: item.schema_name,
          source: source
        };

        if (layer === 'silver') silverViews.push(view);
        else if (layer === 'gold') goldViews.push(view);
        else secondaryViews.push(view);
      } else if (item.type === 'BASE TABLE') {
        const stats = statsMap[item.name] || { rowCount: 0, lastModified: null };
        tables.push({
          name: item.name,
          schema: item.schema_name,
          type: item.type,
          rowCount: stats.rowCount,
          lastModified: stats.lastModified
        });
      }
    });

    return { silverViews, goldViews, secondaryViews, tables };
  } catch (err) {
    console.error('[API] Query error:', err.message);
    throw err;
  }
}

// API Endpoints

// GET /api/data-sources — Full metadata for all sources (views and tables)
app.get('/api/data-sources', async (req, res) => {
  try {
    const { silverViews, goldViews, secondaryViews, tables } = await getMetadata();
    const allViews = [...silverViews, ...goldViews, secondaryViews];

    // Group views by source
    const dataSources = {};
    allViews.forEach(v => {
      if (!dataSources[v.source]) dataSources[v.source] = [];
      dataSources[v.source].push(v);
    });

    // Add gold tables (not bronze, not silver)
    const goldTables = tables.filter(t => !t.name.startsWith('bronze_') &&
                                          (t.name.startsWith('gold_') || t.name === 'gold_exchangeratetable'));
    goldTables.forEach(t => {
      const source = categorizeTable(t.name);
      if (!dataSources[source]) dataSources[source] = [];
      dataSources[source].push({
        name: t.name,
        schema: t.schema,
        source: source,
        type: 'TABLE'
      });
    });

    // Reorder to put primary sources first
    const ordered = {};
    const priority = ['Productboard', 'Salesforce', 'Product Operations', 'Finance', 'Posthog', 'Zendesk', 'Jira', 'Other'];

    priority.forEach(source => {
      if (dataSources[source]) {
        ordered[source] = dataSources[source];
      }
    });

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      dataSources: ordered,
      summary: {
        total: Object.values(ordered).reduce((sum, items) => sum + items.length, 0),
        sources: Object.keys(ordered).length
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/data-sources/minimal — Just view names grouped by source (for UI)
app.get('/api/data-sources/minimal', async (req, res) => {
  try {
    const { silverViews, goldViews, secondaryViews, tables } = await getMetadata();
    const allViews = [...silverViews, ...goldViews, ...secondaryViews];

    // Group views by source
    const dataSources = {};
    allViews.forEach(v => {
      if (!dataSources[v.source]) dataSources[v.source] = [];
      dataSources[v.source].push(v.name);
    });

    // Add gold tables
    const goldTables = tables.filter(t => !t.name.startsWith('bronze_') &&
                                          (t.name.startsWith('gold_') || t.name === 'gold_exchangeratetable'));
    goldTables.forEach(t => {
      const source = categorizeTable(t.name);
      if (!dataSources[source]) dataSources[source] = [];
      dataSources[source].push(t.name);
    });

    const minimal = {};
    const priority = ['Productboard', 'Salesforce', 'Product Operations', 'Finance', 'Posthog', 'Zendesk', 'Jira'];

    priority.forEach(source => {
      if (dataSources[source]) {
        minimal[source] = dataSources[source];
      }
    });

    res.json(minimal);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/lakehouse-status — For Argus Build Status widget (legacy format)
app.get('/api/lakehouse-status', async (req, res) => {
  try {
    const { silverViews, goldViews, secondaryViews, tables } = await getMetadata();

    // Group silver views by source
    const silverBySource = {};
    silverViews.forEach(v => {
      if (!silverBySource[v.source]) silverBySource[v.source] = [];
      silverBySource[v.source].push(v);
    });

    // Group gold views by source
    const goldBySource = {};
    goldViews.forEach(v => {
      if (!goldBySource[v.source]) goldBySource[v.source] = [];
      goldBySource[v.source].push(v);
    });

    // Group secondary views by source
    const secondaryBySource = {};
    secondaryViews.forEach(v => {
      if (!secondaryBySource[v.source]) secondaryBySource[v.source] = [];
      secondaryBySource[v.source].push(v);
    });

    // Filter and categorize bronze tables (only those starting with 'bronze_')
    // and gold tables (like gold_exchangeratetable)
    const bronzeTables = tables.filter(t => t.name.startsWith('bronze_'));
    const goldTables = tables.filter(t => !t.name.startsWith('bronze_') &&
                                          (t.name.startsWith('gold_') || t.name === 'gold_exchangeratetable'));
    const bronzeBySource = {};
    const goldBySourceTables = {};

    // Prepare table objects with HTML-expected properties
    const bronzeTableDetails = bronzeTables.map(t => {
      const source = categorizeTable(t.name);

      if (!bronzeBySource[source]) bronzeBySource[source] = [];

      // Each table has 1 load (distinct modification timestamp = 1 unique date)
      const loadCount = t.lastModified ? 1 : 0;

      const tableDetail = {
        name: t.name,
        source: source,
        lastRefresh: t.lastModified ? new Date(t.lastModified).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : 'Unknown',
        rowCount: loadCount,
        loadLabel: loadCount === 1 ? 'load' : 'loads'
      };

      bronzeBySource[source].push(tableDetail);
      return tableDetail;
    });

    // Calculate total distinct loads across all bronze tables
    const distinctTimestamps = new Set(
      bronzeTables
        .map(t => t.lastModified)
        .filter(ts => ts !== null && ts !== undefined)
        .map(ts => new Date(ts).toLocaleDateString())
    );
    const totalLoads = distinctTimestamps.size;

    // Build sourceGroups for HTML rendering
    const sourceGroups = Object.entries(bronzeBySource).map(([source, tables]) => ({
      name: source,
      count: tables.length,
      tables: tables
    }));

    // Process gold tables (like gold_exchangeratetable)
    const goldTableDetails = goldTables.map(t => {
      const source = categorizeTable(t.name);

      if (!goldBySourceTables[source]) goldBySourceTables[source] = [];

      const tableDetail = {
        name: t.name,
        source: source,
        lastRefresh: t.lastModified ? new Date(t.lastModified).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : 'Unknown',
        rowCount: t.rowCount || 0
      };

      goldBySourceTables[source].push(tableDetail);
      return tableDetail;
    });

    const buildStatus = {
      bronze: {
        count: bronzeTables.length,
        description: 'Source tables',
        tables: bronzeTableDetails,
        sourceGroups: sourceGroups,
        totalRows: bronzeTables.reduce((sum, t) => sum + (t.rowCount || 0), 0),
        lastRefresh: bronzeTables.length > 0 ? new Date(Math.max(...bronzeTables.map(t => new Date(t.lastModified).getTime()).filter(n => !isNaN(n)))).toISOString() : null,
        productboardCount: (bronzeBySource['Productboard'] || []).length,
        salesforceCount: (bronzeBySource['Salesforce'] || []).length
      },
      silver: {
        count: silverViews.length,
        description: 'Transformed views',
        status: 'ready',
        views: silverViews,
        productboardCount: (silverBySource['Productboard'] || []).length,
        salesforceCount: (silverBySource['Salesforce'] || []).length,
        productOpsCount: (silverBySource['Product Operations'] || []).length
      },
      gold: {
        count: goldViews.length + goldTableDetails.length,
        description: 'Materialized tables',
        status: 'ready',
        views: goldViews,
        tables: goldTableDetails,
        productboardCount: (goldBySource['Productboard'] || []).length,
        salesforceCount: (goldBySource['Salesforce'] || []).length,
        productOpsCount: (goldBySource['Product Operations'] || []).length,
        financeCount: (goldBySourceTables['Finance'] || []).length
      }
    };

    res.json(buildStatus);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/health — Connectivity check
app.get('/api/health', async (req, res) => {
  try {
    const conn = await initConnection();
    res.json({ status: 'connected', fabric: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'disconnected', error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[API] Fabric metadata API running on http://localhost:${PORT}`);
  console.log(`  GET /api/data-sources — Full metadata`);
  console.log(`  GET /api/data-sources/minimal — View names only`);
  console.log(`  GET /api/build-status — Build Status widget format`);
  console.log(`  GET /api/health — Health check`);
});
