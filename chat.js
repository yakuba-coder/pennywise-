(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('chatForm');
  const input = $('messageInput');
  const messagesEl = $('messages');
  const statusEl = $('status');
  const sendBtn = $('sendBtn');
  const modeEl = $('chatMode');
  let history = [];
  let busy = false;

  // Reuse the dashboard's light/dark preference without reading financial data.
  try {
    const savedTheme = localStorage.getItem('pw_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.dataset.theme = savedTheme;
  } catch (_) {}
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pw_theme', next); } catch (_) {}
  });

  function addMessage(role, text, extraClass = '') {
    const article = document.createElement('article');
    article.className = `message-card ${role} ${extraClass}`.trim();
    const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = role === 'user' ? 'You' : '✦';
    const content = document.createElement('div'); content.className = 'message-content';
    const strong = document.createElement('strong'); strong.textContent = role === 'user' ? 'You' : 'Pennywise AI';
    const p = document.createElement('p'); p.textContent = text;
    content.append(strong, p); article.append(avatar, content); messagesEl.append(article);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { article, content };
  }

  function renderAnswer(content, text) {
    content.replaceChildren();
    const strong = document.createElement('strong'); strong.textContent = 'Pennywise AI'; content.append(strong);
    // Plain-text rendering avoids executing model-generated HTML.
    const blocks = String(text).split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    for (const block of blocks) {
      const p = document.createElement('p'); p.textContent = block; content.append(p);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage(rawText) {
    if (busy) return;
    const text = rawText.trim();
    if (!text) return;
    const includeContext = $('includeContext').checked;
    const manualContext = $('manualContext').value.trim();
    const contextText = includeContext && manualContext
      ? `\n\nFinancial/personal context the user explicitly chose to share for this message:\n${manualContext}`
      : '';
    const messageToSend = text + contextText;
    addMessage('user', text + (contextText ? '\n[Manual context included for this message]' : ''));
    history.push({ role: 'user', text: messageToSend });
    input.value = '';
    busy = true; sendBtn.disabled = true; sendBtn.textContent = 'Thinking…'; statusEl.textContent = 'Pennywise AI is preparing a response…';
    const pending = addMessage('assistant', ''); pending.content.querySelector('p').textContent = 'Thinking…';
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: modeEl.value, messages: history.slice(-16).map(m => ({ role: m.role, text: m.text })) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Pennywise AI API route was not found (404). The latest GitHub files may not be deployed from the repository root. Check that api/gemini.js is in the same root folder as index.html, then redeploy on Vercel.');
        }
        throw new Error(data.error || `Request failed (${response.status}).`);
      }
      if (!data.reply) throw new Error('The AI returned an empty response. Please try again.');
      renderAnswer(pending.content, data.reply);
      history.push({ role: 'model', text: data.reply });
      // Do not retain manual context in the form after sending it.
      if (includeContext) { $('manualContext').value = ''; $('includeContext').checked = false; }
    } catch (error) {
      pending.content.querySelector('p').textContent = error.message || 'Something went wrong. Please try again.';
      statusEl.textContent = 'Message not completed. Check the API key and Vercel function logs if this continues.';
      history.pop();
    } finally {
      busy = false; sendBtn.disabled = false; sendBtn.textContent = 'Send ↗';
      if (statusEl.textContent === 'Pennywise AI is preparing a response…') statusEl.textContent = 'Ready';
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
  });
  document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.prompt; input.focus(); }));
  $('clearChat').addEventListener('click', () => {
    if (busy) return;
    history = [];
    messagesEl.replaceChildren();
    const greeting = addMessage('assistant', 'Chat cleared. What would you like help with now?');
    statusEl.textContent = 'Conversation cleared from this page.';
  });
})();
