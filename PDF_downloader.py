"""
PDF Sheet → Drive Uploader
Flask backend với đa luồng, pre-scan thư mục, retry tự động
"""

from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request as GRequest
# pyrefly: ignore [missing-import]
from googleapiclient.discovery import build
# pyrefly: ignore [missing-import]
from googleapiclient.http import MediaIoBaseUpload
# pyrefly: ignore [missing-import]
from googleapiclient.errors import HttpError
import threading
import concurrent.futures
import queue
import requests as req_lib
import io
import json
import os
import time
import pickle
import traceback
import re
from pathlib import Path

app = Flask(__name__)

# ============================================================
# Constants
# ============================================================
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

BASE_DIR = Path(__file__).parent
CREDS_FILE = BASE_DIR / 'sick-pdf-api.json'
TOKEN_FILE = BASE_DIR / 'token.pickle'

# ============================================================
# Global State
# ============================================================
class AppState:
    def __init__(self):
        self.creds = None
        self.progress_queue = queue.Queue()
        self.pause_event = threading.Event()
        self.stop_event = threading.Event()
        self.pause_event.set()          # Not paused initially
        self.is_running = False
        self.is_paused = False
        self.stats = {
            'total': 0, 'success': 0, 'failed': 0,
            'skipped': 0, 'current': 0
        }
        self.folder_cache: dict = {}    # {f"{parent_id}|{name}": folder_id}
        self.folder_lock = threading.Lock()
        self.creds_lock = threading.Lock()
        self.stats_lock = threading.Lock()
        # Limit concurrent Sheets API writes (rate limit: 100 req/100s per user)
        self.sheets_semaphore = threading.Semaphore(5)
        self.results = []
        self.executor = None

state = AppState()
_thread_local = threading.local()       # Thread-local Drive service cache


# ============================================================
# Auth Helpers
# ============================================================
def load_credentials():
    if TOKEN_FILE.exists():
        try:
            with open(TOKEN_FILE, 'rb') as f:
                creds = pickle.load(f)
            if creds and creds.valid:
                return creds
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(GRequest())
                _save_creds(creds)
                return creds
        except Exception:
            pass
    return None


def _save_creds(creds):
    with open(TOKEN_FILE, 'wb') as f:
        pickle.dump(creds, f)


def ensure_fresh_creds():
    """Refresh credentials if expired (thread-safe)."""
    with state.creds_lock:
        if state.creds and state.creds.expired and state.creds.refresh_token:
            try:
                state.creds.refresh(GRequest())
                _save_creds(state.creds)
            except Exception as e:
                emit_log(f"⚠ Không thể làm mới token: {e}", "warning")
    return state.creds


# ============================================================
# Service Builders
# ============================================================
def get_drive_service():
    """Get thread-local Drive service (built once per thread)."""
    if not hasattr(_thread_local, 'drive') or _thread_local.drive is None:
        creds = ensure_fresh_creds()
        _thread_local.drive = build(
            'drive', 'v3', credentials=creds, cache_discovery=False
        )
    return _thread_local.drive


def new_sheets_service():
    """Create a new Sheets service (per call for thread safety)."""
    creds = ensure_fresh_creds()
    return build('sheets', 'v4', credentials=creds, cache_discovery=False)


# ============================================================
# Folder Management (Thread-Safe with Cache)
# ============================================================
def get_or_create_folder(service, name: str, parent_id: str) -> str:
    """
    Get existing folder ID or create new one.
    Uses double-checked locking for thread-safe cache.
    After pre-scan, most calls return immediately from cache.
    """
    cache_key = f"{parent_id}|{name}"

    # Fast path: read without lock (GIL-safe for simple dict lookups in CPython)
    cached = state.folder_cache.get(cache_key)
    if cached:
        return cached

    with state.folder_lock:
        # Double-check after acquiring lock
        cached = state.folder_cache.get(cache_key)
        if cached:
            return cached

        safe_name = name.replace("'", "\\'")
        query = (
            f"name='{safe_name}' and "
            f"'{parent_id}' in parents and "
            f"mimeType='application/vnd.google-apps.folder' and "
            f"trashed=false"
        )
        resp = service.files().list(
            q=query, fields='files(id)', spaces='drive', pageSize=1
        ).execute()
        files = resp.get('files', [])

        if files:
            folder_id = files[0]['id']
        else:
            folder = service.files().create(
                body={
                    'name': name,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [parent_id]
                },
                fields='id'
            ).execute()
            folder_id = folder['id']

        state.folder_cache[cache_key] = folder_id
        return folder_id


