import { fetchApi } from './api';

function colToIdx(col) {
    if (!col) return 0;
    const c = (col || '').toUpperCase().trim();
    let r = 0;
    for (let i = 0; i < c.length; i++) r = r * 26 + c.charCodeAt(i) - 64;
    return Math.max(0, r - 1);
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export function convertMarkdownTableToHtml(text) {
    if (!text || typeof text !== 'string') return text;
    let trimmed = text.trim();

    trimmed = trimmed.replace(/:::[a-zA-Z0-9_-]+(\{[^}]*?\})?\s*\n?/gi, '').replace(/\s*:::\s*$/g, '');
    trimmed = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*\n?/gi, '').replace(/\n?\s*```$/gi, '');

    const hasPipes = /^\s*\|.*\|/m.test(trimmed);
    const hasHtmlRows = /<tr[^>]*>/i.test(trimmed) && /<td[^>]*>/i.test(trimmed);

    if (!hasPipes && trimmed.includes('<table') && trimmed.includes('</table>')) {
        return trimmed;
    }

    if (!hasPipes && !hasHtmlRows) {
        return trimmed;
    }

    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const rows = [];
    let headerRow = null;

    for (const line of lines) {
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
        } else if (line.includes('<td')) {
            const matches = [...line.matchAll(/<td[^>]*>(.*?)<\/td>/gi)];
            if (matches.length > 0) {
                const cells = matches.map(m => m[1].trim());
                rows.push(cells);
            }
        } else if (line.includes('<th')) {
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
    
    // Any HTML table tags (table, tr, td, th) is valid!
    if (trimmed.includes('<table') || trimmed.includes('<tr') || trimmed.includes('<td') || trimmed.includes('<th')) return true;

    // Key-value spec lines e.g. "Cấp bảo vệ: IP65" is valid!
    if (/^[^\n:]+:\s*[^\n]+/m.test(trimmed)) return true;

    // Non-empty text without raw unformatted markdown table pipes is valid!
    if (trimmed.length > 10 && !/^\s*\|.*\|/m.test(trimmed)) return true;

    return false;
}

export function cleanAiOutput(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();

    cleaned = cleaned.replace(/:::[a-zA-Z0-9_-]+(\{[^}]*?\})?\s*\n?/gi, '');
    cleaned = cleaned.replace(/^\s*:::\s*$/gm, '');
    cleaned = cleaned.replace(/\s*:::\s*$/g, '');

    if (/^```[a-zA-Z0-9_-]*\n/i.test(cleaned)) {
        cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/i, '').replace(/\n?```$/i, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*\n?/i, '').replace(/\n?\s*```$/i, '');
    }
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*/i, '').replace(/```$/i, '');

    return cleaned.trim();
}

class GlobalAiRunner {
    constructor() {
        this.abortFlag = false;
        this.pauseFlag = false;
        this.state = this.loadState();
    }

    loadState() {
        if (typeof window === 'undefined') return this.getInitialState();
        try {
            const saved = localStorage.getItem('ai_runner_state');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return this.getInitialState();
    }

    getInitialState() {
        return {
            isRunning: false,
            isPaused: false,
            activeProfileSlug: '',
            activeProfileName: 'Chưa chọn',
            activeTabName: 'Chưa chọn',
            activeTaskName: 'Chưa có tác vụ',
            totalRows: 0,
            completedCount: 0,
            pendingCount: 0,
            errorCount: 0,
            skipCount: 0,
            failedItems: [],
            logs: [],
            currentProgressPercent: 0
        };
    }

    saveState(newState) {
        this.state = { ...this.state, ...newState };
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem('ai_runner_state', JSON.stringify(this.state));
            } catch (e) {}
            window.dispatchEvent(new Event('ai_runner_update'));
        }
    }

    stop() {
        this.abortFlag = true;
        this.pauseFlag = false;
        this.saveState({
            isRunning: false,
            isPaused: false,
            logs: [`[${new Date().toLocaleTimeString()}] ⏹️ Người dùng đã chủ động DỪNG tiến trình AI.`, ...this.state.logs.slice(0, 150)]
        });
    }

    pause() {
        this.pauseFlag = true;
        this.saveState({
            isPaused: true,
            logs: [`[${new Date().toLocaleTimeString()}] ⏸️ Đã tạm dừng tiến trình AI.`, ...this.state.logs.slice(0, 150)]
        });
    }

    resume() {
        this.pauseFlag = false;
        this.saveState({
            isPaused: false,
            logs: [`[${new Date().toLocaleTimeString()}] ▶️ Đã tiếp tục tiến trình AI.`, ...this.state.logs.slice(0, 150)]
        });
    }

    async startJob(config) {
        const {
            selectedProfileSlug,
            profiles,
            selectedSheetNames,
            profileSheetsData,
            startRow,
            endRow,
            taskName,
            taskPrompt,
            variables,
            targetCol,
            concurrency,
            skipExisting,
            autoClean,
            onlyRetryFailed
        } = config;

        this.abortFlag = false;
        this.pauseFlag = false;

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

        if (grandTotalRows === 0) return;

        const initialFailed = onlyRetryFailed ? (this.state.failedItems || []) : [];

        this.saveState({
            isRunning: true,
            isPaused: false,
            activeProfileSlug: selectedProfileSlug,
            activeProfileName: profileDisplayName,
            activeTabName: sheetsToProcess[0]?.name || 'Sheet1',
            activeTaskName: taskName || 'Xử lý dữ liệu AI',
            totalRows: grandTotalRows,
            completedCount: onlyRetryFailed ? this.state.completedCount : 0,
            pendingCount: onlyRetryFailed ? initialFailed.length : grandTotalRows,
            errorCount: 0,
            skipCount: onlyRetryFailed ? this.state.skipCount : 0,
            failedItems: [],
            logs: [`[${new Date().toLocaleTimeString()}] ${onlyRetryFailed ? '🔄 Bắt đầu THỬ LẠI các hàng bị lỗi...' : `Bắt đầu tiến trình AI Runner (${concurrency} luồng) cho ${profileDisplayName}...`}`],
            currentProgressPercent: 0
        });

        let updatedSheetsData = JSON.parse(JSON.stringify(profileSheetsData));
        let globalCompleted = onlyRetryFailed ? this.state.completedCount : 0;
        let globalErrors = 0;
        let globalSkips = onlyRetryFailed ? this.state.skipCount : 0;
        let currentFailedList = [];

        const targetColIdx = colToIdx(targetCol);

        try {
            for (let sIdx = 0; sIdx < sheetsToProcess.length; sIdx++) {
                if (this.abortFlag) break;

                const sheetObj = sheetsToProcess[sIdx];
                const currentSheetName = sheetObj.name;

                this.saveState({
                    activeTabName: currentSheetName,
                    logs: [`[${new Date().toLocaleTimeString()}] Đang xử lý Tab: ${currentSheetName}`, ...this.state.logs.slice(0, 150)]
                });

                const sheetDataRef = updatedSheetsData.find(s => s.name === currentSheetName);
                if (!sheetDataRef || !Array.isArray(sheetDataRef.data)) continue;

                const rStart = Math.max(1, parseInt(startRow) || 1) - 1;
                const rEnd = endRow ? Math.min(sheetDataRef.data.length, parseInt(endRow)) : sheetDataRef.data.length;

                const rowsToProcess = [];
                for (let r = rStart; r < rEnd; r++) {
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

                let taskQueueIndex = 0;
                const activeWorkersCount = Math.max(1, parseInt(concurrency) || 2);

                const substituteRowVariables = (template, rowArray) => {
                    if (!template || !Array.isArray(rowArray)) return template;
                    let result = template;
                    variables.forEach(v => {
                        const idx = colToIdx(v.col);
                        const val = rowArray[idx];
                        const valStr = val !== undefined && val !== null ? String(val) : '';
                        const regex = new RegExp(`\\{${v.name}\\}`, 'g');
                        result = result.replace(regex, valStr);
                    });
                    result = result.replace(/\{\{([A-Z]+)\}\}/g, (match, colLetter) => {
                        const idx = colToIdx(colLetter);
                        const val = rowArray[idx];
                        return val !== undefined && val !== null ? String(val) : '';
                    });
                    return result;
                };

                const workerTask = async (workerId) => {
                    while (taskQueueIndex < rowsToProcess.length && !this.abortFlag) {
                        while (this.pauseFlag && !this.abortFlag) {
                            await delay(500);
                        }
                        if (this.abortFlag) break;

                        const itemIdx = taskQueueIndex++;
                        if (itemIdx >= rowsToProcess.length) break;

                        const item = rowsToProcess[itemIdx];
                        const rowIdx = item.rowIndex;
                        const currentRow = item.rowData;

                        if (skipExisting && !onlyRetryFailed) {
                            const existingVal = currentRow[targetColIdx];
                            if (existingVal !== undefined && existingVal !== null && String(existingVal).trim() !== '') {
                                globalSkips++;
                                const completedTotal = globalCompleted + globalSkips + globalErrors;
                                const percent = Math.min(100, Math.round((completedTotal / grandTotalRows) * 100));
                                this.saveState({
                                    skipCount: globalSkips,
                                    pendingCount: Math.max(0, grandTotalRows - completedTotal),
                                    currentProgressPercent: percent
                                });
                                continue;
                            }
                        }

                        const builtPrompt = substituteRowVariables(taskPrompt, currentRow);

                        try {
                            const res = await fetchApi('/api/ai/chat', {
                                method: 'POST',
                                body: JSON.stringify({ message: builtPrompt, history: [] })
                            });

                            let rawContent = res.content || '';
                            let cleaned = autoClean ? cleanAiOutput(rawContent) : rawContent.trim();

                            if (!cleaned && !this.abortFlag) {
                                throw new Error('Kết quả AI trả về rỗng');
                            }

                            if (/^\s*\|.*\|/m.test(cleaned)) {
                                cleaned = convertMarkdownTableToHtml(cleaned);
                            }

                            while (sheetDataRef.data.length <= rowIdx) {
                                sheetDataRef.data.push([]);
                            }
                            while (sheetDataRef.data[rowIdx].length <= targetColIdx) {
                                sheetDataRef.data[rowIdx].push('');
                            }
                            sheetDataRef.data[rowIdx][targetColIdx] = cleaned;

                            globalCompleted++;
                            const completedTotal = globalCompleted + globalSkips + globalErrors;
                            const percent = Math.min(100, Math.round((completedTotal / grandTotalRows) * 100));

                            const successLog = `[Thành công] [${currentSheetName}] Hàng ${rowIdx + 1}: ${cleaned.slice(0, 50)}...`;
                            this.saveState({
                                completedCount: globalCompleted,
                                pendingCount: Math.max(0, grandTotalRows - completedTotal),
                                currentProgressPercent: percent,
                                logs: [successLog, ...this.state.logs.slice(0, 150)]
                            });

                            if (globalCompleted % 5 === 0 || completedTotal >= grandTotalRows) {
                                try {
                                    await fetchApi('/api/products/profile-sheet', {
                                        method: 'POST',
                                        body: JSON.stringify({ profile: selectedProfileSlug, sheets: updatedSheetsData })
                                    });
                                } catch (e) {}
                            }

                        } catch (err) {
                            globalErrors++;
                            currentFailedList.push({
                                sheetName: currentSheetName,
                                rowIndex: rowIdx,
                                errorMsg: err.message || 'Lỗi xử lý AI'
                            });
                            const completedTotal = globalCompleted + globalSkips + globalErrors;
                            const percent = Math.min(100, Math.round((completedTotal / grandTotalRows) * 100));

                            const errLog = `[Lỗi] [${currentSheetName}] Hàng ${rowIdx + 1}: ${err.message || 'Lỗi kết nối Server AI'}`;
                            this.saveState({
                                errorCount: globalErrors,
                                failedItems: [...currentFailedList],
                                pendingCount: Math.max(0, grandTotalRows - completedTotal),
                                currentProgressPercent: percent,
                                logs: [errLog, ...this.state.logs.slice(0, 150)]
                            });
                        }
                    }
                };

                const workerPromises = [];
                for (let w = 0; w < activeWorkersCount; w++) {
                    workerPromises.push(workerTask(w));
                }
                await Promise.all(workerPromises);
            }

            try {
                await fetchApi('/api/products/profile-sheet', {
                    method: 'POST',
                    body: JSON.stringify({ profile: selectedProfileSlug, sheets: updatedSheetsData })
                });
            } catch (e) {}

            const finishMsg = this.abortFlag
                ? `[${new Date().toLocaleTimeString()}] ⏹️ ĐÃ DỪNG TIẾN TRÌNH AI!`
                : `[${new Date().toLocaleTimeString()}] 🥳 ĐÃ HOÀN THÀNH TIẾN TRÌNH CHẠY AI!`;

            this.saveState({
                isRunning: false,
                isPaused: false,
                currentProgressPercent: 100,
                logs: [finishMsg, ...this.state.logs.slice(0, 150)]
            });

        } catch (e) {
            console.error('Global AI Runner Error:', e);
            this.saveState({
                isRunning: false,
                isPaused: false,
                logs: [`[${new Date().toLocaleTimeString()}] ❌ Lỗi tiến trình AI: ${e.message}`, ...this.state.logs.slice(0, 150)]
            });
        }
    }
}

export const getGlobalAiRunner = () => {
    if (typeof window !== 'undefined') {
        if (!window.__GLOBAL_AI_RUNNER__) {
            window.__GLOBAL_AI_RUNNER__ = new GlobalAiRunner();
        }
        return window.__GLOBAL_AI_RUNNER__;
    }
    return new GlobalAiRunner();
};
