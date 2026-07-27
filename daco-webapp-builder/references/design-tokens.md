# DACO Design Tokens — Quick Reference

## Colors

| Variable | Value | Preview |
|---|---|---|
| `--bg-primary` | `#f8fafc` | Page background |
| `--bg-secondary` | `#ffffff` | Card / modal |
| `--bg-card` | `#ffffff` | Card |
| `--bg-card-hover` | `#f1f5f9` | Hover state |
| `--bg-input` | `#ffffff` | Form inputs |
| `--bg-sidebar` | `#ffffff` | Sidebar |
| `--border-color` | `#e2e8f0` | Default border |
| `--border-hover` | `#cbd5e1` | Hover border |
| `--border-focus` | `rgba(249,115,22,0.4)` | Focus ring |
| `--text-primary` | `#0f172a` | Main text |
| `--text-secondary` | `#475569` | Secondary text |
| `--text-muted` | `#94a3b8` | Muted / placeholder |
| `--text-accent` | `#f97316` | Accent text |
| `--accent` | `#f97316` | Primary accent |
| `--accent-hover` | `#ea580c` | Accent hover |
| `--success` | `#10b981` | Success state |
| `--danger` | `#ef4444` | Danger state |
| `--warning` | `#f59e0b` | Warning state |

## Gradients

| Variable | From → To |
|---|---|
| `--gradient-primary` | `#f97316 → #ea580c` |
| `--gradient-accent` | `#fb923c → #f97316` |
| `--gradient-success` | `#10b981 → #059669` |
| `--gradient-danger` | `#ef4444 → #dc2626` |
| `--gradient-warning` | `#f59e0b → #d97706` |
| `--gradient-info` | `#0ea5e9 → #0284c7` |

## Spacing & Radius

| Variable | Value | Usage |
|---|---|---|
| `--sidebar-width` | `260px` | Sidebar open |
| `--sidebar-collapsed-width` | `76px` | Sidebar collapsed |
| `--radius-sm` | `6px` | Buttons, inputs, table cells |
| `--radius-md` | `10px` | Cards, modals |
| `--radius-lg` | `14px` | Login card |
| `--radius-xl` | `18px` | Large containers |

## Shadows

| Variable | Value |
|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.05)` |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)` |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.025)` |
| `--shadow-glow` | `0 0 15px rgba(249,115,22,0.15)` |

## Typography

| Property | Value |
|---|---|
| Font family | `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` |
| Base size | `14px` (set on `html`) |
| Line height | `1.6` |
| Import | `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap')` |

### Font Sizes by Component

| Element | Size | Weight |
|---|---|---|
| Page header `h2` | `24px` | `700` |
| Card title | `16px` | `600` |
| Modal title | `18px` | `700` |
| Sidebar logo `h1` | `16px` | `700` |
| Nav item | `13.5px` | `500` |
| Table header `th` | `12px` | `600` |
| Table body `td` | `13.5px` | `400` |
| Button | `13.5px` | `600` |
| Button small | `12.5px` | `600` |
| Form label | `13px` | `600` |
| Form input | `14px` | `400` |
| Badge | `11.5px` | `600` |
| Stat card label | `13px` | `500` |
| Stat card value | `20px` | `700` |
| Toast | `13.5px` | `500` |

## Button Classes

| Class | Style |
|---|---|
| `.btn` | Base: `padding: 10px 20px`, `radius: 6px` |
| `.btn-primary` | Orange gradient, white text, glow shadow |
| `.btn-secondary` | White bg, border, dark text |
| `.btn-danger` | Red gradient, white text |
| `.btn-success` | Green gradient, white text |
| `.btn-sm` | `padding: 7px 14px`, `font: 12.5px` |
| `.btn-icon` | `padding: 8px`, `min: 36×36px` |

## Badge Classes

| Class | Background | Text | Border |
|---|---|---|---|
| `.badge-success` | `#dcfce7` | `#166534` | `#bbf7d0` |
| `.badge-danger` | `#fee2e2` | `#991b1b` | `#fecaca` |
| `.badge-warning` | `#fef3c7` | `#92400e` | `#fde68a` |
| `.badge-info` | `#ffedd5` | `#9a3412` | `#fed7aa` |

