const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'feedback.json');

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
  const { widget, comment, page, user } = req.body || {};
  if (!comment || !widget) return res.status(400).json({ error: 'widget and comment required' });

  const entry = {
    ts: new Date().toISOString(),
    user: user || req.headers['cf-access-authenticated-user-email'] || 'unknown',
    page: page || '/',
    widget,
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

module.exports = { postFeedback, getFeedback };
