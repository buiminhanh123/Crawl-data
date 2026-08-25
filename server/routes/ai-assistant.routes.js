const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const {
    aiPromptProfileQueries,
    aiGlossaryQueries,
    aiTranslationMemoryQueries,
    aiWhitelistQueries
} = require('../db');

const AI_API_URL = process.env.AI_API_URL || 'https://aidesign.io.vn/api/chatbot/chat';
const AI_API_KEY = process.env.AI_API_KEY || 'chatgpt2api';


// Helper function to sleep/delay
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Simple In-Memory Response Cache (500 entries max, 1 hour TTL)
const responseCache = new Map();
const MAX_CACHE_SIZE = 500;

function getCacheKey(msg) {
    return crypto.createHash('md5').update(String(msg || '').trim()).digest('hex');
}

function isRefusalText(text) {
    if (!text || typeof text !== 'string') return false;
    return /chia (kết quả|thành nhiều phần)|bảng (dữ liệu )?rất dài|Phần 1:|tránh bị cắt/i.test(text) && !text.includes('<table');
}

function getFromCache(key) {
    const cached = responseCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > 3600 * 1000 || isRefusalText(cached.data?.content)) {
        responseCache.delete(key);
        return null;
    }
    return cached.data;
}

function setToCache(key, data) {
    if (!data || !data.content || isRefusalText(data.content)) {
        return; // DO NOT CACHE BAD / REFUSAL RESPONSES
    }
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

    let enhancedMessage = finalMessage;
    if (req.body.seriesKey || req.body.useGlossary) {
        try {
            const glossaryTerms = aiGlossaryQueries.getAll(req.body.seriesKey || null).filter(g => g.is_active);
            let termRules = [];
            glossaryTerms.forEach(g => {
                termRules.push(`"${g.source_term}" -> "${g.target_term}"`);
            });
            if (req.body.seriesKey) {
                const memTerms = aiTranslationMemoryQueries.getBySeries(req.body.seriesKey);
                memTerms.forEach(m => {
                    termRules.push(`"${m.source_text}" -> "${m.translated_text}"`);
                });
            }
            if (termRules.length > 0) {
                enhancedMessage += `\n\n[QUY TẮC DỊCH BẮT BUỘC (GLOSSARY & SERIES MEMORY)]:\nBẮT BUỘC dịch chính xác các thuật ngữ sau sang Tiếng Việt (không được dùng từ đồng nghĩa khác):\n` + termRules.slice(0, 50).map(r => `- ${r}`).join('\n');
            }
        } catch (e) {
            console.error('Error attaching glossary rules to chat prompt:', e);
        }
    }

    // Append strict single-pass anti-splitting rules ONLY for explicit translation / spec table prompts (not for Meta, Sapo, SEO, etc.)
    const isExplicitTableTranslation = /(?:dịch\s+bảng|dịch\s+thông\s+số|chuyển\s+đổi\s+cấu\s+trúc|đổi\s+cấu\s+trúc|chỉ\s+xuất\s+duy\s+nhất\s+bảng|table_product_style|<table|thông\s+số\s+kỹ\s+thuật)/i.test(finalMessage) && !/(?:meta|sapo|tiêu\s+đề|bài\s+viết|mở\s+đầu)/i.test(finalMessage);
    if (isExplicitTableTranslation) {
        enhancedMessage += `\n\n[QUY TẮC NGUYÊN TẮC BẮT BUỘC - XỬ LÝ BẢNG THÔNG SỐ]:\n1. BẮT BUỘC dịch/chuyển đổi TOÀN BỘ 100% tất cả các dòng thông số trong 1 LẦN TRẢ VỀ DUY NHẤT.\n2. BẤT KỂ BẢNG DÀI BAO NHIÊU (DÙ TRÊN 100-200 HÀNG), TUYỆT ĐỐI KHÔNG ĐƯỢC CHIA THÀNH NHIỀU PHẦN (KHÔNG ĐƯỢC BÁO "Phần 1", "Phần 2"...), KHÔNG ĐƯỢC GIẢI THÍCH HOẶC HỎI LẠI.\n3. CHỈ TRẢ VỀ DUY NHẤT BẢNG KẾT QUẢ KỸ THUẬT, KHÔNG ĐƯỢC CÓ ĐOẠN VĂN MỞ ĐẦU HOẶC LỜI CHÀO HỎI (TUYỆT ĐỐI KHÔNG VIẾT "Tôi đã nhận...", "Do bảng dữ liệu rất dài...").\n4. BẮT BUỘC GIỮ NGUYÊN 100% cấu trúc HTML, tên class của thẻ <table> và nội dung các thẻ tiêu đề (<th>) đúng theo mẫu mà người dùng đã yêu cầu trong prompt.`;
    }

    const payload = {
        message: enhancedMessage,
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

                        let content = extractAiContent(json, lastRaw);
                        
                        // Check if AI output is conversational refusal chatter ("chia thành nhiều phần", "Do bảng rất dài", "Phần 1:")
                        const isRefusalChatter = /chia (kết quả|thành nhiều phần)|bảng (dữ liệu )?rất dài|Phần 1:|tránh bị cắt/i.test(content) && !content.includes('<table');

                        if (content && !isRefusalChatter) {
                            // Extract HTML <table> ONLY for explicit table translation prompts
                            // For meta/sapo/SEO prompts, keep the full response as-is
                            if (isExplicitTableTranslation) {
                                const tableMatch = content.match(/(?:<h2>[\s\S]*?<\/h2>[\s\n]*)?<table[\s\S]*?(?:<\/table>|$)/i);
                                if (tableMatch) {
                                    content = tableMatch[0];
                                    if (!content.includes('</table>')) {
                                        content += '\n</table>';
                                    }
                                }
                            }
                            const resultObj = { content, raw: json || lastRaw };
                            setToCache(cacheKey, resultObj);
                            return resultObj;
                        } else {
                            console.warn(`[AI] Attempt ${attempts}/${maxAttempts} returned ${isRefusalChatter ? 'refusal chatter' : 'empty content'}. Retrying in ${attempts * 1000}ms...`);
                            // Update payload with urgent enforcement prompt on retry
                            payload.message = enhancedMessage + `\n\n[CẢNH BÁO KHẨN CẤP LẦN ${attempts}]: Bạn vừa từ chối dịch hoặc chia nhỏ phần! KHÔNG ĐƯỢC CHIA PHẦN, KHÔNG NÓI CHUYỆN! Hãy xuất BẢNG HTML HOÀN CHỈNH 100% HÀNG ngay bây giờ!`;
                            if (attempts < maxAttempts) {
                                await delay(attempts * 1000);
                                continue;
                            }
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
        const msg = err.message || 'Lỗi kết nối Server AI (aidesign.io.vn). Vui lòng thử lại sau.';
        return res.json({
            error: msg,
            success: false,
            status
        });
    }
});

