// FishCast AI backend using Google's Gemini API.
// Keep GEMINI_API_KEY in Render's Environment settings, never in this file.
const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'FishCast AI' });
});

app.post('/chat', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server.' });
    }

    const { message, history = [], location = {} } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'A message is required.' });
    }

    const safeHistory = Array.isArray(history)
      ? history.slice(-12).filter((item) =>
          item && ['user', 'assistant', 'model'].includes(item.role) &&
          typeof item.content === 'string' && item.content.trim()
        )
      : [];

    const locationContext = [
      `Selected place: ${String(location.name || 'Unknown')}`,
      `Latitude: ${Number.isFinite(location.latitude) ? location.latitude : 'unknown'}`,
      `Longitude: ${Number.isFinite(location.longitude) ? location.longitude : 'unknown'}`,
    ].join('\n');

    const systemInstruction = `You are FishCast AI, a practical fishing assistant focused on Denmark.
Answer in the same language as the user.
Use the selected location as context, but never claim coordinates prove fish are present.
Ask whether the water is coast/sea, fjord, river/lake, or Put & Take when unknown.
Never invent local catch statistics, fish sightings, live weather, tide times,
fishing regulations, or guaranteed catch probabilities.
Clearly separate verified facts from estimates. Explain that a FishCast score is
not a real probability of catching a fish.
Consider season, habitat, water type, depth, water temperature, wind, tide/current,
time of day, bait/lure, and local regulations where relevant.
For legal questions, tell users to check current Danish rules and local protected areas.
Selected location:\n${locationContext}`;

    const contents = safeHistory.map((item) => ({
      role: item.role === 'assistant' || item.role === 'model' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }));
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { maxOutputTokens: 900 },
        }),
      }
    );

    const data = await apiResponse.json();
    if (!apiResponse.ok) {
      console.error('Gemini API error status:', apiResponse.status);
      return res.status(502).json({
        error: data?.error?.message || 'Gemini API request failed.',
      });
    }

    const reply = (data.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('\n')
      .trim();

    return res.json({ reply: reply || 'I could not create an answer. Please try again.' });
  } catch (error) {
    console.error('FishCast AI server error:', error.message);
    return res.status(500).json({ error: 'Unexpected error on the FishCast AI server.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FishCast AI server listening on port ${PORT}`);
});
