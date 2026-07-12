/**
 * Public chat endpoint — /api/chat
 * Dedicated route so it never hits the admin auth gate in [[...path]].
 */
const { chatWithGemini } = require('../lib/chat');

function parseBody(req) {
  let body = req.body;
  if (body == null || body === '') return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history } = parseBody(req);
    const result = await chatWithGemini({ message, history });
    return res.status(200).json({ ok: true, reply: result.reply });
  } catch (err) {
    console.error('[api/chat]', err.message || err);
    return res.status(err.status || 500).json({
      error: err.message || 'Chat unavailable.'
    });
  }
};
