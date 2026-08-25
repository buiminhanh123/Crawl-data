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
    Save,
    BookOpen,
    ShieldCheck,
    CheckCheck,
    Table,
    Eye,
    Code,
    Zap
} from 'lucide-react';
import {
    fetchGlossary,
    fetchTranslationMemory,
    fetchWhitelist,
    saveGlossaryItem,
    deleteGlossaryItem,
    auditTranslation,
    applyPreTranslation,
    saveSeriesMemory
} from '@/lib/translationControl';
import { parseAndNormalizeHtmlTable } from '@/lib/htmlTableParser';

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

    dich: `Dịch bảng thông số kỹ thuật sau sang tiếng Việt chuẩn kỹ thuật (BẮT BUỘC TUÂN THỦ TỪ ĐIỂN THUẬT NGỮ 1-1, KHÔNG TỰ Ý DÙNG TỪ ĐỒNG NGHĨA):
1. QUY TẮC DỊCH THUẬT NGỮ CỐ ĐỊNH (1-1 KHÔNG ĐỔI):
   - Supply voltage -> "Điện áp cấp nguồn"
   - Communication interface -> "Giao diện truyền thông"
   - Connection type -> "Kiểu kết nối điện"
   - Operating speed -> "Tốc độ vận hành"
   - Reverse polarity protection -> "Bảo vệ chống ngược cực"
   - Short-circuit protection -> "Bảo vệ ngắn mạch"
   - Operating temperature range -> "Dải nhiệt độ vận hành"
   - Storage temperature range -> "Dải nhiệt độ lưu trữ"
   - Enclosure rating / Protection class -> "Cấp bảo vệ (IP)"
   - Operating height / altitude -> "Độ cao vận hành (so với mực nước biển)"
   - Weight -> "Khối lượng"
   - Housing material -> "Vật liệu vỏ"
   - Flange material -> "Vật liệu mặt bích"
   - Shaft material -> "Vật liệu trục"
   - Start up torque -> "Mô-men xoắn khởi động"
   - Operating torque -> "Mô-men xoắn vận hành"
   - Permissible relative humidity -> "Độ ẩm tương đối cho phép"
   - Number of steps per revolution -> "Số bước mỗi vòng quay"
   - Repeatability standard deviation σr -> "Độ lệch chuẩn khả năng lặp lại σr"
   - Signal before differential generation -> "Tín hiệu trước khi tạo vi sai"
   - Signal after differential generation -> "Tín hiệu sau khi tạo vi sai"

2. QUY TẮC BẢO TỒN DỮ LIỆU & FORMAT:
   - Giữ nguyên 100% định dạng cấu trúc bảng/HTML/JSON
   - Giữ nguyên bản TẤT CẢ các mã số, mã định danh, số đo, đơn vị (VD: U089908..., EN ISO 13849-1, 250 years, 262,144 (18 bit), UNSPSC, ECLASS, ETIM, cULus, RoHS...)
   - KHÔNG thêm/bớt thông số. KHÔNG tự ý suy ra các từ đồng nghĩa khác. Chỉ dùng duy nhất 1 nghĩa tiếng Việt chuẩn kỹ thuật đã định sẵn.

3. QUY TẮC XỬ LÝ BẢNG DÀI (BẮT BUỘC):
   - Dịch 100% tất cả các dòng thông số trong 1 LẦN TRẢ VỀ DUY NHẤT. Bất kể bảng dài hơn 100-200 dòng, KHÔNG ĐƯỢC CHIA THÀNH NHIỀU PHẦN (Phần 1, Phần 2...).
   - TUYỆT ĐỐ KHÔNG ĐƯỢC GIẢI THÍCH, KHÔNG CHÀO HỎI, KHÔNG DẪN DẮT. Chỉ xuất duy nhất bảng HTML kết quả.

Thông tin:
{noi-dung}`,

    custom: `Hãy xử lý thông tin sản phẩm sau theo yêu cầu:
{noi-dung}`
};

const getJobStatusBg = (status) => {
    switch (status) {
        case 'done': return '#dcfce7'; // green-100
        case 'running': return '#dbeafe'; // blue-100
        case 'error': return '#fee2e2'; // red-100
        case 'skipped': return '#f1f5f9'; // slate-100
        case 'pending':
        default: return '#e2e8f0'; // gray-200
    }
};