def create_nested_folder(service, root_id: str, category: str, series: str = None) -> str:
    """Create/get Category[/Series] folder tree, returns deepest folder ID."""
    cat_id = get_or_create_folder(service, category, root_id)
    if series:
        return get_or_create_folder(service, series, cat_id)
    return cat_id


# ============================================================
# Pre-scan Phase
# ============================================================
def prescan_and_create_folders(service, rows: list, root_id: str, col_idx: dict):
    """
    Phase 1: Scan all rows to collect unique (category, series) pairs,
    then pre-create the entire folder tree on Drive.
    This prevents race conditions and eliminates duplicate API calls
    during the parallel download/upload phase.
    """
    pairs = set()
    for row in rows:
        cat = safe_get_col(row, col_idx.get('category'))
        ser = safe_get_col(row, col_idx.get('series')) if col_idx.get('series') is not None else ''
        if cat:
            pairs.add((cat, ser or ''))

    unique_cats = sorted({p[0] for p in pairs})
    unique_pairs = sorted({p for p in pairs if p[1]})

    emit_log(f"Pre-scan: {len(unique_cats)} danh mục, {len(unique_pairs)} cặp Danh mục/Series", "info")
    emit_progress("Đang tạo cấu trúc thư mục trên Drive...")

    # Create category folders first (sequential to avoid duplicates)
    for cat in unique_cats:
        get_or_create_folder(service, cat, root_id)
        emit_log(f"  📁 {cat}", "folder")

    # Create series folders
    for cat, ser in unique_pairs:
        cat_id = state.folder_cache.get(f"{root_id}|{cat}")
        if cat_id and ser:
            get_or_create_folder(service, ser, cat_id)
            emit_log(f"  📂 {cat}/{ser}", "folder")

    emit_log(f"✓ Tạo xong {len(state.folder_cache)} thư mục", "success")


# ============================================================
# Utility
# ============================================================
def safe_get_col(row: list, col_index) -> str:
    if col_index is None or col_index < 0:
        return ''
    try:
        val = row[col_index]
        return str(val).strip() if val else ''
    except (IndexError, TypeError):
        return ''


def sanitize_name(name: str, max_len: int = 200) -> str:
    """Remove characters invalid for filenames/folder names."""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)
    name = name.strip().strip('.')
    return name[:max_len] or 'untitled'


def col_letter_to_index(letter: str) -> int:
    """Convert Excel-style column letter (A, B, ..., AA, ...) to 0-based index."""
    if not letter:
        return -1
    result = 0
    for char in str(letter).strip().upper():
        if 'A' <= char <= 'Z':
            result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1


def emit_log(message: str, level: str = "info"):
    state.progress_queue.put({
        'type': 'log',
        'message': message,
        'level': level,
        'time': time.strftime('%H:%M:%S')
    })


def emit_progress(message: str):
    with state.stats_lock:
        stats = dict(state.stats)
    state.progress_queue.put({
        'type': 'progress',
        'message': message,
        'stats': stats
    })


def update_stats(key: str):
    with state.stats_lock:
        state.stats[key] = state.stats.get(key, 0) + 1
        state.stats['current'] = state.stats.get('current', 0) + 1


def broadcast_stats():
    with state.stats_lock:
        stats = dict(state.stats)
    state.progress_queue.put({'type': 'stats', 'stats': stats})


