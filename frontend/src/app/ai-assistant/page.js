'use client';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import {
    Bot, Send, Trash2, Copy, Download, Languages, FileText,
    PenLine, ChevronDown, Loader2, X, Plus, Play, Square,
    RefreshCw, Save, Check, Zap, FileSpreadsheet, Settings,
    Info, User, AlertCircle, RotateCcw, Bell, CheckCircle2,
    Pause, Sliders, Layers, ArrowRight, Bookmark, Filter, ShieldCheck
} from 'lucide-react';

// ══════════════════════════════════════════════════════
//  CONSTANTS & DEFAULT PRESETS
// ══════════════════════════════════════════════════════
const DEFAULT_PRESET_PROMPTS = [
    {
        id: 'sapo',
        name: 'Viết SAPO Giới Thiệu Sản Phẩm',
        targetCol: 'D',
        variables: [
            { id: 'sapo-1', name: 'ten-sp', label: 'Tên SP', col: 'A' },
            { id: 'sapo-2', name: 'ma-sp', label: 'Mã SP', col: 'B' },
            { id: 'sapo-3', name: 'noi-dung', label: 'Nội Dung', col: 'C' }
        ],
        prompt: `Viết đoạn SAPO mở đầu bài viết (2-3 câu ngắn gọn, hấp dẫn, chuẩn SEO) cho sản phẩm dựa vào thông tin sau. Chỉ trả về nội dung SAPO, không kèm câu chào hay tiêu đề:

Tên sản phẩm: {ten-sp}
Thương hiệu / Mã: {ma-sp}
Thông số: {noi-dung}`
    },
    {
        id: 'dich',
        name: 'Dịch Bảng Thông Số Kỹ Thuật (Sang Tiếng Việt)',
        targetCol: 'C',
        variables: [
            { id: 'dich-1', name: 'noi-dung', label: 'Nội Dung', col: 'C' }
        ],
        prompt: `Dịch bảng thông số kỹ thuật sau sang tiếng Việt chuyên ngành tự nhiên. Giữ nguyên đơn vị đo lường và định dạng. Không thêm câu chào:

{noi-dung}`
    },
    {
        id: 'meta',
        name: 'Tạo Meta Title & Description SEO',
        targetCol: 'E',
        variables: [
            { id: 'meta-1', name: 'ten-sp', label: 'Tên SP', col: 'A' },
            { id: 'meta-2', name: 'ma-sp', label: 'Mã SP', col: 'B' }
        ],
        prompt: `Viết Meta Title (dưới 60 ký tự) và Meta Description (130-160 ký tự) chuẩn SEO tiếng Việt cho sản phẩm. Format output:
Title: [Nội dung title]
Description: [Nội dung description]

Thông tin:
Tên: {ten-sp}
Mã sản phẩm: {ma-sp}`
    }
];

function colToIdx(col) {
    if (!col) return 0;
    const c = (col || '').toUpperCase().trim();
    let r = 0;
    for (let i = 0; i < c.length; i++) r = r * 26 + c.charCodeAt(i) - 64;
    return Math.max(0, r - 1);
}

// Auto-convert Vietnamese input to a valid slug variable name (e.g. "Tên SP" → "ten-sp")
function toVarName(str) {
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
        .replace(/[^a-z0-9_-]/g, '');
}

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

function cleanAiOutput(text) {
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

// ── Web Audio Chime Sound (Plays a pleasant completion notification sound) ──
function playCompletionSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        // Note 1: A5 (880Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        gain1.gain.setValueAtTime(0.25, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.35);

        // Note 2: E6 (1318.5Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.12);
        osc2.stop(ctx.currentTime + 0.55);
    } catch (e) {
        console.warn('Audio chime error:', e);
    }
}

// ── Desktop Notification Helper ──
function sendDesktopNotification(title, body) {
    try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification(title, { body, icon: '/favicon.ico' });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, { body, icon: '/favicon.ico' });
                    }
                });
            }
        }
    } catch (e) {}
}