// ──────────────────────────────────────────────────────────────
// POST /api/ai/clear-cache
// Flush in-memory AI response cache
// ──────────────────────────────────────────────────────────────
router.post('/clear-cache', (req, res) => {
    responseCache.clear();
    res.json({ success: true, message: 'Đã xóa toàn bộ bộ nhớ tạm (cache) kết quả AI thành công.' });
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
            let errorHint = rawText.slice(0, 200);
            if (rawText.includes('429')) {
                errorHint = 'Phía upstream ChatGPT trả về status=429 (Too Many Requests / Quá tải lượt gọi / Hết quota IP)';
            }
            return res.json({
                ok: false,
                status: response.status,
                latencyMs,
                message: `Server AI (${new URL(AI_API_URL).hostname}) phản hồi mã lỗi HTTP ${response.status}`,
                details: errorHint
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
        res.json({
            ok: false,
            status: 504,
            latencyMs,
            message: `❌ Không thể kết nối tới Server AI (aidesign.io.vn): ${err.message}`,
            error: err.message
        });
    }
});



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

// ──────────────────────────────────────────────────────────────
// GLOSSARY APIs (Thư viện Thuật ngữ Tùy chỉnh)
// ──────────────────────────────────────────────────────────────
router.get('/glossary', (req, res) => {
    try {
        const { scope } = req.query;
        const items = aiGlossaryQueries.getAll(scope || null);
        res.json({ success: true, data: items });
    } catch (err) {
        console.error('Failed to fetch glossary:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch glossary items.' });
    }
});

router.post('/glossary', (req, res) => {
    try {
        const { scope = 'global', source_term, target_term, notes, items } = req.body;
        if (Array.isArray(items)) {
            const synced = aiGlossaryQueries.bulkSave(items);
            return res.json({ success: true, data: synced });
        }
        if (!source_term || !target_term) {
            return res.status(400).json({ success: false, error: 'Từ tiếng Anh và từ dịch tiếng Việt không được để trống.' });
        }
        const item = aiGlossaryQueries.create(scope, source_term, target_term, notes);
        res.json({ success: true, data: item });
    } catch (err) {
        console.error('Failed to create glossary term:', err);
        res.status(500).json({ success: false, error: 'Failed to create glossary item.' });
    }
});

