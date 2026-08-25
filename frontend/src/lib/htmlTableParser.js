/**
 * HTML Table Converter & Normalizer Utility
 * Parses raw scraped HTML (DIV sections, DL/DT lists, complex multi-th/td tables, key-value blocks)
 * and safely formats it into a standardized, web-ready HTML Table structure:
 * 
 * <h2>[Heading]</h2>
 * <table class="[TableClass]">
 *   <tr><th>[Th1]</th><th>[Th2]</th></tr>
 *   <tr><td>Key</td><td>Value</td></tr>
 * </table>
 */

function cleanCellHtml(html) {
    if (!html || typeof html !== 'string') return '';
    let s = html.trim();
    // Remove empty tags like <h4></h4> or <span style=""></span>
    s = s.replace(/<([a-z0-9]+)[^>]*>\s*<\/\1>/gi, '');
    // Unwrap outer heading tags like <h4>...</h4> inside cell
    s = s.replace(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>$/gi, '$1');
    // Remove inline style noise on td/th like height/width to make output super clean
    s = s.replace(/style="[^"]*height:[^"]*"/gi, '');
    return s.trim();
}

export function parseAndNormalizeHtmlTable(rawHtml, options = {}) {
    if (!rawHtml || typeof rawHtml !== 'string') return '';
    let html = rawHtml.trim();
    if (!html) return '';

    const {
        heading = 'Thông số kỹ thuật',
        tableClass = 'Table_Product_Style',
        th1 = 'Thông số',
        th2 = 'Giá trị',
        keepOriginalHeading = true
    } = options;

    // 1. Extract heading if exists (<h2>...</h2> or <h3>...</h3>)
    let extractedHeading = heading;
    const hMatch = html.match(/<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/i);
    if (hMatch && keepOriginalHeading) {
        const cleanH = hMatch[2].replace(/<[^>]*>/g, '').trim();
        if (cleanH) {
            extractedHeading = cleanH;
        }
    }

    // Check if DOMParser is available (Browser environment)
    if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const rowsData = [];

            // Case A: Source contains a <table>
            const tables = doc.querySelectorAll('table');
            if (tables.length > 0) {
                tables.forEach(table => {
                    const trList = table.querySelectorAll('tr');
                    trList.forEach(tr => {
                        const directCells = Array.from(tr.querySelectorAll('th, td'));
                        
                        // Filter out spacer cells (e.g. empty layout rowspan spacers with no content)
                        const validCells = directCells.filter(c => {
                            const txt = c.textContent.replace(/[\s\u00A0]+/g, ' ').trim();
                            const hasMedia = c.querySelector('img, svg, iframe, video, a');
                            return txt.length > 0 || hasMedia;
                        });

                        if (validCells.length === 0) return;

                        const ths = validCells.filter(c => c.tagName.toLowerCase() === 'th');
                        const tds = validCells.filter(c => c.tagName.toLowerCase() === 'td');

                        let key = '';
                        let val = '';

                        if (ths.length > 0 && tds.length > 0) {
                            // Key from TH, Value from TD
                            key = ths.map(c => cleanCellHtml(c.innerHTML)).filter(Boolean).join(' — ');
                            val = tds.map(c => cleanCellHtml(c.innerHTML)).filter(Boolean).join(' | ');
                        } else if (validCells.length >= 2) {
                            // If all are TH or all are TD
                            key = cleanCellHtml(validCells[0].innerHTML);
                            val = validCells.slice(1).map(c => cleanCellHtml(c.innerHTML)).filter(Boolean).join(' | ');
                        } else if (validCells.length === 1) {
                            // Single cell (e.g. section subheader)
                            key = cleanCellHtml(validCells[0].innerHTML);
                            val = '';
                        }

                        // Check if row is the table header row
                        const plain1 = key.replace(/<[^>]*>/g, '').trim().toLowerCase();
                        const plain2 = val.replace(/<[^>]*>/g, '').trim().toLowerCase();
                        if ((plain1 === 'thông số' || plain1 === 'thông số kỹ thuật' || plain1 === 'part number' || plain1 === 'parameter' || plain1 === 'item') && 
                            (plain2 === 'giá trị' || plain2 === 'chi tiết' || plain2 === 'description' || plain2 === 'value' || plain2 === 'specs')) {
                            return;
                        }

                        if (key || val) {
                            rowsData.push([key, val]);
                        }
                    });
                });
            }

            // Case B: Source contains Definition Lists <dl><dt>...</dt><dd>...</dd></dl>
            if (rowsData.length === 0) {
                const dls = doc.querySelectorAll('dl');
                if (dls.length > 0) {
                    dls.forEach(dl => {
                        const dts = dl.querySelectorAll('dt');
                        dts.forEach(dt => {
                            let next = dt.nextElementSibling;
                            const key = cleanCellHtml(dt.innerHTML);
                            let val = '';
                            if (next && next.tagName.toLowerCase() === 'dd') {
                                val = cleanCellHtml(next.innerHTML);
                            }
                            if (key || val) rowsData.push([key, val]);
                        });
                    });
                }
            }

            // Case C: Source contains list items or key-value divs
            if (rowsData.length === 0) {
                const items = doc.querySelectorAll('.spec-item, .section-item, .item, .spec_row, .row, li, p');
                items.forEach(el => {
                    const children = Array.from(el.children).filter(c => c.textContent.trim().length > 0);
                    if (children.length === 2) {
                        const k = cleanCellHtml(children[0].innerHTML);
                        const v = cleanCellHtml(children[1].innerHTML);
                        if (k || v) rowsData.push([k, v]);
                    } else {
                        const text = el.textContent.trim();
                        if (text.includes(':')) {
                            const idx = text.indexOf(':');
                            const k = text.substring(0, idx).trim();
                            const v = text.substring(idx + 1).trim();
                            if (k && v) rowsData.push([k, v]);
                        }
                    }
                });
            }

            // Case D: Fallback text line-by-line parsing
            if (rowsData.length === 0) {
                const plainText = doc.body.textContent || '';
                const lines = plainText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                for (const line of lines) {
                    if (line.includes(':')) {
                        const idx = line.indexOf(':');
                        const k = line.substring(0, idx).trim();
                        const v = line.substring(idx + 1).trim();
                        if (k && v) rowsData.push([k, v]);
                    } else if (line.includes('\t')) {
                        const parts = line.split('\t').map(p => p.trim());
                        if (parts.length >= 2) rowsData.push([parts[0], parts.slice(1).join(' ')]);
                    }
                }
            }

            // If we successfully extracted rows, assemble standardized HTML table
            if (rowsData.length > 0) {
                let out = '';
                if (extractedHeading) {
                    out += `<h2>${extractedHeading}</h2>\n`;
                }
                out += `<table class="${tableClass}">\n`;
                out += `  <tr><th>${th1}</th><th>${th2}</th></tr>\n`;
                for (const [k, v] of rowsData) {
                    if (!v) {
                        // Section subheader row spanning full table width
                        out += `  <tr><td colspan="2" style="background: #f1f5f9; font-weight: 700; padding: 8px 12px; color: #0f172a;">${k}</td></tr>\n`;
                    } else {
                        out += `  <tr><td>${k}</td><td>${v}</td></tr>\n`;
                    }
                }
                out += `</table>`;
                return out.trim();
            }

        } catch (err) {
            console.warn('[HTML Parser Error]:', err);
        }
    }

    // Fallback Regex Parser for SSR / Node environment
    return fallbackRegexParser(html, { extractedHeading, tableClass, th1, th2 });
}