# ============================================================
# Download & Upload (with retry)
# ============================================================
def download_pdf(url: str, timeout: int = 60, max_retries: int = 3) -> bytes:
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Safari/537.36'
        ),
        'Accept': 'application/pdf,*/*'
    }
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            resp = req_lib.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()
            return resp.content
        except req_lib.exceptions.RequestException as e:
            last_err = e
            if attempt < max_retries:
                wait = 2 ** attempt
                time.sleep(wait)
    # pyrefly: ignore [bad-raise]
    raise last_err


def upload_to_drive(service, content: bytes, filename: str, folder_id: str,
                    max_retries: int = 3) -> str:
    """Upload PDF bytes to Drive, set anyone-readable, return webViewLink."""
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            media = MediaIoBaseUpload(
                io.BytesIO(content),
                mimetype='application/pdf',
                resumable=True,
                chunksize=4 * 1024 * 1024   # 4 MB chunks
            )
            uploaded = service.files().create(
                body={'name': filename, 'parents': [folder_id]},
                media_body=media,
                fields='id,webViewLink'
            ).execute()

            # Make publicly readable (anyone with link)
            service.permissions().create(
                fileId=uploaded['id'],
                body={'type': 'anyone', 'role': 'reader'}
            ).execute()

            return uploaded['webViewLink']

        except HttpError as e:
            status = e.resp.status if hasattr(e, 'resp') else 500
            last_err = e
            if status in (429, 500, 502, 503, 504) and attempt < max_retries:
                wait = (2 ** attempt) + 1
                emit_log(f"Drive API {status}, retry sau {wait}s...", "warning")
                time.sleep(wait)
                continue
            raise
    # pyrefly: ignore [bad-raise]
    raise last_err


def write_to_sheet(spreadsheet_id: str, sheet_name: str, row_num: int,
                   col_letter: str, value: str, max_retries: int = 3):
    """Write result link to Sheet cell (semaphore-limited to avoid rate limit)."""
    with state.sheets_semaphore:
        last_err = None
        for attempt in range(max_retries + 1):
            try:
                svc = new_sheets_service()
                range_notation = f"'{sheet_name}'!{col_letter}{row_num}"
                svc.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_notation,
                    valueInputOption='USER_ENTERED',
                    body={'values': [[value]]}
                ).execute()
                return
            except HttpError as e:
                status = e.resp.status if hasattr(e, 'resp') else 500
                last_err = e
                if status in (429, 500, 503) and attempt < max_retries:
                    wait = (2 ** attempt) + 2
                    emit_log(f"Sheets API {status}, retry sau {wait}s...", "warning")
                    time.sleep(wait)
                    continue
                raise
        # pyrefly: ignore [bad-raise]
        raise last_err


