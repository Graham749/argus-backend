require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
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
const eosEngagement        = require('./api/eos-engagement');
const eosEngagementAccount = require('./api/eos-engagement-account');
const { query: dbQuery } = require('./lib/db');
const cacheWarmer        = require('./lib/cache-warmer');
const { postFeedback, getFeedback, deleteFeedback } = require('./api/feedback');
const { isAllowed, loadAllowlist } = require('./lib/allowlist');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});
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

// ── Allowlist guard — reads from dbo.argus_allowed_users in Fabric ──
// Guard is automatically disabled if the table doesn't exist yet (fail open).
// Cache refreshes every 5 minutes — no restart needed to add/remove users.
function decodeOidcEmail(req) {
  try {
    const token = req.headers['x-amzn-oidc-data'];
    if (!token) return null;
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return (payload.email || payload.upn || payload.preferred_username || payload.unique_name || '').toLowerCase();
  } catch { return null; }
}

app.use(async (req, res, next) => {
  if (req.path === '/health') return next();
  if (req.path.startsWith('/assets/')) return next(); // static assets always public (fonts, images)

  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  let email = decodeOidcEmail(req);

  // Local dev: simulate a user via DEV_USER_EMAIL so the allowlist can be tested without an ALB
  if (!email && isLocal) {
    email = process.env.DEV_USER_EMAIL || null;
  }

  if (!email) return next(); // no identity — ALB will have already blocked unauthenticated requests in prod

  if (await isAllowed(email)) return next();

  console.warn(`[allowlist] Blocked: ${email} ${req.path}`);
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Argus is currently in a limited pilot. Your account has not been added yet.' });
  }
  return res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Argus — Pilot Access</title>
  <style>
    @font-face{font-family:'Lato';src:url('/assets/fonts/lato-regular.woff2') format('woff2');font-weight:400;font-style:normal;}
    @font-face{font-family:'Lato';src:url('/assets/fonts/lato-bold.woff2') format('woff2');font-weight:700;font-style:normal;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Lato','Helvetica Neue',Arial,sans-serif;background:#f7f7f6;color:#3c3c3b;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column;}
    nav{background:#3c3c3b;height:60px;display:flex;align-items:center;padding:0 28px;gap:12px;box-shadow:0 1px 0 rgba(0,0,0,0.2);}
    nav img{height:32px;width:32px;}
    nav .brand{font-size:15px;font-weight:700;color:#fff;letter-spacing:0.02em;}
    nav .pill{font-size:10px;font-weight:700;padding:3px 9px;background:#ffcc00;color:#3c3c3b;border-radius:20px;letter-spacing:0.08em;text-transform:uppercase;}
    main{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px;}
    .card{background:#fff;border:1px solid #e6e6e5;border-radius:12px;padding:48px 40px;max-width:480px;width:100%;text-align:center;box-shadow:0 2px 8px rgba(60,60,59,0.08);}
    .card h1{font-size:22px;font-weight:700;color:#3c3c3b;margin-bottom:12px;}
    .card .sub{font-size:14px;color:#6d6d6c;line-height:1.7;margin-bottom:8px;}
    .card .email{font-size:13px;color:#9d9d9d;background:#f7f7f6;border-radius:6px;padding:8px 14px;display:inline-block;margin:12px 0 20px;}
    .card a{color:#288184;text-decoration:none;font-weight:700;}
    .card a:hover{text-decoration:underline;}
    .divider{border:none;border-top:1px solid #e6e6e5;margin:24px 0;}
    .footer{font-size:11px;color:#9d9d9d;}
  </style>
</head>
<body>
  <nav>
    <img src="/assets/Argus Logo.svg" alt="Argus">
    <span class="brand">ARGUS</span>
    <span class="pill">Pilot</span>
  </nav>
  <main>
    <div class="card">
      <h1>Access Restricted</h1>
      <p class="sub">Argus is Aurora's internal intelligence platform — bringing together client engagement, commercial signals, EOS usage, and support activity into a single view.</p>
      <hr class="divider">
      <p class="sub">Argus is currently available to a limited pilot group of users.</p>
      <div class="email">${email}</div>
      <p class="sub">Your account has not been included in this phase.</p>
      <hr class="divider">
      <p class="footer">To request access, please contact <a href="mailto:graham.clark@auroraer.com">Graham Clark</a>.</p>
    </div>
  </main>
</body>
</html>`);
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
app.get('/api/eos-engagement',         eosEngagement);
app.get('/api/eos-engagement-account', eosEngagementAccount);
app.get('/sw-intelligence',   (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(argusPath, 'sw-intelligence.html')); });
app.get('/eos-engagement',    (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(argusPath, 'eos-engagement.html')); });
app.get('/welcome',           (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(argusPath, 'welcome.html')); });

// Serve Argus dashboard at root
app.post('/api/feedback', postFeedback);
app.get('/api/feedback', getFeedback);
app.delete('/api/feedback/:id', deleteFeedback);

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
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

  // Pre-warm top-30 accounts across all client health endpoints (staggered, non-blocking).
  cacheWarmer.run(PORT).catch(err => console.warn('[cache-warmer]', err.message));

  // Keep Fabric compute warm — prevents autosuspend between cache refreshes.
  setInterval(() => {
    dbQuery('SELECT 1 AS ping').catch(() => {});
  }, 5 * 60 * 1000);
});
