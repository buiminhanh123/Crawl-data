'use client';
import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { fetchApi } from '@/lib/api';
import {
    Bot, Send, Trash2, Copy, Download, Languages, FileText,
    PenLine, ChevronDown, Loader2, X, Plus, Play, Square,
    RefreshCw, Save, Check, Zap, FileSpreadsheet, Settings,
    Info, User, AlertCircle, RotateCcw, Bell
} from 'lucide-react';

// ══════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════
const DEFAULT_PROMPTS = {
    dich: `Hãy dịch bảng thông số kỹ thuật sau sang tiếng Việt. Yêu cầu:
- Giữ nguyên định dạng bảng (dùng | để chia cột nếu cần)
- Dịch tên thông số sang tiếng Việt tự nhiên
- Giữ nguyên đơn vị đo lường và tên riêng/thương hiệu
- Không thêm/bớt thông số

Nội dung:
{noi-dung}`,
    meta: `Viết meta title (tối đa 60 ký tự) và meta description (130-160 ký tự) chuẩn SEO tiếng Việt. Format output:
**Meta Title:** [title]
**Meta Description:** [description]

Thông tin sản phẩm:
{noi-dung}`,
    sapo: `Viết sapo giới thiệu sản phẩm tiếng Việt (2-3 câu, 60-100 từ). Giọng văn chuyên nghiệp, nhấn mạnh điểm nổi bật. Chỉ trả về đoạn sapo, không thêm tiêu đề.

Thông tin sản phẩm:
{noi-dung}`,
};

const HTML_AUTO_TAGS = [
    'ECLASS', 'ETIM', 'UNSPSC', 'Tuyên bố', 'RoHS',
    'MTBF', 'MTTFD', 'MTTF', 'Thông tin theo Biểu',
];

const DEFAULT_CFG = {
    spreadsheetId: '',
    sheetName: 'Sheet1',
    targetCol: 'D',
    batch: 5,
    startRow: 3,
    endRow: '',
    charLimit: 0,
    skipExisting: true,
};

const DEFAULT_FILTER = {
    enabled: true,
    autoTags: [...HTML_AUTO_TAGS],
    customExclude: '',
    maxFields: 25,
    maxChars: 1500,
};

// ══════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════
function toVarName(str) {
    if (!str) return '';
    const map = {
        'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a', 'ă': 'a', 'ắ': 'a', 'ặ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a',
        'â': 'a', 'ấ': 'a', 'ậ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'đ': 'd',
        'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e', 'ê': 'e', 'ế': 'e', 'ệ': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e',
        'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o', 'ô': 'o', 'ố': 'o', 'ộ': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o',
        'ơ': 'o', 'ớ': 'o', 'ợ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o',
        'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u', 'ư': 'u', 'ứ': 'u', 'ự': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u',
        'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y'
    };
    return str.toLowerCase()
        .split('').map(c => map[c] || c).join('')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');
}

function colToIdx(col) {
    if (!col) return 0;
    const c = (col || '').toUpperCase().trim();
    let r = 0;
    for (let i = 0; i < c.length; i++) r = r * 26 + c.charCodeAt(i) - 64;
    return r - 1;
}

function idxToCol(idx) {
    let col = '';
    let temp = idx;
    while (temp >= 0) {
        col = String.fromCharCode((temp % 26) + 65) + col;
        temp = Math.floor(temp / 26) - 1;
    }
    return col;
}

function getAdjacentCol(col) {
    const idx = colToIdx(col);
    return idxToCol(idx + 1);
}

const AUTO_FILTER_PATTERNS = [
    'ECLASS', 'ETIM', 'UNSPSC',
    'Tuyên bố', 'RoHS', 'Thông tin theo Điều',
    'MTTFD', 'MTBF', 'MTTF'
];

function applyHtmlFilter(text, filter) {
    const rawData = String(text ?? '');
    if (!rawData || rawData.trim() === '') return '';

    if (!filter || !filter.enabled) return rawData;

    const maxChars = parseInt(filter.maxChars) || 0;
    const maxFields = parseInt(filter.maxFields) || 0;
    const extraBlacklist = filter.customExclude || '';

    // Check if contains HTML tags
    if (!/<[^>]+>/.test(rawData)) {
        if (maxChars > 0 && rawData.length > maxChars) {
            return rawData.substring(0, maxChars) + '...';
        }
        return rawData;
    }

    const blacklist = [...AUTO_FILTER_PATTERNS];
    if (extraBlacklist.trim()) {
        extraBlacklist.split(',').map(k => k.trim()).forEach(k => {
            if (k) blacklist.push(k);
        });
    }

    const trMatches = rawData.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const results = [];
    let lastHeader = '';
    let fieldCount = 0;

    for (let i = 0; i < trMatches.length; i++) {
        const tr = trMatches[i];
        if (/<th[\s>]/i.test(tr)) continue;

        const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        const cells = tdMatches.map(td => {
            return td
                .replace(/<[^>]+>/g, '')
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ')
                .replace(/✔/g, '').replace(/✓/g, '')
                .trim();
        }).filter(c => c !== '');

        if (cells.length === 0) continue;
        const key = cells[0] || '';

        const blocked = blacklist.some(p => {
            return key.toLowerCase().indexOf(p.toLowerCase()) === 0 ||
                key.toLowerCase() === p.toLowerCase();
        });
        if (blocked) continue;

        const isHeader = /colspan\s*=\s*["']?2["']?/i.test(tr) || cells.length === 1;
        if (isHeader) {
            lastHeader = key;
            results.push('[' + key + ']');
            continue;
        }

        if (maxFields > 0 && fieldCount >= maxFields) {
            results.push('...[đã lược bỏ]');
            break;
        }

        if (cells.length >= 2) {
            const k = cells[0];
            const v = cells[1];
            if (!k && lastHeader) {
                results.push('  ' + v);
            } else {
                results.push(k + ': ' + v);
                fieldCount++;
            }
        }
    }

    let cleaned = results.join(' | ');

    if (maxChars > 0 && cleaned.length > maxChars) {
        let truncated = cleaned.substring(0, maxChars);
        const lastPipe = truncated.lastIndexOf(' | ');
        if (lastPipe > 0) truncated = truncated.substring(0, lastPipe);
        cleaned = truncated + ' | ...[đã rút gọn]';
    }

    return cleaned || rawData;
}

function substituteVars(prompt, variables, rowData, filter) {
    let text = prompt;
    let hasData = false;
    variables.forEach(v => {
        if (!v.name) return;
        const idx = colToIdx(v.col);
        let val = String(rowData[idx] ?? '');
        val = applyHtmlFilter(val, filter);
        if (val.trim()) hasData = true;
        text = text.replaceAll(`{${v.name}}`, val);
    });
    return { text, hasData };
}

function fmtDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
    return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtTime(ts) {
    const d = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function lsGet(key, def) {
    if (typeof window === 'undefined') return def;
    try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : def; } catch { return def; }
}
function lsSet(key, val) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(val));
}