const getJobStatusColor = (status) => {
    switch (status) {
        case 'done': return '#15803d'; // green-700
        case 'running': return '#1d4ed8'; // blue-700
        case 'error': return '#b91c1c'; // red-700
        case 'skipped': return '#475569'; // slate-600
        case 'pending':
        default: return '#475569'; // slate-600
    }
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
    const [activeView, setActiveView] = useState('runner'); // 'runner' | 'glossary'
    const [glossaryItems, setGlossaryItems] = useState([]);
    const [memoryItems, setMemoryItems] = useState([]);
    const [whitelistItems, setWhitelistItems] = useState([]);
    const [newEnTerm, setNewEnTerm] = useState('');
    const [newViTerm, setNewViTerm] = useState('');
    const [newNotes, setNewNotes] = useState('');
    const [newScope, setNewScope] = useState('global');
    const [auditResult, setAuditResult] = useState(null);
    const [auditing, setAuditing] = useState(false);

    const loadGlossaryAndMemory = async () => {
        try {
            const [gList, mList, wList] = await Promise.all([
                fetchGlossary(profileSlug || null),
                fetchTranslationMemory(profileSlug || null),
                fetchWhitelist()
            ]);
            setGlossaryItems(gList || []);
            setMemoryItems(mList || []);
            setWhitelistItems(wList || []);
        } catch (e) {
            console.error('Failed to load glossary & memory:', e);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadGlossaryAndMemory();
        }
    }, [isOpen, profileSlug]);

    const handleAddGlossaryTerm = async () => {
        if (!newEnTerm.trim() || !newViTerm.trim()) return;
        try {
            await saveGlossaryItem({
                scope: newScope,
                source_term: newEnTerm.trim(),
                target_term: newViTerm.trim(),
                notes: newNotes.trim()
            });
            setNewEnTerm('');
            setNewViTerm('');
            setNewNotes('');
            loadGlossaryAndMemory();
        } catch (e) {
            alert('Lỗi thêm thuật ngữ: ' + e.message);
        }
    };

    const handleDeleteGlossaryTerm = async (id) => {
        if (!confirm('Bạn có chắc muốn xóa thuật ngữ này?')) return;
        await deleteGlossaryItem(id);
        loadGlossaryAndMemory();
    };

    const handleRunAuditOnTest = async (textToAudit) => {
        if (!textToAudit) return;
        setAuditing(true);
        try {
            const res = await auditTranslation(textToAudit, profileSlug || selectedTab);
            setAuditResult(res);
        } catch (e) {
            console.error('Audit failed:', e);
        } finally {
            setAuditing(false);
        }
    };
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

    // Update currently selected saved command profile
    const handleUpdateCurrentProfile = async () => {
        if (!selectedSavedProfileId) return;
        const p = savedProfiles.find(item => item.id === selectedSavedProfileId || String(item.id) === String(selectedSavedProfileId));
        if (!p) return;

        const updatedProfileData = {
            ...p,
            name: p.name,
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
            const res = await fetchApi(`/api/ai/prompt-profiles/${selectedSavedProfileId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: updatedProfileData.name,
                    prompt: JSON.stringify(updatedProfileData)
                })
            });

            if (res && res.success) {
                const updatedList = savedProfiles.map(item =>
                    (item.id === selectedSavedProfileId || String(item.id) === String(selectedSavedProfileId))
                        ? { ...updatedProfileData, id: selectedSavedProfileId }
                        : item
                );
                setSavedProfiles(updatedList);
                alert(`✅ Đã cập nhật thành công Cấu Hình Lệnh "${p.name}"!`);
            }
        } catch (e) {
            console.error('Error updating profile:', e);
            alert('❌ Không thể cập nhật Cấu Hình Lệnh vào Server Database.');
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
    const promptTextareaRef = useRef(null);

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

    // Parser State (0-Token Deterministic Table Normalizer)
    const [parserSourceCol, setParserSourceCol] = useState(19); // Default Col T (0-indexed 19)
    const [parserTargetCol, setParserTargetCol] = useState(20); // Default Col U (0-indexed 20)
    const [parserHeading, setParserHeading] = useState('Thông số kỹ thuật');
    const [parserTableClass, setParserTableClass] = useState('Table_Product_Style');
    const [parserTh1, setParserTh1] = useState('Thông số');
    const [parserTh2, setParserTh2] = useState('Giá trị');
    const [parserKeepOriginalHeading, setParserKeepOriginalHeading] = useState(true);
    const [parserStartRow, setParserStartRow] = useState(2);
    const [parserEndRow, setParserEndRow] = useState('');
    const [parserSkipExisting, setParserSkipExisting] = useState(false);
    const [parserPreviewRowIdx, setParserPreviewRowIdx] = useState(2);
    const [parserPreviewSource, setParserPreviewSource] = useState('');
    const [parserPreviewResult, setParserPreviewResult] = useState('');
    const [parserPreviewTab, setParserPreviewTab] = useState('rendered'); // 'rendered' | 'html'
    const [parserProcessing, setParserProcessing] = useState(false);
    const [parserSuccessMsg, setParserSuccessMsg] = useState('');
    const [parserPreviewInfo, setParserPreviewInfo] = useState(null);

    const handleRunParserPreview = (targetRow = parserPreviewRowIdx) => {
        const activeSheet = sheets.find(s => s.name === selectedTab) || sheets[0];
        const rIdx = Math.max(1, parseInt(targetRow) || 1) - 1;
        if (!activeSheet || !activeSheet.data || activeSheet.data.length <= rIdx) {
            alert('Hàng đã chọn không tồn tại hoặc không có dữ liệu.');
            return;
        }
        const row = activeSheet.data[rIdx] || [];
        const modelName = row[0] || row[1] || `Hàng ${rIdx + 1}`;
        const sourceText = row[parserSourceCol] || '';
        setParserPreviewSource(sourceText);
        
        if (!sourceText || typeof sourceText !== 'string' || sourceText.trim() === '') {
            setParserPreviewInfo({
                rowNum: rIdx + 1,
                modelName,
                sourceLen: 0,
                rowCount: 0,
                empty: true
            });
            setParserPreviewResult('<div style="color: #94a3b8; font-style: italic; padding: 24px; text-align: center;">⚠️ Ô dữ liệu nguồn ở Cột ' + getColLetter(parserSourceCol) + ' của Hàng ' + (rIdx + 1) + ' (' + modelName + ') đang TRỐNG.<br/><span style="font-size: 11.5px; color: #64748b; margin-top: 4px; display: inline-block;">(Vui lòng chọn hàng khác có dữ liệu thông số HTML)</span></div>');
            return;
        }

        const converted = parseAndNormalizeHtmlTable(sourceText, {
            heading: parserHeading,
            tableClass: parserTableClass,
            th1: parserTh1,
            th2: parserTh2,
            keepOriginalHeading: parserKeepOriginalHeading
        });

        const rowMatches = converted ? (converted.match(/<tr/gi) || []).length : 0;
        const actualSpecRows = Math.max(0, rowMatches - 1);

        setParserPreviewInfo({
            rowNum: rIdx + 1,
            modelName,
            sourceLen: sourceText.length,
            rowCount: actualSpecRows,
            empty: false
        });

        setParserPreviewResult(converted);
    };

    const handleRunBatchParser = async () => {
        const activeSheet = sheets.find(s => s.name === selectedTab) || sheets[0];
        if (!activeSheet || !activeSheet.data || activeSheet.data.length === 0) {
            alert('Không tìm thấy dữ liệu trong tab.');
            return;
        }

        setParserProcessing(true);
        setParserSuccessMsg('');

        try {
            const sIdx = Math.max(1, parseInt(parserStartRow) || 1) - 1;
            const eIdx = parserEndRow ? Math.min(activeSheet.data.length, parseInt(parserEndRow)) : activeSheet.data.length;

            let workingData = activeSheet.data.map(r => Array.isArray(r) ? [...r] : []);
            let convertedCount = 0;
            let skippedCount = 0;

            for (let r = sIdx; r < eIdx; r++) {
                const row = workingData[r];
                if (!row) continue;

                const existingTarget = row[parserTargetCol];
                if (parserSkipExisting && existingTarget && String(existingTarget).trim() !== '') {
                    skippedCount++;
                    continue;
                }

                const sourceVal = row[parserSourceCol];
                if (sourceVal && typeof sourceVal === 'string' && sourceVal.trim() !== '') {
                    const converted = parseAndNormalizeHtmlTable(sourceVal, {
                        heading: parserHeading,
                        tableClass: parserTableClass,
                        th1: parserTh1,
                        th2: parserTh2,
                        keepOriginalHeading: parserKeepOriginalHeading
                    });
                    if (converted) {
                        row[parserTargetCol] = converted;
                        convertedCount++;
                    }
                }
            }

            const updatedSheets = sheets.map(s => s.name === selectedTab ? { ...s, data: workingData } : s);
            if (onUpdateSheets) onUpdateSheets(updatedSheets);

            try {
                await fetchApi('/api/products/profile-sheet', {
                    method: 'POST',
                    body: JSON.stringify({ profile: profileSlug, sheets: updatedSheets })
                });
            } catch (e) {
                console.error('Failed to auto-save sheet parser:', e);
            }

            playCompletionChime();
            setParserSuccessMsg(`🎉 Đã chuyển đổi thành công ${convertedCount} hàng (Bỏ qua: ${skippedCount}) trong nháy mắt!`);
        } catch (err) {
            alert('Lỗi chuyển đổi: ' + err.message);
        } finally {
            setParserProcessing(false);
        }
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
    const handleDeleteVariable = handleRemoveVariable;

    // Insert variable tag into prompt textarea at cursor position or append
    const handleInsertVariable = (token) => {
        if (!token) return;
        let tag = token;
        if (!tag.startsWith('{')) {
            if (/^[A-Z]+$/.test(tag)) {
                tag = `{{${tag}}}`;
            } else {
                tag = `{${tag}}`;
            }
        }

        const textarea = promptTextareaRef.current;
        if (textarea) {
            const start = textarea.selectionStart ?? promptText.length;
            const end = textarea.selectionEnd ?? promptText.length;
            const before = promptText.substring(0, start);
            const after = promptText.substring(end);
            const nextText = `${before}${tag}${after}`;
            setPromptText(nextText);
            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + tag.length, start + tag.length);
            }, 0);
        } else {
            setPromptText(prev => `${prev} ${tag}`);
        }
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
                body: JSON.stringify({
                    message: finalPrompt,
                    seriesKey: profileSlug || selectedTab || 'default',
                    useGlossary: true
                })
            });

            if (res?.content) {
                const cleaned = cleanAiArtifactTags(res.content);
                setTestResult(cleaned);
                handleRunAuditOnTest(cleaned);
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
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('runner')}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: activeView === 'runner' ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                                        background: activeView === 'runner' ? '#fff7ed' : 'var(--bg-card)',
                                        color: activeView === 'runner' ? 'var(--accent)' : 'var(--text-secondary)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ⚡ Tác Vụ AI Hàng Loạt
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveView('parser');
                                        if (!parserPreviewResult) {
                                            setTimeout(() => handleRunParserPreview(parserPreviewRowIdx), 50);
                                        }
                                    }}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: activeView === 'parser' ? '1.5px solid #059669' : '1px solid var(--border-color)',
                                        background: activeView === 'parser' ? '#ecfdf5' : 'var(--bg-card)',
                                        color: activeView === 'parser' ? '#059669' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                >
                                    <Zap size={13} /> Chuyển Đổi Bảng HTML (Parser 0 Token)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('glossary')}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        borderRadius: 6,
                                        border: activeView === 'glossary' ? '1.5px solid var(--accent)' : '1px solid var(--border-color)',
                                        background: activeView === 'glossary' ? '#fff7ed' : 'var(--bg-card)',
                                        color: activeView === 'glossary' ? 'var(--accent)' : 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                >
                                    <BookOpen size={14} /> Thư Viện Thuật Ngữ & Series Memory ({glossaryItems.length})
                                </button>
                            </div>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={22} />
                    </button>
                </div>

                {/* Main Content Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {activeView === 'glossary' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Form add new term */}
                            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #cbd5e1' }}>
                                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Plus size={16} /> Thêm Thuật Ngữ / Cụm Từ Mới Vào Thư Viện Dịch Cố Định
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 150px 100px', gap: 10 }}>
                                    <input
                                        type="text"
                                        placeholder="Từ Tiếng Anh (VD: Rated Power)"
                                        value={newEnTerm}
                                        onChange={e => setNewEnTerm(e.target.value)}
                                        style={{ padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Dịch Tiếng Việt cố định (VD: Công suất định mức)"
                                        value={newViTerm}
                                        onChange={e => setNewViTerm(e.target.value)}
                                        style={{ padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Ghi chú (Tùy chọn)"
                                        value={newNotes}
                                        onChange={e => setNewNotes(e.target.value)}
                                        style={{ padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                    />
                                    <select
                                        value={newScope}
                                        onChange={e => setNewScope(e.target.value)}
                                        style={{ padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                    >
                                        <option value="global">Global (Tất cả)</option>
                                        {profileSlug && <option value={profileSlug}>Profile {profileName}</option>}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddGlossaryTerm}
                                        style={{ padding: '7px 12px', fontSize: 13, fontWeight: 700, background: 'var(--gradient-primary)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                                    >
                                        Thêm Từ
                                    </button>
                                </div>
                            </div>

                            {/* Glossary Table */}
                            <div>
                                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <BookOpen size={16} /> Danh Sách Thuật Ngữ Cố Định ({glossaryItems.length})
                                </h4>
                                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                                                <th style={{ padding: '8px 12px' }}>Phạm vi</th>
                                                <th style={{ padding: '8px 12px' }}>Tiếng Anh (Gốc)</th>
                                                <th style={{ padding: '8px 12px' }}>Tiếng Việt (Cố định 100%)</th>
                                                <th style={{ padding: '8px 12px' }}>Ghi chú</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {glossaryItems.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có thuật ngữ nào. Hãy thêm từ đầu tiên ở trên!</td>
                                                </tr>
                                            ) : (
                                                glossaryItems.map(item => (
                                                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: item.scope === 'global' ? '#e0f2fe' : '#fef3c7', color: item.scope === 'global' ? '#0369a1' : '#b45309', fontWeight: 600 }}>
                                                                {item.scope === 'global' ? 'Global' : item.scope}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>{item.source_term}</td>
                                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#15803d' }}>{item.target_term}</td>
                                                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{item.notes || '—'}</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteGlossaryTerm(item.id)}
                                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Series Memory Cache Section */}
                            <div>
                                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ShieldCheck size={16} style={{ color: 'var(--accent)' }} /> Cache Dịch Theo Series / Profile ({memoryItems.length} từ đã tự học)
                                </h4>
                                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                                                <th style={{ padding: '8px 12px' }}>Series Key</th>
                                                <th style={{ padding: '8px 12px' }}>Từ Gốc (Tiếng Anh)</th>
                                                <th style={{ padding: '8px 12px' }}>Nghĩa Đã Khóa (Tiếng Việt)</th>
                                                <th style={{ padding: '8px 12px' }}>Số lần dùng</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {memoryItems.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có bộ nhớ cache nào cho series này. Khi bạn dịch bảng đầu tiên, hệ thống sẽ tự động học và khóa nghĩa tại đây!</td>
                                                </tr>
                                            ) : (
                                                memoryItems.map(m => (
                                                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>{m.series_key}</td>
                                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.source_text}</td>
                                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#047857' }}>{m.translated_text}</td>
                                                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{m.hit_count} lần</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Whitelist section */}
                            <div>
                                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    🛡️ Whitelist Đơn Vị Đo Lường & Từ Viết Tắt Đã Được Miễn Trừ Việt Hóa:
                                </h4>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 80, overflowY: 'auto', padding: 8, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    {whitelistItems.map(w => (
                                        <span key={w.id} style={{ fontSize: 11, padding: '2px 7px', background: '#e2e8f0', color: '#334155', borderRadius: 4, fontWeight: 600 }}>
                                            {w.term}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : activeView === 'parser' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Parser Intro Banner */}
                            <div style={{ padding: '14px 18px', background: '#ecfdf5', borderRadius: 'var(--radius-md)', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Zap size={16} /> Chuyển Đổi Bảng Thông Số Bằng DOM Parser (Thuật Toán Chuẩn)
                                    </div>
                                    <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
                                        Tự động trích xuất mọi cấu trúc bảng/khối DIV thông số thành định dạng thẻ <code>&lt;table class="{parserTableClass}"&gt;</code> chuẩn Web. Tốc độ siêu tốc 0.05s, 0 Token AI, bảo đảm 100% không mất chữ, không bị ngắt đoạn.
                                    </div>
                                </div>
                            </div>

                            {parserSuccessMsg && (
                                <div style={{ padding: '10px 14px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, color: '#15803d', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span>{parserSuccessMsg}</span>
                                    <button type="button" onClick={() => setParserSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d' }}><X size={15} /></button>
                                </div>
                            )}

                            {/* Section 1: Sub-Tab & Cột Nguồn / Cột Đích */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                <div>
                                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                        Chọn Sub-Tab dữ liệu:
                                    </label>
                                    <select
                                        value={selectedTab}
                                        onChange={e => setSelectedTab(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600 }}
                                    >
                                        {sheets.map((s, idx) => (
                                            <option key={idx} value={s.name}>
                                                📄 Tab '{s.name}' ({s.data?.length || 0} hàng)
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                        Cột Nguồn (Chứa mã HTML/DIV thô):
                                    </label>
                                    <select
                                        value={parserSourceCol}
                                        onChange={e => setParserSourceCol(parseInt(e.target.value))}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
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
                                    <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                        Cột Đích (Nơi lưu Bảng HTML Chuẩn):
                                    </label>
                                    <select
                                        value={parserTargetCol}
                                        onChange={e => setParserTargetCol(parseInt(e.target.value))}
                                        style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid #10b981', background: '#ecfdf5', color: '#047857', fontWeight: 700 }}
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
                            </div>

                            {/* Section 2: Cấu hình HTML Output */}
                            <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                    <Table size={16} style={{ color: '#059669' }} /> Cấu hình Cấu Trúc HTML Bảng:
                                </span>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tiêu đề thẻ &lt;h2&gt;:</label>
                                        <input
                                            type="text"
                                            value={parserHeading}
                                            onChange={e => setParserHeading(e.target.value)}
                                            placeholder="Thông số kỹ thuật"
                                            style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tên Class của &lt;table&gt;:</label>
                                        <input
                                            type="text"
                                            value={parserTableClass}
                                            onChange={e => setParserTableClass(e.target.value)}
                                            placeholder="Table_Product_Style"
                                            style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Cột 1 Header &lt;th&gt;:</label>
                                        <input
                                            type="text"
                                            value={parserTh1}
                                            onChange={e => setParserTh1(e.target.value)}
                                            placeholder="Thông số"
                                            style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Cột 2 Header &lt;th&gt;:</label>
                                        <input
                                            type="text"
                                            value={parserTh2}
                                            onChange={e => setParserTh2(e.target.value)}
                                            placeholder="Giá trị"
                                            style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 6, border: '1px solid var(--border-color)' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                        type="checkbox"
                                        id="chk-keep-h"
                                        checked={parserKeepOriginalHeading}
                                        onChange={e => setParserKeepOriginalHeading(e.target.checked)}
                                        style={{ accentColor: '#059669' }}
                                    />
                                    <label htmlFor="chk-keep-h" style={{ fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                        Tự động giữ nguyên tiêu đề &lt;h2&gt; gốc nếu trong ô nguồn đã có sẵn
                                    </label>
                                </div>
                            </div>

                            {/* Section 3: Phạm vi hàng */}
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                    <span>Từ hàng:</span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={parserStartRow}
                                        onChange={e => setParserStartRow(e.target.value)}
                                        style={{ width: 60, padding: '5px 8px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', textAlign: 'center' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                    <span>Đến hàng:</span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={parserEndRow}
                                        onChange={e => setParserEndRow(e.target.value)}
                                        placeholder="Hàng cuối"
                                        style={{ width: 85, padding: '5px 8px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', textAlign: 'center' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto' }}>
                                    <input
                                        type="checkbox"
                                        id="chk-parser-skip"
                                        checked={parserSkipExisting}
                                        onChange={e => setParserSkipExisting(e.target.checked)}
                                        style={{ accentColor: '#059669' }}
                                    />
                                    <label htmlFor="chk-parser-skip" style={{ cursor: 'pointer', fontWeight: 600 }}>
                                        Bỏ qua các hàng đã có dữ liệu ở cột đích
                                    </label>
                                </div>
                            </div>

                            {/* Section 4: Live Preview Box */}
                            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #cbd5e1' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Eye size={16} style={{ color: '#0284c7' }} /> Xem Trước Kết Quả Chuyển Đổi:
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                            <span>Hàng:</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextRow = Math.max(1, parserPreviewRowIdx - 1);
                                                    setParserPreviewRowIdx(nextRow);
                                                    handleRunParserPreview(nextRow);
                                                }}
                                                disabled={parserPreviewRowIdx <= 1}
                                                style={{ padding: '3px 8px', fontSize: 11, background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: 4, cursor: parserPreviewRowIdx <= 1 ? 'not-allowed' : 'pointer' }}
                                                title="Hàng trước"
                                            >
                                                ◀
                                            </button>
                                            <input
                                                type="number"
                                                min={1}
                                                max={sheetData.length || 1}
                                                value={parserPreviewRowIdx}
                                                onChange={e => setParserPreviewRowIdx(parseInt(e.target.value) || 1)}
                                                onKeyDown={e => { if (e.key === 'Enter') handleRunParserPreview(parserPreviewRowIdx); }}
                                                style={{ width: 55, padding: '3px 6px', fontSize: 12, textAlign: 'center', borderRadius: 4, border: '1px solid #cbd5e1' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const nextRow = Math.min(sheetData.length || 999, parserPreviewRowIdx + 1);
                                                    setParserPreviewRowIdx(nextRow);
                                                    handleRunParserPreview(nextRow);
                                                }}
                                                disabled={sheetData.length > 0 && parserPreviewRowIdx >= sheetData.length}
                                                style={{ padding: '3px 8px', fontSize: 11, background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: 4, cursor: (sheetData.length > 0 && parserPreviewRowIdx >= sheetData.length) ? 'not-allowed' : 'pointer' }}
                                                title="Hàng tiếp theo"
                                            >
                                                ▶
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRunParserPreview(parserPreviewRowIdx)}
                                                style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, background: '#0284c7', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                            >
                                                Kiểm tra ngay
                                            </button>
                                        </div>
                                    </div>

                                    {/* Preview Mode Switcher */}
                                    <div style={{ display: 'flex', gap: 4, background: '#e2e8f0', padding: 2, borderRadius: 6 }}>
                                        <button
                                            type="button"
                                            onClick={() => setParserPreviewTab('rendered')}
                                            style={{ padding: '3px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer', background: parserPreviewTab === 'rendered' ? 'white' : 'transparent', color: parserPreviewTab === 'rendered' ? '#0f172a' : '#64748b' }}
                                        >
                                            👁️ Giao Diện Web
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setParserPreviewTab('html')}
                                            style={{ padding: '3px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer', background: parserPreviewTab === 'html' ? 'white' : 'transparent', color: parserPreviewTab === 'html' ? '#0f172a' : '#64748b' }}
                                        >
                                            &lt;/&gt; Mã HTML
                                        </button>
                                    </div>
                                </div>

                                {/* Preview Info Badge & Sample Switchers */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                    {parserPreviewInfo && !parserPreviewInfo.empty ? (
                                        <div style={{ fontSize: 12, color: '#0369a1', background: '#e0f2fe', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #bae6fd' }}>
                                            <span><strong>Hàng {parserPreviewInfo.rowNum}:</strong> {parserPreviewInfo.modelName}</span>
                                            <span>•</span>
                                            <span>Nguồn: <strong>{parserPreviewInfo.sourceLen}</strong> ký tự</span>
                                            <span>•</span>
                                            <span>Trích xuất: <strong>{parserPreviewInfo.rowCount}</strong> dòng thông số</span>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: 11.5, color: '#64748b' }}>Thử kiểm tra nhanh các hàng mẫu:</span>
                                    )}

                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: 11.5, color: '#64748b' }}>Xem nhanh:</span>
                                        {[2, 3, 5].map(rNum => (
                                            <button
                                                key={rNum}
                                                type="button"
                                                onClick={() => {
                                                    setParserPreviewRowIdx(rNum);
                                                    handleRunParserPreview(rNum);
                                                }}
                                                style={{ padding: '2px 8px', fontSize: 11, background: parserPreviewRowIdx === rNum ? '#0284c7' : '#f1f5f9', color: parserPreviewRowIdx === rNum ? 'white' : '#334155', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Hàng {rNum} {rNum === 2 ? '(Phụ kiện)' : rNum === 3 ? '(Bảng chi tiết)' : ''}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Notice if Row 2 only has 1 accessory row */}
                                {parserPreviewInfo && parserPreviewInfo.rowCount === 1 && (
                                    <div style={{ marginBottom: 8, padding: '6px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>💡 Hàng {parserPreviewInfo.rowNum} ({parserPreviewInfo.modelName}) là phụ kiện nên chỉ có 1 dòng thông số "Các model áp dụng". Bấm nút <strong>"Hàng 3 (Bảng chi tiết)"</strong> ở trên để xem bảng nhiều thông số hơn.</span>
                                    </div>
                                )}

                                {/* Preview Content */}
                                {parserPreviewResult ? (
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', padding: 14, maxHeight: 300, overflowY: 'auto' }}>
                                        {parserPreviewTab === 'rendered' ? (
                                            <div>
                                                <style>{`
                                                    .Table_Product_Style, .Table_Products_Style {
                                                        width: 100%;
                                                        border-collapse: collapse;
                                                        margin-top: 8px;
                                                        font-size: 12.5px;
                                                    }
                                                    .Table_Product_Style th, .Table_Products_Style th {
                                                        background: #f1f5f9;
                                                        color: #1e293b;
                                                        font-weight: 700;
                                                        text-align: left;
                                                        padding: 8px 12px;
                                                        border: 1px solid #cbd5e1;
                                                    }
                                                    .Table_Product_Style td, .Table_Products_Style td {
                                                        padding: 8px 12px;
                                                        border: 1px solid #e2e8f0;
                                                        color: #334155;
                                                    }
                                                    .Table_Product_Style tr:nth-child(even), .Table_Products_Style tr:nth-child(even) {
                                                        background: #f8fafc;
                                                    }
                                                    .Table_Product_Style a, .Table_Products_Style a {
                                                        color: #0284c7;
                                                        text-decoration: underline;
                                                        font-weight: 600;
                                                    }
                                                `}</style>
                                                <div dangerouslySetInnerHTML={{ __html: parserPreviewResult }} />
                                            </div>
                                        ) : (
                                            <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#0f172a', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                                                {parserPreviewResult}
                                            </pre>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12.5, border: '1px dashed #cbd5e1', borderRadius: 8 }}>
                                        Bấm <strong>"Kiểm tra ngay"</strong> ở trên để xem trước bảng chuyển đổi mẫu cho hàng đang chọn.
                                    </div>
                                )}
                            </div>

                            {/* Section 5: Batch Run Card */}
                            <div style={{ padding: '16px 20px', background: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1.5px solid #86efac', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Zap size={18} style={{ color: '#16a34a' }} /> Bắt đầu chuyển đổi bảng hàng loạt (0 Token AI):
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#15803d', marginTop: 2 }}>
                                        Xử lý từ <strong>Cột {getColLetter(parserSourceCol)}</strong> sang <strong>Cột {getColLetter(parserTargetCol)}</strong> (Phạm vi: Hàng {parserStartRow} đến {parserEndRow || 'hàng cuối'}).
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRunBatchParser}
                                    disabled={parserProcessing}
                                    style={{
                                        background: '#16a34a',
                                        color: 'white',
                                        border: 'none',
                                        padding: '10px 24px',
                                        fontSize: 13.5,
                                        fontWeight: 700,
                                        borderRadius: 'var(--radius-md)',
                                        cursor: parserProcessing ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
                                    }}
                                >
                                    {parserProcessing ? (
                                        <>
                                            <Loader2 className="spin" size={17} /> Đang chuyển đổi...
                                        </>
                                    ) : (
                                        <>
                                            <Zap size={17} /> ⚡ Bắt Đầu Chuyển Đổi Bảng Ngay (0 Token)
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                    
                    {/* Saved Command Profiles Preset Manager Bar */}
                    <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 240 }}>
                            <Bookmark size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                📁 Cấu hình Prompt Đã Lưu:
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <select
                                    value={selectedSavedProfileId}
                                    onChange={e => handleSelectSavedProfile(e.target.value)}
                                    style={{ width: '100%', padding: '7px 11px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600, outline: 'none', textOverflow: 'ellipsis' }}
                                >
                                    <option value="">-- Chọn Cấu hình Prompt Đã Lưu --</option>
                                    {savedProfiles.map(p => (
                                        <option key={p.id} value={p.id}>
                                            ⭐ {p.name} ({p.variables?.length || 0} biến - Cột {getColLetter(p.targetColIdx)})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                            {selectedSavedProfileId && (
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={handleUpdateCurrentProfile}
                                    style={{ fontSize: 12.5, padding: '6px 14px', background: '#0284c7', color: 'white', border: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}
                                    title="Lưu ghi đè lên cấu hình đang chọn"
                                >
                                    <CheckCircle2 size={15} /> Cập Nhật Cấu Hình Đang Chọn
                                </button>
                            )}

                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={handleSaveCurrentProfile}
                                style={{ fontSize: 12.5, padding: '6px 14px', background: 'var(--gradient-primary)', color: 'white', border: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}
                            >
                                <Save size={15} /> Lưu Cấu Hình Mới
                            </button>

                            {selectedSavedProfileId && (
                                <button
                                    type="button"
                                    onClick={handleDeleteSavedProfile}
                                    style={{ fontSize: 12, padding: '6px 10px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
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

                    {/* Section 1: Sub-Tab, Cột Đích & Số Luồng Song Song (Matching Image 2) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                                Chọn Sub-Tab dữ liệu:
                            </label>
                            <select
                                value={selectedTab}
                                onChange={e => setSelectedTab(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', fontSize: 13, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            >
                                {sheets.map((s, idx) => (
                                    <option key={idx} value={s.name}>
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
                                            if (hTitle && (!v.label || v.label === v.name)) {
                                                updates.label = hTitle;
                                                updates.name = cleanHeaderToSlug(hTitle, newCol);
                                            }
                                            handleUpdateVariable(v.id, updates);
                                        }}
                                        style={{ padding: '6px 10px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                    >
                                        {Array.from({ length: Math.max(maxCols, 1) }).map((_, cIdx) => {
                                            const letter = getColLetter(cIdx);
                                            const headerTitle = getHeaderTitleForCol(cIdx);
                                            return (
                                                <option key={cIdx} value={letter}>
                                                    {letter} {headerTitle ? `(${headerTitle})` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>

                                    {/* BIẾN INPUT (e.g. { thong-so }) */}
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 12.5, fontFamily: 'monospace', color: '#0284c7', fontWeight: 600 }}>
                                        <span style={{ color: '#0369a1', marginRight: 4 }}>{`{`}</span>
                                        <span style={{ flex: 1 }}>{v.name || 'var'}</span>
                                        <span style={{ color: '#0369a1', marginLeft: 4 }}>{`}`}</span>
                                    </div>

                                    {/* Delete Button */}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveVariable(v.id)}
                                        style={{ padding: 6, border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="Xóa biến này"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={handleAddVariable}
                            style={{ marginTop: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 600 }}
                        >
                            <Plus size={14} /> Thêm biến tùy chỉnh
                        </button>
                    </div>

                    {/* Section 3: Câu Lệnh AI (Prompt Template with Click-to-Insert Pills) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                3. Câu Lệnh AI (Prompt Template):
                            </label>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                Bấm để chèn nhanh biến vào Prompt:
                            </span>
                        </div>

                        {/* Click-to-Insert Quick Variable Buttons / Pills */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                            {variables.map((v, idx) => (
                                <button
                                    key={v.id ? `pill-v-${v.id}` : `pill-idx-${idx}`}
                                    type="button"
                                    onClick={() => handleInsertVariable(v.name)}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: 11.5,
                                        fontFamily: 'monospace',
                                        fontWeight: 600,
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid #bfdbfe',
                                        background: '#eff6ff',
                                        color: '#1d4ed8',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4
                                    }}
                                >
                                    <Plus size={12} /> {`{${v.name}}`} <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'sans-serif' }}>(Cột {v.col})</span>
                                </button>
                            ))}
                            {/* Generic Column Tokens */}
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(col => (
                                <button
                                    key={`gen-${col}`}
                                    type="button"
                                    onClick={() => handleInsertVariable(col)}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: 11,
                                        fontFamily: 'monospace',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid #fed7aa',
                                        background: '#fff7ed',
                                        color: '#c2410c',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + {`{{${col}}}`}
                                </button>
                            ))}
                        </div>

                        <textarea
                            ref={promptTextareaRef}
                            value={promptText}
                            onChange={e => setPromptText(e.target.value)}
                            rows={8}
                            placeholder="Nhập câu lệnh của bạn. Sử dụng {ten_bien} tương ứng với danh sách biến ở trên..."
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                fontSize: 13,
                                fontFamily: 'monospace',
                                lineHeight: 1.5,
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    {/* Row Range & Execution Options */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <span>Từ hàng:</span>
                            <input
                                type="number"
                                min={1}
                                value={startRow}
                                onChange={e => setStartRow(e.target.value)}
                                style={{ width: 60, padding: '5px 8px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', textAlign: 'center' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <span>Đến hàng:</span>
                            <input
                                type="number"
                                min={1}
                                value={endRow}
                                onChange={e => setEndRow(e.target.value)}
                                placeholder="Hàng cuối"
                                style={{ width: 85, padding: '5px 8px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', textAlign: 'center' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto' }}>
                            <input
                                type="checkbox"
                                id="chk-skip"
                                checked={skipExisting}
                                onChange={e => setSkipExisting(e.target.checked)}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            <label htmlFor="chk-skip" style={{ cursor: 'pointer', fontWeight: 500 }}>
                                Bỏ qua các hàng đã có dữ liệu ở cột đích
                            </label>
                        </div>
                    </div>

                    {/* Status Matrix Grid & Logs */}
                    {jobs.length > 0 && (
                        <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Layers size={16} style={{ color: 'var(--accent)' }} /> Ma Trận Tiến Độ Hàng ({jobs.length} Hàng):
                                </div>
                                <div style={{ display: 'flex', gap: 12, fontSize: 11.5, fontWeight: 600 }}>
                                    <span style={{ color: '#16a34a' }}>● Hoàn thành: {stats.done}</span>
                                    <span style={{ color: '#2563eb' }}>● Đang chạy: {stats.running}</span>
                                    <span style={{ color: '#dc2626' }}>● Lỗi: {stats.error}</span>
                                    <span style={{ color: '#64748b' }}>● Đã bỏ qua: {stats.skipped}</span>
                                    <span style={{ color: '#94a3b8' }}>○ Đang chờ: {stats.pending}</span>
                                </div>
                            </div>

                            {/* Matrix Grid of Row Badges */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 110, overflowY: 'auto', padding: '6px 2px' }}>
                                {jobs.map(job => (
                                    <button
                                        key={job.rowNum}
                                        type="button"
                                        onClick={() => setSelectedJobDetail(job)}
                                        style={{
                                            padding: '3px 7px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            borderRadius: 4,
                                            border: selectedJobDetail?.rowNum === job.rowNum ? '2px solid #0f172a' : '1px solid transparent',
                                            background: getJobStatusBg(job.status),
                                            color: getJobStatusColor(job.status),
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title={`Hàng ${job.rowNum}: ${job.status.toUpperCase()}${job.error ? ` - Lỗi: ${job.error}` : ''}`}
                                    >
                                        {job.rowNum}
                                    </button>
                                ))}
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
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {auditing ? (
                                        <span style={{ fontSize: 11.5, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Loader2 className="spin" size={12} /> Đang kiểm soát dịch...
                                        </span>
                                    ) : auditResult ? (
                                        auditResult.is100PercentVietnamese ? (
                                            <span style={{ fontSize: 11.5, padding: '2px 8px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <CheckCheck size={13} /> 100% Việt Hóa (Chuẩn Kỹ Thuật)
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: 11.5, padding: '2px 8px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde047', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }} title={`Từ chưa dịch: ${auditResult.untranslatedWords?.join(', ')}`}>
                                                ⚠️ {auditResult.count} từ Anh chưa dịch ({auditResult.untranslatedWords?.slice(0, 3).join(', ')})
                                            </span>
                                        )
                                    ) : null}

                                    <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(testResult)}
                                        style={{ padding: '3px 10px', fontSize: 11.5, background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', borderRadius: 4, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                        <Copy size={12} /> Sao chép kết quả mẫu
                                    </button>
                                </div>
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
                    </>
                    )}

                </div>

                {/* Modal Footer Controls */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Đóng cửa sổ
                        </button>
                    </div>

                    <div>
                        {activeView === 'parser' ? (
                            <button
                                type="button"
                                className="btn btn-success"
                                onClick={handleRunBatchParser}
                                disabled={parserProcessing}
                                style={{
                                    background: '#16a34a',
                                    color: 'white',
                                    border: 'none',
                                    padding: '9px 24px',
                                    fontSize: 13.5,
                                    fontWeight: 700,
                                    borderRadius: 'var(--radius-md)',
                                    cursor: parserProcessing ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                                }}
                            >
                                {parserProcessing ? (
                                    <>
                                        <Loader2 className="spin" size={16} /> Đang chuyển đổi...
                                    </>
                                ) : (
                                    <>
                                        <Zap size={16} /> ⚡ Bắt Đầu Chuyển Đổi Bảng Hàng Loạt (0 Token)
                                    </>
                                )}
                            </button>
                        ) : activeView === 'glossary' ? (
                            <button type="button" className="btn btn-primary" onClick={() => setActiveView('runner')}>
                                Quay lại Trình Chạy AI
                            </button>
                        ) : aiState.isRunning ? (
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
