const SYSTEM_PROMPT = `You are Pennywise AI, a helpful assistant for a personal finance dashboard and general questions. Explain concepts in plain, accessible language as if speaking to a beginner. Prefer tailored, practical recommendations over generic advice. When there is no single best answer, offer several realistic options, explain trade-offs, and recommend a sensible starting point. Ask a brief clarifying question when missing information materially changes the answer. For finance questions, be careful and transparent about assumptions, avoid guaranteeing outcomes, and remind users that you are not a licensed financial adviser when appropriate. Never claim to have access to dashboard data, bank accounts, or personal files unless the user has included the information in their message. Do not request passwords, full account numbers, card numbers, or other secret credentials. Be honest when uncertain. Use short headings and steps when they improve clarity.`;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST to send a message.' });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Pennywise AI is not configured yet. Add GEMINI_API_KEY in Vercel Project Settings → Environment Variables, then redeploy.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  const allowedModes = new Set(['finance', 'general', 'both']);
  const mode = body && allowedModes.has(body.mode) ? body.mode : 'both';
  const incoming = body && Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) return res.status(400).json({ error: 'Please enter a message.' });
  const messages = incoming.slice(-16).map(item => ({
    role: item && item.role === 'model' ? 'model' : 'user',
    text: typeof (item && item.text) === 'string' ? item.text.slice(0, 6000) : ''
  })).filter(item => item.text.trim());
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'The last conversation item must be a user message.' });
  }
  const modeInstruction = mode === 'finance'
    ? 'Focus on personal finance, budgeting, spending, saving, and financial literacy. For unrelated questions, still be helpful but briefly connect back to the mode if appropriate.'
    : mode === 'general'
      ? 'Answer general questions across topics. Do not assume the user wants financial advice unless they ask for it.'
      : 'Help with both personal finance and general topics, following the user’s actual question.';
  const contents = messages.map(item => ({ role: item.role, parts: [{ text: item.text }] }));

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}\n\nCurrent assistant mode: ${modeInstruction}` }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
      })
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('Gemini API returned status', upstream.status, result && result.error && result.error.message);
      if (upstream.status === 400) return res.status(502).json({ error: 'Gemini could not process this request. Check the selected model and try a shorter message.' });
      if (upstream.status === 401 || upstream.status === 403) return res.status(502).json({ error: 'Gemini rejected the API key. Check GEMINI_API_KEY and its Gemini API restrictions.' });
      if (upstream.status === 429) return res.status(429).json({ error: 'The Gemini API rate limit or quota was reached. Wait a little or check your Google AI Studio quota.' });
      return res.status(502).json({ error: 'The AI provider is temporarily unavailable. Please try again shortly.' });
    }
    const reply = (result.candidates || []).flatMap(c => (c.content && c.content.parts) || []).map(p => p.text || '').join('\n').trim();
    if (!reply) return res.status(502).json({ error: 'Gemini did not return a text answer. Please rephrase your question.' });
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Gemini request failed:', error && error.message);
    return res.status(502).json({ error: 'Could not reach Gemini right now. Please check your connection and try again.' });
  }
};
