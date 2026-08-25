import asyncio
import sys
import json
import os
import re
import time
import argparse
import urllib.request
import xml.etree.ElementTree as ET
from playwright.async_api import async_playwright

# Ensure utf-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

BLOCKED_DOMAINS = [
    "googletagmanager.com",
    "google-analytics.com",
    "facebook.net",
    "nakanohito.jp",
    "datasign.co",
    "doubleclick.net",
    "connect.facebook.net",
]

async def block_unnecessary_resources(route):
    url = route.request.url
    resource_type = route.request.resource_type
    
    # Block media, fonts, and tracking scripts
    if resource_type in ["media", "font"]:
        await route.abort()
        return
    for domain in BLOCKED_DOMAINS:
        if domain in url:
            await route.abort()
            return
    await route.continue_()

async def evaluate_schema_on_page(page, schema):
    """
    Extracts all fields in schema directly from page DOM using in-browser JavaScript.
    Supports single values and multi-item collections (href_all, src_all, text_all, links_with_title).
    """
    extracted = await page.evaluate("""(schema) => {
        const results = {};
        
        const resolveUrl = (url) => {
            if (!url) return '';
            try { return new URL(url, window.location.href).href; } catch(e) { return url; }
        };
        
        const processNodes = (nodes, attr) => {
            if (!nodes || nodes.length === 0) return null;
            
            // Multi-link / Multi-item modes
            if (attr === 'href_all') {
                const links = nodes.map(node => {
                    const val = node.getAttribute ? (node.getAttribute('href') || node.getAttribute('data-filename') || node.getAttribute('src')) : node.nodeValue;
                    return resolveUrl((val || '').trim());
                }).filter(Boolean);
                return links.length ? links.join('\\n') : null;
            }
            
            if (attr === 'src_all') {
                const srcs = nodes.map(node => {
                    const val = node.getAttribute ? (node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('href')) : node.nodeValue;
                    return resolveUrl((val || '').trim());
                }).filter(Boolean);
                return srcs.length ? srcs.join('\\n') : null;
            }
            
            if (attr === 'text_all') {
                const texts = nodes.map(node => (node.innerText || node.textContent || node.nodeValue || '').trim()).filter(Boolean);
                return texts.length ? texts.join('\\n') : null;
            }
            
            if (attr === 'links_with_title') {
                const pairs = nodes.map(node => {
                    const title = (node.innerText || node.textContent || '').trim();
                    const val = node.getAttribute ? (node.getAttribute('href') || node.getAttribute('data-filename') || node.getAttribute('src')) : '';
                    const fullUrl = resolveUrl((val || '').trim());
                    return title && fullUrl ? `${title}: ${fullUrl}` : (fullUrl || title || '');
                }).filter(Boolean);
                return pairs.length ? pairs.join('\\n') : null;
            }
            
            // Single element extraction
            const first = nodes[0];
            if (typeof first === 'string' || typeof first === 'number' || typeof first === 'boolean') {
                return String(first).trim() || null;
            }
            if (first.nodeType === 3 || first.nodeType === 2) {
                const val = (first.nodeValue || '').trim();
                return (attr === 'href' || attr === 'src') ? resolveUrl(val) : val;
            }
            if (first.nodeType === 1) {
                if (attr === 'text') return (first.innerText || first.textContent || '').trim() || null;
                if (attr === 'html') return (first.innerHTML || '').trim() || null;
                const val = (first.getAttribute(attr) || first[attr] || '').trim();
                return (attr === 'href' || attr === 'src') ? resolveUrl(val) : (val || null);
            }
            return (first.textContent || '').trim() || null;
        };
        
        for (const [fieldKey, rule] of Object.entries(schema || {})) {
            if (!rule || !rule.type || rule.type === 'skip') {
                results[fieldKey] = null;
                continue;
            }
            
            const type = rule.type;
            const selector = (rule.selector || '').trim();
            const attr = rule.attr || 'text';
            
            if (!selector && type !== 'meta') {
                results[fieldKey] = null;
                continue;
            }
            
            try {
                // 1. CSS Selector
                if (type === 'css') {
                    const els = Array.from(document.querySelectorAll(selector));
                    results[fieldKey] = processNodes(els, attr);
                    continue;
                }
                
                // 2. XPath & Full XPath
                if (type === 'xpath' || type === 'xpath_full') {
                    const xpathResult = document.evaluate(
                        selector,
                        document,
                        null,
                        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE || XPathResult.ANY_TYPE,
                        null
                    );
                    
                    const nodes = [];
                    if (xpathResult.snapshotLength !== undefined) {
                        for (let i = 0; i < xpathResult.snapshotLength; i++) {
                            nodes.push(xpathResult.snapshotItem(i));
                        }
                    } else if (xpathResult.resultType === XPathResult.STRING_TYPE) {
                        results[fieldKey] = xpathResult.stringValue.trim() || null;
                        continue;
                    } else if (xpathResult.resultType === XPathResult.NUMBER_TYPE) {
                        results[fieldKey] = String(xpathResult.numberValue);
                        continue;
                    } else if (xpathResult.resultType === XPathResult.BOOLEAN_TYPE) {
                        results[fieldKey] = String(xpathResult.booleanValue);
                        continue;
                    } else {
                        let n;
                        while ((n = xpathResult.iterateNext())) {
                            nodes.push(n);
                        }
                    }
                    
                    results[fieldKey] = processNodes(nodes, attr);
                    continue;
                }
                
                // 3. JSON-LD
                if (type === 'jsonld') {
                    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
                    let found = null;
                    const [typeName, ...keys] = selector.split('.');
                    
                    for (const s of ldScripts) {
                        try {
                            let block = JSON.parse(s.textContent);
                            const items = Array.isArray(block) ? block : [block];
                            for (const item of items) {
                                if ((item['@type'] || '').toLowerCase() === typeName.toLowerCase()) {
                                    let val = item;
                                    for (const k of keys) {
                                        if (val == null) break;
                                        val = Array.isArray(val) ? val[parseInt(k)] : val[k];
                                    }
                                    if (val != null) {
                                        found = typeof val === 'object' && val.name ? String(val.name).trim() : String(val).trim();
                                        break;
                                    }
                                }
                            }
                        } catch(e) {}
                        if (found != null) break;
                    }
                    results[fieldKey] = found;
                    continue;
                }
                
                // 4. Meta tag
                if (type === 'meta') {
                    const meta = document.querySelector(`meta[name="${selector}"], meta[property="${selector}"], meta[property="og:${selector}"]`);
                    results[fieldKey] = meta ? (meta.getAttribute('content') || '').trim() || null : null;
                    continue;
                }
                
                // 5. Regex on page HTML
                if (type === 'regex') {
                    const html = document.documentElement.outerHTML;
                    const m = html.match(new RegExp(selector, 'i'));
                    results[fieldKey] = (m && m[1]) ? m[1].trim() : null;
                    continue;
                }
            } catch (err) {
                results[fieldKey] = null;
            }
        }
        
        // SMART FALLBACKS: If standard fields are empty or missed by specific selectors, auto-recover from DOM
        const getFirstText = (selectors) => {
            for (const s of selectors) {
                const el = document.querySelector(s);
                if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
            }
            return null;
        };

        if (!results.name || results.name.length < 2) {
            const n = getFirstText(['.goods_name', 'h1.goods_name', '.product_name', 'h1']);
            if (n) results.name = n;
        }
        if (!results.model || results.model.length < 1) {
            const m = getFirstText(['.goods_model', 'h1.goods_model', '.model_name']);
            if (m) results.model = m;
        }
        if (!results.description || results.description.length < 25 || results.description.startsWith('*')) {
            const descCandidate = getFirstText(['.goods_feature', '.goods_outline', '.goods_lead', '[class*="feature"]', '[class*="outline"]']);
            if (descCandidate && descCandidate.length > (results.description || '').length) {
                results.description = descCandidate;
            }
        }
        if (!results.specs_json) {
            const specEl = document.querySelector('#detail-specification, #detail-spec, .specTable, .scrollTable');
            if (specEl) results.specs_json = specEl.innerHTML.trim();
        }
        if (!results.category || !results.series) {
            const pzItems = Array.from(document.querySelectorAll('.pankuzu_item a, .breadcrumb a')).map(a => a.innerText.trim());
            if (!results.category && pzItems[2]) results.category = pzItems[2];
            if (!results.series && pzItems[3]) results.series = pzItems[3];
        }
        
        // Auto-extract full documents and manuals if document_url or hdsd has fewer than all available links
        const docLis = Array.from(document.querySelectorAll('#detail-document > div > div:nth-child(2) > div > ul > li, #detail-document li, [id*="document"] li'));
        if (docLis.length > 0) {
            let allCatalogs = [];
            let allManuals = [];
            
            docLis.forEach((li, idx) => {
                const headerText = (li.querySelector('dt, .title, strong') || li).innerText.toLowerCase();
                const aTags = Array.from(li.querySelectorAll('dd a, a')).filter(a => a.getAttribute('href') || (a.href && a.href.includes('http')));
                const linksFormatted = aTags.map(a => `${(a.innerText || 'Tài Liệu').trim()}: ${resolveUrl(a.getAttribute('href') || a.href)}`);
                
                if (headerText.includes('catalog') || headerText.includes('giới thiệu') || headerText.includes('sản phẩm') || idx === 0) {
                    allCatalogs.push(...linksFormatted);
                } else {
                    allManuals.push(...linksFormatted);
                }
            });
            
            allCatalogs = Array.from(new Set(allCatalogs));
            allManuals = Array.from(new Set(allManuals));
            
            if (allCatalogs.length > 0) {
                results.document_url = allCatalogs.join('\\n');
            }
            if (allManuals.length > 0) {
                results.hdsd = allManuals.join('\\n');
            }
        }
        
        return results;
    }""", schema)
    
    return extracted

