import streamlit as st
import pandas as pd
import requests
import re
import os
import io
import json
import threading
import time
import concurrent.futures
from pathlib import Path
from PIL import Image

CONFIG_FILE = Path(__file__).parent / "saved_configs.json"

# ─── Helpers ────────────────────────────────────────────────────────────────

def sanitize_name(name):
    if not name or (isinstance(name, float) and pd.isna(name)):
        return "Unknown"
    name = str(name).strip()
    name = name.replace("/", "-").replace("\\", "-")
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "", name)
    name = re.sub(r"[-\s]+", " ", name).strip(" -")
    return name or "Unknown"


def col_letter_to_idx(letter):
    letter = letter.strip().upper()
    idx = 0
    for ch in letter:
        idx = idx * 26 + (ord(ch) - ord("A") + 1)
    return idx - 1


def get_col_value(row, idx):
    try:
        val = row.iloc[idx]
        return "" if pd.isna(val) else str(val).strip()
    except Exception:
        return ""


def load_sheet(sheet_input, sheet_name, header_row, data_start_row):
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", sheet_input)
    sheet_id = m.group(1) if m else sheet_input.strip()
    url = (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}"
        f"/gviz/tq?tqx=out:csv&sheet={requests.utils.quote(sheet_name)}"
    )
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200:
        raise ValueError(f"Không thể truy cập sheet (HTTP {resp.status_code}). Kiểm tra sheet đã public chưa.")
    raw = pd.read_csv(io.StringIO(resp.text), header=None, dtype=str)
    col_names = raw.iloc[header_row - 1].tolist()
    data = raw.iloc[data_start_row - 1:].copy()
    data.columns = col_names
    return data.reset_index(drop=True).dropna(how="all")


def build_tasks(df_batch, idx_brand, idx_category, idx_series, idx_model, idx_url, base_dir):
    tasks, skipped = [], 0
    for _, row in df_batch.iterrows():
        url = get_col_value(row, idx_url)
        if not url or url.lower() == "nan":
            skipped += 1
            continue
        brand    = sanitize_name(get_col_value(row, idx_brand))
        category = sanitize_name(get_col_value(row, idx_category))
        series   = sanitize_name(get_col_value(row, idx_series))
        model    = sanitize_name(get_col_value(row, idx_model))
        folder   = base_dir / brand / category / series
        filename = f"{model}_{category}.webp"
        tasks.append((url, str(folder / filename)))
    return tasks, skipped


def download_one(args, max_retries=3):
    url, save_path = args
    if os.path.exists(save_path):
        return ("skip", url, save_path)
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    last_error = None
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200:
                last_error = f"HTTP {resp.status_code}"
                break  # HTTP errors won't fix themselves with retry
            img = Image.open(io.BytesIO(resp.content))
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "transparency" in img.info else "RGB")
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            img.save(save_path, "WEBP", quality=85)
            return ("ok", url, save_path)
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                time.sleep(0.5 * (attempt + 1))  # backoff: 0.5s, 1s, 1.5s
    return ("fail", url, last_error)


# ─── Background download worker ──────────────────────────────────────────────

def download_worker(tasks, concurrency, stop_event, shared):
    """Runs in background thread. Updates `shared` dict for UI polling."""
    shared.update(ok=0, skip=0, fail=0, done=0, total=len(tasks),
                  fail_log=[], start_time=time.time(), finished=False)

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(download_one, t): t for t in tasks}
        for future in concurrent.futures.as_completed(futures):
            if stop_event.is_set():
                for f in futures:
                    f.cancel()
                shared["stopped"] = True
                break
            status, url, detail = future.result()
            shared["done"] += 1
            if status == "ok":
                shared["ok"] += 1
            elif status == "skip":
                shared["skip"] += 1
            else:
                shared["fail"] += 1
                shared["fail_log"].append(f"{url} → {detail}")

    shared["finished"] = True


# ─── Config persistence ──────────────────────────────────────────────────────

def load_all_configs():
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_config(name, cfg):
    all_cfg = load_all_configs()
    all_cfg[name] = cfg
    CONFIG_FILE.write_text(json.dumps(all_cfg, ensure_ascii=False, indent=2), encoding="utf-8")


