const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'feedback.json');
const { isAdmin } = require('../lib/allowlist');

function getCallerEmail(req) {
  try {
    const token = req.headers['x-amzn-oidc-data'];
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
      return (payload.email || payload.upn || payload.preferred_username || '').toLowerCase();
    }
  } catch {}
  if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
    return (process.env.DEV_USER_EMAIL || 'graham.clark@auroraer.com').toLowerCase();
  }
  return null;
}

function loadFeedback() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (_) {
    return [];
  }
}

function saveFeedback(entries) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

function postFeedback(req, res) {
  const { widget, title, comment, page, user } = req.body || {};
  if ((!comment && !title) || !widget) return res.status(400).json({ error: 'widget and title or comment required' });

  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: new Date().toISOString(),
    status: 'submitted',
    user: user || (() => { try { const b = (req.headers['x-amzn-oidc-data']||'').split('.')[1]; return b ? JSON.parse(Buffer.from(b.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString()).email : null; } catch(_){} })() || 'unknown',
    page: page || '/',
    widget,
    title: title || '',
    comment,
  };

  const entries = loadFeedback();
  entries.push(entry);
  saveFeedback(entries);

  console.log(`[feedback] ${entry.user} · ${entry.widget}: ${entry.comment}`);
  res.json({ ok: true });
}

function getFeedback(req, res) {
  res.json(loadFeedback());
}

async function patchFeedback(req, res) {
  const caller = getCallerEmail(req);
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Admin access required' });

  const { id } = req.params;
  const { status, note } = req.body || {};
  const allowed = ['submitted', 'in progress', 'on hold', 'new data', 'done'];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

  const entries = loadFeedback();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });

  if (status) entries[idx].status = status;
  if (note && note.trim()) {
    if (!entries[idx].notes) entries[idx].notes = [];
    entries[idx].notes.push({ ts: new Date().toISOString(), text: note.trim() });
  }
  entries[idx].updated = new Date().toISOString();

  saveFeedback(entries);
  res.json({ ok: true, entry: entries[idx] });
}

function deleteFeedback(req, res) {
  const { id } = req.params;
  const entries = loadFeedback();
  const filtered = entries.filter(e => e.id !== id);
  if (filtered.length === entries.length) return res.status(404).json({ error: 'not found' });
  saveFeedback(filtered);
  res.json({ ok: true });
}

module.exports = { postFeedback, getFeedback, patchFeedback, deleteFeedback };
