require('dotenv').config();
const express = require('express');
const path = require('path');
const lakehouseStatus = require('./api/lakehouse-status');
const features = require('./api/features');
const currentUser = require('./api/current-user');
const accounts = require('./api/accounts');
const accountsList = require('./api/accounts-list');
const integrationStatus = require('./api/integration-status');
const buildStatus = require('./api/build-status');
const dataSources = require('./api/data-sources');
const dataSourcesMinimal = require('./api/data-sources-minimal');
const mdmAccounts = require('./api/mdm-accounts');
const zdTickets = require('./api/zd-tickets');
const pbInsights = require('./api/pb-insights');
const featureInsights = require('./api/feature-insights');
const companyFeatures = require('./api/company-features');
const phTrends       = require('./api/ph-trends');
const phUsers        = require('./api/ph-users');
const phRegions      = require('./api/ph-regions');
const phRegionDetail = require('./api/ph-region-detail');
const phBenchmark    = require('./api/ph-benchmark');
const phSankey       = require('./api/ph-sankey');
const accountMatches = require('./api/account-matches');
const swIntelligence = require('./api/sw-intelligence');
const clientTimeline    = require('./api/client-timeline');
const sfCases           = require('./api/sf-cases');
const sfOpportunities   = require('./api/sf-opportunities');
const { query: dbQuery } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// No-cache headers to prevent stale data
app.use((req, res, next) => {
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
});

const argusPath = path.join(__dirname, '../public');

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ test: 'ok', hasAccountsList: typeof accountsList });
});

// API routes (MUST be before static files)
app.get('/api/lakehouse-status', lakehouseStatus);
app.get('/api/build-status', buildStatus);
app.get('/api/data-sources', dataSources);
app.get('/api/data-sources/minimal', dataSourcesMinimal);
app.get('/api/features', features);
app.get('/api/current-user', currentUser);
app.get('/api/accounts-list', accountsList);
app.get('/api/accounts/:accountName', accounts);
app.get('/api/integration-status', integrationStatus);
app.get('/api/mdm-accounts', mdmAccounts);
app.get('/api/zd-tickets', zdTickets);
app.get('/api/pb-insights', pbInsights);
app.get('/api/feature-insights', featureInsights);
app.get('/api/company-features', companyFeatures);
app.get('/api/ph-trends',   phTrends);
app.get('/api/ph-users',    phUsers);
app.get('/api/ph-regions',        phRegions);
app.get('/api/ph-region-detail',  phRegionDetail);
app.get('/api/ph-benchmark',      phBenchmark);
app.get('/api/ph-sankey',         phSankey);
app.get('/api/account-matches',   accountMatches);
app.get('/api/sw-intelligence',   swIntelligence);
app.get('/api/client-timeline',   clientTimeline);
app.get('/api/sf-cases',          sfCases);
app.get('/api/sf-opportunities',  sfOpportunities);
app.get('/sw-intelligence', (req, res) => res.sendFile(path.join(argusPath, 'sw-intelligence.html')));

// Serve Argus dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(argusPath, 'Argus.dc.html'));
});

// Serve Argus dashboard static files (AFTER API routes) — no-cache so HTML changes are always picked up
app.use(express.static(argusPath, { etag: false, lastModified: false, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); } }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Argus backend running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  // Eagerly connect pool + prime the accounts-list cache so health card loads instantly.
  dbQuery('SELECT 1 AS ping').then(() => {
    console.log('[db] Pool warm — priming accounts-list cache');
    return accountsList({ query: {} }, {
      json: (data) => { console.log(`[db] Accounts-list primed (${(data.accounts||[]).length} accounts)`); },
      status: () => ({ json: () => {} }),
    });
  }).catch(err => {
    console.warn('[db] Warm-up failed (will retry on first request):', err.message);
  });
});
