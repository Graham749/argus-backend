#!/usr/bin/env node
// Bundles Argus mock into a single self-contained HTML file for sharing.
// Usage: node build-mock.js
// Output: mock-standalone.html

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const { execSync } = require('child_process');

const PUBLIC = path.join(__dirname, 'public');
const ASSETS = path.join(PUBLIC, 'assets');
const CACHE  = path.join(__dirname, '.build-cache');
const OUT    = path.join(__dirname, 'mock-standalone.html');

// React must be inlined — Claude artifact sandbox blocks unpkg.com at runtime.
// d3/topojson/d3-sankey are loaded by support.js via script tags after React boots;
// those CDNs (cdnjs/jsdelivr) are reachable from the artifact sandbox.
const CDN_DEPS = [
  { name: 'react.production.min.js',     url: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js' },
  { name: 'react-dom.production.min.js', url: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js' },
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
const reactInline =
  `<script>${cdnSources['react.production.min.js']}</script>\n` +
  `<script>${cdnSources['react-dom.production.min.js']}</script>`;

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

// 3. Redirect countries-110m.json to CDN (Claude artifact has internet access)
mockJs = mockJs.replace(
  'return _origFetch(url, opts);',
  `if (u.includes('countries-110m.json')) return _origFetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');\n    return _origFetch(url, opts);`
);

// 4. Version stamp in the badge
mockJs = mockJs.replace(
  '>Mock data</span>',
  `>Mock · ${date}</span>`
);

// ── Transform HTML ────────────────────────────────────────────────────────────

// 1. Inline React then support.js — React must already exist so support.js skips CDN fetch
// Escape "<script" literal inside support.js string to prevent HTML parser confusion
const supportJsSafe = supportJs.replace(/<script/g, '\\x3Cscript');
html = html.replace(
  '<script src="./support.js"></script>',
  `${reactInline}\n<script>\n${supportJsSafe}\n</script>`
);

// 2. Inline mock-data.js
html = html.replace(
  '<script src="./mock-data.js"></script>',
  `<script>\n${mockJs}\n</script>`
);

// 3. Base64-encode images — deduplicate isotope.png (used 3× in template)
function dataUri(filename) {
  const fullPath = path.join(ASSETS, filename);
  if (!fs.existsSync(fullPath)) { console.warn(`  WARN: missing asset — ${filename}`); return null; }
  const ext  = path.extname(filename).slice(1).toLowerCase();
  const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(fullPath).toString('base64')}`;
}

// Isotope: inject once via script, replace src refs with data-iso marker
const isotopeUri = dataUri('isotope.png');
if (isotopeUri) {
  html = html.replace(/src="assets\/isotope\.png"/g, 'data-iso="1" src=""');
  html = html.replace('</body>', `<script>document.querySelectorAll('[data-iso]').forEach(function(i){i.src='${isotopeUri}';});</script>\n</body>`);
}

const imageReplacements = [
  ['assets/logo-negative.png',                     'logo-negative.png'],
  ['assets/Argus Logo.svg',                         'Argus Logo.svg'],
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

// ── Compact: script-aware whitespace stripper ──────────────────────────────────
// html-minifier-terser cannot handle the x-dc template block (which contains
// JavaScript expressions with bare '<') or support.js (which has '<script' in
// a string literal). Roll our own: collapse inter-tag whitespace in pure-HTML
// sections; leave every <script…>…</script> block verbatim.
console.log('Compacting...');
function compactHtml(src) {
  const out = [];
  let pos = 0;
  // Walk through the source matching script blocks
  const RE_OPEN  = /<script(\s[^>]*)?>/gi;
  const RE_CLOSE = /<\/script>/gi;
  let m;
  RE_OPEN.lastIndex = 0;
  while ((m = RE_OPEN.exec(src)) !== null) {
    // Compact the HTML chunk before this script tag
    out.push(compactHtmlChunk(src.slice(pos, m.index)));
    const scriptStart = m.index;
    // Find the matching </script>
    RE_CLOSE.lastIndex = m.index + m[0].length;
    const closeM = RE_CLOSE.exec(src);
    if (!closeM) { out.push(src.slice(scriptStart)); pos = src.length; break; }
    // Emit the entire script block verbatim (strip blank lines only)
    const scriptBlock = src.slice(scriptStart, closeM.index + closeM[0].length);
    out.push(scriptBlock.split('\n').filter(l => l.trim().length > 0).join('\n'));
    pos = closeM.index + closeM[0].length;
    RE_OPEN.lastIndex = pos; // resume outer scan after this close
  }
  out.push(compactHtmlChunk(src.slice(pos)));
  return out.join('');
}

function compactHtmlChunk(chunk) {
  return chunk
    .replace(/<!--[\s\S]*?-->/g, '')    // remove HTML comments
    .replace(/>\s+</g, '><')            // collapse whitespace between tags
    .split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

const minified = compactHtml(html);

// ── Write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(OUT, minified, 'utf8');
const lineCount = minified.split('\n').length;
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`\n✓  mock-standalone.html  (${kb} KB, ${lineCount} lines)`);
console.log(`   Version : ${version}`);
console.log(`   Upload to Claude and share the artifact URL.\n`);

})().catch(e => { console.error('\nBuild failed:', e.message); process.exit(1); });
