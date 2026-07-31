const express = require('express');
const router = express.Router();

const AI_API_URL = 'https://aidesign.io.vn/api/chatbot/chat';
const AI_API_KEY = 'chatgpt2api';

// Helper function to sleep/delay
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Server-side Request Queue Pacer
// Ensures outgoing API calls to AI provider are spaced out by at least MIN_INTERVAL_MS
// to prevent 429 Rate Limit / 502 Bad Gateway when running multi-threaded batches.
let pacerChain = Promise.resolve();
const MIN_INTERVAL_MS = 800; // 800ms spacing between AI calls

function enqueuePacedRequest(fn) {
    const resultPromise = pacerChain.then(async () => {
        const res = await fn();
        await delay(MIN_INTERVAL_MS);
        return res;
    }).catch(async (err) => {
        await delay(MIN_INTERVAL_MS);
        throw err;
    });

    // Keep queue chain alive even if a request fails
    pacerChain = resultPromise.catch(() => {});
    return resultPromise;
}

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
// Proxy to aidesign.io.vn chatbot API with Paced Queue + Retry Engine
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

    try {
        const aiResponse = await enqueuePacedRequest(async () => {
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
                        signal: AbortSignal.timeout(30000), // 30s timeout
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
                            return { content, raw: json || lastRaw };
                        }
                    }

                    // If rate limited or 502/503 bad gateway, retry with increasing delay
                    if (response.status === 429 || response.status >= 500) {
                        console.warn(`[AI] Attempt ${attempts}/${maxAttempts} failed with status ${response.status}. Retrying in ${attempts * 1500}ms...`);
                        if (attempts < maxAttempts) {
                            await delay(attempts * 1500);
                            continue;
                        }
                    } else {
                        break;
                    }
                } catch (err) {
                    console.error(`[AI] Attempt ${attempts}/${maxAttempts} fetch error:`, err.message);
                    lastRaw = err.message;
                    if (attempts < maxAttempts) {
                        await delay(attempts * 1500);
                    }
                }
            }

            throw {
                status: lastStatus,
                message: `Server AI đang quá tải hoặc tạm thời bận (Status ${lastStatus}). Khuyên dùng 2-3 luồng để chạy ổn định.`
            };
        });

        return res.json(aiResponse);

    } catch (err) {
        const status = err.status || 502;
        const msg = err.message || 'Lỗi kết nối Server AI. Vui lòng giảm số luồng xuống 2-3 luồng.';
        return res.status(status).json({
            error: msg,
            status
        });
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
