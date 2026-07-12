/**
 * WeCare Counseling — Vercel serverless API (single catch-all function).
 * Mirrors the local Express server (server.js) but:
 *   - stores leads in Upstash Redis instead of a JSON file
 *   - uses stateless HMAC-signed session cookies instead of in-memory sessions
 *
 * Required Vercel env vars:
 *   ADMIN_PASSWORD                                 — dashboard password
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (or KV_REST_API_URL / KV_REST_API_TOKEN)
 *     — auto-injected when you add "Upstash for Redis" from the Vercel Marketplace
 */
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const { chatWithGemini } = require('../lib/chat');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wecare2026';
const SESSION_SECRET = process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('wecare-session:' + ADMIN_PASSWORD).digest('hex');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

const IDS_KEY = 'leads:ids';
const leadKey = id => 'lead:' + id;

let redis;
function db() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      const err = new Error('Storage not configured. Add "Upstash for Redis" to this project in the Vercel Marketplace (Storage tab).');
      err.status = 503;
      throw err;
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

async function getLeads() {
  const ids = await db().lrange(IDS_KEY, 0, -1);
  if (!ids || !ids.length) return [];
  const rows = await db().mget(...ids.map(leadKey));
  return rows.filter(Boolean);
}

// ---------- stateless sessions ----------
const sign = exp => crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('hex');
function makeToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  return exp + '.' + sign(exp);
}
function isAuthed(req) {
  const t = (req.cookies || {}).wc_session;
  if (!t) return false;
  const [exp, sig] = String(t).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sign(exp));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const setSessionCookie = (res, token, maxAge) =>
  res.setHeader('Set-Cookie', `wc_session=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict; Secure`);

/** Resolve catch-all segments; fall back to parsing req.url if query.path is empty. */
function resolvePath(req) {
  let raw = req.query && req.query.path;
  const empty =
    raw == null ||
    raw === '' ||
    (Array.isArray(raw) && raw.filter(Boolean).length === 0);

  if (empty) {
    const urlPath = String(req.url || '').split('?')[0];
    // "/api/chat" → "chat", "/chat" → "chat" (depending on mount)
    const stripped = urlPath.replace(/^\/api\/?/, '').replace(/^\//, '');
    raw = stripped ? stripped.split('/').filter(Boolean) : [];
  }

  const segs = [].concat(raw).map(String).filter(Boolean);
  return { segs, route: segs.join('/') };
}

function parseBody(req) {
  let body = req.body;
  if (body == null || body === '') return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
}

module.exports = async (req, res) => {
  const { segs, route } = resolvePath(req);
  const m = req.method;
  const body = parseBody(req);

  try {
    // ----- public: website chat (Gemini) — also available at api/chat.js -----
    if ((route === 'chat' || segs[0] === 'chat') && m === 'POST') {
      try {
        const { message, history } = body;
        const result = await chatWithGemini({ message, history });
        return res.json({ ok: true, reply: result.reply });
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'Chat unavailable.' });
      }
    }

    // ----- public: contact form -----
    if (route === 'contact' && m === 'POST') {
      const { name, email, phone, service, contactMethod, message, website } = body;
      if (website) return res.json({ ok: true }); // honeypot
      if (!name || !name.trim() || (!email && !phone)) {
        return res.status(400).json({ error: 'Please provide your name and at least one way to reach you.' });
      }
      const clean = v => String(v || '').slice(0, 2000).trim();
      const id = crypto.randomUUID();
      const lead = {
        id,
        receivedAt: new Date().toISOString(),
        name: clean(name), email: clean(email), phone: clean(phone),
        service: clean(service), contactMethod: clean(contactMethod), message: clean(message),
        read: false
      };
      await db().set(leadKey(id), lead);
      await db().lpush(IDS_KEY, id);
      return res.json({ ok: true });
    }

    // ----- auth -----
    if (route === 'login' && m === 'POST') {
      const supplied = String(body.password || '');
      const a = crypto.createHash('sha256').update(supplied).digest();
      const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
      if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Incorrect password.' });
      setSessionCookie(res, makeToken(), SESSION_TTL_MS / 1000);
      return res.json({ ok: true });
    }
    if (route === 'logout' && m === 'POST') {
      setSessionCookie(res, '', 0);
      return res.json({ ok: true });
    }
    if (route === 'session' && m === 'GET') {
      return res.json({ authed: isAuthed(req) });
    }

    // ----- admin only (explicit prefixes — don't 401 public unknown routes) -----
    const isAdminRoute =
      route === 'submissions' ||
      route === 'export' ||
      segs[0] === 'submissions';

    if (isAdminRoute) {
      if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });

      if (route === 'submissions' && m === 'GET') {
        return res.json(await getLeads());
      }
      if (route === 'export' && m === 'GET') {
        const escCsv = v => `"${String(v || '').replace(/"/g, '""')}"`;
        const rows = (await getLeads()).map(s =>
          [s.receivedAt, s.name, s.email, s.phone, s.service, s.contactMethod, s.message, s.read ? 'yes' : 'no'].map(escCsv).join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="wecare-leads.csv"');
        return res.send(['"Received","Name","Email","Phone","Service","Preferred Contact","Message","Read"', ...rows].join('\r\n'));
      }
      if (segs[0] === 'submissions' && segs[1] && segs[2] === 'read' && m === 'POST') {
        const lead = await db().get(leadKey(segs[1]));
        if (lead) {
          lead.read = !(body && body.read === false);
          await db().set(leadKey(segs[1]), lead);
        }
        return res.json({ ok: true });
      }
      if (segs[0] === 'submissions' && segs[1] && !segs[2] && m === 'DELETE') {
        await db().del(leadKey(segs[1]));
        await db().lrem(IDS_KEY, 0, segs[1]);
        return res.json({ ok: true });
      }
    }

    return res.status(404).json({ error: 'not found', route: route || '(root)' });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error. Please try again.' });
  }
};
