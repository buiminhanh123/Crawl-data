# 01 — Project Initialization

Create a new DACO webapp from scratch with Next.js frontend + Express backend.

## Prerequisites

- Node.js 18+
- npm

## Step 1: Create Frontend (Next.js)

```bash
npx -y create-next-app@latest ./frontend --js --no-tailwind --no-eslint --src-dir --app --no-turbopack --import-alias "@/*"
```

After creation, install additional dependencies:

```bash
cd frontend
npm install lucide-react recharts
```

## Step 2: Create Backend (Express)

```bash
mkdir server && cd server
npm init -y
npm install express cors jsonwebtoken bcryptjs sql.js multer xlsx
```

## Step 3: Copy Template Files

Copy the following template files from this skill's `templates/` directory:

### Frontend files to copy:
| Template | Destination |
|---|---|
| `templates/frontend/globals.css` | `frontend/src/app/globals.css` (replace) |
| `templates/frontend/layout.js` | `frontend/src/app/layout.js` (replace) |
| `templates/frontend/ClientLayout.js` | `frontend/src/components/ClientLayout.js` |
| `templates/frontend/Sidebar.js` | `frontend/src/components/Sidebar.js` |
| `templates/frontend/AuthProvider.js` | `frontend/src/components/AuthProvider.js` |
| `templates/frontend/Toast.js` | `frontend/src/components/Toast.js` |
| `templates/frontend/api.js` | `frontend/src/lib/api.js` |
| `templates/frontend/login-page.js` | `frontend/src/app/login/page.js` |

### Server files to copy:
| Template | Destination |
|---|---|
| `templates/server/server.js` | `server/server.js` |
| `templates/server/auth.js` | `server/auth.js` |
| `templates/server/db.js` | `server/db.js` |
| `templates/server/auth.routes.js` | `server/routes/auth.routes.js` |

### Deployment files to copy:
| Template | Destination |
|---|---|
| `templates/deploy/deploy.yml` | `.github/workflows/deploy.yml` |
| `templates/deploy/ecosystem.config.js` | `ecosystem.config.js` |

## Step 4: Configure Environment

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3002
```

## Step 5: Replace Placeholders

Search and replace these placeholders in all copied files:
- `{APP_NAME}` → Application name (e.g., "HR Tool")
- `{APP_DESCRIPTION}` → Short description
- `{APP_SUBTITLE}` → Sidebar subtitle text
- `{PORT}` → Server production port for deployment (e.g., 3000, 3002)

## Step 6: Customize Sidebar Menu

Edit `Sidebar.js` — update the `menuItems` array with your app's pages.
Each item needs: `key`, `label`, `icon` (Lucide), `path`.

## Step 7: Run

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — Frontend  
cd frontend && npm run dev
```

Frontend: http://localhost:3000 | Backend: http://localhost:3002
Default login: admin / admin123
