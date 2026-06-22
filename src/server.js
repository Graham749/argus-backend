require('dotenv').config();
const express = require('express');
const path = require('path');
const lakehouseStatus = require('./api/lakehouse-status');
const features = require('./api/features');
const currentUser = require('./api/current-user');

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

const argusPath = path.join(__dirname, '../../skills-for-fabric/Argus/Argus live data update');

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (MUST be before static files)
app.get('/api/lakehouse-status', lakehouseStatus);
app.get('/api/features', features);
app.get('/api/current-user', currentUser);

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
  console.log(`Features: http://localhost:${PORT}/api/features`);
});
