import asyncio
import xml.etree.ElementTree as ET
import sqlite3
import json
import os
import sys
import random
import re
import urllib.parse
import ssl
import subprocess

# Bypass SSL certificate validation errors on Linux VPS
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass

# Auto-install missing critical Python dependencies if pip is available
def ensure_dependencies():
    missing = []
    try:
        import bs4
    except ImportError:
        missing.append("beautifulsoup4")
    try:
        import aiohttp
    except ImportError:
        missing.append("aiohttp")

    if missing:
        print(f"Installing missing Python packages: {missing}...", file=sys.stderr)
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
            print("Successfully installed missing packages!", file=sys.stderr)
        except Exception as e:
            print(f"Failed to auto-install packages: {e}", file=sys.stderr)

ensure_dependencies()

# Fix Windows console & redirected stdio encoding
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    else:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
except Exception:
    pass

from bs4 import BeautifulSoup

try:
    import aiohttp
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False
    print("ERROR: aiohttp is required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)

CAMOUFOX_AVAILABLE = False
AsyncCamoufox = None
try:
    custom_camou_dir = r"C:\Users\LEGION\AppData\Local\camoufox"
    if os.path.exists(custom_camou_dir):
        os.environ["CAMOUFOX_INSTALL_DIR"] = custom_camou_dir
    from camoufox import AsyncCamoufox
    CAMOUFOX_AVAILABLE = True
except Exception as camou_err:
    print(f"WARNING: Camoufox import failed ({camou_err}). Crawler will run in HTTP-only mode.", file=sys.stderr)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.basename(BASE_DIR) == "server":
    DATA_DIR = os.path.join(BASE_DIR, "data")
else:
    DATA_DIR = os.path.join(BASE_DIR, "server", "data")

DB_PATH = os.path.join(DATA_DIR, "products.db")
APP_DB_PATH = os.path.join(DATA_DIR, "app.db")
os.makedirs(DATA_DIR, exist_ok=True)

# ── HTTP headers that mimic a real Chrome browser ───────────────────
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
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
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN series TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN main_category TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN profile_slug TEXT")
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
    try:
        print(message)
        sys.stdout.flush()
    except Exception:
        pass
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO crawler_logs (message) VALUES (?)", (str(message),))
        conn.commit()
        conn.close()
    except Exception:
        pass

def update_status(status, progress, total_items, current_item, last_message, profile_slug=None):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        if profile_slug:
            cursor.execute("""
            UPDATE crawler_status
            SET status=?, progress=?, total_items=?, current_item=?,
                last_message=?, profile_slug=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=1
            """, (status, progress, total_items, current_item, last_message, profile_slug))
        else:
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

    # Fallback to browser if available
    if not browser:
        return None, f'{reason}+no_browser'

    html, br_reason = await fetch_page_browser(browser, browser_sem, url)
    return html, br_reason if html else f'{reason}+{br_reason}'

# ══════════════════════════════════════════════════════════════════
#  DATA EXTRACTION
# ══════════════════════════════════════════════════════════════════

async def get_product_urls(profile_slug='newland'):
    """Fetch product URLs for the given profile (strictly from HAR report in DB for custom profiles)."""
    if profile_slug != 'newland':
        try:
            import sqlite3, json, urllib.parse
            conn = sqlite3.connect(APP_DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT har_report_json, target_url, name, sitemap_xml, sitemap_url, slug FROM product_profiles WHERE slug = ?", (profile_slug,))
            row = cursor.fetchone()
            if not row:
                cursor.execute("SELECT har_report_json, target_url, name, sitemap_xml, sitemap_url, slug FROM product_profiles WHERE LOWER(slug) = LOWER(?) OR LOWER(name) LIKE ? OR LOWER(brand_name) LIKE ?", 
                               (profile_slug, f"%{profile_slug.lower()}%", f"%{profile_slug.lower()}%"))
                row = cursor.fetchone()
            if not row and profile_slug.startswith('profile-'):
                clean = profile_slug.replace('profile-', '')
                cursor.execute("SELECT har_report_json, target_url, name, sitemap_xml, sitemap_url, slug FROM product_profiles WHERE LOWER(slug) = LOWER(?) OR LOWER(name) LIKE ? OR LOWER(brand_name) LIKE ?", 
                               (clean, f"%{clean.lower()}%", f"%{clean.lower()}%"))
                row = cursor.fetchone()
            if not row:
                cursor.execute("SELECT har_report_json, target_url, name, sitemap_xml, sitemap_url, slug FROM product_profiles ORDER BY id DESC LIMIT 1")
                row = cursor.fetchone()
            conn.close()

            if not row:
                log_message(f"Lỗi: Không tìm thấy Profile '{profile_slug}' trong cơ sở dữ liệu.")
                return []

            har_json_str, target_url, profile_name, sitemap_xml, sitemap_url_db, db_slug = row
            report = json.loads(har_json_str) if har_json_str else {"fields": []}
            seen = set()
            raw_candidates = []

            # 1. Parse from uploaded sitemap_xml string if present
            if sitemap_xml:
                log_message("Đang nạp dữ liệu từ file Sitemap.xml đã upload...")
                locs = re.findall(r'<loc>(https?://[^<]+)</loc>', sitemap_xml, re.I)
                for loc in locs:
                    clean = loc.split('?')[0].split('#')[0]
                    if clean not in seen and not any(clean.lower().endswith(ext) for ext in ('.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.pdf')):
                        if not any(x in clean.lower() for x in ('news-detail', 'solutions-detail', 'products-compare')):
                            seen.add(clean)
                            raw_candidates.append(clean)
                log_message(f"Đã nạp {len(raw_candidates)} liên kết từ file Sitemap.xml upload!")

            # 2. Parse from sitemap_url_db if specified
            if sitemap_url_db:
                try:
                    log_message(f"Đang tải Sitemap từ URL: '{sitemap_url_db}'...")
                    headers = {
                        "User-Agent": HTTP_HEADERS["User-Agent"],
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Encoding": "gzip, deflate"
                    }
                    import urllib.request, gzip
                    req = urllib.request.Request(sitemap_url_db, headers=headers)
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        data = resp.read()
                        if resp.headers.get('Content-Encoding') == 'gzip':
                            data = gzip.decompress(data)
                        text = data.decode('utf-8', errors='replace')
                        locs = re.findall(r'<loc>(https?://[^<]+)</loc>', text, re.I)
                        c = 0
                        for loc in locs:
                            clean = loc.split('?')[0].split('#')[0]
                            if clean not in seen and not any(clean.lower().endswith(ext) for ext in ('.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.pdf')):
                                if not any(x in clean.lower() for x in ('news-detail', 'solutions-detail', 'products-compare')):
                                    seen.add(clean)
                                    raw_candidates.append(clean)
                                    c += 1
                        log_message(f"Đã tải và bổ sung {c} liên kết từ Sitemap URL!")
                except Exception as ex:
                    log_message(f"Lỗi khi nạp Sitemap URL '{sitemap_url_db}': {ex}")
            p_name = profile_name or profile_slug

            if not target_url or not target_url.startswith('http'):
                for f in report.get("fields", []):
                    for s in f.get("samples", []):
                        if isinstance(s, dict) and s.get("value") and s.get("value").startswith("http"):
                            parsed_u = urllib.parse.urlparse(s.get("value"))
                            d = parsed_u.netloc.lower()
                            if not any(x in d for x in ('youtube.com', 'google', 'facebook', 'cloudflare', 'doubleclick', 'analytics')):
                                target_url = f"{parsed_u.scheme}://{parsed_u.netloc}"
                                break
                    if target_url:
                        break

            target_domain = urllib.parse.urlparse(target_url).netloc.lower() if target_url else ''
            if not target_domain:
                for f in report.get("fields", []):
                    for s in f.get("samples", []):
                        if isinstance(s, dict) and s.get("value") and s.get("value").startswith("http"):
                            d = urllib.parse.urlparse(s.get("value")).netloc.lower()
                            if not any(x in d for x in ('youtube.com', 'google', 'facebook', 'cloudflare', 'doubleclick', 'analytics')):
                                target_domain = d
                                break
                    if target_domain:
                        break

            # Append HAR candidates to existing raw_candidates
            for field in report.get("fields", []):
                candidates = []
                for sample in field.get("samples", []):
                    if isinstance(sample, dict) and sample.get("value"):
                        candidates.append(sample.get("value"))
                for ep in field.get("endpoints", []):
                    if isinstance(ep, str):
                        candidates.append(ep)

                for val in candidates:
                    if not val or not val.startswith("http"):
                        continue
                    parsed = urllib.parse.urlparse(val)
                    domain = parsed.netloc.lower()
                    if target_domain and domain != target_domain and not domain.endswith('.' + target_domain):
                        continue
                    if any(val.lower().endswith(ext) for ext in ('.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ico')):
                        continue
                    if any(x in val.lower() for x in ('products-compare', 'products-search', 'discontinued=', 'index_tag_id=')):
                        continue

                    clean_val = val.split('#')[0].split('?')[0]
                    if clean_val not in seen:
                        seen.add(clean_val)
                        raw_candidates.append(clean_val)

            detail_urls = []
            category_urls = []
            for val in raw_candidates:
                lower = val.lower()
                parsed = urllib.parse.urlparse(val)
                parts = [p for p in parsed.path.split('/') if p]
                slug = parts[-1] if parts else 'product'
                category = parts[-2] if len(parts) >= 2 else p_name

                is_detail = any(x in lower for x in ('products-detail', 'product-detail', '/detail/', '/item/', '/p/'))
                if is_detail and not lower.replace('/', '').endswith('products-detail') and not lower.replace('/', '').endswith('product-detail'):
                    detail_urls.append((val, category, slug))
                else:
                    category_urls.append((val, category, slug))

            product_urls = detail_urls if len(detail_urls) > 0 else category_urls

            # Auto-discovery fallback if HAR has few/no links but target_url exists
            if (len(product_urls) < 10 or not detail_urls) and target_url and target_url.startswith('http'):
                try:
                    log_message(f"Đang tự động quét toàn bộ website '{target_url}' để thu thập thêm link sản phẩm...")
                    auto_found = []
                    sitemap_url = urllib.parse.urljoin(target_url, "/sitemap.xml")
                    headers = {
                        "User-Agent": HTTP_HEADERS["User-Agent"],
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Encoding": "gzip, deflate"
                    }
                    import urllib.request, gzip
                    req = urllib.request.Request(sitemap_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        data = resp.read()
                        if resp.headers.get('Content-Encoding') == 'gzip':
                            data = gzip.decompress(data)
                        text = data.decode('utf-8', errors='replace')
                        locs = re.findall(r'<loc>(https?://[^<]+)</loc>', text, re.I)
                        for loc in locs:
                            clean = loc.split('?')[0].split('#')[0]
                            if any(clean.lower().endswith(ext) for ext in ('.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.pdf')):
                                continue
                            if 'news-detail' in clean or 'solutions-detail' in clean or 'products-compare' in clean:
                                continue
                            lower = clean.lower()
                            is_detail = any(x in lower for x in ('products-detail', 'product-detail', '/detail/', '/item/', '/p/'))
                            if is_detail and not lower.rstrip('/').endswith('products-detail') and not lower.rstrip('/').endswith('product-detail'):
                                if clean not in seen:
                                    seen.add(clean)
                                    parts = [p for p in urllib.parse.urlparse(clean).path.split('/') if p]
                                    slug = parts[-1] if parts else 'product'
                                    cat = parts[-2] if len(parts) >= 2 else p_name
                                    auto_found.append((clean, cat, slug))
                    if auto_found:
                        log_message(f"Tự động quét sitemap website đã bổ sung thêm {len(auto_found)} đường dẫn sản phẩm!")
                        product_urls = auto_found
                except Exception as ex:
                    log_message(f"Không tự quét được sitemap website: {ex}")

            if product_urls:
                log_message(f"Đã trích xuất {len(product_urls)} đường dẫn từ báo cáo HAR của Profile '{profile_slug}'")
                return product_urls
            else:
                log_message(f"Lỗi: File HAR của Profile '{profile_slug}' chưa phát hiện được đường dẫn sản phẩm nào. Vui lòng kiểm tra lại file HAR.")
                return []
        except Exception as e:
            log_message(f"Lỗi khi đọc báo cáo HAR của Profile '{profile_slug}': {e}")
            return []

    # Newland default profile
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

def extract_product_data(soup, slug, url=""):
    """
    Extract product details including:
    - name: Product Name / Title
    - main_category: Danh mục lớn (e.g. Barcode Printers, Barcode Scanners)
    - category: Danh mục con (e.g. Desktop Printers, Industrial Printers)
    - series: Dòng Series (e.g. CP / CX Series, OS Series)
    - description, image_url, specs, part_number, download_links
    """
    # 1. Name
    name_el = soup.find("h1") or soup.find("h2", class_=re.compile(r'title|product', re.I))
    name = name_el.text.strip() if name_el else slug.replace("-", " ").replace("_", " ").title()

    # 2. Specifications table & Part Number
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
                    if "part number" in key.lower() or key.lower() == "pn" or "model" in key.lower():
                        if not part_number: part_number = val

    if not part_number and tables:
        for row in tables[-1].find_all("tr"):
            cols = [c.text.strip() for c in row.find_all(["td", "th"])]
            if len(cols) >= 2 and ("nls-" in cols[0].lower() or "part number" in cols[0].lower()):
                part_number = cols[0]

    if not part_number or part_number.strip().lower() in ('', 'description'):
        m_code = re.search(r'\b([A-Za-z]{1,4}[-_/]?[0-9]{2,5}[A-Za-z0-9]*)\b', name)
        if m_code:
            part_number = m_code.group(1).upper()
        elif slug:
            part_number = slug.upper()

    # 3. Multi-level Category & Series Extraction
    main_category = ""
    category = ""
    series = ""

    # Check Argox model lookup table first for known brand families
    ARGOX_PATTERNS = [
        (r'\b(cx[-_]?2040|cx[-_]?2140|cx[-_]?3040|cx[-_]?3140|cp[-_]?2140)\b', "Barcode Printers", "Desktop Printers", "CP / CX Series"),
        (r'\b(os[-_]?214|os[-_]?2130|os[-_]?200)\b', "Barcode Printers", "Desktop Printers", "OS Series"),
        (r'\b(o4[-_]?250|o4[-_]?350)\b', "Barcode Printers", "Desktop Printers", "O4 Series"),
        (r'\b(p4[-_]?250|p4[-_]?350)\b', "Barcode Printers", "Desktop Printers", "P4 Series"),
        (r'\b(d4[-_]?250|d4[-_]?350)\b', "Barcode Printers", "Desktop Printers", "D4 Series"),
        (r'\b(d2[-_]?250|d2[-_]?350)\b', "Barcode Printers", "Desktop Printers", "D2 Series"),
        (r'\b(mp[-_]?2140)\b', "Barcode Printers", "Desktop Printers", "MP Series"),
        (r'\b(ix4[-_]?250|ix4[-_]?350)\b', "Barcode Printers", "Industrial Printers", "iX4 Series"),
        (r'\b(ix6[-_]?250|ix6[-_]?350)\b', "Barcode Printers", "Industrial Printers", "iX6 Series"),
        (r'\b(xm4[-_]?250)\b', "Barcode Printers", "Industrial Printers", "XM4 Series"),
    ]
    
    text_for_argox = f"{name} {slug} {url}"
    for pattern, m_cat, cat, ser in ARGOX_PATTERNS:
        if re.search(pattern, text_for_argox, re.I):
            main_category = m_cat
            category = cat
            series = ser
            break

    # Strategy A: Breadcrumbs HTML parsing if not resolved
    if not category or not main_category:
        bc_elements = soup.find_all(class_=re.compile(r'breadcrumb|crumbs|nav-path|location|site-map|header-path', re.I))
        if not bc_elements:
            bc_elements = soup.find_all(['nav', 'div', 'ul', 'ol'], attrs={"aria-label": re.compile(r'breadcrumb', re.I)})
        if not bc_elements:
            bc_elements = soup.find_all(attrs={"itemtype": re.compile(r'BreadcrumbList', re.I)})

        crumbs = []
        if bc_elements:
            for bc_el in bc_elements:
                items = bc_el.find_all(["a", "li", "span"])
                for item in items:
                    t = item.text.strip()
                    if t and t not in crumbs and not any(x in t.lower() for x in ('home', 'trang chủ', 'main', 'index', '>', '/')):
                        crumbs.append(t)
                if len(crumbs) >= 1:
                    break

        clean_crumbs = [c for c in crumbs if c.lower() != name.lower() and c.lower() != slug.lower()]
        if len(clean_crumbs) >= 3:
            if not main_category: main_category = clean_crumbs[0]
            if not category: category = clean_crumbs[1]
            if not series: series = clean_crumbs[2]
        elif len(clean_crumbs) == 2:
            if not main_category: main_category = clean_crumbs[0]
            if not category: category = clean_crumbs[1]
        elif len(clean_crumbs) == 1:
            if not category: category = clean_crumbs[0]

    # Strategy B: Prettified URL Path parsing
    GENERIC_SEGMENTS = {
        'en', 'vn', 'products', 'product', 'products-detail', 'product-detail', 
        'detail', 'item', 'items', 'p', 'catalog', 'category', 'categories', 
        'shop', 'home', 'default.aspx', 'index.html', 'index.php'
    }
    
    parsed_url = urllib.parse.urlparse(url) if url else None
    parts = [p for p in parsed_url.path.split('/') if p] if parsed_url else []
    meaningful_parts = [
        p.replace('-', ' ').replace('_', ' ').title() 
        for p in parts 
        if p.lower() not in GENERIC_SEGMENTS and not p.isdigit()
    ]

    if not category:
        if len(meaningful_parts) >= 2:
            if not main_category: main_category = meaningful_parts[0]
            category = meaningful_parts[1] if len(meaningful_parts) >= 2 else meaningful_parts[0]
            if not series and len(meaningful_parts) >= 3:
                series = meaningful_parts[2]
        elif len(meaningful_parts) == 1:
            category = meaningful_parts[0]

    if not main_category:
        main_category = category if category else "Thiết bị mã số mã vạch"

    # Strategy C: Series Extraction from Specifications or Product Name / Model
    if not series:
        for k, v in specs.items():
            if any(term in k.lower() for term in ('series', 'dòng', 'family', 'product line', 'model series')):
                series = v
                break

    if not series and (name or part_number or slug):
        text_to_search = f"{name} {part_number} {slug}"
        m_series = re.search(r'\b([A-Za-z0-9\-]+(?:\s+Series|\s+Family))\b', text_to_search, re.I)
        if m_series:
            series = m_series.group(1).title()
        else:
            m_code = re.search(r'\b([A-Z]{2,4}[-_\s]?[0-9]{2,4})\b', text_to_search)
            if m_code:
                code_str = m_code.group(1).upper()
                series = f"{code_str} Series"

    if not series:
        series = f"{category} Series" if category and category != "Chung" else "Default Series"

    # 4. Description
    description = ""
    prose = soup.find("div", class_=re.compile(r'prose|description|intro|summary', re.I))
    if prose:
        description = prose.text.strip()
    else:
        meta = soup.find("meta", attrs={"name": "description"}) or \
               soup.find("meta", property="og:description")
        if meta:
            description = meta.get("content", "").strip()

    # 5. Image URL (Rich Image Link Extraction)
    image_url = ""
    og_img = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"}) or soup.find("meta", attrs={"name": "twitter:image"})
    if og_img and og_img.get("content"):
        image_url = og_img.get("content").strip()

    if not image_url:
        for img in soup.find_all("img"):
            src = img.get("src", "") or img.get("data-src", "")
            if not src or any(ext in src.lower() for ext in ('.svg', 'icon', 'logo', 'banner', 'button', 'loading')):
                continue
            if any(k in src.lower() for k in ("katanapim", "upload", "catalog", "product", "item", "media", "images", "detail")):
                image_url = src
                break

    if image_url and not image_url.startswith("http") and url:
        image_url = urllib.parse.urljoin(url, image_url)

    # 6. Download links
    download_links = extract_download_links(soup)

    return name, main_category, category, series, description, image_url, specs, part_number, download_links

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

async def scrape_product(session, browser, browser_sem, url_info, index, total, mode='full', profile_slug='newland'):

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
            update_status("Running", int(index / total * 100), total, index, f"Skipping {slug}...", profile_slug)
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
    if index >= total:
        update_status("Completed", 100, total, total, f"Completed {action.lower()} {slug}.", profile_slug)
    else:
        update_status("Running", int(index / total * 100), total, index, f"{action} {slug}...", profile_slug)

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
            name, main_cat_ext, cat_extracted, series_extracted, description, image_url, specs, part_number, downloads = extract_product_data(soup, slug, url)

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO products
                (main_category, category, series, slug, name, description, image_url, url, specifications, part_number, download_links, profile_slug)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                main_category=excluded.main_category, category=excluded.category, series=excluded.series,
                slug=excluded.slug, name=excluded.name, description=excluded.description,
                image_url=excluded.image_url, specifications=excluded.specifications,
                part_number=excluded.part_number, download_links=excluded.download_links,
                profile_slug=excluded.profile_slug
            """, (
                main_cat_ext, cat_extracted, series_extracted, slug, name, description, image_url, url,
                json.dumps(specs, ensure_ascii=False), part_number,
                json.dumps(downloads, ensure_ascii=False), profile_slug
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

async def worker(queue, session, browser, browser_sem, total, mode, profile_slug="newland"):
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
            await scrape_product(session, browser, browser_sem, url_info, index, total, mode, profile_slug)
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
    profile_slug = 'newland'

    for i, arg in enumerate(sys.argv):
        if arg == "--concurrency" and i + 1 < len(sys.argv):
            try:
                concurrency = int(sys.argv[i + 1])
            except ValueError:
                pass
        if arg == "--profile" and i + 1 < len(sys.argv):
            profile_slug = sys.argv[i + 1]
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
        product_urls = await get_product_urls(profile_slug)
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

    try:
        async with aiohttp.ClientSession(connector=connector) as session:
            queue = asyncio.Queue()
            for i, url_info in enumerate(product_urls, start=1):
                await queue.put((i, url_info))

            browser_used = False
            if CAMOUFOX_AVAILABLE and AsyncCamoufox is not None:
                try:
                    async with AsyncCamoufox(headless=True, block_images=True) as browser:
                        log_message("Browser ready. Starting workers...")
                        workers = []
                        for i in range(concurrency):
                            await asyncio.sleep(0.1)
                            task = asyncio.create_task(
                                worker(queue, session, browser, browser_sem, total, mode, profile_slug)
                            )
                            workers.append(task)
                        await asyncio.gather(*workers)
                        browser_used = True
                except Exception as b_err:
                    log_message(f"Browser execution failed ({b_err}). Falling back to HTTP-only mode...")

            if not browser_used:
                log_message("Running crawler in HTTP-only mode...")
                workers = []
                for i in range(concurrency):
                    await asyncio.sleep(0.1)
                    task = asyncio.create_task(
                        worker(queue, session, None, browser_sem, total, mode, profile_slug)
                    )
                    workers.append(task)
                await asyncio.gather(*workers)
    except Exception as s_err:
        log_message(f"Session closed with note: {s_err}")
    finally:
        log_message("Crawling completed.")
        update_status("Completed", 100, total, total, "All done.", profile_slug)

if __name__ == "__main__":
    asyncio.run(main())