router.put('/glossary/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { scope = 'global', source_term, target_term, notes, is_active } = req.body;
        if (!source_term || !target_term) {
            return res.status(400).json({ success: false, error: 'Từ tiếng Anh và từ dịch tiếng Việt không được để trống.' });
        }
        const updated = aiGlossaryQueries.update(Number(id), scope, source_term, target_term, notes, is_active);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Failed to update glossary term:', err);
        res.status(500).json({ success: false, error: 'Failed to update glossary item.' });
    }
});

router.delete('/glossary/:id', (req, res) => {
    try {
        const { id } = req.params;
        aiGlossaryQueries.delete(Number(id));
        res.json({ success: true, message: 'Deleted glossary term successfully.' });
    } catch (err) {
        console.error('Failed to delete glossary term:', err);
        res.status(500).json({ success: false, error: 'Failed to delete glossary item.' });
    }
});

// ──────────────────────────────────────────────────────────────
// TRANSLATION MEMORY APIs (Cache Dịch theo Series / Danh mục)
// ──────────────────────────────────────────────────────────────
router.get('/translation-memory', (req, res) => {
    try {
        const { seriesKey } = req.query;
        let items;
        if (seriesKey) {
            items = aiTranslationMemoryQueries.getBySeries(seriesKey);
        } else {
            items = aiTranslationMemoryQueries.getAll();
        }
        res.json({ success: true, data: items });
    } catch (err) {
        console.error('Failed to fetch translation memory:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch translation memory.' });
    }
});

router.post('/translation-memory', (req, res) => {
    try {
        const { seriesKey, source_text, translated_text, pairs } = req.body;
        if (!seriesKey) {
            return res.status(400).json({ success: false, error: 'seriesKey không được để trống.' });
        }
        if (Array.isArray(pairs)) {
            const count = aiTranslationMemoryQueries.bulkUpsert(seriesKey, pairs);
            return res.json({ success: true, count });
        }
        if (!source_text || !translated_text) {
            return res.status(400).json({ success: false, error: 'source_text và translated_text không được để trống.' });
        }
        aiTranslationMemoryQueries.upsert(seriesKey, source_text, translated_text);
        res.json({ success: true, message: 'Saved translation memory successfully.' });
    } catch (err) {
        console.error('Failed to save translation memory:', err);
        res.status(500).json({ success: false, error: 'Failed to save translation memory.' });
    }
});

router.delete('/translation-memory/:id', (req, res) => {
    try {
        const { id } = req.params;
        aiTranslationMemoryQueries.delete(Number(id));
        res.json({ success: true, message: 'Deleted memory entry successfully.' });
    } catch (err) {
        console.error('Failed to delete memory entry:', err);
        res.status(500).json({ success: false, error: 'Failed to delete memory entry.' });
    }
});

router.delete('/translation-memory/series/:seriesKey', (req, res) => {
    try {
        const { seriesKey } = req.params;
        aiTranslationMemoryQueries.deleteBySeries(seriesKey);
        res.json({ success: true, message: `Cleared memory for series ${seriesKey}.` });
    } catch (err) {
        console.error('Failed to clear series memory:', err);
        res.status(500).json({ success: false, error: 'Failed to clear series memory.' });
    }
});

// ──────────────────────────────────────────────────────────────
// WHITELIST APIs (Đơn vị đo lường & Từ viết tắt)
// ──────────────────────────────────────────────────────────────
router.get('/whitelist', (req, res) => {
    try {
        const items = aiWhitelistQueries.getAll();
        res.json({ success: true, data: items });
    } catch (err) {
        console.error('Failed to fetch whitelist:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch whitelist.' });
    }
});

router.post('/whitelist', (req, res) => {
    try {
        const { term, category = 'unit' } = req.body;
        if (!term) {
            return res.status(400).json({ success: false, error: 'Ký tự/từ Whitelist không được để trống.' });
        }
        aiWhitelistQueries.add(term, category);
        res.json({ success: true, message: 'Added whitelist entry successfully.' });
    } catch (err) {
        console.error('Failed to add whitelist entry:', err);
        res.status(500).json({ success: false, error: 'Failed to add whitelist entry.' });
    }
});