# ============================================================
# Worker Function (runs in thread pool)
# ============================================================
def process_row(row_idx: int, row: list, actual_row_num: int,
                config: dict, root_folder_id: str):
    """
    Process one sheet row:
    1. Pause/stop check
    2. Extract fields
    3. Skip if already done
    4. Download PDF
    5. Upload to Drive (folder from cache)
    6. Write link back to Sheet
    """
    # --- Stop/Pause check ---
    if state.stop_event.is_set():
        return 'stopped', actual_row_num, None

    while not state.pause_event.is_set():
        if state.stop_event.is_set():
            return 'stopped', actual_row_num, None
        time.sleep(0.3)

    col = config['columns']
    pdf_url   = safe_get_col(row, col.get('pdf_url'))
    category  = safe_get_col(row, col.get('category'))
    series    = safe_get_col(row, col.get('series'))
    model     = safe_get_col(row, col.get('model'))
    result_col = col['result']
    max_retries = config.get('retries', 3)

    # --- Skip if existing result ---
    if config.get('skip_existing'):
        existing = safe_get_col(row, col.get('existing_result_idx', -1))
        if existing and (existing.startswith('http') or existing.startswith('https')):
            emit_log(f"⊘ [{actual_row_num}] Đã có link, bỏ qua", "skip")
            update_stats('skipped')
            broadcast_stats()
            return 'skipped', actual_row_num, existing

    if not pdf_url:
        emit_log(f"⊘ [{actual_row_num}] Không có URL PDF", "skip")
        update_stats('skipped')
        broadcast_stats()
        return 'skipped', actual_row_num, None

    filename = f"{sanitize_name(model)}.pdf" if model else f"row_{actual_row_num}.pdf"
    last_err = None

    for attempt in range(max_retries + 1):
        if state.stop_event.is_set():
            return 'stopped', actual_row_num, None
        try:
            drive_svc = get_drive_service()

            # Resolve folder from pre-built cache
            if category and series:
                folder_id = create_nested_folder(drive_svc, root_folder_id, category, series)
            elif category:
                folder_id = create_nested_folder(drive_svc, root_folder_id, category)
            else:
                folder_id = root_folder_id

            # Download
            emit_log(
                f"↓ [{actual_row_num}] {filename[:55]}"
                + (f" (retry {attempt})" if attempt > 0 else ""),
                "download"
            )
            pdf_bytes = download_pdf(
                pdf_url,
                timeout=config.get('timeout', 60),
                max_retries=max_retries
            )

            # Upload
            size_kb = len(pdf_bytes) // 1024
            emit_log(f"↑ [{actual_row_num}] {filename[:55]} ({size_kb}KB)", "upload")
            link = upload_to_drive(drive_svc, pdf_bytes, filename, folder_id,
                                   max_retries=max_retries)

            # Write link to Sheet
            write_to_sheet(
                config['spreadsheet_id'], config['sheet_name'],
                actual_row_num, result_col, link, max_retries=max_retries
            )

            emit_log(f"✓ [{actual_row_num}] {filename[:55]}", "success")
            update_stats('success')
            broadcast_stats()
            return 'success', actual_row_num, link

        except Exception as e:
            last_err = e
            err_short = str(e)[:100]
            if attempt < max_retries:
                wait = 2 ** attempt
                emit_log(
                    f"⚠ [{actual_row_num}] Lỗi lần {attempt+1}/{max_retries}: "
                    f"{err_short} — thử lại sau {wait}s",
                    "warning"
                )
                time.sleep(wait)
            else:
                emit_log(f"✗ [{actual_row_num}] Thất bại: {err_short}", "error")
                update_stats('failed')
                broadcast_stats()
                return 'failed', actual_row_num, None

    update_stats('failed')
    broadcast_stats()
    return 'failed', actual_row_num, None


