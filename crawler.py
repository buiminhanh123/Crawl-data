import asyncio
import xml.etree.ElementTree as ET
import sqlite3
import json
import os
import sys
import random
from bs4 import BeautifulSoup

# Fix Windows console encoding
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf-8-sig'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    print("ERROR: aiohttp is required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)

os.environ["CAMOUFOX_INSTALL_DIR"] = r"C:\Users\LEGION\AppData\Local\camoufox"
from camoufox import AsyncCamoufox

DB_PATH = r"E:\sp\Newland\server\data\products.db"
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# ── HTTP headers that mimic a real Chrome browser ───────────────────
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
}

# Retry delays (exponential backoff): 5s, 15s, 30s between attempts
RETRY_DELAYS = [5, 15, 30]
MAX_RETRIES = 3

# Third-party domains to block in browser (tracking/embed scripts — no product data)
BLOCKED_DOMAINS = [
    "google-analytics.com", "googletagmanager.com", "analytics.google.com",
    "facebook.com/tr", "connect.facebook.net",
    "hubspot.com", "hs-scripts.com", "hs-analytics.net",
    "hotjar.com", "doubleclick.net", "googlesyndication.com",
    "adservice.google.com", "vimeo.com", "player.vimeo.com",
    "f.vimeocdn.com", "i.vimeocdn.com",
    "linkedin.com/px", "snap.licdn.com", "bat.bing.com", "clarity.ms",
]

# ══════════════════════════════════════════════════════════════════
#  DATABASE HELPERS
# ══════════════════════════════════════════════════════════════════

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT, slug TEXT, name TEXT, description TEXT,
        image_url TEXT, url TEXT UNIQUE, specifications TEXT,
        part_number TEXT, download_links TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    # Migration: add download_links if missing
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN download_links TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS crawler_status (
        id INTEGER PRIMARY KEY, status TEXT, progress INTEGER,
        total_items INTEGER, current_item INTEGER,
        last_message TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS crawler_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS crawler_failed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE, category TEXT, slug TEXT, error TEXT,
        attempts INTEGER DEFAULT 3,
        failed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute(
        "INSERT OR IGNORE INTO crawler_status "
        "(id, status, progress, total_items, current_item, last_message) "
        "VALUES (1, 'Idle', 0, 0, 0, 'Ready')"
    )
    conn.commit()
    conn.close()

def log_message(message):
    print(message)
    sys.stdout.flush()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO crawler_logs (message) VALUES (?)", (message,))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to save log: {e}", file=sys.stderr)

def update_status(status, progress, total_items, current_item, last_message):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE crawler_status
        SET status=?, progress=?, total_items=?, current_item=?,
            last_message=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
        """, (status, progress, total_items, current_item, last_message))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to update status: {e}", file=sys.stderr)

def save_failed(url, category, slug, error):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO crawler_failed (url, category, slug, error)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(url) DO UPDATE SET
            error=excluded.error,
            attempts=attempts+1,
            failed_at=CURRENT_TIMESTAMP
        """, (url, category, slug, str(error)[:500]))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to save failed URL: {e}", file=sys.stderr)

def remove_from_failed(url):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM crawler_failed WHERE url=?", (url,))
        conn.commit()
        conn.close()
    except Exception:
        pass

def get_failed_urls():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT url, category, slug FROM crawler_failed ORDER BY failed_at ASC")
        rows = cursor.fetchall()
        conn.close()
        return [(url, cat, slug) for url, cat, slug in rows]
    except Exception as e:
        print(f"Failed to load failed URLs: {e}", file=sys.stderr)
        return []

