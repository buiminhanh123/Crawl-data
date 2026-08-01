const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const AI_API_URL = 'https://aidesign.io.vn/api/chatbot/chat';
const AI_API_KEY = 'chatgpt2api';

// Helper function to sleep/delay
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Simple In-Memory Response Cache (500 entries max, 1 hour TTL)
const responseCache = new Map();
const MAX_CACHE_SIZE = 500;

function getCacheKey(msg) {
    return crypto.createHash('md5').update(String(msg || '').trim()).digest('hex');
}

function getFromCache(key) {
    const cached = responseCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > 3600 * 1000) {
        responseCache.delete(key);
        return null;
    }
    return cached.data;
}

function setToCache(key, data) {
    if (responseCache.size >= MAX_CACHE_SIZE) {
        const firstKey = responseCache.keys().next().value;
        if (firstKey) responseCache.delete(firstKey);
    }
    responseCache.set(key, { data, timestamp: Date.now() });
}

// Server-side Request Queue Pacer (Optimized 250ms spacing)
let pacerChain = Promise.resolve();
const MIN_INTERVAL_MS = 250;

function enqueuePacedRequest(fn) {
    const resultPromise = pacerChain.then(async () => {
        const res = await fn();
        await delay(MIN_INTERVAL_MS);
        return res;
    }).catch(async (err) => {
        await delay(MIN_INTERVAL_MS);
        throw err;
    });

    pacerChain = resultPromise.catch(() => {});
    return resultPromise;
}

