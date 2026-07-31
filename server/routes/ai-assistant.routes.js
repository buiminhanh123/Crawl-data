const express = require('express');
const router = express.Router();

const AI_API_URL = 'https://aidesign.io.vn/api/chatbot/chat';
const AI_API_KEY = 'chatgpt2api';

// Helper function to sleep/delay
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Helper function to safely extract clean JSON or text content from AI response
function extractAiContent(jsonObj, rawText) {
    if (!jsonObj && !rawText) return '';
    if (jsonObj) {
        const c = jsonObj?.choices?.[0]?.message?.content ?? jsonObj?.response ?? jsonObj?.content ?? jsonObj?.text ?? '';
        if (c) return String(c).trim();
    }
    if (rawText && typeof rawText === 'string') {
        const cleaned = rawText.trim();
        if (!cleaned.startsWith('<') && !cleaned.startsWith('{')) {
            return cleaned;
        }
    }
    return '';
}

// ──────────────────────────────────────────────────────────────
// POST /api/ai/chat
// Body: { message: string, history: Array, mode?: string }
// Proxy to aidesign.io.vn chatbot API with retry engine
// ──────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    const { message, history = [], mode } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
    }

    const finalMessage = message.trim();
    const payload = {
        message: finalMessage,
        stream: false,
        history: Array.isArray(history) ? history : [],
    };

    let attempts = 0;
    const maxAttempts = 3;
    let lastStatus = 500;
    let lastRaw = '';

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const response = await fetch(AI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_API_KEY}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(25000), // 25s timeout
            });

            lastStatus = response.status;
            lastRaw = await response.text();

            if (response.ok) {
                let json;
                try {
                    json = JSON.parse(lastRaw);
                } catch (e) {
                    json = null;
                }

                const content = extractAiContent(json, lastRaw);
                if (content) {
                    return res.json({
                        content,
                        raw: json || lastRaw,
                    });
                }
            }

            // If rate limited or 502/503 bad gateway, retry with increasing delay
            if (response.status === 429 || response.status >= 500) {
                console.warn(`[AI] Attempt ${attempts}/${maxAttempts} failed with status ${response.status}. Retrying in ${attempts * 1200}ms...`);
                if (attempts < maxAttempts) {
                    await delay(attempts * 1200);
                    continue;
                }
            } else {
                // Non-retriable error
                break;
            }
        } catch (err) {
            console.error(`[AI] Attempt ${attempts}/${maxAttempts} fetch error:`, err.message);
            lastRaw = err.message;
            if (attempts < maxAttempts) {
                await delay(attempts * 1200);
            }
        }
    }

    console.error('[AI] All attempts failed. Last status:', lastStatus, lastRaw?.slice(0, 150));

    // Return clean JSON error response (never return raw HTML)
    return res.status(502).json({
        error: `Dịch vụ AI đang quá tải hoặc tạm thời bận (Status ${lastStatus}). Vui lòng bấm "Thử Lại" hoặc giảm số luồng xuống 1-2.`,
        status: lastStatus,
        details: typeof lastRaw === 'string' && lastRaw.startsWith('<') ? 'HTML Error Page' : lastRaw.slice(0, 200)
    });
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