function fallbackRegexParser(html, { extractedHeading, tableClass, th1, th2 }) {
    const rows = [];
    
    // Case 1: Check for <tr>...</tr>
    const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (trMatches.length > 0) {
        for (const tr of trMatches) {
            const trContent = tr[1];
            const thMatches = [...trContent.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => m[1].trim()).filter(t => t.replace(/<[^>]*>/g, '').trim().length > 0);
            const tdMatches = [...trContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].trim()).filter(t => t.replace(/<[^>]*>/g, '').trim().length > 0);

            let k = '';
            let v = '';

            if (thMatches.length > 0 && tdMatches.length > 0) {
                k = thMatches.map(cleanCellHtml).join(' — ');
                v = tdMatches.map(cleanCellHtml).join(' | ');
            } else if (thMatches.length + tdMatches.length >= 2) {
                const all = [...thMatches, ...tdMatches];
                k = cleanCellHtml(all[0]);
                v = all.slice(1).map(cleanCellHtml).join(' | ');
            } else if (thMatches.length + tdMatches.length === 1) {
                const single = thMatches[0] || tdMatches[0];
                k = cleanCellHtml(single);
                v = '';
            }

            if (k || v) {
                const plain1 = k.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const plain2 = v.replace(/<[^>]*>/g, '').trim().toLowerCase();
                if ((plain1 === 'thông số' || plain1 === 'thông số kỹ thuật' || plain1 === 'part number') && 
                    (plain2 === 'giá trị' || plain2 === 'chi tiết' || plain2 === 'description')) {
                    continue;
                }
                rows.push([k, v]);
            }
        }
    }

    // Case 2: Check for <dt>...</dt><dd>...</dd>
    if (rows.length === 0) {
        const dtddMatches = [...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/gi)];
        if (dtddMatches.length > 0) {
            for (const m of dtddMatches) {
                rows.push([cleanCellHtml(m[1]), cleanCellHtml(m[2])]);
            }
        }
    }

    // Case 3: Check for colon-separated tags (p, div, li)
    if (rows.length === 0) {
        const tagMatches = [...html.matchAll(/<(?:p|div|li)[^>]*>([\s\S]*?)<\/(?:p|div|li)>/gi)];
        for (const tm of tagMatches) {
            const rawContent = tm[1].replace(/<[^>]*>/g, '').trim();
            if (rawContent.includes(':')) {
                const idx = rawContent.indexOf(':');
                const k = rawContent.substring(0, idx).trim();
                const v = rawContent.substring(idx + 1).trim();
                if (k && v) rows.push([k, v]);
            }
        }
    }

    if (rows.length > 0) {
        let out = '';
        if (extractedHeading) {
            out += `<h2>${extractedHeading}</h2>\n`;
        }
        out += `<table class="${tableClass}">\n`;
        out += `  <tr><th>${th1}</th><th>${th2}</th></tr>\n`;
        for (const [k, v] of rows) {
            if (!v) {
                out += `  <tr><td colspan="2" style="background: #f1f5f9; font-weight: 700; padding: 8px 12px; color: #0f172a;">${k}</td></tr>\n`;
            } else {
                out += `  <tr><td>${k}</td><td>${v}</td></tr>\n`;
            }
        }
        out += `</table>`;
        return out.trim();
    }

    // Fallback to original if unparseable
    return html;
}