async def run_single_test(url, schema):
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ]
        )
        context = await browser.new_context(
            locale='vi-VN',
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            extra_http_headers={
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
            },
            viewport={'width': 1280, 'height': 800}
        )
        await context.add_init_script("delete Object.getPrototypeOf(navigator).webdriver")
        
        page = await context.new_page()
        try:
            t0 = time.time()
            await page.goto(url, timeout=25000, wait_until='domcontentloaded')
            # Wait for dynamic translation script (OneLink) to render Vietnamese text
            try:
                await page.wait_for_function("""() => {
                    const name = document.querySelector('.goods_name, h1.goods_name')?.innerText || '';
                    const feat = document.querySelector('.goods_feature, .goods_outline')?.innerText || '';
                    const featWithoutFooter = feat.replace(/\\*.*$/s, '');
                    return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(name) ||
                           /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(featWithoutFooter);
                }""", timeout=5000)
            except Exception:
                pass
                
            elapsed = time.time() - t0
            if elapsed < 2.5:
                await asyncio.sleep(2.5 - elapsed)
            
            results = await evaluate_schema_on_page(page, schema)
            
            preview = {}
            for k, v in results.items():
                preview[k] = {
                    "value": v,
                    "status": "ok" if (v is not None and v != "") else "empty"
                }
            
            output = {
                "success": True,
                "url": url,
                "preview": preview
            }
            print(json.dumps(output, ensure_ascii=False))
        except Exception as e:
            err_output = {
                "success": False,
                "error": str(e)
            }
            print(json.dumps(err_output, ensure_ascii=False))
        finally:
            await browser.close()

