# 06 — Charts & Dashboard

Build dashboard pages with KPI cards and Recharts visualizations.

## Dependencies

```bash
npm install recharts  # Already included in project template
```

## Recharts Imports

```jsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  AreaChart, Area
} from 'recharts';
```

## KPI Cards Grid

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
  <div className="card" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: 'var(--gradient-primary)',  /* or gradient-success, gradient-danger, etc. */
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(249, 115, 22, 0.25)'
      }}>
        <IconComponent size={20} color="white" />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {KPI_LABEL}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1.1, marginTop: 2 }}>
          {KPI_VALUE}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span>{METRIC_1}</span>
      <span>{METRIC_2}</span>
    </div>
  </div>
  {/* More KPI cards... */}
</div>
```

## Bar Chart

```jsx
<div className="card" style={{ padding: 20 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <BarChart3 size={18} color="var(--accent)" />
    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{CHART_TITLE}</h3>
  </div>
  <ResponsiveContainer width="100%" height={280}>
    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
      <Tooltip content={<CustomTooltip />} />
      <Bar dataKey="value" fill="url(#barGradient)" radius={[6, 6, 0, 0]} maxBarSize={60} />
      <defs>
        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
          <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
        </linearGradient>
      </defs>
    </BarChart>
  </ResponsiveContainer>
</div>
```

## Pie Chart (Donut)

```jsx
<ResponsiveContainer width="100%" height={180}>
  <PieChart>
    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={75}
      paddingAngle={3} dataKey="value" stroke="none">
      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
    </Pie>
    <Tooltip content={<CustomTooltipPie />} />
  </PieChart>
</ResponsiveContainer>
```

## Custom Tooltip Pattern

```jsx
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12
    }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: '#1f2937' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontWeight: 600, margin: '2px 0' }}>
          {p.name}: {formatValue(p.value)}
        </p>
      ))}
    </div>
  );
};
```

## Chart Legend (Custom)

```jsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
  {data.map((item, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: item.fill, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>{item.name}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: item.fill }}>{formatValue(item.value)}</span>
    </div>
  ))}
</div>
```

## Charts in Grid Layout

```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
  <div className="card" style={{ padding: 20, gridColumn: 'span 2' }}>{/* Wide chart */}</div>
  <div className="card" style={{ padding: 20 }}>{/* Regular chart */}</div>
  <div className="card" style={{ padding: 20 }}>{/* Regular chart */}</div>
</div>
```
