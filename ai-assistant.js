/**
 * FILE LOCATION: /ai-assistant.js
 * Add to space-cosmos.html: <script src="ai-assistant.js" defer></script>
 * (place just before the closing </body> tag)
 *
 * ─────────────────────────────────────────────────────────────────────
 * ARIA — Autonomous Research & Intelligence Assistant
 * Spacecraft AI chat overlay for COSMOS
 *
 * Features:
 *  • Floating trigger button with pulse rings
 *  • Expandable glassmorphism chat panel (matches cosmic theme)
 *  • Streaming AI responses via SSE
 *  • Typing / thinking indicator
 *  • Conversation memory (session-scoped array)
 *  • Error handling with user-friendly messages
 *  • Suggested quick-prompts on first open
 *  • Mobile responsive (full-width bottom sheet on ≤480 px)
 * ─────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── CONFIG ────────────────────────────────────────────────────── */
  // Change this to your deployed Vercel URL in production.
  // In local dev (vercel dev), it stays as-is.
  const API_ENDPOINT = '/api/chat';

  const SUGGESTIONS = [
    'How far is the nearest star?',
    'Explain black holes',
    'What is the James Webb telescope?',
    'How big is the Solar System?',
  ];

  /* ── STATE ─────────────────────────────────────────────────────── */
  let isPanelOpen = false;
  let isStreaming = false;
  let conversationHistory = [];   // { role: 'user'|'assistant', content: string }[]
  let hasGreeted = false;

  /* ── DOM INJECTION ─────────────────────────────────────────────── */
  function buildUI() {
    const root = document.createElement('div');
    root.id = 'aria-root';
    root.innerHTML = `
      <!-- Floating trigger -->
      <button id="aria-trigger" aria-label="Open ARIA — spacecraft AI assistant" title="ARIA">
        <span id="aria-notif"></span>
        <svg class="aria-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Stylised AI / signal icon -->
          <circle cx="16" cy="16" r="5" stroke="#b06eff" stroke-width="1.5"/>
          <path d="M16 4v5M16 23v5M4 16h5M23 16h5" stroke="#b06eff" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M7.76 7.76l3.54 3.54M20.7 20.7l3.54 3.54M7.76 24.24l3.54-3.54M20.7 11.3l3.54-3.54"
                stroke="#00d4ff" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
          <circle cx="16" cy="16" r="2" fill="#b06eff"/>
        </svg>
      </button>

      <!-- Chat panel -->
      <div id="aria-panel" role="dialog" aria-label="ARIA spacecraft AI assistant" aria-modal="true">

        <!-- Header -->
        <div id="aria-header">
          <div class="aria-avatar">✦</div>
          <div class="aria-header-info">
            <div class="aria-name">ARIA · Onboard AI</div>
            <div class="aria-status" id="aria-status-row">
              <span class="aria-status-dot" id="aria-status-dot"></span>
              <span id="aria-status-text">Systems nominal</span>
            </div>
          </div>
          <button class="aria-close-btn" id="aria-close-btn" aria-label="Close">✕</button>
        </div>

        <!-- Messages -->
        <div id="aria-messages" role="log" aria-live="polite" aria-relevant="additions"></div>

        <!-- Typing indicator -->
        <div id="aria-typing" aria-hidden="true">
          <span class="aria-typing-label">Aria is processing</span>
          <div class="aria-dots">
            <div class="aria-dot"></div>
            <div class="aria-dot"></div>
            <div class="aria-dot"></div>
          </div>
        </div>

        <!-- Error banner -->
        <div class="aria-error" id="aria-error"></div>

        <!-- Suggested prompts -->
        <div id="aria-suggestions"></div>

        <!-- Input -->
        <div id="aria-input-area">
          <textarea
            id="aria-input"
            rows="1"
            placeholder="Ask about the cosmos…"
            aria-label="Message ARIA"
            maxlength="600"
          ></textarea>
          <button id="aria-send" aria-label="Send message" disabled>
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 10l14-7-6 7 6 7-14-7z" fill="currentColor"/>
            </svg>
          </button>
        </div>

      </div>
    `;
    document.body.appendChild(root);
  }

  /* ── HELPERS ────────────────────────────────────────────────────── */
  function timestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function setStatus(text, thinking = false) {
    document.getElementById('aria-status-text').textContent = text;
    const dot = document.getElementById('aria-status-dot');
    dot.classList.toggle('thinking', thinking);
  }

  function showTyping(show) {
    document.getElementById('aria-typing').classList.toggle('show', show);
  }

  function showError(msg) {
    const el = document.getElementById('aria-error');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
  }

  function scrollToBottom() {
    const msgs = document.getElementById('aria-messages');
    msgs.scrollTop = msgs.scrollHeight;
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
  }

  /* ── SUGGESTIONS ────────────────────────────────────────────────── */
  function renderSuggestions() {
    const container = document.getElementById('aria-suggestions');
    container.innerHTML = '';
    SUGGESTIONS.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'aria-suggestion';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        container.innerHTML = '';   // hide after use
        sendMessage(text);
      });
      container.appendChild(btn);
    });
  }

  /* ── MESSAGE RENDERING ──────────────────────────────────────────── */
  function appendMessage(role, content, streaming = false) {
    const messages = document.getElementById('aria-messages');

    // Remove welcome placeholder if present
    const welcome = messages.querySelector('.aria-welcome');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `aria-msg ${role}`;
    div.innerHTML = `
      <div class="aria-bubble">${escapeHtml(content)}</div>
      <div class="aria-msg-time">${timestamp()}</div>
    `;
    if (streaming) div.dataset.streaming = 'true';

    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  function updateStreamingMessage(div, fullText) {
    const bubble = div.querySelector('.aria-bubble');
    bubble.textContent = fullText;     // textContent keeps it safe
    scrollToBottom();
  }

  function finaliseStreamingMessage(div) {
    delete div.dataset.streaming;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  /* ── STREAMING FETCH ────────────────────────────────────────────── */
  async function sendMessage(userText) {
    if (isStreaming || !userText.trim()) return;

    const input = document.getElementById('aria-input');
    const sendBtn = document.getElementById('aria-send');

    // Hide suggestions permanently once user starts chatting
    document.getElementById('aria-suggestions').innerHTML = '';

    // Add to history and render
    conversationHistory.push({ role: 'user', content: userText.trim() });
    appendMessage('user', userText.trim());

    // Reset input
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    isStreaming = true;

    // Show loading states
    showTyping(true);
    setStatus('Processing query…', true);

    try {
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      showTyping(false);

      // Create assistant bubble for streaming
      const assistantDiv = appendMessage('assistant', '');
      let fullText = '';

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              updateStreamingMessage(assistantDiv, fullText);
            }
          } catch {
            // Malformed chunk — skip
          }
        }
      }

      finaliseStreamingMessage(assistantDiv);
      conversationHistory.push({ role: 'assistant', content: fullText });
      setStatus('Systems nominal', false);

    } catch (err) {
      showTyping(false);
      console.error('ARIA error:', err);
      showError('⚠ Transmission error — check your connection and try again.');
      setStatus('Systems nominal', false);
      // Roll back the user message so it can be retried cleanly
      conversationHistory.pop();
    } finally {
      isStreaming = false;
      sendBtn.disabled = !input.value.trim();
    }
  }

  /* ── PANEL TOGGLE ───────────────────────────────────────────────── */
  function openPanel() {
    isPanelOpen = true;
    document.getElementById('aria-panel').classList.add('open');
    document.getElementById('aria-trigger').classList.add('panel-open');
    document.getElementById('aria-notif').classList.remove('show');

    if (!hasGreeted) {
      hasGreeted = true;
      const msgs = document.getElementById('aria-messages');
      msgs.innerHTML = `
        <div class="aria-welcome">
          Greetings, crew member.<br>
          I am <strong>ARIA</strong> — your onboard astronomical intelligence.<br>
          Ask me anything about the cosmos.
        </div>
      `;
      renderSuggestions();
    }

    // Focus input after transition
    setTimeout(() => {
      document.getElementById('aria-input').focus();
    }, 360);
  }

  function closePanel() {
    isPanelOpen = false;
    document.getElementById('aria-panel').classList.remove('open');
    document.getElementById('aria-trigger').classList.remove('panel-open');
  }

  /* ── EVENT LISTENERS ────────────────────────────────────────────── */
  function attachEvents() {
    const trigger  = document.getElementById('aria-trigger');
    const closeBtn = document.getElementById('aria-close-btn');
    const input    = document.getElementById('aria-input');
    const sendBtn  = document.getElementById('aria-send');

    trigger.addEventListener('click', () => {
      isPanelOpen ? closePanel() : openPanel();
    });

    closeBtn.addEventListener('click', closePanel);

    input.addEventListener('input', () => {
      autoResize(input);
      sendBtn.disabled = isStreaming || !input.value.trim();
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) sendMessage(input.value);
      }
    });

    sendBtn.addEventListener('click', () => {
      sendMessage(input.value);
    });

    // Close on backdrop (outside panel) — but only when panel is open
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isPanelOpen) closePanel();
    });
  }

  /* ── INIT ───────────────────────────────────────────────────────── */
  function init() {
    buildUI();
    attachEvents();

    // Also expand the cursor hover effect to the ARIA trigger
    const trail = document.getElementById('cursor-trail');
    if (trail) {
      const trigger = document.getElementById('aria-trigger');
      trigger.addEventListener('mouseenter', () => trail.classList.add('expand'));
      trigger.addEventListener('mouseleave', () => trail.classList.remove('expand'));
    }

    // Show notification dot after 3 seconds to invite first interaction
    setTimeout(() => {
      if (!hasGreeted) {
        document.getElementById('aria-notif').classList.add('show');
      }
    }, 3000);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
