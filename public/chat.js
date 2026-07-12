/* WeCare Guide — stylized site chat widget */
(() => {
  'use strict';

  const SUGGESTIONS = [
    'What services do you offer?',
    'Do you take insurance?',
    'How do I book an appointment?',
    'Do you offer telehealth?'
  ];

  const WELCOME =
    "Hi — I'm the WeCare Guide. I can answer questions about services, insurance, hours, and how to get started. " +
    "I'm not a therapist and can't provide counseling online. If you're in crisis, call or text <strong>988</strong>.";

  const history = []; // { role: 'user'|'model', text }

  function el(tag, className, html) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Lightweight markdown-ish: bold, links, line breaks */
  function formatReply(text) {
    let t = escapeHtml(text);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    t = t.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
    return `<p>${t}</p>`;
  }

  // ----- DOM shell -----
  const root = el('div', 'wc-chat');
  root.innerHTML = `
    <button type="button" class="wc-chat-fab" id="wcChatFab" aria-label="Open chat with WeCare Guide" aria-expanded="false" aria-controls="wcChatPanel">
      <span class="wc-chat-fab-ring" aria-hidden="true"></span>
      <span class="wc-chat-fab-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="26" height="26" fill="none">
          <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2.2"/>
          <path d="M16 30c2.5-7 6.5-11.5 9-13.5 1.8 3.5 3.2 7.5 3.6 12.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M25 16.8c2 1.6 5.2 5.2 7.2 11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M21.5 27.5c1.5-3 3.2-4.5 4.6-5.2" stroke="#c8a24b" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </span>
      <span class="wc-chat-fab-close" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </span>
      <span class="wc-chat-fab-label">Ask us</span>
    </button>

    <div class="wc-chat-panel" id="wcChatPanel" role="dialog" aria-modal="false" aria-labelledby="wcChatTitle" hidden>
      <div class="wc-chat-glow" aria-hidden="true"></div>
      <header class="wc-chat-header">
        <div class="wc-chat-avatar" aria-hidden="true">
          <img src="assets/mark.svg" alt="" width="28" height="28">
        </div>
        <div class="wc-chat-heading">
          <h2 id="wcChatTitle">WeCare Guide</h2>
          <p><span class="wc-chat-status-dot"></span> Usually replies instantly</p>
        </div>
        <button type="button" class="wc-chat-minimize" id="wcChatClose" aria-label="Close chat">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>

      <div class="wc-chat-messages" id="wcChatMessages" role="log" aria-live="polite" aria-relevant="additions"></div>

      <div class="wc-chat-suggestions" id="wcChatSuggestions"></div>

      <form class="wc-chat-form" id="wcChatForm" autocomplete="off">
        <label class="visually-hidden" for="wcChatInput">Message</label>
        <textarea id="wcChatInput" rows="1" maxlength="1200" placeholder="Ask about services, insurance, booking…" enterkeyhint="send"></textarea>
        <button type="submit" class="wc-chat-send" id="wcChatSend" aria-label="Send message" disabled>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12l15-7-4 14-3.5-5.5L4 12z"/>
          </svg>
        </button>
      </form>
      <p class="wc-chat-disclaimer">Not therapy · For crisis support call/text <strong>988</strong></p>
    </div>
  `;
  document.body.appendChild(root);

  const fab = root.querySelector('#wcChatFab');
  const panel = root.querySelector('#wcChatPanel');
  const messagesEl = root.querySelector('#wcChatMessages');
  const suggestionsEl = root.querySelector('#wcChatSuggestions');
  const form = root.querySelector('#wcChatForm');
  const input = root.querySelector('#wcChatInput');
  const sendBtn = root.querySelector('#wcChatSend');
  const closeBtn = root.querySelector('#wcChatClose');

  let open = false;
  let busy = false;
  let welcomeAdded = false;

  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    fab.setAttribute('aria-label', open ? 'Close chat' : 'Open chat with WeCare Guide');
    root.classList.toggle('is-open', open);
    document.body.classList.toggle('wc-chat-open', open);
    if (open) {
      if (!welcomeAdded) {
        addBubble('bot', WELCOME, true);
        welcomeAdded = true;
        renderSuggestions();
      }
      setTimeout(() => input.focus(), 180);
    }
  }

  function addBubble(kind, htmlOrText, isHtml) {
    const row = el('div', `wc-msg wc-msg-${kind}`);
    if (kind === 'bot') {
      row.appendChild(el('div', 'wc-msg-avatar', '<img src="assets/mark.svg" alt="" width="18" height="18">'));
    }
    const bubble = el('div', 'wc-msg-bubble');
    if (isHtml) bubble.innerHTML = htmlOrText;
    else bubble.innerHTML = formatReply(htmlOrText);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function addTyping() {
    const row = el('div', 'wc-msg wc-msg-bot wc-msg-typing');
    row.appendChild(el('div', 'wc-msg-avatar', '<img src="assets/mark.svg" alt="" width="18" height="18">'));
    row.appendChild(el('div', 'wc-msg-bubble', '<span></span><span></span><span></span>'));
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function renderSuggestions() {
    suggestionsEl.innerHTML = '';
    if (history.length > 0) {
      suggestionsEl.hidden = true;
      return;
    }
    suggestionsEl.hidden = false;
    SUGGESTIONS.forEach((label) => {
      const b = el('button', 'wc-chip');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        input.value = label;
        syncSend();
        form.requestSubmit();
      });
      suggestionsEl.appendChild(b);
    });
  }

  function syncSend() {
    const has = input.value.trim().length > 0;
    sendBtn.disabled = !has || busy;
  }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  async function sendMessage(text) {
    const message = String(text || '').trim();
    if (!message || busy) return;

    busy = true;
    syncSend();
    suggestionsEl.hidden = true;
    addBubble('user', message, false);
    history.push({ role: 'user', text: message });
    input.value = '';
    autoResize();
    syncSend();

    const typing = addTyping();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: history.slice(0, -1)
        })
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      const reply = data.reply || '…';
      history.push({ role: 'model', text: reply });
      addBubble('bot', reply, false);
    } catch (err) {
      typing.remove();
      addBubble(
        'bot',
        err.message ||
          'I had trouble connecting. Please try again, or use the appointment form on this page.',
        false
      );
    } finally {
      busy = false;
      syncSend();
      input.focus();
    }
  }

  fab.addEventListener('click', () => setOpen(!open));
  closeBtn.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener('input', () => {
    syncSend();
    autoResize();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // Nudge attention once after load (desktop polish)
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => root.classList.add('wc-chat-nudge'), 2200);
    setTimeout(() => root.classList.remove('wc-chat-nudge'), 5200);
  }
})();