def get_all_products_from_db(only_missing_downloads=False):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        if only_missing_downloads:
            cursor.execute(
                "SELECT url, category, slug FROM products "
                "WHERE download_links IS NULL ORDER BY id ASC"
            )
        else:
            cursor.execute("SELECT url, category, slug FROM products ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()
        return [(url, cat, slug) for url, cat, slug in rows]
    except Exception as e:
        print(f"Failed to load products from DB: {e}", file=sys.stderr)
        return []

# ══════════════════════════════════════════════════════════════════
#  PAGE FETCHING — HTTP-first, browser fallback
# ══════════════════════════════════════════════════════════════════

async def fetch_page_http(session, url):
    """
    Primary method: lightweight aiohttp HTTP request.
    Returns (html, 'http') on success, or (None, reason) on failure.
    No browser process needed — handles 30-50+ concurrent easily.
    """
    try:
        async with session.get(
            url,
            headers=HTTP_HEADERS,
            timeout=aiohttp.ClientTimeout(total=15, connect=8),
            allow_redirects=True
        ) as resp:
            if resp.status == 200:
                html = await resp.text(errors='replace')
                # Sanity check: real product pages are >5 KB
                if len(html) > 5000:
                    return html, 'http'
                return None, 'response_too_short'
            elif resp.status == 404:
                return None, '404'           # Permanent — don't retry via browser
            elif resp.status == 429:
                return None, 'rate_limited'  # Too many requests
            elif resp.status in (403, 503, 502):
                return None, f'blocked_{resp.status}'
            else:
                return None, f'status_{resp.status}'
    except asyncio.TimeoutError:
        return None, 'http_timeout'
    except aiohttp.ClientError as e:
        return None, f'http_error:{str(e)[:60]}'
    except Exception as e:
        return None, f'unexpected:{str(e)[:60]}'

async def block_resources(route):
    """Block resources that aren't needed for data extraction."""
    resource_type = route.request.resource_type
    if resource_type in ("image", "media", "font", "stylesheet"):
        await route.abort()
        return
    url = route.request.url
    for domain in BLOCKED_DOMAINS:
        if domain in url:
            await route.abort()
            return
    await route.continue_()

async def fetch_page_browser(browser, browser_sem, url):
    """
    Fallback method: Camoufox headless browser.
    Strictly limited by browser_sem — max 5 concurrent browser ops regardless
    of total worker count. Prevents browser instance overload.
    """
    async with browser_sem:
        page = None
        try:
            page = await browser.new_page()
            await page.route("**/*", block_resources)
            await page.goto(url, timeout=25000, wait_until="domcontentloaded")
            html = await page.content()
            return html, 'browser'
        except Exception as e:
            return None, f'browser_error:{str(e)[:100]}'
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass

async def get_page_content(session, browser, browser_sem, url):
    """
    Get page HTML using HTTP first, browser as fallback.
    404s are returned immediately without trying browser.
    """
    html, reason = await fetch_page_http(session, url)
    if html:
        return html, reason

    # Permanent failures — no point trying browser
    if reason == '404':
        return None, reason

    # For rate limiting, wait before trying browser
    if reason == 'rate_limited':
        await asyncio.sleep(random.uniform(5, 10))

    # Fallback to browser
    html, br_reason = await fetch_page_browser(browser, browser_sem, url)
    return html, br_reason if html else f'{reason}+{br_reason}'

# ══════════════════════════════════════════════════════════════════
#  DATA EXTRACTION
# ══════════════════════════════════════════════════════════════════

async def get_product_urls():
    """Fetch all product URLs from the sitemap."""
    sitemap_url = "https://www.newland-id.com/sitemap.xml"
    import urllib.request
    try:
        req = urllib.request.Request(sitemap_url, headers={
            "User-Agent": HTTP_HEADERS["User-Agent"]
        })
        with urllib.request.urlopen(req, timeout=20) as response:
            content = response.read()
        root = ET.fromstring(content)
        ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        product_urls = []
        for u in root.findall('.//ns:url', ns):
            loc = u.find('ns:loc', ns).text
            if "/en/products/" in loc:
                parts = loc.split("/en/products/")[1].strip("/").split("/")
                if len(parts) == 2:
                    product_urls.append((loc, parts[0], parts[1]))
        return product_urls
    except Exception as e:
        print(f"Error fetching sitemap: {e}")
        return []

def extract_product_data(soup, slug):
    """Extract all product fields from parsed HTML."""
    # 1. Name
    name_el = soup.find("h1")
    name = name_el.text.strip() if name_el else slug.replace("-", " ").title()

    # 2. Description
    description = ""
    prose = soup.find("div", class_="prose")
    if prose:
        description = prose.text.strip()
    else:
        meta = soup.find("meta", attrs={"name": "description"}) or \
               soup.find("meta", property="og:description")
        if meta:
            description = meta.get("content", "").strip()

    # 3. Image URL (from Katana PIM CDN — src attribute, no download needed)
    image_url = ""
    for img in soup.find_all("img"):
        src = img.get("src", "")
        if "katanapim.com" in src:
            image_url = src
            break

    # 4. Specifications table
    specs = {}
    part_number = ""
    tables = soup.find_all("table")
    for table in tables:
        for row in table.find_all("tr"):
            cols = row.find_all(["td", "th"])
            if len(cols) >= 2:
                key = cols[0].text.strip()
                val = cols[1].text.strip()
                if key and val:
                    specs[key] = val
                    if "part number" in key.lower() or key.lower() == "pn":
                        part_number = val
    if not part_number and tables:
        for row in tables[-1].find_all("tr"):
            cols = [c.text.strip() for c in row.find_all(["td", "th"])]
            if len(cols) >= 2 and ("nls-" in cols[0].lower() or "part number" in cols[0].lower()):
                part_number = cols[0]

    # 5. Download links
    download_links = extract_download_links(soup)

    return name, description, image_url, specs, part_number, download_links

def extract_download_links(soup):
    """Extract downloadable file links from parsed HTML."""
    DOWNLOAD_EXTENSIONS = {
        '.pdf', '.zip', '.exe', '.msi', '.rar', '.apk',
        '.fw', '.bin', '.tar', '.gz', '.7z', '.dmg', '.pkg', '.img'
    }
    DOWNLOAD_DOMAINS = [
        'katanapim.com/AttachmentDownload',
        'newland-id.com/media/',
        'newland-id.com/datasheets/',
    ]
    links = []
    seen = set()
    for a in soup.find_all('a', href=True):
        href = a.get('href', '').strip()
        if not href or href.startswith(('#', 'mailto:', 'javascript:')):
            continue
        if href.startswith('/'):
            href = 'https://www.newland-id.com' + href
        elif not href.startswith('http'):
            continue
        if href in seen:
            continue
        href_lower = href.lower().split('?')[0]
        is_file = any(href_lower.endswith(ext) for ext in DOWNLOAD_EXTENSIONS)
        is_known = any(d in href for d in DOWNLOAD_DOMAINS)
        if (is_file or is_known or a.has_attr('download')):
            seen.add(href)
            text = a.get_text(strip=True) or href.split('?')[0].rsplit('/', 1)[-1]
            links.append({'name': text, 'url': href})
    return links

# ══════════════════════════════════════════════════════════════════
#  CORE CRAWL LOGIC
# ══════════════════════════════════════════════════════════════════

async def scrape_product(session, browser, browser_sem, url_info, index, total, mode='full'):
    url, category, slug = url_info

    # ── Skip check ────────────────────────────────────────────────
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        if mode == 'fill_downloads':
            # Skip only if download_links already filled
            cursor.execute(
                "SELECT COUNT(*) FROM products WHERE url=? AND download_links IS NOT NULL",
                (url,)
            )
            skip = cursor.fetchone()[0] > 0
        elif mode == 're_scrape':
            # Re-scrape mode: never skip, force update info
            skip = False
        else:
            # Full mode: skip only when BOTH name AND download_links are present.
            # Products crawled before download_links was added will be re-visited
            # to fill in the missing field — no separate "Fill Downloads" run needed.
            cursor.execute(
                "SELECT COUNT(*) FROM products "
                "WHERE url=? AND name IS NOT NULL AND name!='' AND download_links IS NOT NULL",
                (url,)
            )
            skip = cursor.fetchone()[0] > 0
        conn.close()
        if skip:
            update_status("Running", int(index / total * 100), total, index, f"Skipping {slug}...")
            return
    except Exception as e:
        log_message(f"DB check error: {e}")

    if mode == 'fill_downloads':
        action = "Filling downloads"
    elif mode == 're_scrape':
        action = "Re-scraping"
    else:
        action = "Crawling"
    log_message(f"[{index}/{total}] {action}: {slug}")
    update_status("Running", int(index / total * 100), total, index, f"{action} {slug}...")

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            html, method = await get_page_content(session, browser, browser_sem, url)

            if html is None:
                err = f"No content ({method})"
                if method == '404':
                    # 404 = permanent, don't retry
                    log_message(f"[{index}/{total}] 404 (skip permanently): {slug}")
                    return
                raise RuntimeError(err)

            soup = BeautifulSoup(html, "html.parser")

            if mode == 'fill_downloads':
                dl = extract_download_links(soup)
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE products SET download_links=? WHERE url=?",
                    (json.dumps(dl, ensure_ascii=False), url)
                )
                conn.commit()
                conn.close()
                log_message(f"[{index}/{total}] OK [{method}] ({len(dl)} files): {slug}")
                return

            # Full crawl
            name, description, image_url, specs, part_number, downloads = extract_product_data(soup, slug)

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO products
                (category, slug, name, description, image_url, url, specifications, part_number, download_links)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                category=excluded.category, slug=excluded.slug,
                name=excluded.name, description=excluded.description,
                image_url=excluded.image_url, specifications=excluded.specifications,
                part_number=excluded.part_number, download_links=excluded.download_links
            """, (
                category, slug, name, description, image_url, url,
                json.dumps(specs, ensure_ascii=False), part_number,
                json.dumps(downloads, ensure_ascii=False)
            ))
            conn.commit()
            conn.close()
            remove_from_failed(url)
            log_message(f"[{index}/{total}] OK [{method}]: {name}")
            return

        except Exception as e:
            last_error = e
            err_short = str(e)[:120].replace('\n', ' ')
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt - 1]
                log_message(
                    f"[{index}/{total}] Attempt {attempt}/{MAX_RETRIES} failed: "
                    f"{err_short} -- retry in {delay}s..."
                )
                await asyncio.sleep(delay)
            else:
                log_message(f"[{index}/{total}] FAILED ({MAX_RETRIES} attempts): {slug}")

    save_failed(url, category, slug, last_error)

async def worker(queue, session, browser, browser_sem, total, mode):
    """
    Each worker picks items from the queue and processes them.
    Uses HTTP-first approach, so many workers can run concurrently without overloading the browser.
    """
    while not queue.empty():
        index = None
        try:
            index, url_info = await queue.get()
            # Small staggered delay to spread out initial burst.
            # HTTP requests are lightweight so we can afford a shorter wait.
            await asyncio.sleep(random.uniform(0.3, 1.2))
            await scrape_product(session, browser, browser_sem, url_info, index, total, mode)
        except Exception as e:
            log_message(f"Worker error on item {index}: {e}")
        finally:
            queue.task_done()

# ══════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════

async def main():
    concurrency = 5
    retry_failed_mode = False
    fill_downloads_mode = False
    from_file_path = None

    for i, arg in enumerate(sys.argv):
        if arg == "--concurrency" and i + 1 < len(sys.argv):
            try:
                concurrency = int(sys.argv[i + 1])
            except ValueError:
                pass
        if arg == "--retry-failed":
            retry_failed_mode = True
        if arg == "--fill-downloads":
            fill_downloads_mode = True
        if arg == "--from-file" and i + 1 < len(sys.argv):
            from_file_path = sys.argv[i + 1]

    init_db()

    # Clear logs
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM crawler_logs")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to clear logs: {e}", file=sys.stderr)

    # Load URL list based on mode
    if from_file_path:
        log_message(f"=== FROM FILE MODE: {from_file_path} ===")
        update_status("Starting", 0, 0, 0, f"Loading URLs from {os.path.basename(from_file_path)}...")
        product_urls = []
        try:
            if os.path.exists(from_file_path):
                with open(from_file_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        loc = line.strip()
                        if not loc or not loc.startswith('http'):
                            continue
                        if "/en/products/" in loc:
                            parts = loc.split("/en/products/")[1].strip("/").split("/")
                            if len(parts) == 2:
                                product_urls.append((loc, parts[0], parts[1]))
                            else:
                                log_message(f"Skipping invalid product URL format (no category/slug): {loc}")
                        else:
                            log_message(f"Skipping non-product URL: {loc}")
            else:
                log_message(f"Error: File not found: {from_file_path}")
        except Exception as e:
            log_message(f"Error reading URLs from file: {e}")
        
        log_message(f"Found {len(product_urls)} products in file.")
        mode = 're_scrape'
    elif fill_downloads_mode:
        log_message("=== FILL DOWNLOADS MODE ===")
        update_status("Starting", 0, 0, 0, "Loading products for download scan...")
        product_urls = get_all_products_from_db(only_missing_downloads=True)
        log_message(f"Found {len(product_urls)} products missing download links.")
        mode = 'fill_downloads'
    elif retry_failed_mode:
        log_message("=== RETRY FAILED MODE ===")
        update_status("Starting", 0, 0, 0, "Loading failed URLs for retry...")
        product_urls = get_failed_urls()
        log_message(f"Found {len(product_urls)} failed URLs to retry.")
        mode = 'full'
    else:
        log_message("Fetching product URLs from sitemap...")
        update_status("Starting", 0, 0, 0, "Fetching sitemap...")
        product_urls = await get_product_urls()
        log_message(f"Found {len(product_urls)} products in sitemap.")
        mode = 'full'

    total = len(product_urls)
    if total == 0:
        msg = {
            'fill_downloads': "All products already have download links.",
            'retry_failed': "No failed URLs to retry.",
        }.get(mode, "No products found.")
        log_message(msg)
        update_status("Completed", 100, 0, 0, msg)
        return

    # ── Browser semaphore: HARD LIMIT on concurrent browser operations ──────
    # Regardless of concurrency level, never run more than 5 browser pages at once.
    # HTTP requests (aiohttp) run without this limit — they're lightweight.
    MAX_BROWSER_CONCURRENT = min(5, max(2, concurrency // 4))
    browser_sem = asyncio.Semaphore(MAX_BROWSER_CONCURRENT)

    # ── aiohttp connector: limit concurrent connections to same host ─────────
    # limit_per_host prevents overwhelming the target server.
    # Even with 50 workers, only limit_per_host connections run in parallel to the server.
    limit_per_host = min(concurrency, 20)
    connector = aiohttp.TCPConnector(
        limit=concurrency + 10,
        limit_per_host=limit_per_host,
        ssl=False
    )

    update_status("Starting", 0, total, 0, f"Found {total} items. Launching ({concurrency} workers, max {MAX_BROWSER_CONCURRENT} browser slots)...")
    log_message(
        f"Starting: {concurrency} workers | HTTP limit/host={limit_per_host} | "
        f"Browser slots={MAX_BROWSER_CONCURRENT} | Mode={mode}"
    )

    async with aiohttp.ClientSession(connector=connector) as session:
        async with AsyncCamoufox(headless=True, block_images=True) as browser:
            log_message("Browser ready. Starting workers...")

            queue = asyncio.Queue()
            for i, url_info in enumerate(product_urls, start=1):
                await queue.put((i, url_info))

            # Stagger worker starts by 0.1s each to spread initial load
            workers = []
            for i in range(concurrency):
                await asyncio.sleep(0.1)
                task = asyncio.create_task(
                    worker(queue, session, browser, browser_sem, total, mode)
                )
                workers.append(task)

            await asyncio.gather(*workers)

    log_message("Crawling completed.")
    update_status("Completed", 100, total, total, "All done.")

if __name__ == "__main__":
    asyncio.run(main())