async def run_batch_crawl(urls, schema, concurrency=4, delay_ms=200, out_file=None):
    """
    High performance concurrent crawler with worker pool and reused browser.
    """
    total = len(urls)
    processed = 0
    found = 0
    errors = 0
    results_list = []
    
    queue = asyncio.Queue()
    for u in urls:
        await queue.put(u)
        
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ]
        )
        context = await browser.new_context(
            locale='vi-VN',
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            extra_http_headers={
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
            },
            viewport={'width': 1280, 'height': 800}
        )
        await context.add_init_script("delete Object.getPrototypeOf(navigator).webdriver")
        
        async def worker(worker_id):
            nonlocal processed, found, errors
            page = await context.new_page()
            
            while not queue.empty():
                try:
                    url = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                    
                try:
                    t0 = time.time()
                    await page.goto(url, timeout=25000, wait_until='domcontentloaded')
                    try:
                        await page.wait_for_function("""() => {
                            const name = document.querySelector('.goods_name, h1.goods_name')?.innerText || '';
                            const feat = document.querySelector('.goods_feature, .goods_outline')?.innerText || '';
                            const featWithoutFooter = feat.replace(/\\*.*$/s, '');
                            return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(name) ||
                                   /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(featWithoutFooter);
                        }""", timeout=5000)
                    except Exception:
                        pass
                        
                    elapsed = time.time() - t0
                    if elapsed < 2.5:
                        await asyncio.sleep(2.5 - elapsed)
                        
                    data = await evaluate_schema_on_page(page, schema)
                    has_data = any(v is not None and v != '' for v in data.values())
                    if has_data:
                        item = {"url": url, **data}
                        results_list.append(item)
                        found += 1
                        print(json.dumps({"type": "item", "data": item}, ensure_ascii=False), flush=True)
                except Exception as e:
                    errors += 1
                    print(f"[WORKER ERROR on {url}]: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
                finally:
                    processed += 1
                    queue.task_done()
                    print(json.dumps({
                        "type": "progress",
                        "processed": processed,
                        "total": total,
                        "found": found,
                        "errors": errors
                    }, ensure_ascii=False), flush=True)
                    
                if delay_ms > 0:
                    await asyncio.sleep(delay_ms / 1000.0)
                    
            await page.close()
            
        tasks = [asyncio.create_task(worker(i)) for i in range(min(concurrency, total))]
        await asyncio.gather(*tasks)
        await browser.close()
        
    final_output = {
        "success": True,
        "total": total,
        "processed": processed,
        "found": found,
        "errors": errors,
        "results": results_list
    }
    
    if out_file:
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(final_output, f, ensure_ascii=False, indent=2)
            
    print(json.dumps({"type": "done", **final_output}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['test', 'crawl'], default='test')
    parser.add_argument('--url', type=str, default='')
    parser.add_argument('--urls-file', type=str, default='')
    parser.add_argument('--schema', type=str, default='')
    parser.add_argument('--schema-file', type=str, default='')
    parser.add_argument('--concurrency', type=int, default=3)
    parser.add_argument('--delay', type=int, default=300)
    parser.add_argument('--out-file', type=str, default='')
    args = parser.parse_args()
    
    schema_obj = {}
    if args.schema_file and os.path.exists(args.schema_file):
        with open(args.schema_file, 'r', encoding='utf-8') as f:
            schema_obj = json.load(f)
    elif args.schema:
        schema_obj = json.loads(args.schema)
    elif not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read()
            if stdin_data:
                parsed = json.loads(stdin_data)
                if isinstance(parsed, dict) and 'schema' in parsed:
                    schema_obj = parsed['schema']
                else:
                    schema_obj = parsed
        except Exception:
            pass
    
    if args.mode == 'test':
        asyncio.run(run_single_test(args.url, schema_obj))
    elif args.mode == 'crawl':
        urls = []
        if args.urls_file and os.path.exists(args.urls_file):
            with open(args.urls_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content.startswith('['):
                    try:
                        urls = json.loads(content)
                    except Exception:
                        urls = [line.strip() for line in content.splitlines() if line.strip()]
                else:
                    urls = [line.strip() for line in content.splitlines() if line.strip()]
        asyncio.run(run_batch_crawl(urls, schema_obj, concurrency=args.concurrency, delay_ms=args.delay, out_file=args.out_file))