def delete_config(name):
    all_cfg = load_all_configs()
    all_cfg.pop(name, None)
    CONFIG_FILE.write_text(json.dumps(all_cfg, ensure_ascii=False, indent=2), encoding="utf-8")


# ─── Page & session state ────────────────────────────────────────────────────

st.set_page_config(page_title="Image Batch Downloader", page_icon="🖼️", layout="wide")

# Compact UI: shrink paddings & gaps so everything fits one screen
st.markdown("""
<style>
    .block-container { padding-top: 3rem; padding-bottom: 1rem; }
    div[data-testid="stVerticalBlock"] { gap: 0.5rem; }
    div[data-testid="stTextInput"] label,
    div[data-testid="stNumberInput"] label { font-size: 0.8rem; margin-bottom: 0; }
    hr { margin: 0.4rem 0 !important; }
    h2 { font-size: 1.3rem !important; margin-bottom: 0.2rem !important; }
    div[data-testid="stExpander"] summary { padding: 0.3rem 0.6rem; }

    /* Fix number input white edge mismatch with +/- buttons */
    div[data-testid="stNumberInput"] > div {
        background-color: rgb(240, 242, 246);
        border-radius: 0.5rem;
        overflow: hidden;
    }
    div[data-testid="stNumberInput"] input {
        background-color: transparent;
    }
    div[data-testid="stNumberInput"] button {
        background-color: transparent;
        border: none;
    }
</style>
""", unsafe_allow_html=True)

DEFAULTS = dict(
    sheet_input="", sheet_name="", header_row=2, data_start_row=3,
    col_brand="C", col_category="B", col_series="E", col_model="F", col_url="I",
    batch_start=1, batch_end=0, concurrency=30, output_dir=r"D:\Downloads\images",
)
for k, v in DEFAULTS.items():
    if k not in st.session_state:
        st.session_state[k] = v

# Download state
if "is_running"  not in st.session_state: st.session_state.is_running  = False
if "stop_event"  not in st.session_state: st.session_state.stop_event  = None
if "shared"      not in st.session_state: st.session_state.shared      = {}
if "run_logs"    not in st.session_state: st.session_state.run_logs    = []
if "dl_thread"   not in st.session_state: st.session_state.dl_thread   = None

# ─── Layout ──────────────────────────────────────────────────────────────────

left, right = st.columns([1, 1.6], gap="large")