// Safe AI text extraction
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
// Body: { message: string, history: Array }
// High-Speed AI Proxy with Generous 45s Timeout & Auto-Retry
// ──────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
    }

    const finalMessage = message.trim();
    const cacheKey = getCacheKey(finalMessage);

    // 1. Check in-memory cache
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
        return res.json({
            content: cachedData.content,
            raw: cachedData.raw,
            cached: true
        });
    }

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
                        signal: AbortSignal.timeout(45000), // Generous 45s timeout for complex product prompts
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
                            const resultObj = { content, raw: json || lastRaw };
                            setToCache(cacheKey, resultObj);
                            return resultObj;
                        }
                    }

                    if (response.status === 429 || response.status >= 500) {
                        console.warn(`[AI] Attempt ${attempts}/${maxAttempts} status ${response.status}. Retrying in ${attempts * 1000}ms...`);
                        if (attempts < maxAttempts) {
                            await delay(attempts * 1000);
                            continue;
                        }
                    } else {
                        break;
                    }
                } catch (err) {
                    console.error(`[AI] Attempt ${attempts}/${maxAttempts} fetch error:`, err.message);
                    lastRaw = err.message;
                    if (attempts < maxAttempts) {
                        await delay(attempts * 1000);
                    }
                }
            }

            throw {
                status: lastStatus,
                message: `Server AI đang quá tải hoặc phản hồi chậm (Status ${lastStatus}). Vui lòng thử lại sau giây lát.`
            };
        });

        return res.json(aiResponse);

    } catch (err) {
        const status = err.status || 502;
        const msg = err.message || 'Lỗi kết nối Server AI. Vui lòng thử lại sau.';
        return res.status(status).json({
            error: msg,
            status
        });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/ai/health
// Real-time Health Check & Ping for AI Server Endpoint
// ──────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
    const startTime = Date.now();
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({ message: 'ping', stream: false, history: [] }),
            signal: AbortSignal.timeout(15000),
        });

        const latencyMs = Date.now() - startTime;
        const rawText = await response.text();

        let isOk = response.ok;
        let snippet = rawText.slice(0, 150);

        if (response.ok) {
            try {
                const parsed = JSON.parse(rawText);
                const extracted = extractAiContent(parsed, rawText);
                if (extracted) isOk = true;
            } catch (e) {}
        }

        res.json({
            ok: isOk,
            status: response.status,
            latencyMs,
            endpoint: AI_API_URL,
            message: isOk
                ? `✅ Kết nối thành công! Server AI hoạt động tốt (${latencyMs}ms)`
                : `⚠️ Server AI trả về mã lỗi ${response.status} (${latencyMs}ms)`,
            snippet
        });
    } catch (err) {
        const latencyMs = Date.now() - startTime;
        res.json({
            ok: false,
            status: 504,
            latencyMs,
            endpoint: AI_API_URL,
            message: `❌ Lỗi kết nối Server AI: ${err.message}`,
            error: err.message
        });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/ai/test-connection
// Sends a real test prompt to verify AI output response
// ──────────────────────────────────────────────────────────────
router.post('/test-connection', async (req, res) => {
    const startTime = Date.now();
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`,
            },
            body: JSON.stringify({ message: 'Xin chào! Hãy trả về dòng chữ "AI OK".', stream: false, history: [] }),
            signal: AbortSignal.timeout(20000),
        });

        const latencyMs = Date.now() - startTime;
        const rawText = await response.text();

        if (!response.ok) {
            return res.status(response.status).json({
                ok: false,
                status: response.status,
                latencyMs,
                message: `Server AI trả về lỗi HTTP ${response.status}`,
                details: rawText.slice(0, 200)
            });
        }

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (e) {
            parsed = null;
        }

        const reply = extractAiContent(parsed, rawText);

        res.json({
            ok: true,
            status: response.status,
            latencyMs,
            reply: reply || rawText.slice(0, 200),
            message: `🎉 Kết nối API AI hoàn hảo! Thời gian phản hồi: ${latencyMs}ms`
        });
    } catch (err) {
        const latencyMs = Date.now() - startTime;
        res.status(504).json({
            ok: false,
            status: 504,
            latencyMs,
            message: `❌ Không thể kết nối tới Server AI: ${err.message}`,
            error: err.message
        });
    }
});

const { aiPromptProfileQueries } = require('../db');

// ──────────────────────────────────────────────────────────────
// GET /api/ai/prompt-profiles
// Fetch all stored AI prompt profiles from SQLite database
// ──────────────────────────────────────────────────────────────
router.get('/prompt-profiles', (req, res) => {
    try {
        const profiles = aiPromptProfileQueries.getAll();
        res.json({ success: true, data: profiles });
    } catch (err) {
        console.error('Failed to fetch prompt profiles:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch prompt profiles.' });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/ai/prompt-profiles
// Create a single profile OR bulk save/sync profiles
// Body: { name, prompt } OR { profiles: [...] }
// ──────────────────────────────────────────────────────────────
router.post('/prompt-profiles', (req, res) => {
    try {
        const { name, prompt, profiles } = req.body;
        if (Array.isArray(profiles)) {
            const synced = aiPromptProfileQueries.bulkSave(profiles);
            return res.json({ success: true, data: synced });
        }
        if (!name || !prompt) {
            return res.status(400).json({ success: false, error: 'Tên và nội dung prompt không được để trống.' });
        }
        const created = aiPromptProfileQueries.create(name, prompt);
        res.json({ success: true, data: created });
    } catch (err) {
        console.error('Failed to create prompt profile:', err);
        res.status(500).json({ success: false, error: 'Failed to create prompt profile.' });
    }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/ai/prompt-profiles/:id
// Update an existing prompt profile
// ──────────────────────────────────────────────────────────────
router.put('/prompt-profiles/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, prompt } = req.body;
        if (!name || !prompt) {
            return res.status(400).json({ success: false, error: 'Tên và nội dung prompt không được để trống.' });
        }
        const updated = aiPromptProfileQueries.update(Number(id), name, prompt);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Failed to update prompt profile:', err);
        res.status(500).json({ success: false, error: 'Failed to update prompt profile.' });
    }
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/ai/prompt-profiles/:id
// Delete a prompt profile
// ──────────────────────────────────────────────────────────────
router.delete('/prompt-profiles/:id', (req, res) => {
    try {
        const { id } = req.params;
        aiPromptProfileQueries.delete(Number(id));
        res.json({ success: true, message: 'Deleted successfully.' });
    } catch (err) {
        console.error('Failed to delete prompt profile:', err);
        res.status(500).json({ success: false, error: 'Failed to delete prompt profile.' });
    }
});

module.exports = router;
