/**
 * WeCare counseling website assistant — Gemini proxy helpers.
 * API key stays server-side only (GEMINI_API_KEY).
 */

const SYSTEM_PROMPT = `You are "WeCare Guide", a warm, professional website assistant for WeCare Counseling Services, LLC in Conyers, Georgia.

About the practice:
- Therapist: Lisa Guest, LPC, LMSW (also CASAC-certified). Licensed in GA and NY. 20+ years of experience.
- Services: Individual Psychotherapy; Substance Abuse Counseling; Couples & Family Therapy; Adolescent Therapy.
- Approach: Solution-focused, practical, non-judgmental.
- Location: Conyers, GA — private office suite. In-person and telehealth.
- Hours: Tuesday–Saturday by appointment. Closed Sunday and Monday.
- Insurance: Most major plans (Aetna, Ambetter, American Behavioral, Anthem, BCBS, Beacon, Cenpatico, Cigna, Emblem Health, Humana, Magellan, MH Net, NY State Empire Plan, United Health Care, Value Options). Cash, FSA, PayPal, major cards. Sliding scale available based on need.
- Cancellation: 24-hour notice; missed appointments charged as full sessions.
- How to book: Use the "Request an Appointment" form on this website; Lisa follows up personally.

Rules:
1. You are NOT a therapist and do NOT provide therapy, diagnosis, crisis counseling, or medical advice.
2. If someone is in crisis, suicidal, or in danger: urge them to call or text 988 (Suicide & Crisis Lifeline) or dial 911 immediately. Be calm and direct.
3. Keep replies concise (2–4 short paragraphs or brief bullets). Warm, clear, and professional — match a premium counseling brand.
4. For appointments, gently direct them to the website contact form (#contact) or to request an appointment.
5. Do not invent phone numbers, prices, or credentials not listed above. If unsure, say so and suggest the appointment form.
6. Never collect full SSN, insurance member IDs, or detailed medical histories in chat.
7. Do not mention you are Gemini/Google unless asked what powers you — say you are the WeCare website assistant.`;

// gemini-flash-latest tracks Google's current free-friendly flash model
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function cleanMessage(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-12)
    .map((m) => ({
      role: m && m.role === 'model' ? 'model' : 'user',
      text: cleanMessage(m && (m.text || m.content))
    }))
    .filter((m) => m.text);
}

/**
 * Call Gemini generateContent. Returns { reply } or throws Error with .status.
 */
async function chatWithGemini({ message, history }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('Chat is not configured yet. Please use the appointment form below.');
    err.status = 503;
    throw err;
  }

  const userText = cleanMessage(message);
  if (!userText) {
    const err = new Error('Please type a message.');
    err.status = 400;
    throw err;
  }

  const prior = normalizeHistory(history);
  const contents = [
    ...prior.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }]
    })),
    { role: 'user', parts: [{ text: userText }] }
  ];

  const model = DEFAULT_MODEL;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024,
      topP: 0.9
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    const err = new Error('Unable to reach the assistant. Please try again in a moment.');
    err.status = 502;
    throw err;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (data.error && data.error.message) ||
      (res.status === 429
        ? 'The assistant is busy right now. Please try again shortly, or use the appointment form.'
        : 'The assistant could not respond. Please try again or use the appointment form.');
    const err = new Error(msg);
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }

  const parts = data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts;
  const reply = (parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();

  if (!reply) {
    const block = data.candidates && data.candidates[0] && data.candidates[0].finishReason;
    if (block === 'SAFETY') {
      const err = new Error(
        'I can only help with general questions about WeCare. If you are in crisis, please call or text 988.'
      );
      err.status = 400;
      throw err;
    }
    const err = new Error('No response received. Please try again or request an appointment.');
    err.status = 502;
    throw err;
  }

  return { reply: reply.slice(0, 4000) };
}

module.exports = { chatWithGemini, SYSTEM_PROMPT };