// ══════════════════════════════════════════════════════
//  UI PRIMITIVES
// ══════════════════════════════════════════════════════
function Section({ title, icon, children, defaultOpen = true, accent }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 8 }}>
            <button onClick={() => setOpen(p => !p)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'var(--bg-secondary)', border: 'none', cursor: 'pointer',
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, color: accent || 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {icon} {title}
                </span>
                <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {open && (
                <div style={{ padding: '12px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {children}
                </div>
            )}
        </div>
    );
}

function FieldLabel({ children }) {
    return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{children}</span>;
}

function FInput({ value, onChange, placeholder, type = 'text', style = {}, disabled }) {
    return (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
            style={{
                width: '100%', padding: '7px 9px', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)', background: disabled ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', transition: 'border-color 0.15s', ...style
            }}
            onFocus={e => { if (!disabled) e.target.style.borderColor = 'var(--accent)'; }}
            onBlur={e => { e.target.style.borderColor = ''; }}
        />
    );
}

function FSelect({ value, onChange, children, style = {} }) {
    return (
        <select value={value} onChange={onChange} style={{
            width: '100%', padding: '7px 9px', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', cursor: 'pointer', ...style
        }}>
            {children}
        </select>
    );
}

function Btn({ children, onClick, disabled, variant = 'primary', small, full, style = {} }) {
    const variants = {
        primary: { background: 'var(--gradient-primary)', color: 'white', border: 'none' },
        danger: { background: 'var(--gradient-danger)', color: 'white', border: 'none' },
        success: { background: 'var(--gradient-success)', color: 'white', border: 'none' },
        secondary: { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' },
        ghost: { background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border-color)' },
    };
    return (
        <button onClick={onClick} disabled={disabled} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: small ? '5px 10px' : '7px 13px', borderRadius: 'var(--radius-sm)',
            fontSize: small ? 11.5 : 12.5, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1, width: full ? '100%' : undefined,
            transition: 'opacity 0.15s', ...variants[variant], ...style
        }}>
            {children}
        </button>
    );
}

// ══════════════════════════════════════════════════════
//  MARKDOWN RENDERER (for chat)
// ══════════════════════════════════════════════════════
function renderMarkdown(text) {
    if (!text) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const codeBlocks = [];
    text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(esc(code.trim()));
        return `%%CB_${idx}%%`;
    });
    text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${esc(code)}</code>`);
    const lines = text.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\s*[\|:\-\s]+\s*$/)) {
            let html = '<table><thead><tr>';
            line.split('|').filter(h => h.trim()).forEach(h => { html += `<th>${h.trim()}</th>`; });
            html += '</tr></thead><tbody>';
            i += 2;
            while (i < lines.length && lines[i].includes('|')) {
                const cells = lines[i].split('|').slice(1);
                if (cells.some(c => c.trim())) {
                    html += '<tr>';
                    cells.forEach(c => { html += `<td>${c.trim()}</td>`; });
                    html += '</tr>';
                }
                i++;
            }
            html += '</tbody></table>';
            result.push(html);
            continue;
        }
        result.push(line);
        i++;
    }
    text = result.join('\n');
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/^---+$/gm, '<hr/>');
    text = text.replace(/^\- (.+)$/gm, '<li>$1</li>');
    text = text.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    text = text.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`);
    text = text.replace(/^(?!<[hultbh]|%%)(.*\S.*)$/gm, '<p>$1</p>');
    codeBlocks.forEach((code, idx) => {
        text = text.replace(`%%CB_${idx}%%`,
            `<div class="ai-code-block"><pre><code>${code}</code></pre><button class="ai-copy-btn" onclick="(function(btn){navigator.clipboard.writeText(btn.previousElementSibling.textContent);btn.textContent='✓';setTimeout(()=>btn.textContent='Copy',1500)})(this)">Copy</button></div>`
        );
    });
    return text;
}

// ══════════════════════════════════════════════════════
//  CHAT UI
// ══════════════════════════════════════════════════════
function TypingIndicator() {
    return (
        <div className="ai-typing">
            <div className="ai-avatar small">🤖</div>
            <div className="ai-typing-dots">
                <div className="ai-typing-dot" /><div className="ai-typing-dot" /><div className="ai-typing-dot" />
            </div>
        </div>
    );
}

