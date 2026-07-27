# 08 — Toast & Badge

Toast notification system and badge/tag components.

## Toast Component

Use `templates/frontend/Toast.js` which exports both a component and a hook.

### Using the Hook (recommended for shared components)

```jsx
import Toast, { useToast } from '@/components/Toast';

export default function MyPage() {
  const { toasts, addToast, removeToast } = useToast();

  const handleAction = async () => {
    try {
      await fetchApi('/api/something', { method: 'POST', body: JSON.stringify({}) });
      addToast('Saved successfully');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div>
      <Toast toasts={toasts} removeToast={removeToast} />
      {/* page content */}
    </div>
  );
}
```

### Inline Toast Pattern (used in most pages)

Most pages use inline toast state instead of the shared component:

```jsx
const [toasts, setToasts] = useState([]);

const toast = (msg, type = 'success') => {
  const id = Date.now();
  setToasts(p => [...p, { id, message: msg, type }]);
  setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
};

// Render toasts
<div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8 }}>
  {toasts.map(t => (
    <div key={t.id} style={{
      padding: '10px 16px', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500,
      background: t.type === 'error' ? 'var(--danger)' : 'var(--success)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'fadeIn 0.3s ease'
    }}>{t.message}</div>
  ))}
</div>
```

### Toast CSS Classes (from globals.css)

```css
.toast-container   — fixed top-right, z-index 999
.toast             — padding 12px 20px, rounded, shadow
.toast-success     — white bg, green left border
.toast-error       — white bg, red left border
```

## Badge / Tag

```jsx
<span className="badge badge-success">Active</span>
<span className="badge badge-danger">Expired</span>
<span className="badge badge-warning">Pending</span>
<span className="badge badge-info">Info</span>
```

### Badge Styles
| Class | Background | Text | Border |
|---|---|---|---|
| `.badge-success` | `#dcfce7` | `#166534` | `#bbf7d0` |
| `.badge-danger` | `#fee2e2` | `#991b1b` | `#fecaca` |
| `.badge-warning` | `#fef3c7` | `#92400e` | `#fde68a` |
| `.badge-info` | `#ffedd5` | `#9a3412` | `#fed7aa` |

**Specs**: `padding: 4px 10px`, `border-radius: 20px`, `font-size: 11.5px`,
`font-weight: 600`.

## Inline Status Badge (for tables)

```jsx
<span style={{
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
  background: value > 90 ? '#fee2e2' : value > 60 ? '#ffedd5' : '#fef3c7',
  color: value > 90 ? '#991b1b' : value > 60 ? '#9a3412' : '#92400e'
}}>
  {value} days
</span>
```
