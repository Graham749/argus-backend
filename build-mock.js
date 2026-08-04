#!/usr/bin/env node
// Bundles Argus mock into a single self-contained HTML file for sharing.
// Usage: node build-mock.js
// Output: mock-standalone.html

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { execSync } = require('child_process');

const PUBLIC = path.join(__dirname, 'public');
const ASSETS = path.join(PUBLIC, 'assets');
const CACHE  = path.join(__dirname, '.build-cache');
const OUT    = path.join(__dirname, 'mock-standalone.html');

// ── CDN deps inlined to avoid network requirement at runtime ──────────────────
const CDN_DEPS = [
  { name: 'react.js',     url: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js' },
  { name: 'react-dom.js', url: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js' },
  { name: 'd3.js',        url: 'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js' },
  { name: 'topojson.js',  url: 'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js' },
  { name: 'd3-sankey.js', url: 'https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js' },
];

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return download(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getCdnDep(dep) {
  if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE);
  const cached = path.join(CACHE, dep.name);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
  process.stdout.write(`  Downloading ${dep.name}...`);
  const src = await download(dep.url);
  fs.writeFileSync(cached, src);
  process.stdout.write(' done\n');
  return src;
}

(async () => {

// ── Version stamp ─────────────────────────────────────────────────────────────
let gitHash = 'local';
try { gitHash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim(); } catch(e) {}
const date    = new Date().toISOString().slice(0, 10);
const version = `${date} · ${gitHash}`;

console.log(`\nBuilding Argus mock standalone — ${version}`);

// ── Download / cache CDN deps ─────────────────────────────────────────────────
console.log('CDN dependencies:');
const cdnSources = {};
for (const dep of CDN_DEPS) {
  cdnSources[dep.name] = await getCdnDep(dep);
}

// ── Read source files ─────────────────────────────────────────────────────────
let html        = fs.readFileSync(path.join(PUBLIC, 'Argus.dc.html'), 'utf8');
let mockJs      = fs.readFileSync(path.join(PUBLIC, 'mock-data.js'),  'utf8');
const supportJs = fs.readFileSync(path.join(PUBLIC, 'support.js'),    'utf8');

// ── Transform mock-data.js ────────────────────────────────────────────────────

// 1. Always-on mock mode — remove the URL guard
mockJs = mockJs.replace(
  "if (!new URLSearchParams(location.search).has('mock')) return;",
  '// standalone build — mock always active'
);

// 2. Remove beforeunload cache-clear (no live version to protect in bundle)
mockJs = mockJs.replace(
  /\/\/ Remove accounts cache.*?}\s*\}\);/s,
  '// (beforeunload cache-clear removed in standalone build)'
);

// 3. Inject countries-110m.json into the fetch interceptor so globe works offline
const countriesRaw = fs.readFileSync(path.join(ASSETS, 'countries-110m.json'), 'utf8');
const countriesMin = JSON.stringify(JSON.parse(countriesRaw));
mockJs = mockJs.replace(
  'const _origFetch = window.fetch;',
  `window.__mockCountries = ${countriesMin};\n  const _origFetch = window.fetch;`
);
mockJs = mockJs.replace(
  'return _origFetch(url, opts);',
  `if (u.includes('countries-110m.json')) return ok(window.__mockCountries);\n    return _origFetch(url, opts);`
);

// 4. Version stamp in the badge
mockJs = mockJs.replace(
  '>Mock data</span>',
  `>Mock · ${date}</span>`
);

// ── Transform HTML ────────────────────────────────────────────────────────────

// 1. Replace CDN script tags with inline versions
html = html
  .replace('<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>',
    `<script>\n${cdnSources['d3.js']}\n</script>`)
  .replace('<script src="https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js"></script>',
    `<script>\n${cdnSources['topojson.js']}\n</script>`)
  .replace('<script src="https://cdn.jsdelivr.net/npm/d3-sankey@0.12.3/dist/d3-sankey.min.js"></script>',
    `<script>\n${cdnSources['d3-sankey.js']}\n</script>`);

// 2. Inline React + ReactDOM BEFORE support.js (support.js skips its own fetch if they're on window)
const reactBlock = `<script>\n${cdnSources['react.js']}\n</script>\n<script>\n${cdnSources['react-dom.js']}\n</script>`;
html = html.replace(
  '<script src="./support.js"></script>',
  `${reactBlock}\n<script>\n${supportJs}\n</script>`
);

// 3. Inline mock-data.js
html = html.replace(
  '<script src="./mock-data.js"></script>',
  `<script>\n${mockJs}\n</script>`
);

// 4. Base64-encode images
function dataUri(filename) {
  const fullPath = path.join(ASSETS, filename);
  if (!fs.existsSync(fullPath)) { console.warn(`  WARN: missing asset — ${filename}`); return null; }
  const ext  = path.extname(filename).slice(1).toLowerCase();
  const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

const imageReplacements = [
  ['assets/logo-negative.png',                     'logo-negative.png'],
  ['assets/Argus Logo.svg',                         'Argus Logo.svg'],
  ['assets/isotope.png',                            'isotope.png'],
  ['./assets/salesforce-2.svg',                     'salesforce-2.svg'],
  ['./assets/Zendesk.png',                          'Zendesk.png'],
  ['./assets/Productboard Logo Vector.svg .png',    'Productboard Logo Vector.svg .png'],
  ['./assets/posthog-logomark.svg',                 'posthog-logomark.svg'],
];

for (const [ref, filename] of imageReplacements) {
  const uri = dataUri(filename);
  if (!uri) continue;
  while (html.includes(ref)) html = html.replace(ref, uri);
}

// 5. SW Intelligence iframe → placeholder (requires live backend)
html = html.replace(
  '<iframe src="/sw-intelligence?embed=1" style="width:100%;height:100%;border:none;" title="SW Revenue Intelligence"></iframe>',
  '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#9d9d9d;">'
  + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:40px;height:40px;opacity:0.4;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  + '<div style="font-size:14px;font-weight:600;">SW Intelligence</div>'
  + '<div style="font-size:12px;">Available in the live version</div>'
  + '</div>'
);

// 6. Version comment at top
html = `<!-- Argus mock standalone — ${version} -->\n` + html;

// ── Write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(OUT, html, 'utf8');
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`\n✓  mock-standalone.html  (${kb} KB)`);
console.log(`   Version : ${version}`);
console.log(`   Upload to Claude and share the artifact URL.\n`);

})().catch(e => { console.error('\nBuild failed:', e.message); process.exit(1); });
