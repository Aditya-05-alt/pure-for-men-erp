export function Panel({ children, className = '' }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function PanelHeader({ title, subtitle, badge, children }) {
  return (
    <div className="ph">
      {title && <div className="ph-t">{title}</div>}
      {subtitle && <div className="ph-s">{subtitle}</div>}
      {badge && (
        <span
          className="ph-badge"
          style={{ background: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      )}
      {children}
    </div>
  );
}

export function PanelBody({ children, className = '', style }) {
  return (
    <div className={`pb ${className}`} style={style}>
      {children}
    </div>
  );
}
