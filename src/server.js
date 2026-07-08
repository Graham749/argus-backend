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

// Serve Argus dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(argusPath, 'Argus.dc.html'));
});

// Serve Argus dashboard static files (AFTER API routes)
app.use(express.static(argusPath));

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
  console.log(`Lakehouse status: http://localhost:${PORT}/api/lakehouse-status`);
  console.log(`Build status: http://localhost:${PORT}/api/build-status`);
  console.log(`Features: http://localhost:${PORT}/api/features`);
});