# ============================================================
# Main Process (runs in background thread)
# ============================================================
def run_main_process(config: dict):
    state.is_running = True
    state.stop_event.clear()
    state.pause_event.set()
    state.is_paused = False
    state.folder_cache.clear()
    state.stats = {'total': 0, 'success': 0, 'failed': 0, 'skipped': 0, 'current': 0}
    state.results = []
    # Clear thread-local service cache
    if hasattr(_thread_local, 'drive'):
        _thread_local.drive = None

    try:
        spreadsheet_id  = config['spreadsheet_id']
        sheet_name      = config['sheet_name']
        start_row       = int(config.get('start_row', 3))
        end_row         = config.get('end_row') or ''
        root_folder_id  = config['root_folder_id']
        n_threads       = min(100, max(1, int(config.get('threads', 20))))
        retry_count     = min(10, max(0, int(config.get('retries', 3))))

        emit_log(f"▶ Khởi động — {n_threads} luồng, retry={retry_count}", "info")

        # --- Build column index map ---
        raw_cols = config.get('columns', {})
        col_idx: dict = {}
        for key in ('pdf_url', 'category', 'series', 'model'):
            letter = raw_cols.get(key, '').strip()
            col_idx[key] = col_letter_to_index(letter) if letter else None
        col_idx['result'] = raw_cols.get('result', 'K').strip().upper()

        # For skip_existing: need result column as index too
        if config.get('skip_existing'):
            col_idx['existing_result_idx'] = col_letter_to_index(col_idx['result'])

        # Inject back so workers see processed indices
        config['columns']  = col_idx
        config['retries']  = retry_count

        # --- Read sheet ---
        emit_log(f"Đọc dữ liệu từ '{sheet_name}'...", "info")
        svc = new_sheets_service()
        range_str = f"'{sheet_name}'!A{start_row}:ZZ{end_row}"
        result = svc.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_str
        ).execute()

        all_rows = result.get('values', [])
        if not all_rows:
            emit_log("Không có dữ liệu trong phạm vi đã chọn!", "error")
            return

        emit_log(f"Đọc được {len(all_rows)} hàng", "info")

        # Filter rows that have a PDF URL
        valid_rows = []
        for i, row in enumerate(all_rows):
            actual_num = start_row + i
            if safe_get_col(row, col_idx.get('pdf_url')):
                valid_rows.append((i, row, actual_num))

        state.stats['total'] = len(valid_rows)
        emit_log(
            f"Có {len(valid_rows)}/{len(all_rows)} hàng có URL PDF",
            "info"
        )
        broadcast_stats()

        if not valid_rows:
            emit_log("Không có hàng nào cần xử lý!", "warning")
            return

        # ─── PHASE 1: Pre-scan & create folder tree ───────────────────
        emit_log("═══ Giai đoạn 1: Tạo cấu trúc thư mục ═══", "info")
        drive_svc = get_drive_service()
        prescan_and_create_folders(
            drive_svc,
            [r[1] for r in valid_rows],
            root_folder_id,
            col_idx
        )

        if state.stop_event.is_set():
            emit_log("Bị dừng.", "error")
            return

        # ─── PHASE 2: Parallel download & upload ─────────────────────
        emit_log(
            f"═══ Giai đoạn 2: Tải & Upload ({n_threads} luồng) ═══",
            "info"
        )

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=n_threads,
            thread_name_prefix='pdf_worker'
        ) as executor:
            state.executor = executor

            # Submit all tasks at once
            future_to_row = {
                executor.submit(
                    process_row,
                    row_idx, row, actual_num, config, root_folder_id
                ): actual_num
                for row_idx, row, actual_num in valid_rows
                if not state.stop_event.is_set()
            }

            # Collect results as they complete
            for future in concurrent.futures.as_completed(future_to_row):
                if state.stop_event.is_set():
                    for f in future_to_row:
                        f.cancel()
                    break
                try:
                    result_status, row_num, link = future.result()
                    state.results.append({
                        'row': row_num, 'status': result_status, 'link': link
                    })
                except Exception as e:
                    emit_log(f"Worker exception: {str(e)[:80]}", "error")

        with state.stats_lock:
            s = dict(state.stats)

        stopped = state.stop_event.is_set()
        emit_log(
            f"{'⏹ Đã dừng' if stopped else '🎉 Hoàn thành'}! "
            f"✓ {s['success']} thành công | "
            f"✗ {s['failed']} thất bại | "
            f"⊘ {s['skipped']} bỏ qua",
            "done"
        )

    except Exception:
        emit_log(f"LỖI NGHIÊM TRỌNG:\n{traceback.format_exc()}", "error")
    finally:
        state.is_running = False
        state.is_paused = False
        with state.stats_lock:
            final_stats = dict(state.stats)
        state.progress_queue.put({'type': 'done', 'stats': final_stats})


# ============================================================
# Flask Routes
# ============================================================
@app.route('/')
def index():
    return render_template('index.html')