router.delete('/whitelist/:id', (req, res) => {
    try {
        const { id } = req.params;
        aiWhitelistQueries.delete(Number(id));
        res.json({ success: true, message: 'Deleted whitelist entry successfully.' });
    } catch (err) {
        console.error('Failed to delete whitelist entry:', err);
        res.status(500).json({ success: false, error: 'Failed to delete whitelist entry.' });
    }
});

// ──────────────────────────────────────────────────────────────
// AUDIT TRANSLATION API (Kiểm tra xem 100% đã dịch sang tiếng Việt chưa)
// ──────────────────────────────────────────────────────────────
router.post('/audit-translation', (req, res) => {
    try {
        const { text, seriesKey } = req.body;
        if (!text || typeof text !== 'string') {
            return res.json({ is100PercentVietnamese: true, untranslatedWords: [], count: 0 });
        }

        // Fetch whitelist terms
        const whitelistItems = aiWhitelistQueries.getAll();
        const whitelistSet = new Set(whitelistItems.map(i => i.term.toLowerCase()));

        // Fetch Glossary terms
        const glossaryItems = aiGlossaryQueries.getAll(seriesKey || null);
        const glossarySet = new Set();
        glossaryItems.forEach(g => {
            if (g.is_active) {
                glossarySet.add(g.source_term.toLowerCase());
                glossarySet.add(g.target_term.toLowerCase());
            }
        });

        // Fetch Series Memory terms
        if (seriesKey) {
            const memoryItems = aiTranslationMemoryQueries.getBySeries(seriesKey);
            memoryItems.forEach(m => {
                glossarySet.add(m.source_text.toLowerCase());
                glossarySet.add(m.translated_text.toLowerCase());
            });
        }

        // Clean HTML tags from text
        let cleanText = text.replace(/<[^>]*>/g, ' ');

        // Tokenize words
        const words = cleanText.match(/[a-zA-Z0-9_°³/.-]+/g) || [];
        const untranslatedSet = new Set();

        for (let rawWord of words) {
            let word = rawWord.trim().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
            if (word.length < 2) continue; // Ignore single letters like 'a', 'x', 'y'
            if (/^\d+$/.test(word)) continue; // Ignore numbers

            const lower = word.toLowerCase();

            // Ignore if in Whitelist or Glossary/Memory
            if (whitelistSet.has(lower) || whitelistSet.has(word) || glossarySet.has(lower)) {
                continue;
            }

            // Common English words detection (that are not Vietnamese words)
            // Note: Vietnamese words with accents aren't matched by [a-zA-Z]. Non-accented Vietnamese words like 'va', 'la', 'cho', 'voi', 'duoc', 'trong', 'co', 'nay', 'san', 'pham', 'thong', 'so', 'ky', 'thuat', 'dien', 'ap'...
            // We build a list of common non-accented Vietnamese words to avoid false flagging
            const nonAccentedViWords = new Set([
                'va', 'la', 'cho', 'voi', 'duoc', 'trong', 'co', 'nay', 'san', 'pham', 'thong', 'so', 'ky', 'thuat',
                'dien', 'ap', 'cong', 'suat', 'luu', 'luong', 'kich', 'thuoc', 'trong', 'luong', 'nhiet', 'do', 'hang',
                'nhap', 'khau', 'chinh', 'hang', 'bao', 'hanh', 'mo', 'ta', 'chi', 'tiet', 'cac', 'nhat', 'dung',
                'cao', 'thap', 'nho', 'lon', 'dep', 'tot', 'moi', 'cu', 'the', 'khi', 'de', 'tu', 'den', 'vua',
                'theo', 'dang', 'kieu', 'loai', 'dong', 'bo', 'vat', 'lieu', 'than', 'truc', 'canh', 'dau', 'ra', 'vao',
                'mau', 'trang', 'den', 'do', 'xanh', 'vang', 'cam', 'tim', 'xam', 'bac', 'dong', 'thep', 'nhom', 'nhua'
            ]);

            if (nonAccentedViWords.has(lower)) {
                continue;
            }

            // High probability of English word
            untranslatedSet.add(word);
        }

        const untranslatedWords = Array.from(untranslatedSet);
        res.json({
            is100PercentVietnamese: untranslatedWords.length === 0,
            untranslatedWords,
            count: untranslatedWords.length
        });
    } catch (err) {
        console.error('Failed to audit translation:', err);
        res.status(500).json({ success: false, error: 'Failed to audit translation.' });
    }
});

module.exports = router;
