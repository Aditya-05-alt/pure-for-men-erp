export default function StatusBar({ items = [], right = null }) {
  return (
    <div className="statusbar">
      {items.map((it, i) => (
        <div key={i} className="si">
          <div className="si-dot" style={{ background: it.color || 'var(--green)' }} />
          {it.label}
        </div>
      ))}
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}