function ChatMessage({ msg, onCopy }) {
    const isUser = msg.role === 'user';
    const time = new Date(msg.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return (
        <div className={`ai-message ${isUser ? 'user' : 'bot'}`}>
            {!isUser && <div className="ai-avatar small">🤖</div>}
            <div className={`ai-bubble ${isUser ? 'user' : 'bot'}`}>
                {isUser
                    ? <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    : <div className="ai-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                }
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, gap: 8 }}>
                    <span className="ai-time">{time}</span>
                    {!isUser && (
                        <button onClick={() => onCopy(msg.content)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '2px 4px',
                        }} title="Sao chép">
                            <Copy size={11} /> Chép
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

const CHAT_CHIPS = [
    { id: 'translate', label: 'Dịch thông số', icon: <Languages size={12} />, color: '#0ea5e9', prompt: `Hãy dịch bảng thông số kỹ thuật sau sang tiếng Việt, giữ nguyên định dạng bảng:\n\n` },
    { id: 'meta', label: 'Viết Meta SEO', icon: <FileText size={12} />, color: '#8b5cf6', prompt: `Viết meta title (≤60 ký tự) và meta description (130-160 ký tự) chuẩn SEO tiếng Việt:\n\n` },
    { id: 'sapo', label: 'Viết Sapo', icon: <PenLine size={12} />, color: '#10b981', prompt: `Viết sapo giới thiệu sản phẩm tiếng Việt (2-3 câu, 60-100 từ, nhấn mạnh điểm nổi bật):\n\n` },
];

function ChatUI({ apiStatus }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [activeChip, setActiveChip] = useState(null);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

    const handleCopy = (text) => { navigator.clipboard.writeText(text); };

    const handleChipClick = (chip) => {
        if (activeChip?.id === chip.id) { setActiveChip(null); setInput(''); return; }
        setActiveChip(chip);
        setInput(chip.prompt);
        textareaRef.current?.focus();
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text || loading) return;
        const userMsg = { role: 'user', content: text, ts: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInput(''); setActiveChip(null); setLoading(true);
        const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
        try {
            const data = await fetchApi('/api/ai/chat', {
                method: 'POST', body: JSON.stringify({ message: text, history }),
            });
            setMessages(prev => [...prev, { role: 'assistant', content: data.content || '(Không có phản hồi)', ts: Date.now() }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Lỗi: ${err.message}`, ts: Date.now() }]);
        } finally { setLoading(false); }
    };

    const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
    const handleInputChange = (e) => {
        setInput(e.target.value);
        const ta = e.target; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
    };
    const handleDownload = () => {
        const content = messages.map(m => `[${m.role === 'user' ? 'Bạn' : 'AI'}]\n${m.content}`).join('\n\n---\n\n');
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = `chat-${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div className="ai-layout no-panel" style={{ height: 'calc(100vh - 130px)' }}>
            <div className="ai-chat-window">
                {/* Quick chips */}
                <div className="ai-chips">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        <Zap size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Nhanh:
                    </span>
                    {CHAT_CHIPS.map(chip => (
                        <button key={chip.id} className={`ai-chip ${activeChip?.id === chip.id ? 'active' : ''}`}
                            onClick={() => handleChipClick(chip)}
                            style={activeChip?.id === chip.id ? { borderColor: chip.color, color: chip.color, background: `${chip.color}15` } : {}}>
                            <span style={{ color: chip.color }}>{chip.icon}</span>{chip.label}
                        </button>
                    ))}
                    {messages.length > 0 && (
                        <>
                            <button className="ai-chip" onClick={handleDownload}><Download size={11} /> Tải xuống</button>
                            <button className="ai-chip" onClick={() => setMessages([])}><Trash2 size={11} /> Xóa chat</button>
                        </>
                    )}
                </div>

                {/* Messages */}
                <div className="ai-messages">
                    {messages.length === 0 ? (
                        <div className="ai-empty">
                            <div className="ai-empty-icon">🤖</div>
                            <div>
                                <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Xin chào! Tôi là AI hỗ trợ nội dung</p>
                                <p style={{ fontSize: 12.5, lineHeight: 1.6 }}>Dùng nút nhanh hoặc gõ câu hỏi bất kỳ bên dưới.</p>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                {CHAT_CHIPS.map(chip => (
                                    <button key={chip.id} onClick={() => handleChipClick(chip)} style={{
                                        padding: '7px 14px', borderRadius: 20, border: `1px solid ${chip.color}40`,
                                        background: `${chip.color}10`, color: chip.color, fontSize: 12.5, fontWeight: 500,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                    }}>
                                        {chip.icon} {chip.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : messages.map((msg, i) => <ChatMessage key={i} msg={msg} onCopy={handleCopy} />)}
                    {loading && <TypingIndicator />}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="ai-input-area">
                    {activeChip && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>
                            <span className="ai-mode-badge" style={{ borderColor: `${activeChip.color}40`, color: activeChip.color, background: `${activeChip.color}15` }}>
                                {activeChip.icon} {activeChip.label}
                            </span>
                            <span>— dán nội dung sau prompt rồi gửi</span>
                            <button onClick={() => { setActiveChip(null); setInput(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={13} /></button>
                        </div>
                    )}
                    <div className="ai-input-row">
                        <textarea ref={textareaRef} className="ai-textarea" rows={1}
                            placeholder="Nhập tin nhắn... (Shift+Enter để xuống dòng)"
                            value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} disabled={loading}
                        />
                        <button className="ai-send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
                            {loading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                        </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Enter gửi · Shift+Enter xuống dòng</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{messages.length > 0 ? `${messages.length} tin nhắn` : ''}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════
//  BATCH TOOL
// ══════════════════════════════════════════════════════
function BatchTool({ tabKey }) {
    const isDich = tabKey === 'dich';
    const lsKey = k => `ai_${k}_${tabKey}`;

    // ── Config state (persisted) ──
    const [cfg, setCfg] = useState(() => lsGet(lsKey('cfg'), DEFAULT_CFG));
    const [vars, setVars] = useState(() => lsGet(lsKey('vars'), [{ name: 'noi-dung', col: 'B' }]));
    const [prompt, setPrompt] = useState(() => lsGet(lsKey('prompt'), isDich ? DEFAULT_PROMPTS.dich : DEFAULT_PROMPTS.meta));
    const [filter, setFilter] = useState(() => lsGet(lsKey('filter'), DEFAULT_FILTER));
    const [metaSapoMode, setMetaSapoMode] = useState(() => lsGet(lsKey('mode'), 'meta')); // for metasapo tab

    // ── Profile & template state ──
    const [profiles, setProfiles] = useState(() => lsGet(lsKey('profiles'), {}));
    const [profileName, setProfileName] = useState('');
    const [selectedProfile, setSelectedProfile] = useState('');
    const [templates, setTemplates] = useState(() => lsGet(lsKey('templates'), {}));
    const [templateName, setTemplateName] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');

    // ── Runtime state ──
    const [localSheets, setLocalSheets] = useState([]);
    const [sheetColumns, setSheetColumns] = useState([]);
    const [jobs, setJobs] = useState([]); // {rowNum, status:'pending'|'running'|'done'|'error'|'skipped', result, error}
    const [running, setRunning] = useState(false);
    const [history, setHistory] = useState(() => lsGet('ai_history', []));
    const [toast, setToast] = useState(null);
    const [previewText, setPreviewText] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const abortRef = useRef(false);

    // ── Persist config ──
    useEffect(() => { lsSet(lsKey('cfg'), cfg); }, [cfg]);
    useEffect(() => { lsSet(lsKey('vars'), vars); }, [vars]);
    useEffect(() => { lsSet(lsKey('prompt'), prompt); }, [prompt]);
    useEffect(() => { lsSet(lsKey('filter'), filter); }, [filter]);
    useEffect(() => { lsSet(lsKey('profiles'), profiles); }, [profiles]);
    useEffect(() => { lsSet(lsKey('templates'), templates); }, [templates]);
    useEffect(() => { if (!isDich) lsSet(lsKey('mode'), metaSapoMode); }, [metaSapoMode, isDich]);


    // ── Toast helper ──
    const showToast = useCallback((msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Load local sheets ──
    const loadLocalSheets = useCallback(async () => {
        try {
            const data = await fetchApi('/api/local-sheets');
            setLocalSheets(data.sheets || []);
        } catch { setLocalSheets([]); }
    }, []);

    useEffect(() => {
        loadLocalSheets();
    }, [loadLocalSheets]);

    useEffect(() => {
        const fetchCols = async () => {
            if (!cfg.spreadsheetId) { setSheetColumns([]); return; }
            try {
                const data = await fetchApi(`/api/local-sheets/${cfg.spreadsheetId}/data`);
                setSheetColumns(data.columns || []);
            } catch { setSheetColumns([]); }
        };
        fetchCols();
    }, [cfg.spreadsheetId]);

    // ── Profile actions ──
    const saveProfile = () => {
        if (!profileName.trim()) return;
        const p = { cfg, vars, prompt, filter };
        const newProfiles = { ...profiles, [profileName.trim()]: p };
        setProfiles(newProfiles);
        setProfileName('');
        showToast(`Đã lưu profile "${profileName.trim()}"`);
    };
    const loadProfile = (name) => {
        const p = profiles[name];
        if (!p) return;
        if (p.cfg) setCfg(p.cfg);
        if (p.vars) setVars(p.vars);
        if (p.prompt) setPrompt(p.prompt);
        if (p.filter) setFilter(p.filter);
        setSelectedProfile(name);
        showToast(`Đã tải profile "${name}"`);
    };
    const deleteProfile = () => {
        if (!selectedProfile) return;
        const { [selectedProfile]: _, ...rest } = profiles;
        setProfiles(rest);
        setSelectedProfile('');
    };

    // ── Template actions ──
    const saveTemplate = () => {
        if (!templateName.trim()) return;
        const newTemplates = { ...templates, [templateName.trim()]: prompt };
        setTemplates(newTemplates);
        setTemplateName('');
        showToast(`Đã lưu template "${templateName.trim()}"`);
    };
    const loadTemplate = (name) => {
        if (templates[name]) { setPrompt(templates[name]); setSelectedTemplate(name); }
    };
    const deleteTemplate = () => {
        if (!selectedTemplate) return;
        const { [selectedTemplate]: _, ...rest } = templates;
        setTemplates(rest);
        setSelectedTemplate('');
    };

    // ── Variables helpers ──
    const addVar = () => setVars(v => [...v, { name: 'bien-moi', col: 'A' }]);
    const removeVar = (i) => setVars(v => v.filter((_, idx) => idx !== i));
    const updateVar = (i, field, val) => {
        setVars(v => v.map((item, idx) => {
            if (idx !== i) return item;
            const updated = { ...item, [field]: val };
            if (field === 'name') updated.name = toVarName(val);
            return updated;
        }));
    };

    // ── Preview prompt ──
    const handlePreview = async () => {
        if (!cfg.spreadsheetId || vars.length === 0) { showToast('Cần cấu hình Bảng dữ liệu và biến nguồn', 'danger'); return; }
        try {
            const data = await fetchApi(`/api/local-sheets/${cfg.spreadsheetId}/data`);
            const firstRowObj = data.rows.find(r => r.row_number === parseInt(cfg.startRow)) || data.rows[0];
            if (!firstRowObj) { showToast('Không tìm thấy dòng tương ứng để xem trước', 'danger'); return; }

            const rowArr = [];
            data.columns.forEach(c => {
                rowArr[colToIdx(c.name)] = firstRowObj.cells[c.name] || '';
            });

            const currentPrompt = isDich ? prompt : (metaSapoMode === 'meta' ? prompt : prompt);
            const { text: preview } = substituteVars(currentPrompt, vars, rowArr, filter);
            setPreviewText(preview);
            setShowPreview(true);
        } catch (err) {
            showToast('Lỗi preview: ' + err.message, 'danger');
        }
    };

    // ── Test API ──
    const handleTestAPI = async () => {
        setTestLoading(true);
        try {
            const data = await fetchApi('/api/ai/chat', {
                method: 'POST',
                body: JSON.stringify({ message: 'Xin chào, trả lời ngắn gọn: bạn đang hoạt động tốt không?', history: [] }),
            });
            showToast(`Test OK: "${(data.content || '').slice(0, 60)}..."`, 'success');
        } catch (err) {
            showToast('Test thất bại: ' + err.message, 'danger');
        } finally { setTestLoading(false); }
    };

    // ── Batch run ──
    const handleStart = async () => {
        if (!cfg.spreadsheetId || !cfg.targetCol || vars.length === 0) {
            showToast('Cần cấu hình Bảng dữ liệu, cột đích và biến nguồn', 'danger'); return;
        }
        setRunning(true);
        abortRef.current = false;
        const startTime = Date.now();

        try {
            const dataRes = await fetchApi(`/api/local-sheets/${cfg.spreadsheetId}/data`);
            const start = parseInt(cfg.startRow) || 3;
            const end = parseInt(cfg.endRow) || 999999;
            const targetRows = dataRes.rows.filter(r => r.row_number >= start && r.row_number <= end);
            if (targetRows.length === 0) { showToast('Không có dữ liệu trong khoảng đã chọn', 'danger'); setRunning(false); return; }

            const batchSize = Math.max(1, parseInt(cfg.batch) || 5);
            const charLimit = parseInt(cfg.charLimit) || 0;
            const currentPrompt = prompt;

            // Formatted rows matching array indexes
            const formattedRows = targetRows.map(r => {
                const rowArr = [];
                dataRes.columns.forEach(c => {
                    rowArr[colToIdx(c.name)] = r.cells[c.name] || '';
                });
                return {
                    rowNum: r.row_number,
                    row: rowArr
                };
            });

            // Init jobs
            const initJobs = formattedRows.map(f => ({
                rowNum: f.rowNum, row: f.row,
                status: 'pending', result: null, error: null,
            }));
            setJobs([...initJobs]);

            let done = 0, errors = 0;
            const allJobs = [...initJobs];

            const errorCol = getAdjacentCol(cfg.targetCol);

            const shortenIfNeeded = async (content, maxLength) => {
                if (!maxLength || maxLength <= 0) return content;
                if (!content || !content.trim()) return content;
                if (content.length <= maxLength) return content;

                const shortenPrompt = `Hãy rút gọn đoạn văn sau xuống còn tối đa ${maxLength} ký tự, giữ nguyên ý nghĩa, không cắt giữa chừng, không thêm giải thích:\n${content}`;
                try {
                    const res = await fetchApi('/api/ai/chat', {
                        method: 'POST',
                        body: JSON.stringify({ message: shortenPrompt, history: [] }),
                    });
                    if (res.content && res.content.trim()) {
                        return res.content.trim();
                    }
                } catch (e) {
                    console.error('Failed to shorten content:', e);
                }
                return content;
            };

            for (let i = 0; i < allJobs.length; i += batchSize) {
                if (abortRef.current) break;
                const batch = allJobs.slice(i, i + batchSize);

                // Mark running
                setJobs(prev => prev.map(j =>
                    batch.find(b => b.rowNum === j.rowNum) ? { ...j, status: 'running' } : j
                ));

                await Promise.all(batch.map(async (job) => {
                    if (abortRef.current) { job.status = 'pending'; return; }
                    try {
                        // Skip existing
                        if (cfg.skipExisting) {
                            const targetIdx = colToIdx(cfg.targetCol);
                            if (job.row[targetIdx]?.toString().trim()) {
                                job.status = 'skipped'; done++;
                                setJobs(prev => prev.map(j => j.rowNum === job.rowNum ? { ...job } : j));
                                return;
                            }
                        }
                        // Build prompt
                        const { text: builtPrompt, hasData } = substituteVars(currentPrompt, vars, job.row, filter);
                        if (!hasData) {
                            throw new Error('Tất cả biến đều trống, bỏ qua');
                        }

                        // Call AI
                        let res = await fetchApi('/api/ai/chat', {
                            method: 'POST',
                            body: JSON.stringify({ message: builtPrompt, history: [] }),
                        });

                        // Retry if AI returns empty (up to 3 retries)
                        let content = res.content || '';
                        if (!content || content.trim() === '') {
                            for (let retry = 0; retry < 3; retry++) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                res = await fetchApi('/api/ai/chat', {
                                    method: 'POST',
                                    body: JSON.stringify({ message: builtPrompt, history: [] }),
                                });
                                content = res.content || '';
                                if (content && content.trim()) break;
                            }
                        }

                        if (!content || content.trim() === '') {
                            throw new Error('AI trả về rỗng sau 3 lần thử');
                        }

                        // Shorten if needed
                        let finalContent = content.trim();
                        if (charLimit > 0 && finalContent.length > charLimit) {
                            finalContent = await shortenIfNeeded(finalContent, charLimit);

                            // Tolerance check 10%: auto retry up to 3 times if it still exceeds
                            if (finalContent.length > charLimit * 1.1) {
                                let shortenRetry = 0;
                                while (shortenRetry < 3 && finalContent.length > charLimit * 1.1) {
                                    shortenRetry++;
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    const retryPrompt = `Hãy viết lại đoạn sau, bắt buộc không được vượt quá ${charLimit} ký tự, giữ nguyên ý nghĩa, không thêm giải thích:\n${finalContent}`;
                                    try {
                                        const retryRes = await fetchApi('/api/ai/chat', {
                                            method: 'POST',
                                            body: JSON.stringify({ message: retryPrompt, history: [] }),
                                        });
                                        if (retryRes.content && retryRes.content.trim()) {
                                            finalContent = retryRes.content.trim();
                                        }
                                    } catch (e) {
                                        console.error('Shorten retry failed:', e);
                                    }
                                }
                            }

                            // If still exceeds tolerance, throw error
                            if (finalContent.length > charLimit * 1.1) {
                                throw new Error(`Vượt giới hạn sau 3 lần rút gọn: ${finalContent.length}/${charLimit}`);
                            }
                        }

                        // Write to local sheet
                        await fetchApi(`/api/local-sheets/${cfg.spreadsheetId}/write`, {
                            method: 'POST',
                            body: JSON.stringify({
                                row_number: job.rowNum,
                                col_name: cfg.targetCol,
                                value: finalContent
                            })
                        });

                        // Clear error cell
                        await fetchApi(`/api/local-sheets/${cfg.spreadsheetId}/write`, {
                            method: 'POST',
                            body: JSON.stringify({
                                row_number: job.rowNum,
                                col_name: errorCol,
                                value: ''
                            })
                        }).catch(e => console.warn('Clear error cell failed:', e));

                        job.status = 'done'; job.result = finalContent; done++;
                    } catch (err) {
                        job.status = 'error'; job.error = err.message; errors++;

                        // Write error adjacent to target column
                        await fetchApi(`/api/local-sheets/${cfg.spreadsheetId}/write`, {
                            method: 'POST',
                            body: JSON.stringify({
                                row_number: job.rowNum,
                                col_name: errorCol,
                                value: `❌ ${err.message}`
                            })
                        }).catch(e => console.warn('Write error cell failed:', e));
                    }
                    setJobs(prev => prev.map(j => j.rowNum === job.rowNum ? { ...job } : j));
                }));
            }

            // Save history entry
            const duration = Date.now() - startTime;
            const localSheetObj = localSheets.find(s => s.id === parseInt(cfg.spreadsheetId));
            const histEntry = {
                id: Date.now(),
                ts: Date.now(),
                tabKey,
                mode: !isDich ? metaSapoMode : 'dich',
                label: isDich ? 'Dịch thông số' : (metaSapoMode === 'meta' ? 'Viết Meta SEO' : 'Viết Sapo'),
                sheetName: localSheetObj ? localSheetObj.name : 'Bảng nội bộ',
                total: allJobs.length,
                done,
                errors,
                durationMs: duration,
                preview: allJobs.find(j => j.status === 'done')?.result?.slice(0, 120) || '',
            };
            const newHistory = [histEntry, ...history].slice(0, 30);
            setHistory(newHistory);
            lsSet('ai_history', newHistory);
            showToast(`Hoàn thành: ${done} done · ${errors} lỗi — ${fmtDuration(duration)}`);
        } catch (err) {
            showToast('Lỗi batch: ' + err.message, 'danger');
        } finally {
            setRunning(false);
        }
    };

    const handleStop = () => { abortRef.current = true; setRunning(false); };

    const handleRetry = async () => {
        const errorJobs = jobs.filter(j => j.status === 'error');
        if (errorJobs.length === 0) { showToast('Không có hàng lỗi để retry'); return; }
        // Reset error jobs to pending and rerun
        setJobs(prev => prev.map(j => j.status === 'error' ? { ...j, status: 'pending' } : j));
        // Simple retry: re-trigger with only error rows
        showToast(`Đang retry ${errorJobs.length} hàng lỗi...`);
        // TODO: could re-run just those rows
    };

    const handleLoadHistory = () => {
        setHistory(lsGet('ai_history', []));
        showToast('Đã tải lại lịch sử');
    };
    const clearHistory = () => { setHistory([]); lsSet('ai_history', []); };

    // ── Stats ──
    const stats = {
        total: jobs.length,
        done: jobs.filter(j => j.status === 'done' || j.status === 'skipped').length,
        running: jobs.filter(j => j.status === 'running').length,
        error: jobs.filter(j => j.status === 'error').length,
        pending: jobs.filter(j => j.status === 'pending').length,
    };

    // ── Batch boxes display ──
    const batchSize = Math.max(1, Math.min(20, parseInt(cfg.batch) || 5));
    // Last N jobs for display
    const displayJobs = jobs.slice(-batchSize);
    const boxStatuses = Array.from({ length: batchSize }, (_, i) => displayJobs[i]?.status || 'idle');

    const boxColor = (s) => ({
        idle: 'var(--border-color)',
        pending: 'var(--border-color)',
        running: '#3b82f6',
        done: '#10b981',
        skipped: '#f59e0b',
        error: '#ef4444',
    }[s] || 'var(--border-color)');

    const historyForTab = history.filter(h => h.tabKey === tabKey);

    // ══ RENDER ══
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 360px', gap: 16, height: 'calc(100vh - 130px)', minHeight: 600 }}>

            {/* ──────── COLUMN 1: System Configs (Left) ──────── */}
            <div style={{
                overflowY: 'auto', padding: '0 12px 16px 0', borderRight: '1px solid var(--border-color)',
                display: 'flex', flexDirection: 'column', gap: 12
            }}>
                {/* CẤU HÌNH */}
                <Section title="Cấu Hình" icon="⚙️" accent="#f97316">
                    <div>
                        <FieldLabel>Bảng dữ liệu</FieldLabel>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <FSelect value={cfg.spreadsheetId} onChange={e => setCfg(p => ({ ...p, spreadsheetId: e.target.value }))} style={{ flex: 1 }}>
                                <option value="">-- Chọn bảng --</option>
                                {localSheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </FSelect>
                            <Btn onClick={loadLocalSheets} small variant="ghost" style={{ flexShrink: 0 }}>
                                <RefreshCw size={12} />
                            </Btn>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <FieldLabel>Cột ghi kết quả</FieldLabel>
                            <FSelect value={cfg.targetCol} onChange={e => setCfg(p => ({ ...p, targetCol: e.target.value }))}>
                                <option value="">-- Chọn cột --</option>
                                {sheetColumns.map(c => <option key={c.name} value={c.name}>{`${c.header_label} [${c.name}]`}</option>)}
                            </FSelect>
                        </div>
                        <div>
                            <FieldLabel>Batch</FieldLabel>
                            <FInput type="number" value={cfg.batch} onChange={e => setCfg(p => ({ ...p, batch: e.target.value }))} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <FieldLabel>Hàng đầu</FieldLabel>
                            <FInput type="number" value={cfg.startRow} onChange={e => setCfg(p => ({ ...p, startRow: e.target.value }))} />
                        </div>
                        <div>
                            <FieldLabel>Hàng cuối (để trống = Auto)</FieldLabel>
                            <FInput type="number" value={cfg.endRow} placeholder="Auto" onChange={e => setCfg(p => ({ ...p, endRow: e.target.value }))} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                            <FieldLabel>Giới hạn ký tự output (0==∞)</FieldLabel>
                            <FInput type="number" value={cfg.charLimit} onChange={e => setCfg(p => ({ ...p, charLimit: e.target.value }))} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <input type="checkbox" checked={cfg.skipExisting} onChange={e => setCfg(p => ({ ...p, skipExisting: e.target.checked }))} />
                                Bỏ qua hàng đã có dữ liệu
                            </label>
                        </div>
                    </div>
                </Section>

                {/* PROFILE */}
                <Section title="Profile" icon="👤" accent="#8b5cf6" defaultOpen={false}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <FSelect value={selectedProfile} onChange={e => { setSelectedProfile(e.target.value); loadProfile(e.target.value); }} style={{ flex: 1 }}>
                            <option value="">-- Chọn profile --</option>
                            {Object.keys(profiles).map(k => <option key={k} value={k}>{k}</option>)}
                        </FSelect>
                        <Btn onClick={deleteProfile} disabled={!selectedProfile} small variant="danger"><Trash2 size={11} /> Xóa</Btn>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <FInput value={profileName} placeholder="Tên profile mới..." onChange={e => setProfileName(e.target.value)} />
                        <Btn onClick={saveProfile} disabled={!profileName.trim()} small><Save size={11} /> Lưu</Btn>
                    </div>
                </Section>

                {/* LỌC HTML (only for Dịch) */}
                {isDich && (
                    <Section title="Lọc HTML / Thông số" icon="🔧" accent="#ef4444" defaultOpen={false}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={filter.enabled} onChange={e => setFilter(p => ({ ...p, enabled: e.target.checked }))} />
                            Bật lọc tự động (phát hiện HTML table và áp dụng filter)
                        </label>
                        <div>
                            <FieldLabel>Tự động bỏ các field chứa từ khóa:</FieldLabel>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {filter.autoTags.map((tag, i) => (
                                    <span key={i} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 7px', borderRadius: 12,
                                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                        fontSize: 11, color: '#ef4444',
                                    }}>
                                        {tag}
                                        <button onClick={() => setFilter(p => ({ ...p, autoTags: p.autoTags.filter((_, j) => j !== i) }))}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, lineHeight: 1 }}>
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))}
                                <button onClick={() => {
                                    const tag = window.prompt('Thêm từ khóa lọc:');
                                    if (tag?.trim()) setFilter(p => ({ ...p, autoTags: [...p.autoTags, tag.trim()] }));
                                }} style={{ padding: '2px 7px', borderRadius: 12, border: '1px dashed var(--border-color)', background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>
                                    + Thêm
                                </button>
                            </div>
                        </div>
                        <div>
                            <FieldLabel>Loại trừ thêm (phân cách bằng dấu phẩy, tùy chọn)</FieldLabel>
                            <FInput value={filter.customExclude} placeholder="VD: Lưu ý khi sử dụng, Độ ẩm" onChange={e => setFilter(p => ({ ...p, customExclude: e.target.value }))} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div>
                                <FieldLabel>Field tối đa (0==∞)</FieldLabel>
                                <FInput type="number" value={filter.maxFields} onChange={e => setFilter(p => ({ ...p, maxFields: parseInt(e.target.value) || 0 }))} />
                            </div>
                            <div>
                                <FieldLabel>Ký tự tối đa (0==∞)</FieldLabel>
                                <FInput type="number" value={filter.maxChars} onChange={e => setFilter(p => ({ ...p, maxChars: parseInt(e.target.value) || 0 }))} />
                            </div>
                        </div>
                        <Btn onClick={() => setFilter(DEFAULT_FILTER)} variant="ghost" small><RotateCcw size={11} /> Reset về mặc định</Btn>
                    </Section>
                )}
            </div>

            {/* ──────── COLUMN 2: Prompt Workspace (Center) ──────── */}
            <div style={{
                overflowY: 'auto', padding: '0 8px 16px 8px',
                display: 'flex', flexDirection: 'column', gap: 12
            }}>
                {/* BIẾN NGUỒN */}
                <Section title="Biến Nguồn" icon="🔤" accent="#0ea5e9">
                    {vars.length > 0 && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 90px 110px 24px',
                            gap: 5,
                            alignItems: 'center',
                            maxHeight: 140,
                            overflowY: 'auto',
                            paddingRight: 4,
                            position: 'relative'
                        }}>
                            {/* Sticky Header */}
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>Tên biến</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'inline-block', width: '100%', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>Cột</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'inline-block', width: '100%', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>Placeholder</span>
                            <span style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }} />

                            {vars.map((v, i) => (
                                <Fragment key={i}>
                                    <FInput value={v.name} placeholder="ten_bien" onChange={e => updateVar(i, 'name', e.target.value)} />
                                    <FSelect value={v.col} onChange={e => updateVar(i, 'col', e.target.value)} style={{ padding: '0 4px', height: 32, fontSize: 11.5 }}>
                                        {sheetColumns.length > 0 ? (
                                            sheetColumns.map(c => <option key={c.name} value={c.name}>{`${c.name} (${c.header_label.slice(0, 8)})`}</option>)
                                        ) : (
                                            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(l => <option key={l} value={l}>{l}</option>)
                                        )}
                                    </FSelect>
                                    <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                        <code style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(249,115,22,0.08)', padding: '3px 7px', borderRadius: 4, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '100%' }}>
                                            {`{${v.name}}`}
                                        </code>
                                    </div>
                                    <button onClick={() => removeVar(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: 2, justifyContent: 'center', alignItems: 'center' }}>
                                        <X size={13} />
                                    </button>
                                </Fragment>
                            ))}
                        </div>
                    )}
                    <Btn onClick={addVar} variant="ghost" small full style={{ marginTop: vars.length > 0 ? 8 : 0 }}>
                        <Plus size={12} /> Thêm biến
                    </Btn>
                </Section>

                {/* PROMPT */}
                <Section title="Prompt" icon="📝" accent="#10b981">
                    {/* Meta & Sapo mode toggle */}
                    {!isDich && (
                        <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden', marginBottom: 4 }}>
                            {['meta', 'sapo'].map(mode => (
                                <button key={mode} onClick={() => {
                                    setMetaSapoMode(mode);
                                    setPrompt(DEFAULT_PROMPTS[mode]);
                                }} style={{
                                    flex: 1, padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    background: metaSapoMode === mode ? 'var(--gradient-primary)' : 'var(--bg-secondary)',
                                    color: metaSapoMode === mode ? 'white' : 'var(--text-muted)',
                                    transition: 'all 0.15s',
                                }}>
                                    {mode === 'meta' ? <><FileText size={11} style={{ display: 'inline', marginRight: 4 }} />Meta SEO</> : <><PenLine size={11} style={{ display: 'inline', marginRight: 4 }} />Viết Sapo</>}
                                </button>
                            ))}
                        </div>
                    )}
                    <div style={{ position: 'relative' }}>
                        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                            style={{
                                width: '100%', minHeight: 180, resize: 'vertical', padding: '9px 10px',
                                border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                fontSize: 12.5, fontFamily: 'Inter, sans-serif', outline: 'none', lineHeight: 1.5,
                            }}
                            placeholder={`VD: Viết meta SEO cho {ten_sp} thương hiệu {thuong_hieu}`}
                        />
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
                            Dùng <code style={{ color: 'var(--accent)' }}>{'{ten_bien}'}</code> để chèn dữ liệu từ cột
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <Btn onClick={handlePreview} variant="ghost" small>👁 Preview prompt (2 hàng đầu)</Btn>
                        {isDich && (
                            <Btn onClick={() => setPrompt(DEFAULT_PROMPTS.dich)} variant="ghost" small>
                                <RotateCcw size={11} /> Mặc định
                            </Btn>
                        )}
                    </div>
                </Section>

                {/* PROMPT TEMPLATES */}
                <Section title="Prompt Templates" icon="📋" accent="#f59e0b" defaultOpen={false}>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <FSelect value={selectedTemplate} onChange={e => { setSelectedTemplate(e.target.value); loadTemplate(e.target.value); }} style={{ flex: 1 }}>
                            <option value="">-- Chọn template --</option>
                            {Object.keys(templates).map(k => <option key={k} value={k}>{k}</option>)}
                        </FSelect>
                        <Btn onClick={deleteTemplate} disabled={!selectedTemplate} small variant="danger"><Trash2 size={11} /> Xóa</Btn>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lưu prompt hiện tại thành template để dùng lại sau.</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <FInput value={templateName} placeholder="Tên template mới..." onChange={e => setTemplateName(e.target.value)} />
                        <Btn onClick={saveTemplate} disabled={!templateName.trim()} small><Save size={11} /> Lưu</Btn>
                    </div>
                </Section>
            </div>

            {/* ──────── COLUMN 3: Runner & Logs (Right) ──────── */}
            <div style={{
                overflowY: 'auto', padding: '0 0 16px 12px', borderLeft: '1px solid var(--border-color)',
                display: 'flex', flexDirection: 'column', gap: 16
            }}>
                {/* SMART BATCH */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-card)' }}>
                    <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>⚡ Smart Batch</span>
                        <span style={{
                            padding: '2px 9px', borderRadius: 10, fontSize: 10.5, fontWeight: 700,
                            background: running ? 'rgba(59,130,246,0.1)' : 'var(--bg-card)',
                            color: running ? '#3b82f6' : 'var(--text-muted)',
                            border: `1px solid ${running ? '#3b82f620' : 'var(--border-color)'}`,
                        }}>
                            {running ? '● RUNNING' : jobs.length > 0 ? (stats.error > 0 ? '● ERROR' : '● IDLE') : '● IDLE'}
                        </span>
                    </div>
                    <div style={{ padding: '14px 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Batch boxes */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 115, overflowY: 'auto', paddingRight: 2 }}>
                            {Array.from({ length: batchSize }, (_, i) => {
                                const s = boxStatuses[i] || 'idle';
                                return (
                                    <div key={i} style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        background: boxColor(s),
                                        border: `2px solid ${s === 'running' ? '#3b82f6' : 'transparent'}`,
                                        transition: 'all 0.3s',
                                        animation: s === 'running' ? 'aiPulse 1s infinite' : 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {s === 'done' && <Check size={12} color="white" />}
                                        {s === 'error' && <X size={12} color="white" />}
                                        {s === 'running' && <Loader2 size={11} color="white" className="spin" />}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'flex', gap: 10, fontSize: 11.5, flexWrap: 'wrap' }}>
                            <span style={{ color: '#10b981', fontWeight: 600 }}>● {stats.done} done</span>
                            <span style={{ color: '#3b82f6', fontWeight: 600 }}>● {stats.running} running</span>
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>● {stats.error} error</span>
                            <span style={{ color: 'var(--text-muted)' }}>{stats.total} total</span>
                        </div>

                        {/* Progress bar */}
                        {stats.total > 0 && (
                            <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 2,
                                    width: `${((stats.done + stats.error) / stats.total) * 100}%`,
                                    background: stats.error > 0 ? 'linear-gradient(90deg, #10b981, #ef4444)' : 'var(--gradient-success)',
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Btn onClick={handleStart} disabled={running} style={{ flex: 1 }}>
                                {running ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Bắt đầu
                            </Btn>
                            <Btn onClick={handleStop} disabled={!running} variant="danger" style={{ flex: 1 }}>
                                <Square size={14} /> Dừng
                            </Btn>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Btn onClick={handleTestAPI} disabled={testLoading} variant="ghost" small style={{ flex: 1 }}>
                                {testLoading ? <Loader2 size={12} className="spin" /> : '🧪'} Test API
                            </Btn>
                            <Btn onClick={handleRetry} disabled={running || stats.error === 0} variant="ghost" small style={{ flex: 1 }}>
                                <RefreshCw size={12} /> Retry lỗi ({stats.error})
                            </Btn>
                        </div>
                        <Btn onClick={handlePreview} variant="ghost" small full>
                            👁 Preview prompt (hàng đầu tiên)
                        </Btn>
                    </div>
                </div>

                {/* Current run job list (last 20) */}
                {jobs.length > 0 && (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Tiến trình hàng
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {jobs.slice(-30).reverse().map(job => (
                                <div key={job.rowNum} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '6px 14px', borderBottom: '1px solid var(--border-color)',
                                    fontSize: 12,
                                }}>
                                    <span style={{
                                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                        background: boxColor(job.status),
                                    }} />
                                    <span style={{ color: 'var(--text-muted)', minWidth: 50 }}>Hàng {job.rowNum}</span>
                                    <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {job.status === 'done' && job.result?.slice(0, 60)}
                                        {job.status === 'error' && <span style={{ color: '#ef4444' }}>⚠ {job.error}</span>}
                                        {job.status === 'running' && <span style={{ color: '#3b82f6' }}>Đang xử lý...</span>}
                                        {job.status === 'skipped' && <span style={{ color: '#f59e0b' }}>Bỏ qua (đã có dữ liệu)</span>}
                                        {job.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Chờ...</span>}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* LỊCH SỬ CHẠY */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>📋 Lịch sử chạy</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <Btn onClick={handleLoadHistory} small variant="ghost"><RefreshCw size={11} /> LOAD</Btn>
                            <Btn onClick={clearHistory} small variant="ghost"><Trash2 size={11} /> Xóa</Btn>
                        </div>
                    </div>
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {historyForTab.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                                Chưa có lịch sử chạy
                            </div>
                        ) : historyForTab.map(h => (
                            <div key={h.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)' }}>
                                        {fmtTime(h.ts)} — {h.sheetName}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        ✓{h.done}/{h.total} · ✕{h.errors} · {fmtDuration(h.durationMs)}
                                    </span>
                                </div>
                                {h.preview && (
                                    <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {h.preview.slice(0, 150)}{h.preview.length > 150 ? '...' : ''}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ──────── Preview Modal ──────── */}
            {showPreview && (
                <div onClick={() => setShowPreview(false)} style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', width: '100%',
                        maxWidth: 700, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                    }}>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>👁 Preview Prompt</span>
                            <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
                            <pre style={{
                                fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.6,
                                color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                            }}>{previewText}</pre>
                        </div>
                        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <Btn onClick={() => navigator.clipboard.writeText(previewText)} variant="ghost" small><Copy size={12} /> Sao chép</Btn>
                            <Btn onClick={() => setShowPreview(false)} variant="secondary" small>Đóng</Btn>
                        </div>
                    </div>
                </div>
            )}

            {/* ──────── Toast ──────── */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
                    padding: '11px 18px', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)',
                    borderLeft: `4px solid ${toast.type === 'danger' ? 'var(--danger)' : 'var(--success)'}`,
                    animation: 'aiFadeInUp 0.2s ease', maxWidth: 360, fontSize: 13, fontWeight: 500,
                    color: 'var(--text-primary)',
                }}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════
export default function AIAssistantPage() {
    const { user, hasPermission } = useAuth();
    const [activeTab, setActiveTab] = useState('chat');
    const [apiStatus, setApiStatus] = useState('checking');

    useEffect(() => {
        fetchApi('/api/ai/health')
            .then(d => setApiStatus(d.ok ? 'online' : 'offline'))
            .catch(() => setApiStatus('offline'));
    }, []);

    if (!hasPermission('products')) {
        return <div className="page-content"><div className="card" style={{ padding: 40, textAlign: 'center' }}>Bạn không có quyền truy cập.</div></div>;
    }

    const tabs = [
        { key: 'chat', label: '💬 Chat', desc: 'Trò chuyện tự do với AI' },
        { key: 'dich', label: '🔄 Dịch thông số', desc: 'Dịch bảng thông số hàng loạt từ sheet' },
        { key: 'metasapo', label: '✏️ Meta & Sapo', desc: 'Viết Meta SEO và Sapo hàng loạt' },
    ];

    return (
        <div className="page-content" style={{ paddingBottom: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="ai-avatar" style={{ width: 38, height: 38, fontSize: 18 }}>🤖</div>
                    <div>
                        <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>AI Content Assistant</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span className={`ai-status-dot ${apiStatus === 'online' ? '' : 'offline'}`} />
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                {apiStatus === 'checking' ? 'Đang kiểm tra...' : apiStatus === 'online' ? 'AI đang hoạt động' : 'Không kết nối được AI'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', marginBottom: 14 }}>
                {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                        padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
                        borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent)' : 'transparent'}`,
                        marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab description */}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, marginTop: -8 }}>
                {tabs.find(t => t.key === activeTab)?.desc}
            </p>

            {/* Tab content */}
            {activeTab === 'chat' && <ChatUI apiStatus={apiStatus} />}
            {activeTab === 'dich' && <BatchTool key="dich" tabKey="dich" />}
            {activeTab === 'metasapo' && <BatchTool key="metasapo" tabKey="metasapo" />}
        </div>
    );
}