# ════════════════════════════════════════════════════════════════════════════
# LEFT — Configuration
# ════════════════════════════════════════════════════════════════════════════
with left:
    st.markdown("## 🖼️ Image Downloader")

    # Saved configs
    all_configs = load_all_configs()
    with st.expander("📁 Cấu hình đã lưu", expanded=bool(all_configs)):
        if all_configs:
            selected = st.selectbox("Chọn cấu hình", ["— chọn —"] + list(all_configs.keys()),
                                    label_visibility="collapsed")
            c_load, c_del = st.columns(2)
            if c_load.button("⬇️ Tải cấu hình", use_container_width=True) and selected != "— chọn —":
                for k, v in all_configs[selected].items():
                    st.session_state[k] = v
                st.rerun()
            if c_del.button("🗑️ Xóa", use_container_width=True) and selected != "— chọn —":
                delete_config(selected)
                st.rerun()
        else:
            st.caption("Chưa có cấu hình nào.")

    disabled = st.session_state.is_running  # lock fields while running

    st.markdown("**1. Google Sheet**")
    st.text_input(
        "URL hoặc Sheet ID", key="sheet_input",
        placeholder="https://docs.google.com/spreadsheets/d/XXXX", disabled=disabled)
    c1, c2, c3 = st.columns([2, 1, 1])
    c1.text_input("Tên Sheet (tab)", key="sheet_name", placeholder="Sheet1", disabled=disabled)
    c2.number_input("Hàng tiêu đề", key="header_row", min_value=1, step=1, disabled=disabled)
    c3.number_input("Hàng dữ liệu", key="data_start_row", min_value=2, step=1, disabled=disabled)

    st.markdown("**2. Mapping cột** *(nhập chữ cái: A, B, C...)*")
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.text_input("Hãng",     key="col_brand",    placeholder="C", disabled=disabled)
    m2.text_input("Danh mục", key="col_category", placeholder="B", disabled=disabled)
    m3.text_input("Series",   key="col_series",   placeholder="E", disabled=disabled)
    m4.text_input("Mã SP",    key="col_model",    placeholder="F", disabled=disabled)
    m5.text_input("URL ảnh",  key="col_url",      placeholder="I", disabled=disabled)

    st.markdown("**3. Batch & Output**")
    b1, b2, b3 = st.columns(3)
    b1.number_input("Từ dòng", key="batch_start", min_value=1, step=1, disabled=disabled)
    b2.number_input("Đến dòng (0=hết)", key="batch_end", min_value=0, step=1, disabled=disabled)
    b3.number_input("Luồng", key="concurrency", min_value=1, max_value=100, step=5, disabled=disabled)
    st.text_input("Thư mục lưu", key="output_dir", disabled=disabled)

    s1, s2 = st.columns([2, 1])
    save_name = s1.text_input("Tên cấu hình", placeholder="VD: SICK - Machine Vision",
                               label_visibility="collapsed", disabled=disabled)
    if s2.button("💾 Lưu", use_container_width=True, disabled=disabled):
        if save_name.strip():
            save_config(save_name.strip(), {k: st.session_state[k] for k in DEFAULTS})
            st.success(f"Đã lưu: **{save_name}**")
            st.rerun()
        else:
            st.warning("Nhập tên cấu hình trước.")

    # Start / Stop buttons
    if not st.session_state.is_running:
        run_btn  = st.button("🚀 Bắt đầu tải", type="primary", use_container_width=True)
        stop_btn = False
    else:
        run_btn  = False
        stop_btn = st.button("⏹️ Dừng lại", type="secondary", use_container_width=True)

# ════════════════════════════════════════════════════════════════════════════
# RIGHT — Log & progress
# ════════════════════════════════════════════════════════════════════════════
with right:
    st.markdown("## 📋 Tiến trình")
    log_box    = st.empty()
    prog_bar   = st.empty()
    stat_text  = st.empty()
    err_detail = st.empty()

# ─── Handle Stop ─────────────────────────────────────────────────────────────
if stop_btn and st.session_state.is_running:
    st.session_state.stop_event.set()
    st.session_state.run_logs.append("⛔ Đã yêu cầu dừng, chờ các luồng hiện tại hoàn thành…")

