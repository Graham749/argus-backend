const express = require('express');
const sql = require('mssql');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Data source categorization
function categorizeView(viewName) {
  if (viewName.includes('_pb_')) return 'Productboard';
  if (viewName.includes('_sf_')) return 'Salesforce';
  if (viewName.includes('_lookup_') || viewName.includes('_prioritization')) return 'Product Operations';
  if (viewName.includes('_posthog_')) return 'Posthog';
  if (viewName.includes('_zendesk_')) return 'Zendesk';
  if (viewName.includes('_jira_')) return 'Jira';
  return 'Other';
}

// Get all views with metadata
async function getDataSources() {
  try {
    const conn = await initConnection();

    const result = await conn.request().query(`
      SELECT
        TABLE_NAME as view_name,
        TABLE_SCHEMA as schema_name,
        TABLE_TYPE as type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_TYPE = 'VIEW'
        AND (TABLE_NAME LIKE 'v_%' OR TABLE_NAME LIKE 'lu_%')
      ORDER BY TABLE_NAME
    `);

    // Organize by data source
    const dataSources = {};

    result.recordset.forEach(view => {
      const source = categorizeView(view.view_name);
      if (!dataSources[source]) {
        dataSources[source] = [];
      }
      dataSources[source].push({
        name: view.view_name,
        schema: view.schema_name,
        type: view.type
      });
    });

    return dataSources;
  } catch (err) {
    console.error('[API] Query error:', err.message);
    throw err;
  }
}

// API Endpoints

// GET /api/data-sources — Full metadata for all sources
app.get('/api/data-sources', async (req, res) => {
  try {
    const dataSources = await getDataSources();

    // Reorder to put primary sources first
    const ordered = {};
    const priority = ['Productboard', 'Salesforce', 'Product Operations', 'Posthog', 'Zendesk', 'Jira', 'Other'];

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
        total: Object.values(ordered).reduce((sum, views) => sum + views.length, 0),
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
    const dataSources = await getDataSources();

    const minimal = {};
    const priority = ['Productboard', 'Salesforce', 'Product Operations', 'Posthog', 'Zendesk', 'Jira'];

    priority.forEach(source => {
      if (dataSources[source]) {
        minimal[source] = dataSources[source].map(v => v.name);
      }
    });

    res.json(minimal);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/build-status — For Argus Build Status widget
app.get('/api/build-status', async (req, res) => {
  try {
    const dataSources = await getDataSources();

    // Format for Argus Build Status UI
    const buildStatus = {
      primary: {
        title: 'Medallion Layer Data Sources',
        sources: {}
      },
      secondary: {
        title: 'Observability & Support',
        sources: {}
      }
    };

    // Primary sources
    ['Productboard', 'Salesforce', 'Product Operations'].forEach(source => {
      if (dataSources[source]) {
        buildStatus.primary.sources[source] = {
          views: dataSources[source].length,
          status: 'ready',
          updated: new Date().toISOString()
        };
      }
    });

    // Secondary sources
    ['Posthog', 'Zendesk', 'Jira'].forEach(source => {
      if (dataSources[source]) {
        buildStatus.secondary.sources[source] = {
          views: dataSources[source].length,
          status: 'ready',
          updated: new Date().toISOString()
        };
      }
    });

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