## Stat Card Icon Classes

| Class | Gradient |
|---|---|
| `.debt-stat-icon.primary` | Orange `#f97316 → #ea580c` |
| `.debt-stat-icon.danger` | Red `#ef4444 → #dc2626` |
| `.debt-stat-icon.info` | Blue `#0ea5e9 → #0284c7` |
| `.debt-stat-icon.warning` | Yellow `#f59e0b → #d97706` |
| `.debt-stat-icon.success` | Green `#22c55e → #16a34a` |

## CSS Class Map

### Layout
| Class | Purpose |
|---|---|
| `.app-layout` | Root flex container |
| `.main-content` | Main area (flex:1, left margin = sidebar) |
| `.sidebar` | Fixed left sidebar |
| `.sidebar-logo` | Logo block |
| `.sidebar-nav` | Navigation container |
| `.sidebar-nav-item` | Each nav link |
| `.sidebar-nav-item.active` | Active state (orange bg) |
| `.sidebar-user` | User info footer |
| `.sidebar-toggle` | Collapse/expand button |

### Content
| Class | Purpose |
|---|---|
| `.page-header` | Page title section |
| `.card` | Generic content card |
| `.card-header` | Card header with border-bottom |
| `.card-title` | Card title text |
| `.debt-stats-grid` | Stat cards grid |
| `.debt-stat-card` | Individual stat card |
| `.placeholder-page` | Empty state |

### Table
| Class | Purpose |
|---|---|
| `.table-wrapper` | Overflow container (simple) |
| `.table` | Basic table |
| `.debt-table-outer` | Advanced table wrapper |
| `.debt-table-container` | Scrollable table area |
| `.debt-table` | Advanced table |
| `.debt-table-sticky` | Enables sticky columns |
| `.sticky-col` | Sticky column |
| `.sticky-col-last` | Last sticky col (with shadow) |
| `.col-resize-handle` | Column resize drag handle |
| `.th-content` | Header text (clamp 2 lines) |
| `.td-ellipsis` | Cell text truncation |
| `.debt-table-top-scroll` | Top scroll bar container |

### Form
| Class | Purpose |
|---|---|
| `.form-group` | Label + input wrapper |
| `.form-label` | Input label |
| `.form-input` | Text input / textarea |
| `.form-select` | Dropdown select |
| `.form-row` | Two-column grid |
| `.form-helper` | Helper text below input |

### Modal
| Class | Purpose |
|---|---|
| `.modal-overlay` | Backdrop (blur + dark) |
| `.modal` | Modal container |
| `.modal-header` | Title + close button |
| `.modal-title` | Modal title text |
| `.modal-close` | X close button |
| `.modal-footer` | Action buttons |

### Interactive
| Class | Purpose |
|---|---|
| `.debt-upload-zone` | Drag & drop file zone |
| `.checkbox-group` | Checkbox list container |
| `.checkbox-item` | Checkbox + label row |

### Login
| Class | Purpose |
|---|---|
| `.login-page` | Centered page with dotted bg |
| `.login-card` | Login form card |
| `.login-logo` | Logo section |
| `.login-error` | Error message banner |
| `.login-btn` | Full-width submit button |

## Animations

| Name | Effect | Duration |
|---|---|---|
| `fadeIn` | Opacity 0→1, Y -4→0 | 0.2-0.3s |
| `slideUp` | Opacity 0→1, Y 10→0 | 0.3s |
| `slideIn` | Opacity 0→1, X 40→0 | 0.3s |
| `spin` | Rotate 360° | 1s loop |
| `aiFadeInUp` | Opacity 0→1, Y 12→0 | for sequential cards |

## Transition Standard

Always use: `transition: all 0.2s ease` or `0.3s ease`

## Placeholders to Replace

| Placeholder | Description |
|---|---|
| `{APP_NAME}` | Application name |
| `{APP_DESCRIPTION}` | Short description |
| `{APP_SUBTITLE}` | Sidebar subtitle |
| `{PAGE_TITLE}` | Page heading |
| `{FEATURE_KEY}` | Permission key for the page |
