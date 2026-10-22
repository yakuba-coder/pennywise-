module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Use GET for this health check.' });
  }
  return res.status(200).json({
    ok: true,
    service: 'Pennywise AI API',
    geminiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    note: 'This checks deployment configuration only; it does not reveal or validate the secret API key.'
  });
};