# --- Auth ---
@app.route('/api/auth/status')
def auth_status():
    try:
        creds = load_credentials()
        if creds and creds.valid:
            state.creds = creds
            return jsonify({'authenticated': True})
    except Exception as e:
        return jsonify({'authenticated': False, 'error': str(e)})
    return jsonify({'authenticated': False})


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    try:
        flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
        creds = flow.run_local_server(port=0, open_browser=True)
        _save_creds(creds)
        state.creds = creds
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    try:
        if TOKEN_FILE.exists():
            TOKEN_FILE.unlink()
        state.creds = None
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# --- Drive ---
@app.route('/api/drive/folders')
def list_drive_folders():
    try:
        if not state.creds:
            return jsonify({'error': 'Chưa xác thực'}), 401
        parent = request.args.get('parent', 'root')
        svc = get_drive_service()
        query = (
            f"'{parent}' in parents and "
            f"mimeType='application/vnd.google-apps.folder' and "
            f"trashed=false"
        )
        resp = svc.files().list(
            q=query, fields='files(id,name)',
            orderBy='name', pageSize=200
        ).execute()

        parent_name = 'My Drive'
        if parent != 'root':
            try:
                f = svc.files().get(fileId=parent, fields='name').execute()
                parent_name = f.get('name', parent)
            except Exception:
                pass

        return jsonify({'folders': resp.get('files', []), 'parent_name': parent_name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- Sheet ---
@app.route('/api/sheet/info', methods=['POST'])
def sheet_info():
    try:
        if not state.creds:
            return jsonify({'error': 'Chưa xác thực'}), 401
        data = request.json
        svc = new_sheets_service()
        meta = svc.spreadsheets().get(
            spreadsheetId=data['spreadsheet_id'],
            fields='sheets.properties.title,properties.title'
        ).execute()
        sheets = [s['properties']['title'] for s in meta.get('sheets', [])]
        title = meta.get('properties', {}).get('title', '')
        return jsonify({'sheets': sheets, 'title': title})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/sheet/preview', methods=['POST'])
def sheet_preview():
    try:
        if not state.creds:
            return jsonify({'error': 'Chưa xác thực'}), 401
        data = request.json
        start = int(data.get('start_row', 3))
        svc = new_sheets_service()
        # Read header row (1) + data rows up to max(30, start + 20)
        end_preview_row = max(30, start + 20)
        range_str = f"'{data['sheet_name']}'!A1:ZZ{end_preview_row}"
        resp = svc.spreadsheets().values().get(
            spreadsheetId=data['spreadsheet_id'],
            range=range_str
        ).execute()
        return jsonify({'rows': resp.get('values', [])})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- Process Control ---
@app.route('/api/run', methods=['POST'])
def start_run():
    if state.is_running:
        return jsonify({'error': 'Đang chạy!'}), 400
    if not state.creds:
        return jsonify({'error': 'Chưa xác thực Google!'}), 401
    config = request.json
    threading.Thread(target=run_main_process, args=(config,), daemon=True).start()
    return jsonify({'success': True})


@app.route('/api/pause', methods=['POST'])
def pause_run():
    if state.is_running and not state.is_paused:
        state.pause_event.clear()
        state.is_paused = True
        emit_log("⏸ Đã tạm dừng (các file đang tải sẽ hoàn thành trước khi dừng)", "warning")
    return jsonify({'success': True, 'paused': state.is_paused})


@app.route('/api/resume', methods=['POST'])
def resume_run():
    if state.is_running and state.is_paused:
        state.pause_event.set()
        state.is_paused = False
        emit_log("▶ Tiếp tục xử lý...", "info")
    return jsonify({'success': True, 'paused': state.is_paused})


@app.route('/api/stop', methods=['POST'])
def stop_run():
    state.stop_event.set()
    state.pause_event.set()     # Unblock any paused threads
    emit_log("⏹ Đang dừng tất cả luồng...", "error")
    return jsonify({'success': True})


@app.route('/api/status')
def get_status():
    with state.stats_lock:
        stats = dict(state.stats)
    return jsonify({
        'is_running': state.is_running,
        'is_paused': state.is_paused,
        'stats': stats
    })


# --- SSE Stream ---
@app.route('/api/stream')
def event_stream():
    """Server-Sent Events endpoint for real-time log/progress updates."""
    def generate():
        while True:
            try:
                event = state.progress_queue.get(timeout=20)
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                if event.get('type') == 'done':
                    break
            except queue.Empty:
                # Heartbeat to keep connection alive
                yield "data: {\"type\":\"ping\"}\n\n"
            except GeneratorExit:
                break

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


# ============================================================
# Entry Point
# ============================================================
if __name__ == '__main__':
    print("=" * 55)
    print("  PDF Sheet -> Drive Uploader  |  http://localhost:5173")
    print("=" * 55)
    import webbrowser
    webbrowser.open('http://localhost:5173')
    app.run(debug=False, port=5173, threaded=True)
