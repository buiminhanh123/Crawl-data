# 03 — Layout & Sidebar

Build the app shell: sidebar navigation, main content area, and login page.

## Architecture

```
<html>
  <body>
    <AuthProvider>
      <LayoutInner>
        <!-- if /login → children only (no sidebar) -->
        <!-- if authenticated → sidebar + main-content -->
        <!-- if not authenticated → redirect to /login -->
      </LayoutInner>
    </AuthProvider>
  </body>
</html>
```

## Template Files

| File | Purpose |
|---|---|
| `templates/frontend/layout.js` | Root layout (metadata, globals.css import) |
| `templates/frontend/ClientLayout.js` | Auth-aware layout with sidebar |
| `templates/frontend/Sidebar.js` | Sidebar navigation component |
| `templates/frontend/login-page.js` | Login page |

## Sidebar Component Structure

```jsx
<aside className="sidebar">
  <button className="sidebar-toggle" />  {/* Collapse/expand */}
  <div className="sidebar-logo">
    <div className="sidebar-logo-icon">{icon}</div>
    <div className="sidebar-logo-text">
      <h1>{APP_NAME}</h1>
      <span>{APP_SUBTITLE}</span>
    </div>
  </div>
  <nav className="sidebar-nav">
    <Link className="sidebar-nav-item active">
      <span className="icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </Link>
  </nav>
  <div className="sidebar-user">
    <div className="sidebar-user-avatar">{initials}</div>
    <div className="sidebar-user-info">...</div>
    <button className="sidebar-logout" />
  </div>
</aside>
```

## Menu Items Configuration

Edit the `menuItems` array in `Sidebar.js`:

```jsx
const menuItems = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
  { key: 'feature-1', label: 'Feature 1', icon: <FileText size={20} />, path: '/feature-1' },
  // Add more items...
];
```

Each `key` must match a permission string. Admin users see all items.
Non-admin users only see items matching their `permissions` array.

## Sidebar Collapse

- Toggle via `.sidebar-toggle` button (absolute positioned, right: -12px)
- State saved in `localStorage('sidebar_collapsed')`
- CSS: `body.sidebar-collapsed .sidebar` reduces width to `76px`
- Labels and user info hidden, icons centered

## Login Page Structure

```jsx
<div className="login-page">
  <div className="login-card">
    <div className="login-logo">
      <div className="logo-icon">{icon}</div>
      <h1>{APP_NAME}</h1>
      <p>{description}</p>
    </div>
    {error && <div className="login-error">{error}</div>}
    <form>
      <div className="form-group">...</div>
      <button className="btn btn-primary login-btn">Login</button>
    </form>
  </div>
</div>
```

## Key CSS Classes
- `.app-layout` — flex container, min-height 100vh
- `.main-content` — flex:1, margin-left: sidebar width, padding: 14px 32px
- `.sidebar` — fixed left, width 260px, border-right
- `.login-page` — centered, dotted background pattern
- `.login-card` — max-width 420px, padding 40px
