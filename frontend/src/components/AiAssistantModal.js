'use client';
import { useState, useEffect, useRef } from 'react';
import { fetchApi } from '@/lib/api';
import {
    Bot,
    Sparkles,
    X,
    Play,
    Square,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FileSpreadsheet,
    Languages,
    FileText,
    PenLine,
    Plus,
    Trash2,
    Wand2,
    RotateCcw,
    Sliders,
    Layers,
    Copy,
    Check,
    Volume2,
    ChevronDown,
    ArrowRight,
    Bookmark,
    Save
} from 'lucide-react';

export function convertMarkdownTableToHtml(text) {
    if (!text || typeof text !== 'string') return text;
    let trimmed = text.trim();

    // Clean artifact tags & backticks
    trimmed = trimmed.replace(/:::[a-zA-Z0-9_-]+(\{[^}]*?\})?\s*\n?/gi, '').replace(/\s*:::\s*$/g, '');
    trimmed = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\n?/gi, '').replace(/\n?\s*```$/gi, '');

    const hasPipes = /^\s*\|.*\|/m.test(trimmed);
    const hasHtmlRows = /<tr[^>]*>/i.test(trimmed) && /<td[^>]*>/i.test(trimmed);

    // If it's already a clean HTML table with no markdown pipes, return as is
    if (!hasPipes && trimmed.includes('<table') && trimmed.includes('</table>')) {
        return trimmed;
    }

    // If there are neither pipes nor HTML table rows, return as is
    if (!hasPipes && !hasHtmlRows) {
        return trimmed;
    }

    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const rows = [];
    let headerRow = null;

    for (const line of lines) {
        // Case 1: Markdown Pipe table line e.g. | col1 | col2 |
        if (line.startsWith('|') || line.endsWith('|')) {
            if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)) {
                continue;
            }
            const parts = line.split('|').map(c => c.trim());
            if (parts.length > 0 && parts[0] === '') parts.shift();
            if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
            
            if (parts.length > 0) {
                if (!headerRow) {
                    headerRow = parts;
                } else {
                    rows.push(parts);
                }
            }
        } 
        // Case 2: HTML table row <tr><td>col1</td><td>col2</td></tr>
        else if (line.includes('<td')) {
            const matches = [...line.matchAll(/<td[^>]*>(.*?)<\/td>/gi)];
            if (matches.length > 0) {
                const cells = matches.map(m => m[1].trim());
                rows.push(cells);
            }
        }
        // Case 3: HTML table header <tr><th>col1</th><th>col2</th></tr>
        else if (line.includes('<th')) {
            const matches = [...line.matchAll(/<th[^>]*>(.*?)<\/th>/gi)];
            if (matches.length > 0 && !headerRow) {
                headerRow = matches.map(m => m[1].trim());
            }
        }
    }

    if (!headerRow && rows.length === 0) {
        return text;
    }

    if (!headerRow && rows.length > 0) {
        headerRow = ['Thông số kỹ thuật', 'Chi tiết'];
    }

    let html = `<table class="Table_Products_Style">\n<thead>\n<tr>\n`;
    headerRow.forEach(h => {
        html += `  <th>${h}</th>\n`;
    });
    html += `</tr>\n</thead>\n<tbody>\n`;

    rows.forEach(r => {
        html += `  <tr>`;
        for (let i = 0; i < headerRow.length; i++) {
            const val = r[i] !== undefined ? r[i] : '';
            html += `<td>${val}</td>`;
        }
        html += `</tr>\n`;
    });

    html += `</tbody>\n</table>`;
    return html;
}

export function isValidHtmlTableStructure(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    
    // Must contain <table and </table>
    if (!trimmed.includes('<table') || !trimmed.includes('</table>')) return false;

    // Must contain <tr> and <td> or <th>
    if (!trimmed.includes('<tr') || (!trimmed.includes('<td') && !trimmed.includes('<th'))) return false;

    // Must NOT contain raw Markdown pipe table syntax e.g. |---|---| or | 1D | ...
    if (/^\s*\|.*\|/m.test(trimmed) || /\|--+/.test(trimmed)) return false;

    return true;
}

// Clean AI chatbot artifact tags (e.g. :::writing{variant="document" id="48271"} ... :::) and trailing chatter
export function cleanAiArtifactTags(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();

    // 1. Remove :::writing{variant="..." id="..."} or :::document tags anywhere
    cleaned = cleaned.replace(/:::[a-zA-Z0-9_-]+(\{[^}]*?\})?\s*\n?/gi, '');
    cleaned = cleaned.replace(/^\s*:::\s*$/gm, '');
    cleaned = cleaned.replace(/\s*:::\s*$/g, '');

    // 2. Remove codeblock wrappers ```html ... ```
    if (/^```[a-zA-Z0-9_-]*\n/i.test(cleaned)) {
        cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/i, '').replace(/\n?```$/i, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*\n?/i, '').replace(/\n?\s*```$/i, '');
    }
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*/i, '').replace(/```$/i, '');

    // 3. Remove leading conversational intro / preamble lines
    let lines = cleaned.split('\n');
    while (lines.length > 1) {
        const firstLine = lines[0].trim();
        const isIntro = /^(chắc chắn rồi|dưới đây|đây là|sau đây|bản dịch|kết quả|dữ liệu|sapo|lưu ý|ghi chú|dịch:)/i.test(firstLine) ||
                        (firstLine.endsWith(':') && firstLine.length < 150 && !firstLine.includes('<') && !firstLine.includes('=') && !firstLine.includes('{'));
        if (isIntro) {
            lines.shift();
            while (lines.length > 0 && lines[0].trim() === '') lines.shift();
        } else {
            break;
        }
    }
    cleaned = lines.join('\n').trim();

    // 4. Remove single line leading phrases
    cleaned = cleaned.replace(/^(Chắc chắn rồi|Dưới đây là|Đây là|Dữ liệu đã được|Bản dịch:|Dịch:|SAPO:|Kết quả:)\s*/i, '');

    // 5. Remove trailing chatbot conversational chatter (e.g. "Nếu cần, tôi có thể tiếp tục dịch...", "Hy vọng...", "Hãy cho tôi biết...")
    lines = cleaned.split('\n');
    while (lines.length > 0) {
        const lastLine = lines[lines.length - 1].trim();
        const isTrailingChatter = /^(nếu cần|nếu bạn|nếu có|tôi có thể|hy vọng|hi vọng|hãy|chúc bạn|bạn có thể|lưu ý rằng|ngoài ra|rất hân hạnh|bản dịch trên|kết quả trên|nếu muốn|có cần)/i.test(lastLine) ||
                                  /tiếp tục dịch.*(khác|thông số|bảng)/i.test(lastLine) ||
                                  /hỗ trợ thêm|giúp ích|thắc mắc|cần chỉnh sửa|bảng thông số/i.test(lastLine);
        if (isTrailingChatter) {
            lines.pop();
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
        } else {
            break;
        }
    }
    cleaned = lines.join('\n').trim();

    // 6. Clean residual standalone :::
    cleaned = cleaned.replace(/^\s*:::\s*$/gm, '').replace(/\s*:::\s*$/g, '').trim();

    // 7. If output contains mixed Markdown pipe table syntax or HTML table rows without <table> wrapper, convert automatically
    if (/^\s*\|.*\|/m.test(cleaned) || (cleaned.includes('<td') && !cleaned.includes('<table'))) {
        cleaned = convertMarkdownTableToHtml(cleaned);
    }

    return cleaned;
}

// Web Audio API Crystal Chime Sound Generator (No external MP3 required)
export function playCompletionChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        // Tone 1: High crisp bell (880Hz - A5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.5);

        // Tone 2: Harmonic pleasant chime (1760Hz - A6)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1760, ctx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.12);
        osc2.stop(ctx.currentTime + 0.85);
    } catch (e) {
        console.error('[Audio Chime Error]:', e);
    }
}

// Convert string to clean variable slug (e.g. "Tên sản phẩm" -> "ten_san_pham")
const toVarSlug = (str) => {
    if (!str) return '';
    const map = {
        'à':'a','á':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ắ':'a','ặ':'a','ằ':'a','ẳ':'a','ẵ':'a',
        'â':'a','ấ':'a','ậ':'a','ầ':'a','ẩ':'a','ẫ':'a','đ':'d',
        'è':'e','é':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e','ế':'e','ệ':'e','ề':'e','ể':'e','ễ':'e',
        'ì':'i','í':'i','ỉ':'i','ĩ':'i','ị':'i',
        'ò':'o','ó':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ố':'o','ộ':'o','ồ':'o','ổ':'o','ỗ':'o',
        'ơ':'o','ớ':'o','ợ':'o','ờ':'o','ở':'o','ỡ':'o',
        'ù':'u','ú':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u','ứ':'u','ự':'u','ừ':'u','ử':'u','ữ':'u',
        'ỳ':'y','ý':'y','ỷ':'y','ỹ':'y','ỵ':'y'
    };
    return str.toLowerCase()
        .split('').map(c => map[c] || c).join('')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
};

const colToIdx = (col) => {
    if (!col) return 0;
    const c = (col || '').toUpperCase().trim();
    let r = 0;
    for (let i = 0; i < c.length; i++) r = r * 26 + c.charCodeAt(i) - 64;
    return r - 1;
};

const cleanHeaderToSlug = (rawStr, colLetter) => {
    if (!rawStr || String(rawStr).trim() === '') return '';
    let str = String(rawStr).trim();

    // If header looks like a long selector or xpath or URL
    if (str.startsWith('/') || str.startsWith('#') || str.startsWith('.') || str.includes('nth-child') || str.length > 25) {
        const words = str.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/).filter(w => w.length > 1 && !['nth', 'child', 'div', 'body', 'html', 'main', 'wrapper', 'container', 'btn', 'class'].includes(w.toLowerCase()));
        if (words.length > 0) {
            const cleanSlug = words.slice(0, 2).join('-').toLowerCase();
            if (cleanSlug.length >= 2) return cleanSlug;
        }
        return colLetter ? `cot-${colLetter.toLowerCase()}` : '';
    }

    const slug = toVarSlug(str);
    return slug;
};

// Preset Prompts
const PRESET_PROMPTS = {
    sapo: `Viết sapo giới thiệu sản phẩm tiếng Việt chuyên nghiệp (2-3 câu, khoảng 60-90 từ). Giọng văn lôi cuốn, nhấn mạnh tính năng nổi bật. Chỉ trả về đoạn văn sapo, không thêm tiêu đề hay trích dẫn.

Thông tin sản phẩm:
{noi-dung}`,

    meta: `Viết Meta Title (tối đa 65 ký tự) và Meta Description (130-160 ký tự) chuẩn SEO tiếng Việt cho sản phẩm.
Định dạng trả về:
Title: [nội dung title]
Description: [nội dung description]

Thông tin sản phẩm:
{noi-dung}`,

    dich: `Hãy dịch bảng thông số kỹ thuật sản phẩm sau sang tiếng Việt tự nhiên:
- Giữ nguyên định dạng cột/bảng
- Giữ nguyên đơn vị đo lường và tên mã model sản phẩm
- Không thêm/bớt thông số

Thông tin:
{noi-dung}`,

    custom: `Hãy xử lý thông tin sản phẩm sau theo yêu cầu:
{noi-dung}`
};

export default function AiAssistantModal({
    isOpen,
    onClose,
    profileName = 'Profile',
    profileSlug = '',
    sheets = [],
    activeTabName = '',
    onUpdateSheets,
    aiState,
    setAiState
}) {
    const [selectedTab, setSelectedTab] = useState(activeTabName || sheets[0]?.name || '');
    const [presetType, setPresetType] = useState('sapo'); // 'sapo' | 'meta' | 'dich' | 'custom'
    const [promptText, setPromptText] = useState(PRESET_PROMPTS.sapo);
    const [targetColIdx, setTargetColIdx] = useState(3); // Default Column D
    const [startRow, setStartRow] = useState(1);
    const [endRow, setEndRow] = useState('');
    const [skipExisting, setSkipExisting] = useState(true);
    const [concurrency, setConcurrency] = useState(3); // Multi-threading concurrent workers (1, 3, 5, 10)
    const [testResult, setTestResult] = useState('');
    const [testing, setTesting] = useState(false);

    // Saved Command Profiles Presets
    const [savedProfiles, setSavedProfiles] = useState([]);
    const [selectedSavedProfileId, setSelectedSavedProfileId] = useState('');

    // Load saved command profiles from Server DB on mount
    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                const res = await fetchApi('/api/ai/prompt-profiles');
                if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                    const parsed = res.data.map(item => {
                        let config = {};
                        try {
                            config = JSON.parse(item.prompt);
                        } catch (e) {
                            config = { promptText: item.prompt };
                        }
                        return {
                            id: item.id,
                            name: item.name,
                            ...config
                        };
                    });
                    setSavedProfiles(parsed);
                } else {
                    const stored = localStorage.getItem('ai_prompt_command_profiles');
                    if (stored) {
                        try {
                            const parsed = JSON.parse(stored);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setSavedProfiles(parsed);
                                fetchApi('/api/ai/prompt-profiles', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        profiles: parsed.map(p => ({ name: p.name || 'Profile Lệnh', prompt: JSON.stringify(p) }))
                                    })
                                }).catch(() => {});
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {
                try {
                    const stored = localStorage.getItem('ai_prompt_command_profiles');
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Array.isArray(parsed)) setSavedProfiles(parsed);
                    }
                } catch (err) {}
            }
        };
        fetchProfiles();
    }, []);

    // Select and load a saved command profile
    const handleSelectSavedProfile = (profileId) => {
        setSelectedSavedProfileId(profileId);
        if (!profileId) return;
        const p = savedProfiles.find(item => item.id === profileId || String(item.id) === String(profileId));
        if (!p) return;

        if (p.presetType) setPresetType(p.presetType);
        if (p.promptText || p.prompt) setPromptText(p.promptText || p.prompt);
        if (Array.isArray(p.variables)) setVariables(p.variables);
        if (p.targetColIdx !== undefined) setTargetColIdx(p.targetColIdx);
        if (p.startRow !== undefined) setStartRow(p.startRow);
        if (p.endRow !== undefined) setEndRow(p.endRow);
        if (p.concurrency !== undefined) setConcurrency(p.concurrency);
        if (p.skipExisting !== undefined) setSkipExisting(p.skipExisting);
    };

    // Save current configuration as a named profile preset
    const handleSaveCurrentProfile = async () => {
        const defaultName = `Profile Lệnh - Cột ${getColLetter(targetColIdx)}`;
        const profileNameInput = prompt('Nhập tên để lưu Cấu Hình Lệnh AI này (ví dụ: Sapo Tiếng Việt - Cột D):', defaultName);
        if (!profileNameInput || !profileNameInput.trim()) return;

        const newProfileData = {
            name: profileNameInput.trim(),
            presetType,
            promptText,
            variables,
            targetColIdx,
            startRow,
            endRow,
            concurrency,
            skipExisting
        };

        try {
            const res = await fetchApi('/api/ai/prompt-profiles', {
                method: 'POST',
                body: JSON.stringify({
                    name: newProfileData.name,
                    prompt: JSON.stringify(newProfileData)
                })
            });

            if (res && res.success && res.data) {
                const savedObj = { id: res.data.id, ...newProfileData };
                const updated = [savedObj, ...savedProfiles.filter(p => p.name !== savedObj.name)];
                setSavedProfiles(updated);
                setSelectedSavedProfileId(savedObj.id);
                alert(`✅ Đã lưu Cấu Hình Lệnh "${savedObj.name}" vào Database Server thành công!`);
            }
        } catch (e) {
            console.error('Error saving profile:', e);
            alert('❌ Không thể lưu Cấu Hình Lệnh vào Server Database.');
        }
    };

    // Delete selected saved command profile
    const handleDeleteSavedProfile = async () => {
        if (!selectedSavedProfileId) return;
        const p = savedProfiles.find(item => item.id === selectedSavedProfileId || String(item.id) === String(selectedSavedProfileId));
        if (!p) return;
        if (confirm(`Bạn có chắc chắn muốn xóa Profile Lệnh "${p.name}" khỏi Database Server?`)) {
            try {
                await fetchApi(`/api/ai/prompt-profiles/${selectedSavedProfileId}`, { method: 'DELETE' });
                const updated = savedProfiles.filter(item => item.id !== selectedSavedProfileId && String(item.id) !== String(selectedSavedProfileId));
                setSavedProfiles(updated);
                setSelectedSavedProfileId('');
            } catch (e) {
                console.error(e);
                alert('❌ Không thể xóa Profile Lệnh khỏi Server Database.');
            }
        }
    };

    // Status Matrix Jobs & Inspection
    const [jobs, setJobs] = useState([]);
    const [selectedJobDetail, setSelectedJobDetail] = useState(null);

    const abortRef = useRef(false);

    // Initial default variables: 1 clean example row
    const [variables, setVariables] = useState([
        { id: 1, label: 'Tên sản phẩm', col: 'A', name: 'ten-san-pham' }
    ]);

    // Sync selected tab with props
    useEffect(() => {
        if (activeTabName && !selectedTab) {
            setSelectedTab(activeTabName);
        } else if (sheets.length > 0 && !selectedTab) {
            setSelectedTab(sheets[0].name);
        }
    }, [activeTabName, sheets, selectedTab]);

    // Handle preset change
    const handlePresetChange = (type) => {
        setPresetType(type);
        setPromptText(PRESET_PROMPTS[type] || PRESET_PROMPTS.custom);
    };

    const currentSheetObj = sheets.find(s => s.name === selectedTab) || sheets[0];
    const sheetData = currentSheetObj?.data || [];
    const maxCols = sheetData.reduce((max, r) => Math.max(max, Array.isArray(r) ? r.length : 0), 0);

    const getColLetter = (idx) => {
        let temp, letter = '';
        let colIndex = idx;
        while (colIndex >= 0) {
            temp = colIndex % 26;
            letter = String.fromCharCode(temp + 65) + letter;
            colIndex = Math.floor(colIndex / 26) - 1;
        }
        return letter;
    };

    const isTechnicalSelector = (str) => {
        if (!str || typeof str !== 'string') return false;
        const s = str.trim();
        if (!s) return false;
        if (s.includes('nth-child') || s.includes('nth-of-type') || s.startsWith('//') || s.startsWith('/html') || s.startsWith('/body')) return true;
        if (s.startsWith('#') || s.startsWith('.') || s.startsWith('a.') || s.startsWith('div.') || s.startsWith('span.') || s.startsWith('p.')) return true;
        if (s.includes(' > ') || s.includes(' + ') || s.includes('~')) return true;
        if (s.startsWith('<') && s.endsWith('>')) return true;
        if (/^\d+$/.test(s) && (s === '246' || s === '245' || s === '247')) return true;
        return false;
    };

    const getCleanHeaderRowIndex = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return 0;
        for (let r = 0; r < Math.min(rows.length, 5); r++) {
            const row = rows[r];
            if (!Array.isArray(row)) continue;
            const vals = row.map(v => v !== null && v !== undefined ? String(v).trim() : '').filter(Boolean);
            if (vals.length === 0) continue;
            const hasSelector = vals.some(v => isTechnicalSelector(v));
            if (!hasSelector) return r;
        }
        return 0;
    };

    const getHeaderTitleForCol = (cIdx) => {
        if (sheetData && sheetData.length > 0) {
            const hIdx = getCleanHeaderRowIndex(sheetData);
            const headerRow = sheetData[hIdx];
            if (Array.isArray(headerRow)) {
                const val = headerRow[cIdx];
                if (val && String(val).trim()) {
                    const str = String(val).trim();
                    if (isTechnicalSelector(str)) return '';
                    return str.length > 25 ? str.slice(0, 22) + '...' : str;
                }
            }
        }
        return '';
    };

    // Auto-map variables from Header row manually
    const handleAutoMapFromHeader = () => {
        if (!sheetData.length) {
            alert('Tab này chưa có dữ liệu để ánh xạ từ Header.');
            return;
        }
        const hIdx = getCleanHeaderRowIndex(sheetData);
        const headerRow = sheetData[hIdx] || [];
        const newVars = [];
        headerRow.forEach((cellVal, idx) => {
            if (!cellVal || String(cellVal).trim() === '') return;
            const colLetter = getColLetter(idx);
            const labelText = String(cellVal).trim();
            if (isTechnicalSelector(labelText)) return;
            const slugName = cleanHeaderToSlug(labelText, colLetter);
            newVars.push({
                id: Date.now() + idx,
                label: labelText,
                col: colLetter,
                name: slugName
            });
        });
        if (newVars.length > 0) {
            setVariables(newVars);
        } else {
            alert('Chưa có tiêu đề cột hợp lệ để tự động ánh xạ.');
        }
    };

    const handleAddVariable = () => {
        const nextColLetter = getColLetter(Math.min(maxCols - 1, variables.length));
        setVariables(prev => [
            ...prev,
            { id: Date.now(), label: '', col: nextColLetter, name: '' }
        ]);
    };

    const handleUpdateVariable = (id, fields) => {
        setVariables(prev => prev.map(v => v.id === id ? { ...v, ...fields } : v));
    };

    const handleRemoveVariable = (id) => {
        setVariables(prev => prev.filter(v => v.id !== id));
    };

    // Format prompt template with custom variables & column tags for specific row
    const formatPromptForRow = (template, rowArray) => {
        if (!template || !Array.isArray(rowArray)) return '';
        let processed = template;

        // 1. Substitute custom mapped variables: {ten_san_pham}, {thong_so}...
        variables.forEach(v => {
            if (!v.name) return;
            const colIndex = colToIdx(v.col);
            const val = rowArray[colIndex] !== undefined && rowArray[colIndex] !== null ? String(rowArray[colIndex]) : '';
            processed = processed.replaceAll(`{${v.name}}`, val);
        });

        // 2. Substitute column tags: {{A}}, {{B}}, {{C}}...
        processed = processed.replace(/\{\{([A-Z]+)\}\}/g, (match, p1) => {
            let colIndex = colToIdx(p1);
            return rowArray[colIndex] !== undefined && rowArray[colIndex] !== null ? String(rowArray[colIndex]) : '';
        });

        // 3. Fallback for {noi-dung}
        if (processed.includes('{noi-dung}')) {
            const rowContent = rowArray.map((cell, idx) => `[Cột ${getColLetter(idx)}]: ${cell || ''}`).join('\n');
            processed = processed.replace('{noi-dung}', rowContent);
        }
        return processed;
    };

    // Test run 1 sample row
    const handleTestRun = async () => {
        if (!sheetData.length) {
            alert('Tab này chưa có dữ liệu.');
            return;
        }
        setTesting(true);
        setTestResult('');
        try {
            const sampleRow = sheetData[startRow ? Math.max(0, parseInt(startRow) - 1) : 0] || sheetData[0];
            const finalPrompt = formatPromptForRow(promptText, sampleRow);

            const res = await fetchApi('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({ message: finalPrompt })
            });

            if (res?.content) {
                setTestResult(cleanAiArtifactTags(res.content));
            } else {
                setTestResult('Không nhận được phản hồi từ AI.');
            }
        } catch (err) {
            setTestResult(`Lỗi: ${err.message || 'Không thể kết nối dịch vụ AI'}`);
        } finally {
            setTesting(false);
        }
    };

    // Start Batch Multi-Thread AI Execution
    const handleStartBatchAI = (onlyFailed = false) => {
        if (!sheetData.length) {
            alert('Tab này chưa có dữ liệu để chạy AI.');
            return;
        }

        abortRef.current = false;
        const sIdx = Math.max(1, parseInt(startRow) || 1) - 1;
        const eIdx = endRow ? Math.min(sheetData.length, parseInt(endRow)) : sheetData.length;
        
        let initialJobs = [];
        if (onlyFailed && jobs.length > 0) {
            // Re-run ONLY failed jobs
            initialJobs = jobs.filter(j => j.status === 'error').map(j => ({ ...j, status: 'pending', error: '' }));
            if (initialJobs.length === 0) {
                alert('Không có hàng nào bị lỗi để thử lại.');
                return;
            }
        } else {
            // New Full Batch Run
            for (let r = sIdx; r < eIdx; r++) {
                initialJobs.push({
                    rowIdx: r,
                    rowNum: r + 1,
                    status: 'pending',
                    result: '',
                    error: ''
                });
            }
        }

        if (initialJobs.length === 0) {
            alert('Phạm vi hàng chọn không hợp lệ.');
            return;
        }

        setJobs(initialJobs);

        setAiState(prev => ({
            ...prev,
            isRunning: true,
            tabName: selectedTab,
            targetColIdx,
            startRow: sIdx + 1,
            endRow: eIdx,
            totalRows: initialJobs.length,
            completedRows: 0,
            errorCount: 0,
            statusText: `Đang chạy song song ${concurrency} luồng cho ${initialJobs.length} hàng...`,
            logs: [`🚀 Khởi tạo tác vụ AI (${concurrency} luồng song song) cho ${initialJobs.length} hàng...`]
        }));

        try {
            const runnerObj = {
                isRunning: true,
                isPaused: false,
                activeProfileName: profileName || 'Profile',
                activeTabName: selectedTab || 'Sheet1',
                activeTaskName: promptText ? (promptText.slice(0, 30) + (promptText.length > 30 ? '...' : '')) : 'Tác vụ AI Modal',
                totalRows: initialJobs.length,
                completedCount: 0,
                pendingCount: initialJobs.length,
                errorCount: 0,
                skipCount: 0,
                currentProgressPercent: 0
            };
            localStorage.setItem('ai_runner_state', JSON.stringify(runnerObj));
            window.dispatchEvent(new Event('ai_runner_update'));
        } catch (e) {}

        // Run multi-threaded parallel batch execution
        runMultiThreadLoop(selectedTab, targetColIdx, initialJobs, promptText, skipExisting, concurrency);
    };

    // Parallel Continuous Queue Worker Pool Engine
    const runMultiThreadLoop = async (tabName, targetCol, jobList, templatePrompt, skipIfExist, workerThreads) => {
        const activeSheet = sheets.find(s => s.name === tabName);
        if (!activeSheet || !activeSheet.data) return;

        let workingData = activeSheet.data.map(r => Array.isArray(r) ? [...r] : []);
        let processedCount = 0;
        let errorsCount = 0;
        let skippedCount = 0;

        const syncRunnerProgress = (done, errs, skips, isRunning = true) => {
            try {
                const total = jobList.length || 1;
                const totalDone = done;
                const percent = Math.min(100, Math.round((totalDone / total) * 100));
                const runnerObj = {
                    isRunning,
                    isPaused: false,
                    activeProfileName: profileName || 'Profile',
                    activeTabName: tabName || selectedTab || 'Sheet1',
                    activeTaskName: templatePrompt ? (templatePrompt.slice(0, 30) + (templatePrompt.length > 30 ? '...' : '')) : 'Tác vụ AI Modal',
                    totalRows: total,
                    completedCount: Math.max(0, done - errs - skips),
                    pendingCount: Math.max(0, total - totalDone),
                    errorCount: errs,
                    skipCount: skips,
                    currentProgressPercent: percent
                };
                localStorage.setItem('ai_runner_state', JSON.stringify(runnerObj));
                window.dispatchEvent(new Event('ai_runner_update'));
            } catch (e) {}
        };

        // Pending Jobs Queue
        const pendingQueue = [...jobList];

        // Worker Task execution loop
        const runWorkerTask = async () => {
            while (pendingQueue.length > 0 && !abortRef.current) {
                const job = pendingQueue.shift();
                if (!job) break;

                // Mark current job as 'running'
                setJobs(prev => prev.map(j => j.rowNum === job.rowNum ? { ...j, status: 'running' } : j));

                const currentRow = workingData[job.rowIdx] || [];
                const existingVal = currentRow[targetCol];

                // Skip existing content
                if (skipIfExist && existingVal && String(existingVal).trim() !== '') {
                    job.status = 'skipped';
                    job.result = existingVal;
                    skippedCount++;
                    processedCount++;
                    syncRunnerProgress(processedCount, errorsCount, skippedCount, true);
                    setJobs(prev => prev.map(j => j.rowNum === job.rowNum ? { ...job } : j));
                    setAiState(p => ({
                        ...p,
                        completedRows: processedCount,
                        statusText: `Đã xử lý ${processedCount}/${jobList.length} hàng...`
                    }));
                    continue; // Worker immediately pulls next job from queue!
                }

                const promptForThisRow = formatPromptForRow(templatePrompt, currentRow);
                const isTableTask = /bảng|table|dịch|thông số|giao diện|html|spec/i.test(templatePrompt || promptForThisRow || '');

                try {
                    let rowAttempts = 0;
                    const maxRowAttempts = 3;
                    let cleanedAiContent = '';
                    let lastErrorMsg = '';

                while (rowAttempts < maxRowAttempts && !abortRef.current) {
                    rowAttempts++;
                    try {
                        const res = await fetchApi('/api/ai/chat', {
                            method: 'POST',
                            body: JSON.stringify({ message: promptForThisRow })
                        });

                        if (res?.content) {
                            let rawContent = res.content.trim();
                            let cleaned = cleanAiArtifactTags(rawContent);

                            if (isTableTask) {
                                const isValid = isValidHtmlTableStructure(cleaned);
                                if (!isValid) {
                                    if (rowAttempts < maxRowAttempts) {
                                        setAiState(p => ({
                                            ...p,
                                            logs: [`⚠️ Hàng ${job.rowNum}: Bảng HTML lỗi cấu trúc/trộn Markdown, đang tự động dịch lại (Lần ${rowAttempts}/${maxRowAttempts})...`, ...p.logs.slice(0, 50)]
                                        }));
                                        await new Promise(r => setTimeout(r, 1200));
                                        continue; // Rerun AI translation for current row!
                                    } else {
                                        cleaned = convertMarkdownTableToHtml(cleaned);
                                    }
                                }
                            }
                            cleanedAiContent = cleaned;
                            lastErrorMsg = '';
                            break;
                        } else {
                            lastErrorMsg = 'AI không trả về kết quả';
                        }
                    } catch (err) {
                        lastErrorMsg = err.message || 'Lỗi mạng khi gọi AI';
                        if (rowAttempts < maxRowAttempts) await new Promise(r => setTimeout(r, 1000));
                    }
                }

                if (cleanedAiContent) {
                    if (!workingData[job.rowIdx]) workingData[job.rowIdx] = [];
                    workingData[job.rowIdx][targetCol] = cleanedAiContent;

                    job.status = 'done';
                    job.result = cleanedAiContent;
                    processedCount++;
                    syncRunnerProgress(processedCount, errorsCount, skippedCount, true);

                        // Immediate Sheet Cell Update & Auto-Save
                        const updatedSheets = sheets.map(s => s.name === tabName ? { ...s, data: workingData } : s);
                        if (onUpdateSheets) onUpdateSheets(updatedSheets);

                        try {
                            await fetchApi('/api/products/profile-sheet', {
                                method: 'POST',
                                body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
                            });
                        } catch (e) {
                            console.error('Failed to auto-save:', e);
                        }

                        setAiState(p => ({
                            ...p,
                            completedRows: processedCount,
                            statusText: `Đã xử lý ${processedCount}/${jobList.length} hàng...`,
                            logs: [`✅ Hàng ${job.rowNum}: ${cleanedAiContent.substring(0, 35)}...`, ...p.logs.slice(0, 50)]
                        }));
                    } else {
                        job.status = 'error';
                        job.error = 'AI không trả về kết quả';
                        errorsCount++;
                        processedCount++;
                        syncRunnerProgress(processedCount, errorsCount, skippedCount, true);
                        setAiState(p => ({
                            ...p,
                            completedRows: processedCount,
                            errorCount: errorsCount,
                            logs: [`❌ Hàng ${job.rowNum}: AI trả về rỗng`, ...p.logs.slice(0, 50)]
                        }));
                    }
                } catch (err) {
                    job.status = 'error';
                    job.error = err.message || 'Lỗi kết nối';
                    errorsCount++;
                    processedCount++;
                    syncRunnerProgress(processedCount, errorsCount, skippedCount, true);
                    setAiState(p => ({
                        ...p,
                        completedRows: processedCount,
                        errorCount: errorsCount,
                        logs: [`❌ Hàng ${job.rowNum}: Lỗi - ${err.message}`, ...p.logs.slice(0, 50)]
                    }));
                }

                setJobs(prev => prev.map(j => j.rowNum === job.rowNum ? { ...job } : j));
            }
        };

        // Spawn N worker threads simultaneously
        const numThreads = Math.min(workerThreads, jobList.length);
        const workerThreadsList = Array.from({ length: numThreads }).map(() => runWorkerTask());

        await Promise.all(workerThreadsList);

        const isAborted = abortRef.current;
        setAiState(p => ({
            ...p,
            isRunning: false,
            statusText: isAborted ? '⏹️ Đã dừng tiến trình AI' : `🎉 Hoàn tất xử lý ${processedCount} hàng!`,
            logs: [isAborted ? '⏹️ Đã dừng tiến trình AI' : `🎉 Tác vụ AI đã hoàn tất thành công!`, ...p.logs]
        }));

        syncRunnerProgress(processedCount, errorsCount, skippedCount, false);

        if (!isAborted) {
            playCompletionChime();

            if (typeof window !== 'undefined' && window.Notification && Notification.permission === 'granted') {
                new Notification('AI Trợ Lý Hoàn Thành', {
                    body: `Đã hoàn thành xử lý AI cho ${processedCount} hàng dữ liệu!`,
                    icon: '/favicon.ico'
                });
            }
        }
    };

    const handleStopAI = () => {
        abortRef.current = true;
        setAiState(p => ({ ...p, isRunning: false }));
        try {
            const runnerObj = {
                isRunning: false,
                isPaused: false,
                activeProfileName: profileName || 'Profile',
                activeTabName: selectedTab || 'Sheet1',
                activeTaskName: 'Tác vụ AI Modal',
                totalRows: 0,
                completedCount: 0,
                pendingCount: 0,
                errorCount: 0,
                skipCount: 0,
                currentProgressPercent: 0
            };
            localStorage.setItem('ai_runner_state', JSON.stringify(runnerObj));
            window.dispatchEvent(new Event('ai_runner_update'));
        } catch (e) {}
    };

    if (!isOpen) return null;

    const stats = {
        total: jobs.length,
        done: jobs.filter(j => j.status === 'done').length,
        skipped: jobs.filter(j => j.status === 'skipped').length,
        running: jobs.filter(j => j.status === 'running').length,
        error: jobs.filter(j => j.status === 'error').length,
        pending: jobs.filter(j => j.status === 'pending').length,
    };

    return (
        <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ width: 960, maxWidth: '96vw', maxHeight: '94vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: 'var(--radius-lg)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)', background: 'var(--bg-card)', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                
                {/* Header Bar */}
                <div style={{ padding: '16px 24px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <Bot size={22} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                AI Trợ Lý Tự Động — Profile {profileName}
                                <span style={{ fontSize: 11, background: '#fff7ed', border: '1px solid #ffedd5', color: 'var(--accent)', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Multi-Thread Engine</span>
                            </h3>
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                                Tự động tạo Sapo, SEO Meta Title, Dịch thông số kỹ thuật và xử lý hàng loạt theo câu lệnh song song.
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={22} />
                    </button>
                </div>

                {/* Main Content Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    
                    {/* Saved Command Profiles Preset Manager Bar */}
                    <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 280 }}>
                            <Bookmark size={18} style={{ color: 'var(--accent)' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                📁 Cấu hình Prompt Đã Lưu:
                            </span>
                            <select
                                value={selectedSavedProfileId}
                                onChange={e => handleSelectSavedProfile(e.target.value)}
                                style={{ flex: 1, padding: '7px 11px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600 }}
                            >
                                <option value="">-- Chọn Cấu hình Prompt Đã Lưu --</option>
                                {savedProfiles.map(p => (
                                    <option key={p.id} value={p.id}>
                                        ⭐ {p.name} ({p.variables?.length || 0} biến - Cột {getColLetter(p.targetColIdx)})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={handleSaveCurrentProfile}
                                style={{ fontSize: 12.5, padding: '6px 14px', background: 'var(--gradient-primary)', color: 'white', border: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                            >
                                <Save size={15} /> Lưu Cấu Hình Lệnh Hiện Tại
                            </button>

                            {selectedSavedProfileId && (
                                <button
                                    type="button"
                                    onClick={handleDeleteSavedProfile}
                                    style={{ fontSize: 12, padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                    title="Xóa Profile Lệnh Này"
                                >
                                    <Trash2 size={14} /> Xóa Profile
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Preset Action Selector */}
                    <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                            1. Chọn Mẫu Tác Vụ AI:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => handlePresetChange('sapo')}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: 'var(--radius-md)',
                                    border: `1.5px solid ${presetType === 'sapo' ? 'var(--accent)' : 'var(--border-color)'}`,
                                    background: presetType === 'sapo' ? '#fff7ed' : 'var(--bg-secondary)',
                                    color: presetType === 'sapo' ? 'var(--accent)' : 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10
                                }}
                            >
                                <PenLine size={18} />
                                <div>
                                    <div>Viết Sapo Giới Thiệu</div>
                                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>2-3 câu lôi cuốn</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handlePresetChange('meta')}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: 'var(--radius-md)',
                                    border: `1.5px solid ${presetType === 'meta' ? 'var(--accent)' : 'var(--border-color)'}`,
                                    background: presetType === 'meta' ? '#fff7ed' : 'var(--bg-secondary)',
                                    color: presetType === 'meta' ? 'var(--accent)' : 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10
                                }}
                            >
                                <FileText size={18} />
                                <div>
                                    <div>Tối Ưu SEO Meta</div>
                                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>Title & Description</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handlePresetChange('dich')}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: 'var(--radius-md)',
                                    border: `1.5px solid ${presetType === 'dich' ? 'var(--accent)' : 'var(--border-color)'}`,
                                    background: presetType === 'dich' ? '#fff7ed' : 'var(--bg-secondary)',
                                    color: presetType === 'dich' ? 'var(--accent)' : 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10
                                }}
                            >
                                <Languages size={18} />
                                <div>
                                    <div>Dịch Bảng Thông Số</div>
                                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>Sang tiếng Việt tự nhiên</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handlePresetChange('custom')}
                                style={{
                                    padding: '12px 14px',
                                    borderRadius: 'var(--radius-md)',
                                    border: `1.5px solid ${presetType === 'custom' ? 'var(--accent)' : 'var(--border-color)'}`,
                                    background: presetType === 'custom' ? '#fff7ed' : 'var(--bg-secondary)',
                                    color: presetType === 'custom' ? 'var(--accent)' : 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10
                                }}
                            >
                                <Sparkles size={18} />
                                <div>
                                    <div>Custom Prompt</div>
                                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>Tùy chỉnh lệnh cá nhân</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Sub-Tab, Output Target & Concurrency Threads Selector */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: 16 }}>
                        <div>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                Chọn Sub-Tab dữ liệu:
                            </label>
                            <select
                                value={selectedTab}
                                onChange={e => setSelectedTab(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            >
                                {sheets.map(s => (
                                    <option key={s.name} value={s.name}>
                                        📄 Tab '{s.name}' ({s.data?.length || 0} hàng)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                Cột Đích (Nơi lưu kết quả AI):
                            </label>
                            <select
                                value={targetColIdx}
                                onChange={e => setTargetColIdx(parseInt(e.target.value))}
                                style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            >
                                {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => {
                                    const letter = getColLetter(cIdx);
                                    const headerTitle = getHeaderTitleForCol(cIdx);
                                    return (
                                        <option key={cIdx} value={cIdx}>
                                            Cột {letter} {headerTitle ? `— [${headerTitle}]` : ''}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, whiteSpace: 'nowrap' }}>
                                ⚡ Số Luồng Song Song:
                            </label>
                            <select
                                value={concurrency}
                                onChange={e => setConcurrency(parseInt(e.target.value))}
                                style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: '#fff7ed', color: 'var(--accent)', fontWeight: 700 }}
                            >
                                <option value={1}>1 Luồng (Đơn luồng)</option>
                                <option value={2}>2 Luồng song song</option>
                                <option value={3}>3 Luồng (Khuyên dùng)</option>
                                <option value={5}>5 Luồng song song</option>
                                <option value={10}>10 Luồng song song</option>
                                <option value={15}>15 Luồng song song</option>
                                <option value={20}>20 Luồng song song</option>
                                <option value={30}>30 Luồng (Tốc độ cao)</option>
                                <option value={40}>40 Luồng song song</option>
                                <option value={50}>50 Luồng (Siêu tốc)</option>
                            </select>
                        </div>
                    </div>

                    {/* Section 2: Tạo Biến & Ánh Xạ Cột (Variable Mapping & Auto-Map) */}
                    <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Wand2 size={16} style={{ color: 'var(--accent)' }} /> 2. Tạo Biến & Ánh Xạ Cột (Variable Mapping):
                                </span>
                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    Định nghĩa tên biến (Ví dụ: <code>{`{ten_san_pham}`}</code>, <code>{`{thong_so}`}</code>) tương ứng với từng cột dữ liệu.
                                </span>
                            </div>

                            <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={handleAutoMapFromHeader}
                                style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-card)', color: 'var(--accent)', borderColor: '#ffedd5', fontWeight: 600 }}
                            >
                                ⚡ Tự động map từ Header (Hàng 1)
                            </button>
                        </div>

                        {/* Variables List Table Matching Image 2 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* Table Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 130px 1fr 34px', gap: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px 6px 4px', borderBottom: '1px solid var(--border-color)' }}>
                                <div>TÊN BIẾN</div>
                                <div>CỘT THAM CHIẾU</div>
                                <div>BIẾN INPUT</div>
                                <div></div>
                            </div>

                            {/* Table Rows */}
                            {variables.map((v, idx) => (
                                <div key={v.id ? `mvar-${v.id}-${idx}` : `mvar-idx-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 130px 1fr 34px', gap: 10, alignItems: 'center' }}>
                                    {/* TÊN BIẾN (Title / Header Label) */}
                                    <input
                                        type="text"
                                        value={v.label || v.name}
                                        onChange={e => {
                                            const newLabel = e.target.value;
                                            const autoSlug = cleanHeaderToSlug(newLabel, v.col);
                                            handleUpdateVariable(v.id, { label: newLabel, name: autoSlug });
                                        }}
                                        placeholder="Tên biến"
                                        style={{ padding: '6px 10px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                    />

                                    {/* CỘT THAM CHIẾU (Col letter + Header title dropdown) */}
                                    <select
                                        value={v.col}
                                        onChange={e => {
                                            const newCol = e.target.value;
                                            const cIdx = colToIdx(newCol);
                                            const hTitle = getHeaderTitleForCol(cIdx);
                                            const updates = { col: newCol };
                                            if (hTitle && (!v.label || v.label === v.col)) {
                                                updates.label = hTitle;
                                                updates.name = cleanHeaderToSlug(hTitle, newCol);
                                            }
                                            handleUpdateVariable(v.id, updates);
                                        }}
                                        style={{ padding: '6px 8px', fontSize: 12, fontWeight: 700, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', textOverflow: 'ellipsis' }}
                                    >
                                        {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => {
                                            const letter = getColLetter(cIdx);
                                            const headerTitle = getHeaderTitleForCol(cIdx);
                                            return (
                                                <option key={letter} value={letter}>
                                                    {letter} {headerTitle ? `(${headerTitle})` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>

                                    {/* BIẾN INPUT ({slug-var}) */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{`{`}</span>
                                        <input
                                            type="text"
                                            value={v.name}
                                            onChange={e => handleUpdateVariable(v.id, { name: e.target.value })}
                                            placeholder="var-name"
                                            style={{ width: '100%', padding: '6px 8px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--radius-sm)', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontFamily: 'monospace' }}
                                        />
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{`}`}</span>
                                    </div>

                                    {/* Delete Button [ X ] */}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveVariable(v.id)}
                                        style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Xóa biến này"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={handleAddVariable}
                            style={{ marginTop: 10, padding: '4px 10px', fontSize: 12, background: 'none', border: '1px dashed var(--border-color)', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                            <Plus size={14} /> Thêm biến tùy chỉnh
                        </button>
                    </div>

                    {/* Section 3: Prompt Template Input */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                3. Câu Lệnh AI (Prompt Template):
                            </label>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Bấm để chèn nhanh biến vào Prompt:</span>
                        </div>
                        
                        {/* Dynamic Column Tag & Variable Pills */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                            {/* Custom Mapped Variable Pills */}
                            {variables.map((v, idx) => (
                                v.name && (
                                    <button
                                        key={v.id ? `mtag-${v.id}-${idx}` : `mtag-idx-${idx}`}
                                        type="button"
                                        onClick={() => setPromptText(prev => prev + ` {${v.name}}`)}
                                        style={{ padding: '3px 8px', fontSize: 11.5, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        + {`{${v.name}}`} (Cột {v.col})
                                    </button>
                                )
                            ))}

                            {/* Standard Column Tag Pills */}
                            {Array.from({ length: Math.min(maxCols, 8) }).map((_, cIdx) => {
                                const letter = getColLetter(cIdx);
                                return (
                                    <button
                                        key={letter}
                                        type="button"
                                        onClick={() => setPromptText(prev => prev + ` {{${letter}}}`)}
                                        style={{ padding: '3px 8px', fontSize: 11.5, background: '#fff7ed', border: '1px solid #ffedd5', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        + {`{{${letter}}}`}
                                    </button>
                                );
                            })}
                        </div>

                        <textarea
                            value={promptText}
                            onChange={e => setPromptText(e.target.value)}
                            rows={5}
                            style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'monospace', outline: 'none' }}
                        />
                    </div>

                    {/* Row Range & Options */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                            <span>Từ hàng:</span>
                            <input
                                type="number"
                                min={1}
                                value={startRow}
                                onChange={e => setStartRow(e.target.value)}
                                style={{ width: 70, padding: '4px 8px', fontSize: 12.5, borderRadius: 4, border: '1px solid var(--border-color)' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                            <span>Đến hàng:</span>
                            <input
                                type="number"
                                placeholder="Hàng cuối"
                                value={endRow}
                                onChange={e => setEndRow(e.target.value)}
                                style={{ width: 90, padding: '4px 8px', fontSize: 12.5, borderRadius: 4, border: '1px solid var(--border-color)' }}
                            />
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                checked={skipExisting}
                                onChange={e => setSkipExisting(e.target.checked)}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            <span>Bỏ qua các hàng đã có dữ liệu ở cột đích</span>
                        </label>
                    </div>

                    {/* Section 4: Visual Status Grid Tiles Matrix (Ma Trận Ô Vuông Theo Dõi Tiến Độ) */}
                    {jobs.length > 0 && (
                        <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Layers size={16} style={{ color: 'var(--accent)' }} /> 
                                    Ma Trận Ô Theo Dõi Hàng ({stats.done + stats.skipped}/{stats.total} xong)
                                </div>

                                {/* Status Legend Indicators */}
                                <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 600 }}>
                                    <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }} /> {stats.done} Xong</span>
                                    <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} /> {stats.skipped} Bỏ qua</span>
                                    <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} /> {stats.running} Đang chạy</span>
                                    <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} /> {stats.error} Lỗi</span>
                                    <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#cbd5e1' }} /> {stats.pending} Chờ</span>
                                </div>
                            </div>

                            {/* Status Grid Tiles Matrix Container */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(32px, 1fr))', gap: 6, maxHeight: 150, overflowY: 'auto', padding: 8, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                {jobs.map((job) => {
                                    const bgColors = {
                                        pending: '#cbd5e1',
                                        running: '#3b82f6',
                                        done: '#10b981',
                                        skipped: '#f59e0b',
                                        error: '#ef4444'
                                    };
                                    const isSelected = selectedJobDetail?.rowNum === job.rowNum;

                                    return (
                                        <div
                                            key={job.rowNum}
                                            onClick={() => setSelectedJobDetail(job)}
                                            title={`Hàng ${job.rowNum}: ${job.status.toUpperCase()} ${job.error ? `- ${job.error}` : ''}`}
                                            style={{
                                                height: 30,
                                                borderRadius: 4,
                                                background: bgColors[job.status] || '#cbd5e1',
                                                color: 'white',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                boxShadow: job.status === 'running' ? '0 0 10px #3b82f6' : 'none',
                                                border: isSelected ? '2px solid #000' : 'none',
                                                transform: isSelected ? 'scale(1.1)' : 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            {job.rowNum}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Inspected Job Detail Box */}
                            {selectedJobDetail && (
                                <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, marginBottom: 4 }}>
                                        <span style={{ color: '#0f172a' }}>Chi tiết Hàng {selectedJobDetail.rowNum} ({selectedJobDetail.status.toUpperCase()})</span>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            {selectedJobDetail.result && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigator.clipboard.writeText(selectedJobDetail.result)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                                                >
                                                    <Copy size={12} /> Sao chép
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setSelectedJobDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={14} /></button>
                                        </div>
                                    </div>
                                    {selectedJobDetail.error ? (
                                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Lỗi: {selectedJobDetail.error}</span>
                                    ) : selectedJobDetail.result ? (
                                        <div style={{ color: '#15803d', whiteSpace: 'pre-wrap', maxHeight: 80, overflowY: 'auto' }}>
                                            {selectedJobDetail.result}
                                        </div>
                                    ) : (
                                        <span style={{ color: '#64748b' }}>Chưa có kết quả (Đang chờ hoặc đang xử lý)</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Test Run Output Box with 1-Click Copy */}
                    {testResult && (
                        <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', fontSize: 12.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <strong style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CheckCircle2 size={16} /> Kết quả mẫu thử nghiệm AI (Hàng {startRow || 1}):
                                </strong>
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(testResult)}
                                    style={{ padding: '3px 10px', fontSize: 11.5, background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', borderRadius: 4, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                    <Copy size={12} /> Sao chép kết quả mẫu
                                </button>
                            </div>
                            <div style={{ color: '#15803d', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', lineHeight: 1.5 }}>
                                {testResult}
                            </div>
                        </div>
                    )}

                    {/* Running Progress & Logs inside Modal */}
                    {aiState.isRunning && (
                        <div style={{ padding: '14px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Loader2 className="spin" size={16} /> {aiState.statusText}
                                </span>
                                <span style={{ fontWeight: 600, color: '#1e40af', fontSize: 12.5 }}>
                                    {aiState.completedRows} / {aiState.totalRows} hàng ({Math.round((aiState.completedRows / Math.max(aiState.totalRows, 1)) * 100)}%)
                                </span>
                            </div>

                            {/* Progress bar */}
                            <div style={{ width: '100%', height: 8, background: '#dbeafe', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                                <div
                                    style={{
                                        width: `${Math.min(100, Math.round((aiState.completedRows / Math.max(aiState.totalRows, 1)) * 100))}%`,
                                        height: '100%',
                                        background: 'var(--gradient-primary)',
                                        transition: 'width 0.3s ease'
                                    }}
                                />
                            </div>

                            {/* Live log viewer */}
                            <div style={{ maxHeight: 100, overflowY: 'auto', background: '#1e293b', color: '#f8fafc', padding: 8, borderRadius: 6, fontSize: 11.5, fontFamily: 'monospace' }}>
                                {aiState.logs.map((log, idx) => (
                                    <div key={idx}>{log}</div>
                                ))}
                            </div>
                        </div>
                    )}

                </div>

                {/* Modal Footer Controls */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={handleTestRun}
                            disabled={testing || aiState.isRunning}
                            style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            {testing ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} style={{ color: 'var(--accent)' }} />}
                            Chạy thử 1 hàng
                        </button>

                        {/* Retry Failed Rows Button */}
                        {stats.error > 0 && !aiState.isRunning && (
                            <button
                                type="button"
                                onClick={() => handleStartBatchAI(true)}
                                style={{ padding: '6px 12px', fontSize: 12.5, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <RotateCcw size={14} /> Thử lại {stats.error} hàng lỗi
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Đóng cửa sổ (Vẫn chạy ngầm)
                        </button>

                        {aiState.isRunning ? (
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handleStopAI}
                                style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '8px 18px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                <Square size={15} /> ⏹️ Dừng tác vụ AI
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleStartBatchAI(false)}
                                style={{ background: 'var(--gradient-primary)', color: 'white', border: 'none', padding: '8px 20px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                <Play size={15} /> 🚀 Bắt đầu Chạy AI ({concurrency} Luồng)
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
