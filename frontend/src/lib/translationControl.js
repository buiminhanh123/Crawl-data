import { fetchApi } from './api';

/**
 * Fetch Glossary terms (Global + optional Series Scope)
 */
export async function fetchGlossary(scope = null) {
    try {
        const url = scope ? `/api/ai/glossary?scope=${encodeURIComponent(scope)}` : '/api/ai/glossary';
        const res = await fetchApi(url);
        return res?.data || [];
    } catch (e) {
        console.error('Failed to fetch glossary:', e);
        return [];
    }
}

/**
 * Fetch Series Translation Memory
 */
export async function fetchTranslationMemory(seriesKey = null) {
    try {
        const url = seriesKey ? `/api/ai/translation-memory?seriesKey=${encodeURIComponent(seriesKey)}` : '/api/ai/translation-memory';
        const res = await fetchApi(url);
        return res?.data || [];
    } catch (e) {
        console.error('Failed to fetch translation memory:', e);
        return [];
    }
}

/**
 * Fetch Whitelist units & acronyms
 */
export async function fetchWhitelist() {
    try {
        const res = await fetchApi('/api/ai/whitelist');
        return res?.data || [];
    } catch (e) {
        console.error('Failed to fetch whitelist:', e);
        return [];
    }
}

/**
 * Add Whitelist item
 */
export async function saveWhitelistItem(term, category = 'unit') {
    try {
        const res = await fetchApi('/api/ai/whitelist', {
            method: 'POST',
            body: JSON.stringify({ term, category })
        });
        return res?.success;
    } catch (e) {
        console.error('Failed to add whitelist item:', e);
        throw e;
    }
}

/**
 * Delete Whitelist item
 */
export async function deleteWhitelistItem(id) {
    try {
        await fetchApi(`/api/ai/whitelist/${id}`, { method: 'DELETE' });
        return true;
    } catch (e) {
        console.error('Failed to delete whitelist item:', e);
        return false;
    }
}


/**
 * Save new glossary item or bulk items
 */
export async function saveGlossaryItem(item) {
    try {
        const res = await fetchApi('/api/ai/glossary', {
            method: 'POST',
            body: JSON.stringify(item)
        });
        return res?.data;
    } catch (e) {
        console.error('Failed to save glossary item:', e);
        throw e;
    }
}

/**
 * Delete glossary item
 */
export async function deleteGlossaryItem(id) {
    try {
        await fetchApi(`/api/ai/glossary/${id}`, { method: 'DELETE' });
        return true;
    } catch (e) {
        console.error('Failed to delete glossary item:', e);
        return false;
    }
}

/**
 * Save pairs to Series Translation Memory
 */
export async function saveSeriesMemory(seriesKey, pairs) {
    if (!seriesKey || !Array.isArray(pairs) || pairs.length === 0) return 0;
    try {
        const res = await fetchApi('/api/ai/translation-memory', {
            method: 'POST',
            body: JSON.stringify({ seriesKey, pairs })
        });
        return res?.count || 0;
    } catch (e) {
        console.error('Failed to save series memory:', e);
        return 0;
    }
}

/**
 * Audit translated text to check if 100% translated to Vietnamese
 */
export async function auditTranslation(text, seriesKey = null) {
    if (!text || typeof text !== 'string') {
        return { is100PercentVietnamese: true, untranslatedWords: [], count: 0 };
    }
    try {
        const res = await fetchApi('/api/ai/audit-translation', {
            method: 'POST',
            body: JSON.stringify({ text, seriesKey })
        });
        return res || { is100PercentVietnamese: true, untranslatedWords: [], count: 0 };
    } catch (e) {
        console.error('Failed to audit translation:', e);
        return { is100PercentVietnamese: true, untranslatedWords: [], count: 0 };
    }
}

/**
 * Apply pre-translation replacements using active Glossary & Series Memory
 */
export function applyPreTranslation(text, glossaryList = [], memoryList = []) {
    if (!text || typeof text !== 'string') return text;
    let result = text;

    // Combine terms: memory terms first, then glossary terms
    const allPairs = [];
    (memoryList || []).forEach(m => {
        if (m.source_text && m.translated_text) {
            allPairs.push({ src: m.source_text, tgt: m.translated_text });
        }
    });
    (glossaryList || []).forEach(g => {
        if (g.is_active && g.source_term && g.target_term) {
            allPairs.push({ src: g.source_term, tgt: g.target_term });
        }
    });

    // Sort by length descending so longer phrases match before short words
    allPairs.sort((a, b) => b.src.length - a.src.length);

    allPairs.forEach(p => {
        const escaped = p.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        result = result.replace(regex, p.tgt);
    });

    return result;
}

/**
 * Extract key-value pairs from source vs translated HTML table / text
 */
export function extractPairsFromTables(sourceHtml, translatedHtml) {
    if (!sourceHtml || !translatedHtml) return [];
    const pairs = [];

    const extractRows = (html) => {
        const rows = [];
        const matches = [...(html || '').matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)];
        matches.forEach(m => {
            const cells = [...m[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map(c => c[1].replace(/<[^>]*>/g, '').trim());
            if (cells.length > 0) rows.push(cells);
        });
        return rows;
    };

    const srcRows = extractRows(sourceHtml);
    const tgtRows = extractRows(translatedHtml);

    if (srcRows.length > 0 && srcRows.length === tgtRows.length) {
        for (let i = 0; i < srcRows.length; i++) {
            const sCells = srcRows[i];
            const tCells = tgtRows[i];
            for (let j = 0; j < Math.min(sCells.length, tCells.length); j++) {
                const s = sCells[j].trim();
                const t = tCells[j].trim();
                if (s && t && s !== t && /[a-zA-Z]{2,}/.test(s) && !/^\d+$/.test(s)) {
                    pairs.push({ source_text: s, translated_text: t });
                }
            }
        }
    }

    return pairs;
}