export default function AIAssistantPage() {
    const { user, hasPermission } = useAuth();
    
    // View tab mode: 'config' vs 'monitor'
    const [viewMode, setViewMode] = useState('config'); 

    // Profiles & Sheets state
    const [profiles, setProfiles] = useState([]);
    const [selectedProfileSlug, setSelectedProfileSlug] = useState('');
    const [availableSheets, setAvailableSheets] = useState([]);
    const [selectedSheetNames, setSelectedSheetNames] = useState([]);
    const [profileSheetsData, setProfileSheetsData] = useState([]);

    // Prompt & Preset Config State
    const [savedPromptProfiles, setSavedPromptProfiles] = useState([]);
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [newPresetNameInput, setNewPresetNameInput] = useState('');
    const [showSavePresetModal, setShowSavePresetModal] = useState(false);

    // Prompt, Task & Variables State
    const [taskPrompt, setTaskPrompt] = useState(DEFAULT_PRESET_PROMPTS[0].prompt);
    const [taskName, setTaskName] = useState(DEFAULT_PRESET_PROMPTS[0].name);
    const [targetCol, setTargetCol] = useState('D');
    const [startRow, setStartRow] = useState(1);
    const [endRow, setEndRow] = useState('');

    // Dynamic Variables (like AiAssistantModal)
    const [variables, setVariables] = useState([
        { id: 'init-1', name: 'ten-sp', label: 'Tên SP', col: 'A' },
        { id: 'init-2', name: 'ma-sp', label: 'Mã SP', col: 'B' },
        { id: 'init-3', name: 'noi-dung', label: 'Nội Dung', col: 'C' }
    ]);

    // Performance & Execution Parameters
    const [concurrency, setConcurrency] = useState(2); // 1, 2, 3, 5, 10
    const [delayMs, setDelayMs] = useState(1500);
    const [skipExisting, setSkipExisting] = useState(true);
    const [autoClean, setAutoClean] = useState(true);

    // Live Runner State
    const [runnerState, setRunnerStateInternal] = useState({
        isRunning: false,
        isPaused: false,
        activeProfileName: 'Chưa chọn',
        activeTabName: 'Chưa chọn',
        activeTaskName: 'Chưa có tác vụ',
        totalRows: 0,
        completedCount: 0,
        pendingCount: 0,
        errorCount: 0,
        skipCount: 0,
        failedItems: [], // Stores failed rows for retry
        logs: [],
        currentProgressPercent: 0
    });

    const setRunnerState = (updater) => {
        setRunnerStateInternal(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            try {
                localStorage.setItem('ai_runner_state', JSON.stringify(next));
            } catch (e) {}
            setTimeout(() => {
                try {
                    window.dispatchEvent(new Event('ai_runner_update'));
                } catch (e) {}
            }, 0);
            return next;
        });
    };

    const abortRef = useRef(false);
    const pauseRef = useRef(false);
    const promptTextareaRef = useRef(null);
    const [toasts, setToasts] = useState([]);

    const showToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(p => [...p, { id, message, type }]);
        setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
    };

    // Load initial profiles & saved prompt presets from localStorage
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const profData = await fetchApi('/api/products/profiles');
                if (profData?.profiles && profData.profiles.length > 0) {
                    setProfiles(profData.profiles);
                    const defaultSlug = profData.profiles[0].slug;
                    setSelectedProfileSlug(defaultSlug);
                    fetchProfileSheets(defaultSlug);
                }

                // Load saved prompt presets from localStorage
                const saved = localStorage.getItem('ai_prompt_saved_profiles');
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) setSavedPromptProfiles(parsed);
                    } catch (e) {}
                }
            } catch (err) {
                console.error('Failed to load profiles:', err);
            }
        };
        loadInitialData();
    }, []);

    // Fetch Sheets for selected profile
    const fetchProfileSheets = async (slug) => {
        if (!slug) return;
        try {
            const data = await fetchApi(`/api/products/profile-sheet?profile=${slug}`);
            if (data?.sheets && data.sheets.length > 0) {
                setAvailableSheets(data.sheets);
                setProfileSheetsData(data.sheets);
                setSelectedSheetNames(data.sheets.map(s => s.name));
            } else {
                setAvailableSheets([]);
                setProfileSheetsData([]);
                setSelectedSheetNames([]);
            }
        } catch (err) {
            console.error('Failed to fetch profile sheets:', err);
        }
    };

    const handleProfileChange = (slug) => {
        setSelectedProfileSlug(slug);
        fetchProfileSheets(slug);
    };

    // Variable operations
    const handleAddVariable = () => {
        const nextLetter = String.fromCharCode(65 + variables.length);
        const uniqueId = `var_${Date.now()}_${variables.length}_${Math.random().toString(36).substring(2, 7)}`;
        setVariables(prev => [
            ...prev,
            { id: uniqueId, name: `bien-${prev.length + 1}`, label: '', col: nextLetter }
        ]);
    };

    const handleRemoveVariable = (targetId, idx) => {
        setVariables(prev => prev.filter((v, i) => (v.id && targetId ? v.id !== targetId : i !== idx)));
    };

    const handleUpdateVariable = (targetId, idx, field, value) => {
        setVariables(prev => prev.map((v, i) => {
            const isMatch = (v.id && targetId) ? v.id === targetId : i === idx;
            return isMatch ? { ...v, [field]: value } : v;
        }));
    };

    // Update label AND auto-generate slug name in one setState call (avoids React batching issue)
    const handleLabelChange = (targetId, idx, label) => {
        const slug = toVarName(label);
        setVariables(prev => prev.map((v, i) => {
            const isMatch = (v.id && targetId) ? v.id === targetId : i === idx;
            return isMatch ? { ...v, label, name: slug || v.name } : v;
        }));
    };

    // Convert to slug when user finishes typing (onBlur)
    const handleBlurVariableName = (targetId, idx, value) => {
        const slug = toVarName(value);
        if (slug !== value) {
            setVariables(prev => prev.map((v, i) => {
                const isMatch = (v.id && targetId) ? v.id === targetId : i === idx;
                return isMatch ? { ...v, name: slug } : v;
            }));
        }
    };

    // Insert variable tag into prompt textarea
    const handleInsertTag = (tag) => {
        setTaskPrompt(prev => prev + ` ${tag}`);
        showToast(`Đã chèn tag ${tag}`, 'info');
    };

    // Preset selection handler
    const handleSelectPreset = (presetId) => {
        setSelectedPresetId(presetId);
        const preset = DEFAULT_PRESET_PROMPTS.find(p => p.id === presetId) || savedPromptProfiles.find(p => p.id === presetId);
        if (preset) {
            setTaskPrompt(preset.prompt);
            setTaskName(preset.name);
            if (preset.targetCol) setTargetCol(preset.targetCol);
            if (preset.startRow !== undefined) setStartRow(preset.startRow);
            if (preset.endRow !== undefined) setEndRow(preset.endRow);
            if (preset.variables && Array.isArray(preset.variables)) {
                setVariables(preset.variables.map((v, i) => ({
                    ...v,
                    id: v.id ? `${v.id}_${Date.now()}_${i}` : `var_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`
                })));
            }
            if (preset.concurrency) setConcurrency(preset.concurrency);
            if (preset.delayMs !== undefined) setDelayMs(preset.delayMs);
            showToast(`Đã nạp Cấu hình Prompt: "${preset.name}"`, 'success');
        }
    };

    // Save current configuration as a new Saved Prompt Profile
    const handleSavePromptProfile = () => {
        if (!newPresetNameInput.trim()) {
            showToast('Vui lòng nhập tên Cấu hình Prompt!', 'danger');
            return;
        }
        const newPreset = {
            id: 'saved_' + Date.now(),
            name: newPresetNameInput.trim(),
            prompt: taskPrompt,
            targetCol,
            startRow,
            endRow,
            variables,
            concurrency,
            delayMs
        };

        const updated = [newPreset, ...savedPromptProfiles.filter(p => p.name !== newPreset.name)];
        setSavedPromptProfiles(updated);
        localStorage.setItem('ai_prompt_saved_profiles', JSON.stringify(updated));
        setSelectedPresetId(newPreset.id);
        setShowSavePresetModal(false);
        setNewPresetNameInput('');
        showToast('Đã lưu Cấu hình Prompt thành công!', 'success');
    };

    // Delete a saved prompt profile
    const handleDeleteSavedPreset = () => {
        if (!selectedPresetId) return;
        const updated = savedPromptProfiles.filter(p => p.id !== selectedPresetId);
        setSavedPromptProfiles(updated);
        localStorage.setItem('ai_prompt_saved_profiles', JSON.stringify(updated));
        setSelectedPresetId('');
        showToast('Đã xóa Cấu hình Prompt!', 'info');
    };

    // Update an existing saved prompt profile
    const handleUpdateExistingPreset = () => {
        if (!selectedPresetId) return;
        const index = savedPromptProfiles.findIndex(p => p.id === selectedPresetId);
        if (index === -1) return;

        const currentPreset = savedPromptProfiles[index];
        const updatedPreset = {
            ...currentPreset,
            name: taskName || currentPreset.name,
            prompt: taskPrompt,
            targetCol,
            startRow,
            endRow,
            variables,
            concurrency,
            delayMs
        };

        const updatedList = [...savedPromptProfiles];
        updatedList[index] = updatedPreset;

        setSavedPromptProfiles(updatedList);
        localStorage.setItem('ai_prompt_saved_profiles', JSON.stringify(updatedList));
        showToast(`Đã cập nhật Cấu hình: "${updatedPreset.name}"`, 'success');
    };

    // Toggle sheet selection
    const toggleSheetSelection = (name) => {
        if (selectedSheetNames.includes(name)) {
            setSelectedSheetNames(selectedSheetNames.filter(n => n !== name));
        } else {
            setSelectedSheetNames([...selectedSheetNames, name]);
        }
    };

    const toggleSelectAllSheets = () => {
        if (selectedSheetNames.length === availableSheets.length) {
            setSelectedSheetNames([]);
        } else {
            setSelectedSheetNames(availableSheets.map(s => s.name));
        }
    };

    // Substitute both custom variable tags {var-name} AND column tags {{A}}, {{B}}
    const substituteRowVariables = (template, rowArray) => {
        if (!template || !Array.isArray(rowArray)) return template;

        let result = template;

        // 1. Substitute custom variables {var-name}
        variables.forEach(v => {
            const idx = colToIdx(v.col);
            const val = rowArray[idx];
            const valStr = val !== undefined && val !== null ? String(val) : '';
            const regex = new RegExp(`\\{${v.name}\\}`, 'g');
            result = result.replace(regex, valStr);
        });

        // 2. Substitute column tags {{A}}, {{B}}, {{C}} etc.
        result = result.replace(/\{\{([A-Z]+)\}\}/g, (match, colLetter) => {
            const idx = colToIdx(colLetter);
            const val = rowArray[idx];
            return val !== undefined && val !== null ? String(val) : '';
        });

        return result;
    };

    // ══════════════════════════════════════════════════════
    //  BATCH RUNNER ENGINE (Supports 10 Threads & Retry)
    // ══════════════════════════════════════════════════════
    const runBatchEngine = async (onlyRetryFailed = false) => {
        if (!selectedProfileSlug) {
            showToast('Vui lòng chọn Profile cần chạy!', 'danger');
            return;
        }
        if (selectedSheetNames.length === 0) {
            showToast('Vui lòng chọn ít nhất 1 Tab Sheet!', 'danger');
            return;
        }

        const activeProfileObj = profiles.find(p => p.slug === selectedProfileSlug);
        const profileDisplayName = activeProfileObj ? (activeProfileObj.name.startsWith('Profile') ? activeProfileObj.name : `Profile ${activeProfileObj.name}`) : selectedProfileSlug;

        const sheetsToProcess = profileSheetsData.filter(s => selectedSheetNames.includes(s.name));

        let grandTotalRows = 0;
        sheetsToProcess.forEach(s => {
            const sStart = Math.max(1, parseInt(startRow) || 1) - 1;
            const sEnd = endRow ? Math.min(s.data.length, parseInt(endRow)) : s.data.length;
            const rowCount = Math.max(0, sEnd - sStart);
            grandTotalRows += rowCount;
        });

        if (grandTotalRows === 0) {
            showToast('Không tìm thấy dòng dữ liệu nào hợp lệ trong khoảng đã chọn!', 'danger');
            return;
        }

        abortRef.current = false;
        pauseRef.current = false;

        const initialFailed = onlyRetryFailed ? runnerState.failedItems : [];

        setRunnerState(prev => ({
            ...prev,
            isRunning: true,
            isPaused: false,
            activeProfileName: profileDisplayName,
            activeTabName: sheetsToProcess[0]?.name || 'Sheet1',
            activeTaskName: taskName || 'Xử lý dữ liệu AI',
            totalRows: grandTotalRows,
            completedCount: onlyRetryFailed ? prev.completedCount : 0,
            pendingCount: onlyRetryFailed ? initialFailed.length : grandTotalRows,
            errorCount: 0,
            skipCount: onlyRetryFailed ? prev.skipCount : 0,
            failedItems: [],
            logs: [`[${new Date().toLocaleTimeString()}] ${onlyRetryFailed ? '🔄 Bắt đầu THỬ LẠI các hàng bị lỗi...' : `Bắt đầu tiến trình AI Runner (${concurrency} luồng) cho ${profileDisplayName}...`}`],
            currentProgressPercent: 0
        }));

        setViewMode('monitor');

        let updatedSheetsData = JSON.parse(JSON.stringify(profileSheetsData));
        let globalCompleted = onlyRetryFailed ? runnerState.completedCount : 0;
        let globalErrors = 0;
        let globalSkips = onlyRetryFailed ? runnerState.skipCount : 0;
        let currentFailedList = [];

        const targetColIdx = colToIdx(targetCol);

        try {
            for (let sIdx = 0; sIdx < sheetsToProcess.length; sIdx++) {
            if (abortRef.current) break;

            const sheetObj = sheetsToProcess[sIdx];
            const currentSheetName = sheetObj.name;

            setRunnerState(prev => ({
                ...prev,
                activeTabName: currentSheetName,
                logs: [`[${new Date().toLocaleTimeString()}] Đang xử lý Tab: ${currentSheetName}`, ...prev.logs.slice(0, 150)]
            }));

            const sheetDataRef = updatedSheetsData.find(s => s.name === currentSheetName);
            if (!sheetDataRef || !Array.isArray(sheetDataRef.data)) continue;

            const rStart = Math.max(1, parseInt(startRow) || 1) - 1;
            const rEnd = endRow ? Math.min(sheetDataRef.data.length, parseInt(endRow)) : sheetDataRef.data.length;

            const rowsToProcess = [];
            for (let r = rStart; r < rEnd; r++) {
                // If only retrying failed rows, filter out non-failed ones
                if (onlyRetryFailed) {
                    const wasFailed = initialFailed.some(f => f.sheetName === currentSheetName && f.rowIndex === r);
                    if (!wasFailed) continue;
                }

                rowsToProcess.push({
                    sheetName: currentSheetName,
                    rowIndex: r,
                    rowData: sheetDataRef.data[r] || []
                });
            }

            // ── Dynamic Concurrency Queue (Worker Pool) ──
            // Keeps N worker threads active continuously. As soon as any worker completes 1 item,
            // it immediately grabs the next available item from queue without waiting for other threads.
            let taskQueueIndex = 0;
            const activeWorkers = Math.max(1, parseInt(concurrency) || 2);

            const workerTask = async (workerId) => {
                while (taskQueueIndex < rowsToProcess.length && !abortRef.current) {
                    while (pauseRef.current && !abortRef.current) {
                        await new Promise(res => setTimeout(res, 500));
                    }
                    if (abortRef.current) break;

                    const itemIdx = taskQueueIndex++;
                    if (itemIdx >= rowsToProcess.length) break;

                    const item = rowsToProcess[itemIdx];
                    const rowIdx = item.rowIndex;
                    const currentRow = item.rowData;

                    if (skipExisting && !onlyRetryFailed) {
                        const existingVal = currentRow[targetColIdx];
                        if (existingVal !== undefined && existingVal !== null && String(existingVal).trim() !== '') {
                            globalSkips++;
                            setRunnerState(prev => {
                                const completedTotal = globalCompleted + globalSkips + globalErrors;
                                const percent = Math.min(100, Math.round((completedTotal / grandTotalRows) * 100));
                                return {
                                    ...prev,
                                    skipCount: globalSkips,
                                    pendingCount: Math.max(0, grandTotalRows - completedTotal),
                                    currentProgressPercent: percent
                                };
                            });
                            continue;
                        }
                    }

                    const builtPrompt = substituteRowVariables(taskPrompt, currentRow);

                    const CHUNK_THRESHOLD = 3000;
                    const CHUNK_SIZE      = 2500;

                    const callAIWithChunking = async (prompt) => {
                        let longestVarCol = -1;
                        let longestVal = '';
                        variables.forEach(v => {
                            const idx = colToIdx(v.col);
                            const val = currentRow[idx] !== undefined ? String(currentRow[idx]) : '';
                            if (val.length > CHUNK_THRESHOLD && val.length > longestVal.length) {
                                longestVal = val;
                                longestVarCol = idx;
                            }
                        });

                        if (longestVarCol === -1 || longestVal.length <= CHUNK_THRESHOLD) {
                            const res = await fetchApi('/api/ai/chat', {
                                method: 'POST',
                                body: JSON.stringify({ message: prompt, history: [] })
                            });
                            return res.content || '';
                        }

                        const chunkedVar = variables.find(v => colToIdx(v.col) === longestVarCol);
                        if (!chunkedVar) {
                            const res = await fetchApi('/api/ai/chat', {
                                method: 'POST',
                                body: JSON.stringify({ message: prompt, history: [] })
                            });
                            return res.content || '';
                        }

                        const chunks = [];
                        let pos = 0;
                        while (pos < longestVal.length) {
                            let end = Math.min(pos + CHUNK_SIZE, longestVal.length);
                            if (end < longestVal.length) {
                                const lastNL = longestVal.lastIndexOf('\n', end);
                                if (lastNL > pos + CHUNK_SIZE * 0.5) end = lastNL + 1;
                            }
                            chunks.push(longestVal.slice(pos, end));
                            pos = end;
                        }

                        const chunkResults = [];
                        for (let ci = 0; ci < chunks.length; ci++) {
                            const fakeRow = [...currentRow];
                            fakeRow[longestVarCol] = chunks[ci];
                            const chunkPrompt = substituteRowVariables(taskPrompt, fakeRow);
                            const chunkRes = await fetchApi('/api/ai/chat', {
                                method: 'POST',
                                body: JSON.stringify({
                                    message: chunkPrompt + (chunks.length > 1 ? `\n\n(Phần ${ci + 1}/${chunks.length} — tiếp tục dịch, không thêm lời chào hay tóm tắt)` : ''),
                                    history: []
                                })
                            });
                            chunkResults.push(chunkRes.content || '');
                        }
                        return chunkResults.join('\n');
                    };

                    try {
                        const isTableTask = /bảng|table|dịch|thông số|giao diện|html|spec/i.test(taskPrompt || builtPrompt || '');
                        let rowAttempts = 0;
                        const maxRowAttempts = 3;
                        let aiContent = '';
                        let rowError = null;

                    while (rowAttempts < maxRowAttempts && !abortRef.current) {
                        rowAttempts++;
                        try {
                            let rawContent = await callAIWithChunking(builtPrompt);
                            let cleaned = autoClean ? cleanAiOutput(rawContent) : rawContent.trim();

                            if (!cleaned && !abortRef.current) {
                                throw new Error('Kết quả AI trả về rỗng');
                            }

                            // Table Structure Validation & Auto-Rerun
                            if (isTableTask) {
                                const isValid = isValidHtmlTableStructure(cleaned);
                                if (!isValid) {
                                    if (rowAttempts < maxRowAttempts) {
                                        const retryLog = '[Thử lại] [' + currentSheetName + '] Hàng ' + (rowIdx + 1) + ': Bảng HTML lỗi cấu trúc, đang tự động dịch lại (' + rowAttempts + '/' + maxRowAttempts + ')...';
                                        setRunnerState(prev => ({
                                            ...prev,
                                            logs: [retryLog, ...prev.logs.slice(0, 150)]
                                        }));
                                        await new Promise(r => setTimeout(r, 1200));
                                        continue; // Rerun current row translation!
                                    } else {
                                        // Final fallback: auto convert Markdown/mixed table to standard HTML table
                                        cleaned = convertMarkdownTableToHtml(cleaned);
                                    }
                                }
                            }

                            aiContent = cleaned;
                            rowError = null;
                            break;
                        } catch (err) {
                            rowError = err;
                            if (rowAttempts < maxRowAttempts) {
                                await new Promise(r => setTimeout(r, 1000));
                            }
                        }
                    }

                    if (rowError && !aiContent) {
                        throw rowError;
                    }

                        if (!updatedSheetsData[sIdx].data[rowIdx]) {
                            updatedSheetsData[sIdx].data[rowIdx] = [];
                        }
                        updatedSheetsData[sIdx].data[rowIdx][targetColIdx] = aiContent;

                        globalCompleted++;

                        const shortLog = '[OK] [' + currentSheetName + '] Hàng ' + (rowIdx + 1) + ': ' + aiContent.slice(0, 40) + '...';
                        setRunnerState(prev => {
                            const completedTotal = globalCompleted + globalSkips + globalErrors;
                            const percent = Math.min(100, Math.round((completedTotal / grandTotalRows) * 100));
                            return {
                                ...prev,
                                completedCount: globalCompleted,
                                pendingCount: Math.max(0, grandTotalRows - completedTotal),
                                currentProgressPercent: percent,
                                logs: [shortLog, ...prev.logs.slice(0, 150)]
                            };
                        });
                    } catch (err) {
                        globalErrors++;
                        currentFailedList.push({ sheetName: currentSheetName, rowIndex: rowIdx, error: err.message });
                        const errLog = '[Lỗi] [' + currentSheetName + '] Hàng ' + (rowIdx + 1) + ': ' + err.message;
                        setRunnerState(prev => {
                            const completedTotal = globalCompleted + globalSkips + globalErrors;
                            const percent = Math.min(100, Math.round((completedTotal / grandTotalRows) * 100));
                            return {
                                ...prev,
                                errorCount: globalErrors,
                                failedItems: [...currentFailedList],
                                pendingCount: Math.max(0, grandTotalRows - completedTotal),
                                currentProgressPercent: percent,
                                logs: [errLog, ...prev.logs.slice(0, 150)]
                            };
                        });
                    }

                    try {
                        await fetchApi('/api/products/profile-sheet', {
                            method: 'POST',
                            body: JSON.stringify({ profile: selectedProfileSlug, sheets: updatedSheetsData })
                        });
                    } catch (e) {
                        console.warn('Auto-save progress error:', e);
                    }

                    if (delayMs > 0 && !abortRef.current) {
                        await new Promise(r => setTimeout(r, parseInt(delayMs) || 1000));
                    }
                }
            };

            const poolWorkers = Array.from({ length: activeWorkers }, (_, i) => workerTask(i + 1));
            await Promise.all(poolWorkers);
        }

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    } catch (e) {
        console.error('Runner engine error:', e);
    } finally {
        const isAborted = abortRef.current;
        setRunnerState(prev => ({
            ...prev,
            isRunning: false,
            isPaused: false,
            currentProgressPercent: isAborted ? prev.currentProgressPercent : 100,
            failedItems: currentFailedList,
            logs: [`[${new Date().toLocaleTimeString()}] ${isAborted ? '⏹️ ĐÃ DỪNG TIẾN TRÌNH CHẠY AI!' : '🎉 ĐÃ HOÀN THÀNH TIẾN TRÌNH CHẠY AI!'}`, ...prev.logs.slice(0, 150)]
        }));

        if (!isAborted) {
            playCompletionSound();
            sendDesktopNotification(
                '🎉 AI Assistant — Hoàn Thành!',
                `Đã hoàn thành ${grandTotalRows} hàng (${globalCompleted} thành công, ${globalErrors} lỗi).`
            );
            showToast('🎉 Đã hoàn thành tiến trình AI!', 'success');
        } else {
            showToast('⏹️ Đã dừng tiến trình AI', 'info');
        }
    }
};

    const handleStartRunner = () => runBatchEngine(false);
    const handleRetryFailedRows = () => runBatchEngine(true);

    const handlePauseRunner = () => {
        pauseRef.current = !pauseRef.current;
        setRunnerState(prev => ({ ...prev, isPaused: pauseRef.current }));
    };

    const handleStopRunner = () => {
        abortRef.current = true;
        pauseRef.current = false;
        setRunnerState(prev => ({
            ...prev,
            isRunning: false,
            isPaused: false,
            logs: [`[${new Date().toLocaleTimeString()}] ⏹️ Đã dừng tiến trình.`, ...prev.logs.slice(0, 150)]
        }));
        showToast('Đã dừng tiến trình AI', 'info');
    };

    if (!hasPermission('products')) {
        return (
            <div className="page-content">
                <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                    Access Denied
                </div>
            </div>
        );
    }

    return (
        <div className="page-content">
            {/* Inline Toasts */}
            <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {toasts.map(t => (
                    <div key={t.id} className={`toast toast-${t.type}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)', borderLeft: '4px solid' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Header Title */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Bot style={{ color: 'var(--accent)' }} size={28} /> AI Assistant — Multi-Profile & Multi-Tab Engine
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                        Cấu hình Prompt, định nghĩa biến nguồn, chọn luồng chạy và theo dõi tiến độ live.
                    </p>
                </div>

                {/* Mode Switcher */}
                <div style={{ display: 'flex', gap: 10, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <button
                        type="button"
                        className={`btn ${viewMode === 'config' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setViewMode('config')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 16px', fontWeight: 600 }}
                    >
                        <Sliders size={16} /> ⚙️ Cấu Hình Tác Vụ AI
                    </button>

                    <button
                        type="button"
                        className={`btn ${viewMode === 'monitor' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setViewMode('monitor')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 16px', fontWeight: 600 }}
                    >
                        <CheckCircle2 size={16} /> 📟 Terminal Log Live
                    </button>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* VIEW MODE 1: CONFIGURATION PANEL (CẤU HÌNH CHI TIẾT)             */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {viewMode === 'config' && (
                <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    
                    {/* Presets & Saved Prompt Profiles Manager */}
                    <div className="card" style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: 14, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 280 }}>
                            <Bookmark size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                📁 Cấu Hình Prompt Đã Lưu:
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <select
                                    value={selectedPresetId}
                                    onChange={e => handleSelectPreset(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600, outline: 'none', textOverflow: 'ellipsis' }}
                                >
                                    <option value="">-- Chọn Cấu hình Prompt Đã Lưu --</option>
                                    <optgroup label="💡 Mẫu Mặc Định">
                                        {DEFAULT_PRESET_PROMPTS.map(p => (
                                            <option key={p.id} value={p.id}>⭐ {p.name}</option>
                                        ))}
                                    </optgroup>
                                    {savedPromptProfiles.length > 0 && (
                                        <optgroup label="💾 Cấu Hình Bạn Đã Lưu">
                                            {savedPromptProfiles.map(p => (
                                                <option key={p.id} value={p.id}>⭐ {p.name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            {selectedPresetId && savedPromptProfiles.some(p => p.id === selectedPresetId) ? (
                                <>
                                    <button
                                        type="button"
                                        className="btn btn-sm"
                                        onClick={handleUpdateExistingPreset}
                                        style={{ fontSize: 12.5, padding: '7px 14px', background: 'var(--gradient-primary)', color: 'white', border: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                                    >
                                        <RefreshCw size={14} /> Cập Nhật Cấu Hình
                                    </button>

                                    <button
                                        type="button"
                                        className="btn btn-sm btn-ghost"
                                        onClick={() => { setNewPresetNameInput(''); setShowSavePresetModal(true); }}
                                        style={{ fontSize: 12.5, padding: '7px 12px', border: '1px solid var(--border-color)', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                                    >
                                        <Plus size={14} /> Lưu Thành Mới
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleDeleteSavedPreset}
                                        style={{ fontSize: 12, padding: '7px 12px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                                    >
                                        <Trash2 size={14} /> Xóa
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => { setNewPresetNameInput(''); setShowSavePresetModal(true); }}
                                    style={{ fontSize: 12.5, padding: '7px 14px', background: 'var(--gradient-primary)', color: 'white', border: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                                >
                                    <Save size={15} /> Lưu Cấu Hình Prompt Mới
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Test API Connection Card */}
                    <div className="card" style={{ padding: '16px 20px', background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                                    <Zap size={16} style={{ color: '#eab308' }} /> Kiểm Tra Kết Nối & Độ Trễ API AI (Server Health Check)
                                </h4>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                                    Bấm nút để gửi 1 yêu cầu thử nghiệm tới Server AI và đo thời gian phản hồi thực tế trước khi chạy hàng loạt.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleTestApiConnection}
                                disabled={apiTestState.testing}
                                style={{ padding: '8px 16px', background: apiTestState.testing ? 'var(--bg-secondary)' : 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: apiTestState.testing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(99,102,241,0.2)' }}
                            >
                                {apiTestState.testing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={15} />}
                                {apiTestState.testing ? 'Đang Kiểm Tra Kết Nối...' : '⚡ Kiểm Tra Kết Nối API AI Ngay'}
                            </button>
                        </div>

                        {apiTestState.result && (
                            <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 'var(--radius-md)', background: apiTestState.result.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${apiTestState.result.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: 13 }}>
                                <div style={{ fontWeight: 700, color: apiTestState.result.ok ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    {apiTestState.result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                    <span>{apiTestState.result.message}</span>
                                    <span style={{ fontSize: 11.5, opacity: 0.85, fontWeight: 600, background: 'rgba(0,0,0,0.06)', padding: '2px 8px', borderRadius: 10 }}>
                                        {apiTestState.result.latencyMs} ms
                                    </span>
                                </div>
                                {apiTestState.result.ok && apiTestState.result.reply && (
                                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                                        💬 Phản hồi thử từ AI: "{apiTestState.result.reply}"
                                    </p>
                                )}
                                {!apiTestState.result.ok && (
                                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#b91c1c' }}>
                                        💡 <strong>Hướng dẫn khắc phục:</strong> Server AI (aidesign.io.vn) hiện đang bị nghẽn/timeout (Status 504). Vui lòng thử lại sau vài phút hoặc chạy 1-2 luồng.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section 1: Choose Profiles & Sheet Tabs */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-color)' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                            <Layers style={{ color: 'var(--accent)' }} size={18} /> 1. Chọn Profile & Các Tab Sheet Cần Chạy
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    Chọn Profile Sản Phẩm:
                                </label>
                                <select
                                    value={selectedProfileSlug}
                                    onChange={e => handleProfileChange(e.target.value)}
                                    style={{ width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 600 }}
                                >
                                    {profiles.map(p => (
                                        <option key={p.id} value={p.slug}>
                                            📦 {p.name.startsWith('Profile') ? p.name : `Profile ${p.name}`} ({p.brand_name || p.slug})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        Chọn Danh Sách Sheet Tabs Để Chạy Liên Hoàn:
                                    </label>
                                    <button
                                        type="button"
                                        onClick={toggleSelectAllSheets}
                                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        {selectedSheetNames.length === availableSheets.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả Tabs'}
                                    </button>
                                </div>

                                {availableSheets.length === 0 ? (
                                    <div style={{ padding: 14, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-muted)' }}>
                                        Profile này chưa có Sheet tab nào. Vui lòng nạp file excel trong trang Products.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                        {availableSheets.map(s => {
                                            const isChecked = selectedSheetNames.includes(s.name);
                                            return (
                                                <label
                                                    key={s.name}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        padding: '6px 12px',
                                                        background: isChecked ? '#eff6ff' : 'var(--bg-card)',
                                                        border: isChecked ? '1px solid #93c5fd' : '1px solid var(--border-color)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        cursor: 'pointer',
                                                        fontSize: 13,
                                                        fontWeight: isChecked ? 700 : 500,
                                                        color: isChecked ? '#1d4ed8' : 'var(--text-primary)'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleSheetSelection(s.name)}
                                                    />
                                                    <FileSpreadsheet size={14} />
                                                    <span>{s.name} ({s.data?.length || 0} hàng)</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Quản Lý Biến Nguồn & Cấu Hình Prompt */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-color)' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                            <Settings style={{ color: 'var(--accent)' }} size={18} /> 2. Quản Lý Biến Nguồn & Nội Dung Prompt
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            
                            {/* Variable Manager Box (Giống AI Assistant Tab Riêng) */}
                            <div style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        📌 Danh Sách Biến Nguồn (Gắn Tên Biến Với Cột Bảng Sheet):
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddVariable}
                                        style={{ fontSize: 12, padding: '4px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <Plus size={13} /> Thêm Biến Mới
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {variables.map((v, idx) => (
                                        <div key={v.id ? `var-${v.id}-${idx}` : `var-idx-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-input, rgba(0,0,0,0.04))', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Nhãn:</span>
                                            <input
                                                type="text"
                                                value={v.label || ''}
                                                onChange={e => handleLabelChange(v.id, idx, e.target.value)}
                                                onBlur={e => handleBlurVariableName(v.id, idx, e.target.value)}
                                                placeholder="Nhập nhãn biến (vd: Tên Sản Phẩm)"
                                                style={{ flex: 1, minWidth: 0, padding: '5px 8px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
                                            />
                                            {/* Fixed-width copyable badge - always same size so rows align */}
                                            <span
                                                title={v.name ? 'Click để copy' : ''}
                                                onClick={() => { if (v.name) { navigator.clipboard.writeText(`{${v.name}}`); showToast(`Đã copy {${v.name}}`, 'success'); } }}
                                                style={{ display: 'inline-block', width: 140, flexShrink: 0, padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: `1px solid ${v.name ? 'rgba(99,102,241,0.35)' : 'var(--border-color)'}`, background: v.name ? 'rgba(99,102,241,0.12)' : 'transparent', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: v.name ? 'var(--primary-color, #6366f1)' : 'var(--text-muted)', cursor: v.name ? 'pointer' : 'default', userSelect: 'all', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}
                                            >
                                                {v.name ? `{${v.name}}` : '{ }'}
                                            </span>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Cột:</span>
                                            <input
                                                type="text"
                                                value={v.col || ''}
                                                onChange={e => handleUpdateVariable(v.id, idx, 'col', e.target.value.toUpperCase())}
                                                placeholder="A"
                                                style={{ width: 44, padding: '5px 6px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}
                                            />
                                            {variables.length > 1 && (
                                                <button type="button" onClick={() => handleRemoveVariable(v.id, idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, flexShrink: 0 }} title="Xóa biến này">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Task Name */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    Tên Tác Vụ AI (Hiển thị trên Sidebar Status Card):
                                </label>
                                <input
                                    type="text"
                                    value={taskName}
                                    onChange={e => setTaskName(e.target.value)}
                                    placeholder="Ví dụ: Viết SAPO sản phẩm"
                                    style={{ width: '100%', padding: '9px 12px', fontSize: 13.5, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            {/* Prompt Textarea & Quick Insert Tags */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                        {"Nội Dung Prompt Hướng Dẫn AI (Chèn biến dạng {ten-bien} hoặc {{A}}, {{B}}):"}
                                    </label>
                                </div>

                                {/* Quick Tag Insertion Buttons */}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Chèn nhanh tag:</span>
                                    {variables.map((v, idx) => (
                                        <button
                                            key={v.id ? `tag-${v.id}-${idx}` : `tag-idx-${idx}`}
                                            type="button"
                                            onClick={() => handleInsertTag(`{${v.name}}`)}
                                            style={{ padding: '3px 8px', fontSize: 11.5, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            + {`{${v.name}}`} (Cột {v.col})
                                        </button>
                                    ))}
                                    {['A', 'B', 'C', 'D'].map(col => (
                                        <button
                                            key={col}
                                            type="button"
                                            onClick={() => handleInsertTag(`{{${col}}}`)}
                                            style={{ padding: '3px 8px', fontSize: 11.5, background: '#fff7ed', border: '1px solid #ffedd5', color: '#c2410c', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            + {`{{${col}}}`}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    ref={promptTextareaRef}
                                    rows={6}
                                    value={taskPrompt}
                                    onChange={e => setTaskPrompt(e.target.value)}
                                    placeholder="Viết prompt tại đây..."
                                    style={{ width: '100%', padding: '12px 14px', fontSize: 13.5, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'monospace' }}
                                />
                            </div>

                            {/* Target Column & Range */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Cột Đích Ghi Kết Quả (Vd: D):
                                    </label>
                                    <input
                                        type="text"
                                        value={targetCol}
                                        onChange={e => setTargetCol(e.target.value.toUpperCase())}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 13.5, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontWeight: 700, textTransform: 'uppercase' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Từ Hàng Số:
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={startRow}
                                        onChange={e => setStartRow(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 13.5, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                                        Đến Hàng Số (Để trống = Hết sheet):
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="Hàng cuối"
                                        value={endRow}
                                        onChange={e => setEndRow(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 13.5, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Concurrency Options (Thêm lựa chọn 10 luồng & Throttling) */}
                    <div className="card" style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-color)' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                            <Zap style={{ color: '#eab308' }} size={18} /> 3. Tốc Độ, Luồng Chạy & An Toàn API (Bổ sung 10 Luồng)
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    Số Luồng Chạy Song Song (Concurrency):
                                </label>
                                <select
                                    value={concurrency}
                                    onChange={e => setConcurrency(parseInt(e.target.value) || 1)}
                                    style={{ width: '100%', padding: '9px 12px', fontSize: 13.5, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 700 }}
                                >
                                    <option value={1}>1 Luồng (An toàn tuyệt đối - Dành cho cày 24/7)</option>
                                    <option value={2}>2 Luồng (Khuyên dùng - Ổn định nhất)</option>
                                    <option value={3}>3 Luồng (Tốc độ vừa)</option>
                                    <option value={5}>5 Luồng (Tốc độ cao)</option>
                                    <option value={10}>⚡ 10 Luồng (Tối đa hiệu năng)</option>
                                </select>
                                {concurrency > 3 && (
                                    <p style={{ fontSize: 12, color: '#d97706', marginTop: 6, marginBottom: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <AlertCircle size={14} /> 💡 Khuyên dùng 2-3 luồng để chạy ổn định và không bị Server AI từ chối (Rate Limit 502).
                                    </p>
                                )}
                            </div>

                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    Khoảng Hoãn Nghỉ (Throttle Delay ms):
                                </label>
                                <select
                                    value={delayMs}
                                    onChange={e => setDelayMs(parseInt(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '9px 12px', fontSize: 13.5, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 600 }}
                                >
                                    <option value={0}>0 ms (Chạy liên tục không hoãn)</option>
                                    <option value={500}>500 ms (0.5 giây)</option>
                                    <option value={1500}>1500 ms (1.5 giây - Tránh nghẽn API)</option>
                                    <option value={3000}>3000 ms (3.0 giây - Dành cho cày ngầm)</option>
                                </select>
                            </div>
                        </div>

                        {/* Toggles */}
                        <div style={{ display: 'flex', gap: 20, marginTop: 18, flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={skipExisting}
                                    onChange={e => setSkipExisting(e.target.checked)}
                                />
                                <span>Bỏ qua các ô đã có nội dung (Skip Existing)</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={autoClean}
                                    onChange={e => setAutoClean(e.target.checked)}
                                />
                                <span>Tự động làm sạch rác (Lọc Markdown Codeblock & Lời chào AI)</span>
                            </label>
                        </div>
                    </div>

                    {/* Bottom Action Bar: Run, Retry & Controls */}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                        {runnerState.errorCount > 0 && !runnerState.isRunning && (
                            <button
                                type="button"
                                onClick={handleRetryFailedRows}
                                style={{
                                    padding: '12px 20px',
                                    background: '#dc2626',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 10,
                                    fontWeight: 700,
                                    fontSize: 14,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                                }}
                            >
                                <RotateCcw size={16} /> 🔄 Thử Lại {runnerState.errorCount} Hàng Lỗi
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleStartRunner}
                            style={{
                                padding: '12px 28px',
                                background: '#0f4c81',
                                color: 'white',
                                border: 'none',
                                borderRadius: 10,
                                fontWeight: 700,
                                fontSize: 15,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                boxShadow: '0 4px 14px rgba(15, 76, 129, 0.25)'
                            }}
                        >
                            <Play size={18} /> Lưu & Bắt Đầu Chạy AI Engine
                        </button>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* VIEW MODE 2: TERMINAL LOG LIVE                                   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {viewMode === 'monitor' && (
                <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Controls & Status Bar */}
                    <div className="card" style={{ padding: 20, background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Bot size={20} style={{ color: '#0f4c81' }} /> {runnerState.activeProfileName} — {runnerState.activeTabName}
                            </div>
                            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                                Tác vụ: {runnerState.activeTaskName} ({concurrency} luồng song song)
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            {runnerState.errorCount > 0 && !runnerState.isRunning && (
                                <button
                                    type="button"
                                    onClick={handleRetryFailedRows}
                                    style={{ padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    <RotateCcw size={15} /> Thử lại {runnerState.errorCount} hàng lỗi
                                </button>
                            )}

                            {runnerState.isRunning && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handlePauseRunner}
                                        style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                        <Pause size={15} /> {runnerState.isPaused ? 'Tiếp tục' : 'Tạm dừng'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleStopRunner}
                                        style={{ padding: '8px 14px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                        <Square size={15} /> Dừng
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Output Terminal Log */}
                    <div className="card" style={{ padding: 20, background: '#0f172a', color: '#f8fafc', borderRadius: 16, border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid #334155', paddingBottom: 10 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                                📟 Terminal Output Monitor Log
                            </span>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                {runnerState.logs.length} log
                            </span>
                        </div>
                        <div style={{ maxHeight: 380, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {runnerState.logs.length === 0 ? (
                                <span style={{ color: '#64748b', fontStyle: 'italic' }}>Chưa có log sự kiện nào. Hãy cấu hình và bấm Bắt đầu để khởi chạy.</span>
                            ) : (
                                runnerState.logs.map((log, idx) => (
                                    <div key={idx} style={{ color: log.includes('Lỗi') ? '#fca5a5' : (log.includes('✓') ? '#86efac' : '#e2e8f0') }}>
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Save New Prompt Profile Preset */}
            {showSavePresetModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSavePresetModal(false)}>
                    <div className="card" style={{ width: 440, padding: 24, background: 'var(--bg-card)', borderRadius: 16, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                <Save size={18} style={{ color: 'var(--accent)' }} /> Lưu Cấu Hình Prompt Đã Lưu Mới
                            </h3>
                            <button onClick={() => setShowSavePresetModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                    Đặt Tên Cho Cấu Hình Prompt Này:
                                </label>
                                <input
                                    type="text"
                                    value={newPresetNameInput}
                                    onChange={e => setNewPresetNameInput(e.target.value)}
                                    placeholder="Ví dụ: Prompt Viết Bài Marketing Cột D"
                                    style={{ width: '100%', padding: '10px 12px', fontSize: 13.5, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontWeight: 600 }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowSavePresetModal(false)}>Hủy</button>
                                <button
                                    type="button"
                                    onClick={handleSavePromptProfile}
                                    style={{ padding: '9px 18px', background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                                >
                                    Lưu Cấu Hình
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
