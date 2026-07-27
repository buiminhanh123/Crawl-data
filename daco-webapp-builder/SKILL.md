---
name: daco-webapp-builder
description: >-
  Build DACO internal webapps with a consistent design system, layout, and
  component patterns. Supports creating new Next.js + Express projects or
  adding features to existing ones. Uses orange accent, Inter font, and
  standardized UI components (sidebar, tables, modals, charts, toasts).
---

# DACO Webapp Builder

Build internal tools for DACO with a **unified design system**. Every webapp
uses the same CSS tokens, layout structure, component patterns, and server
architecture.

## How This Skill Works

This is a **modular skill**. Instead of one large file, it contains focused
sub-skills. Read ONLY the sub-skill(s) relevant to the user's request.

## Routing Table

Analyze the user's request and read the matching sub-skill file(s) from the
`skills/` directory (relative to this SKILL.md).

| User Intent | Sub-Skill File |
|---|---|
| Create a new project from scratch | `skills/01-project-init.md` |
| Set up or modify CSS / design tokens / colors / fonts | `skills/02-design-system.md` |
| Create sidebar, app shell, layout, or login page | `skills/03-layout-sidebar.md` |
| Build a new page with stat cards, filters, tables | `skills/04-page-template.md` |
| Add modals, forms, file upload, or checkboxes | `skills/05-modal-form.md` |
| Add charts, dashboards, KPI cards (Recharts) | `skills/06-chart-dashboard.md` |
| Set up authentication, API wrapper, permissions | `skills/07-auth-api.md` |
| Add toast notifications or badge/tag components | `skills/08-toast-badge.md` |
| Build advanced tables (sort, resize, sticky cols) | `skills/09-advanced-table.md` |
| Setup GitHub CI/CD and deploy to VPS | `skills/10-vps-deploy-cicd.md` |

## Routing Rules

1. **Read this file first** to determine which sub-skill(s) to open.
2. **For a new project**: read `01-project-init.md` first, then the relevant
   feature sub-skills.
3. **For adding a feature**: read only the relevant sub-skill(s).
4. **Multiple features**: read multiple sub-skills in the order listed above.
5. **Template files** are in the `templates/` directory. Copy them into the
   user's project and customize as needed.
6. **Design tokens reference**: see `references/design-tokens.md` for a
   quick-reference card of all CSS variables and class names.

## Key Design Principles

- **Font**: Inter (Google Fonts), 14px base
- **Accent**: `#f97316` (Orange) — fixed across all DACO apps
- **Theme**: Light theme with subtle shadows and borders
- **Radius**: 6/10/14/18px (sm/md/lg/xl)
- **Icons**: Lucide React
- **Charts**: Recharts
- **Stack**: Next.js 16 + React 19 (frontend), Express + sql.js (backend)

## Template Files Location

All reusable template files are in:
- `templates/frontend/` — React components, CSS, config
- `templates/server/` — Express server, auth, routes

When creating a new project, copy these templates and replace placeholders
(`{APP_NAME}`, `{PAGE_TITLE}`, etc.) with actual values.
