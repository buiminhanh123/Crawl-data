# 07 — Auth & API

Authentication system with JWT, permission-based access, and API wrapper.

## Frontend Components

### AuthProvider (`templates/frontend/AuthProvider.js`)

Provides auth context to the entire app:

```jsx
const { user, loading, login, logout, hasPermission } = useAuth();
```

**API:**
- `user` — current user object or `null`
- `loading` — `true` while checking auth on mount
- `login(email, password)` — returns user object, stores token
- `logout()` — clears token and user
- `hasPermission(feature)` — admin always returns `true`; non-admin checks
  `user.permissions` array

**Storage:**
- `localStorage.token` — JWT token string
- `localStorage.user` — JSON stringified user object

### fetchApi Wrapper (`templates/frontend/api.js`)

```jsx
import { fetchApi } from '@/lib/api';

// GET
const data = await fetchApi('/api/endpoint');

// POST
const result = await fetchApi('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify({ field: value }),
});
```

**Features:**
- Auto-attaches `Authorization: Bearer {token}` header
- Auto-sets `Content-Type: application/json`
- On 401 → clears token, redirects to `/login`
- On error → throws `Error(data.error)`
- Base URL from `NEXT_PUBLIC_API_URL` env var (default: `http://localhost:3002`)

## Backend Components

### JWT Auth Middleware (`templates/server/auth.js`)

Three middleware functions:

```js
const { requireAuth, requireAdmin, checkPermission } = require('./auth');

// Any authenticated user
app.use('/api/resource', requireAuth, resourceRoutes);

// Admin only
router.delete('/item/:id', requireAdmin, (req, res) => { ... });

// Specific feature permission
router.get('/data', checkPermission('feature-key'), (req, res) => { ... });
```

**Token format:**
```json
{ "id": 1, "username": "admin", "role": "admin", "display_name": "Admin" }
```

### Auth Routes (`templates/server/auth.routes.js`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login with email + password |
| GET | `/api/auth/me` | Required | Get current user + permissions |
| PUT | `/api/auth/password` | Required | Change own password |

### Permission Model

- **Admin** (`role: 'admin'`) → access everything
- **User** (`role: 'user'`) → access only features in `permissions` array
- Permissions stored in DB, returned on login and `/me`
- Frontend: `hasPermission('feature-key')` gates UI rendering
- Backend: `checkPermission('feature-key')` middleware gates API access

## Standard Page Permission Check

```jsx
export default function FeaturePage() {
  const { hasPermission } = useAuth();

  if (!hasPermission('feature-key')) {
    return (
      <div className="page-content">
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          Access denied
        </div>
      </div>
    );
  }

  return <div className="page-content">...</div>;
}
```
