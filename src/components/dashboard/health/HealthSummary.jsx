export default function HealthSummary({ counts }) {
  return (
    <div className="health-summary">
      <div className="hs-card hs-total">
        <div className="hs-v" style={{ color: 'var(--blue)' }}>{counts.total}</div>
        <div className="hs-l" style={{ color: 'var(--t2)' }}>Total Dealers</div>
        <div className="hs-s" style={{ color: 'var(--t3)' }}>All active clients</div>
      </div>
      <div className="hs-card hs-down">
        <div className="hs-v" style={{ color: 'var(--red)' }}>{counts.down}</div>
        <div className="hs-l" style={{ color: 'var(--red)' }}>⬇ Down &gt;10%</div>
        <div className="hs-s" style={{ color: 'rgba(255,133,133,.7)' }}>Need attention</div>
      </div>
      <div className="hs-card hs-ok">
        <div className="hs-v" style={{ color: 'var(--yellow)' }}>{counts.ok}</div>
        <div className="hs-l" style={{ color: 'var(--yellow)' }}>— Stable</div>
        <div className="hs-s" style={{ color: 'rgba(255,212,102,.75)' }}>Within ±10%</div>
      </div>
      <div className="hs-card hs-up">
        <div className="hs-v" style={{ color: 'var(--green)' }}>{counts.up}</div>
        <div className="hs-l" style={{ color: 'var(--green)' }}>⬆ Up &gt;10%</div>
        <div className="hs-s" style={{ color: 'rgba(78,224,156,.7)' }}>Performing well</div>
      </div>
    </div>
  );
}
