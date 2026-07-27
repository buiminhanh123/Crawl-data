const express = require('express');
const router = express.Router();

const AI_API_URL = 'https://aidesign.io.vn/api/chatbot/chat';
const AI_API_KEY = 'chatgpt2api';

// ──────────────────────────────────────────────────────────────
// POST /api/ai/chat
// Body: { message: string, history: Array, mode?: string }
// Proxy to aidesign.io.vn chatbot API
// ──────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    const { message, history = [], mode } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ error: 'message is required' });
    }

    // Build the final message with mode-based system prompt prefix
    let finalMessage = message.trim();

    try {
        const payload = {
            message: finalMessage,
            stream: false,
            history: Array.isArray(history) ? history : [],
        };

        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify(payload),
        });

        const raw = await response.text();

        if (!response.ok) {
            console.error('[AI] API error:', response.status, raw);
            return res.status(502).json({
                error: 'AI API returned an error',
                details: raw,
                status: response.status,
            });
        }

        let json;
        try {
            json = JSON.parse(raw);
        } catch (e) {
            return res.status(502).json({ error: 'Invalid JSON from AI API', raw });
        }

        // Extract content from standard OpenAI-style response
        const content = json?.choices?.[0]?.message?.content ?? json?.response ?? json?.content ?? '';

        return res.json({
            content,
            raw: json,
        });

    } catch (err) {
        console.error('[AI] Fetch error:', err);
        return res.status(500).json({ error: 'Failed to connect to AI service', details: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ai/health
// Quick check if the AI API is reachable
// ──────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({ message: 'ping', stream: false, history: [] }),
            signal: AbortSignal.timeout(8000),
        });
        res.json({ ok: response.ok, status: response.status });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

module.exports = router;