# ─── Handle Start ────────────────────────────────────────────────────────────
if run_btn:
    s = st.session_state
    missing = [f for f, v in [
        ("URL/ID Sheet", s.sheet_input), ("Tên Sheet", s.sheet_name),
        ("Cột Hãng", s.col_brand), ("Cột Danh mục", s.col_category),
        ("Cột Series", s.col_series), ("Cột Mã SP", s.col_model), ("Cột URL", s.col_url),
    ] if not str(v).strip()]
    if missing:
        with right:
            st.error(f"Vui lòng điền: {', '.join(missing)}")
        st.stop()

    if int(s.data_start_row) <= int(s.header_row):
        with right:
            st.error("Hàng bắt đầu dữ liệu phải lớn hơn hàng tiêu đề.")
        st.stop()

    st.session_state.run_logs = ["⏳ Đang tải dữ liệu từ Google Sheet…"]
    log_box.markdown("\n\n".join(st.session_state.run_logs))

    try:
        df = load_sheet(s.sheet_input, s.sheet_name, int(s.header_row), int(s.data_start_row))
    except Exception as e:
        with right:
            st.error(str(e))
        st.stop()

    st.session_state.run_logs.append(f"✅ Đọc được **{len(df):,}** dòng từ sheet `{s.sheet_name}`")
    log_box.markdown("\n\n".join(st.session_state.run_logs))

    start_idx = int(s.batch_start) - 1
    end_idx   = int(s.batch_end) if int(s.batch_end) > 0 else len(df)
    df_batch  = df.iloc[start_idx:end_idx].reset_index(drop=True)
    st.session_state.run_logs.append(f"📦 Batch: dòng {s.batch_start} → {end_idx} → **{len(df_batch):,}** dòng")
    log_box.markdown("\n\n".join(st.session_state.run_logs))

    try:
        idx_brand    = col_letter_to_idx(s.col_brand)
        idx_category = col_letter_to_idx(s.col_category)
        idx_series   = col_letter_to_idx(s.col_series)
        idx_model    = col_letter_to_idx(s.col_model)
        idx_url      = col_letter_to_idx(s.col_url)
    except Exception as e:
        with right:
            st.error(f"Cột không hợp lệ: {e}")
        st.stop()

    tasks, skipped_no_url = build_tasks(df_batch, idx_brand, idx_category, idx_series,
                                         idx_model, idx_url, Path(s.output_dir))
    if skipped_no_url:
        st.session_state.run_logs.append(f"⚠️ {skipped_no_url:,} dòng không có URL, bỏ qua.")

    if not tasks:
        with right:
            st.error("Không có task nào để chạy.")
        st.stop()

    st.session_state.run_logs.append(f"🚀 Bắt đầu tải **{len(tasks):,}** ảnh — {s.concurrency} luồng song song…")
    st.session_state.run_logs.append("---")

    # Setup & launch background thread
    stop_event = threading.Event()
    shared     = {}
    thread     = threading.Thread(
        target=download_worker,
        args=(tasks, int(s.concurrency), stop_event, shared),
        daemon=True,
    )
    st.session_state.stop_event  = stop_event
    st.session_state.shared      = shared
    st.session_state.dl_thread   = thread
    st.session_state.is_running  = True
    thread.start()
    st.rerun()

# ─── Polling loop while running ──────────────────────────────────────────────
if st.session_state.is_running:
    shared = st.session_state.shared

    # Render logs
    log_box.markdown("\n\n".join(st.session_state.run_logs[-40:]))

    # Render progress
    total = shared.get("total", 1)
    done  = shared.get("done", 0)
    if total > 0:
        prog_bar.progress(done / total)

    elapsed = time.time() - shared.get("start_time", time.time())
    speed   = done / elapsed if elapsed > 0 else 0
    eta     = (total - done) / speed if speed > 0 and done < total else 0
    stat_text.markdown(
        f"**{done:,} / {total:,}** &nbsp;|&nbsp; "
        f"✅ {shared.get('ok',0):,} &nbsp; "
        f"⏭️ {shared.get('skip',0):,} &nbsp; "
        f"❌ {shared.get('fail',0):,} &nbsp;|&nbsp; "
        f"⚡ {speed:.1f} ảnh/s &nbsp;|&nbsp; ETA {eta:.0f}s"
    )

    # Check if finished
    if shared.get("finished"):
        st.session_state.is_running = False
        fail_log = shared.get("fail_log", [])

        if shared.get("stopped"):
            st.session_state.run_logs.append(f"⛔ Đã dừng tại **{done:,}/{total:,}** ảnh.")
        else:
            st.session_state.run_logs.append(
                f"🏁 Hoàn thành trong **{elapsed:.1f}s** &nbsp;|&nbsp; "
                f"✅ {shared.get('ok',0):,} &nbsp; ⏭️ {shared.get('skip',0):,} &nbsp; ❌ {shared.get('fail',0):,}"
            )

        if fail_log:
            out = Path(st.session_state.output_dir)
            fail_path = out / "_failed_downloads.txt"
            fail_path.parent.mkdir(parents=True, exist_ok=True)
            fail_path.write_text("\n".join(fail_log), encoding="utf-8")
            st.session_state.run_logs.append(f"📄 Log lỗi: `{fail_path}`")
            err_detail.expander(f"❌ Danh sách lỗi ({len(fail_log)})").code("\n".join(fail_log))

        st.rerun()
    else:
        # Poll every 0.4s
        time.sleep(0.4)
        st.rerun()

elif st.session_state.run_logs:
    # Show final logs after finish
    log_box.markdown("\n\n".join(st.session_state.run_logs[-40:]))
else:
    log_box.info("Điền cấu hình bên trái rồi nhấn **Bắt đầu tải**.")
