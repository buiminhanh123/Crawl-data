# 02 — Design System

Apply the DACO design system to any project. The system uses CSS custom
properties (variables) so all components stay consistent.

## Core File

Copy `templates/frontend/globals.css` into your project at
`frontend/src/app/globals.css`. This file contains ALL design tokens.

## Design Tokens Reference

### Colors (Light Theme)
| Variable | Value | Usage |
|---|---|---|
| `--bg-primary` | `#f8fafc` | Page background |
| `--bg-secondary` | `#ffffff` | Card/modal background |
| `--bg-card` | `#ffffff` | Card background |
| `--bg-card-hover` | `#f1f5f9` | Card hover state |
| `--border-color` | `#e2e8f0` | Default borders |
| `--border-hover` | `#cbd5e1` | Hover borders |
| `--text-primary` | `#0f172a` | Main text |
| `--text-secondary` | `#475569` | Secondary text |
| `--text-muted` | `#94a3b8` | Muted/placeholder text |
| `--accent` | `#f97316` | Orange accent (FIXED) |

### Gradients
| Variable | Colors | Usage |
|---|---|---|
| `--gradient-primary` | `#f97316 → #ea580c` | Primary buttons, icons |
| `--gradient-success` | `#10b981 → #059669` | Success states |
| `--gradient-danger` | `#ef4444 → #dc2626` | Danger states |
| `--gradient-warning` | `#f59e0b → #d97706` | Warning states |
| `--gradient-info` | `#0ea5e9 → #0284c7` | Info states |

### Spacing & Radius
| Variable | Value |
|---|---|
| `--sidebar-width` | `260px` |
| `--sidebar-collapsed-width` | `76px` |
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `14px` |
| `--radius-xl` | `18px` |

### Shadows
| Variable | Usage |
|---|---|
| `--shadow-sm` | Cards, sidebar |
| `--shadow-md` | Hover states, dropdowns |
| `--shadow-lg` | Modals, floating elements |
| `--shadow-glow` | Accent glow effect |

### Typography
- **Font**: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- **Base size**: `14px` (set on `html`)
- **Line height**: `1.6`
- Import: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');`

### Animations (built into globals.css)
- `fadeIn` — opacity 0→1 with slight Y translate
- `slideUp` — modal entrance, Y translate 10→0
- `slideIn` — toast entrance, X translate 40→0
- `spin` — loading spinner rotation
- `aiFadeInUp` — sequential card reveal

## Rules for New CSS

1. **Always use CSS variables** — never hardcode colors or sizes
2. **Follow the naming convention**: `.component-name` for blocks,
   `.component-name-element` for children
3. **Use `var(--radius-sm)` to `var(--radius-xl)`** for border-radius
4. **Use `var(--shadow-sm)` to `var(--shadow-lg)`** for box-shadow
5. **Transitions**: always `0.2s ease` or `0.3s ease`
6. **Hover states**: use `var(--border-hover)` and `var(--shadow-md)`
