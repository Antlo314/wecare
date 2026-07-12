/**
 * WeCare Counseling Services — server
 * Serves the public site, accepts contact-form leads, and exposes a
 * password-protected admin dashboard at /admin.
 *
 * Config (environment variables, all optional):
 *   PORT            — default 3000
 *   ADMIN_PASSWORD  — dashboard password, default "wecare2026" (CHANGE THIS)
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wecare2026';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function loadSubmissions() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function saveSubmissions(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- sessions (in-memory, httpOnly cookie) ----------
const sessions = new Map(); // token -> expiresAt
const SESSION_TTL = 1000 * 60 * 60 * 8; // 8 hours

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  const token = parseCookies(req).wc_session;
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}
function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ---------- rate limiting (very light, per-IP) ----------
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || 'x';
  const now = Date.now();
  const rec = hits.get(ip) || [];
  const recent = rec.filter(t => now - t < 60_000);
  if (recent.length >= 5) return res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
  recent.push(now);
  hits.set(ip, recent);
  next();
}

// ---------- public API ----------
app.post('/api/contact', rateLimit, (req, res) => {
  const { name, email, phone, service, contactMethod, message, website } = req.body || {};
  if (website) return res.json({ ok: true }); // honeypot — silently drop bots
  if (!name || !name.trim() || (!email && !phone)) {
    return res.status(400).json({ error: 'Please provide your name and at least one way to reach you.' });
  }
  const clean = v => String(v || '').slice(0, 2000).trim();
  const list = loadSubmissions();
  list.unshift({
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    name: clean(name),
    email: clean(email),
    phone: clean(phone),
    service: clean(service),
    contactMethod: clean(contactMethod),
    message: clean(message),
    read: false
  });
  saveSubmissions(list);
  res.json({ ok: true });
});

// ---------- admin API ----------
app.post('/api/login', rateLimit, (req, res) => {
  const supplied = String((req.body || {}).password || '');
  const a = crypto.createHash('sha256').update(supplied).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Incorrect password.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  res.setHeader('Set-Cookie', `wc_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL / 1000}; SameSite=Strict`);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(parseCookies(req).wc_session);
  res.setHeader('Set-Cookie', 'wc_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => res.json({ authed: isAuthed(req) }));

app.get('/api/submissions', requireAuth, (req, res) => res.json(loadSubmissions()));

app.post('/api/submissions/:id/read', requireAuth, (req, res) => {
  const list = loadSubmissions();
  const item = list.find(s => s.id === req.params.id);
  if (item) { item.read = req.body && req.body.read === false ? false : true; saveSubmissions(list); }
  res.json({ ok: true });
});

app.delete('/api/submissions/:id', requireAuth, (req, res) => {
  saveSubmissions(loadSubmissions().filter(s => s.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/export', requireAuth, (req, res) => {
  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const rows = loadSubmissions().map(s =>
    [s.receivedAt, s.name, s.email, s.phone, s.service, s.contactMethod, s.message, s.read ? 'yes' : 'no'].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wecare-leads.csv"');
  res.send(['"Received","Name","Email","Phone","Service","Preferred Contact","Message","Read"', ...rows].join('\r\n'));
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`WeCare Counseling site running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin  (password: ${ADMIN_PASSWORD === 'wecare2026' ? 'wecare2026 — set ADMIN_PASSWORD to change' : 'set via ADMIN_PASSWORD'})`);
});
