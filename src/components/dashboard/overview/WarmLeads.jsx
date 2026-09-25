import { Panel, PanelHeader, PanelBody } from '../Panel';
import { WARM_LEADS_TOP } from '@/lib/data/leads';

const TAG_STYLE = {
  Used: { bg: 'var(--gd)', color: 'var(--green)' },
  New:  { bg: 'var(--bld)', color: 'var(--blue)' },
};

/**
 * Warm leads panel — list is data-driven from `leads`. Empty list renders an
 * empty-state hint. Pass an array of leads via the `leads` prop (defaults to
 * the lib/data list) once you start pushing them from Supabase.
 */
export default function WarmLeads({ leads = WARM_LEADS_TOP, total = 0 }) {
  const safeTotal = total || leads.length || 0;
  return (
    <Panel>
      <PanelHeader
        title="Warm Leads"
        badge={{
          label: safeTotal.toLocaleString(),
          bg: 'var(--acc-soft)',
          color: 'var(--acc)',
        }}
      />
      <PanelBody style={{ padding: '.75rem' }}>
        {leads.length === 0 && (
          <div
            style={{
              padding: '1.5rem .5rem',
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--t3)',
            }}
          >
            No warm leads yet.
          </div>
        )}
        <div className="leads-grid">
          {leads.map((l) => {
            const condStyle = TAG_STYLE[l.cond] || TAG_STYLE.Used;
            return (
              <div key={l.zip} className="lc">
                <div style={{ flex: 1 }}>
                  <div className="lc-zip">{l.zip}</div>
                  <div className="lc-city">
                    {l.city} · {l.distance}
                  </div>
                  <div className="lc-tags">
                    <span className="lc-tag" style={{ background: condStyle.bg, color: condStyle.color }}>
                      {l.cond}
                    </span>
                    <span className="lc-tag" style={{ background: 'var(--yd)', color: 'var(--yellow)' }}>
                      {l.make}
                    </span>
                  </div>
                </div>
                <div className="lc-cnt">
                  <div className="lcc-v">{l.visits}</div>
                  <div className="lcc-l">visits</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '.5rem', textAlign: 'center' }}>
          <button
            type="button"
            disabled={safeTotal === 0}
            style={{
              width: '100%',
              padding: 5,
              background: 'var(--acc-soft)',
              border: '1px solid rgba(200,232,122,.3)',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--acc)',
              cursor: safeTotal === 0 ? 'not-allowed' : 'pointer',
              opacity: safeTotal === 0 ? 0.5 : 1,
            }}
          >
            View all {safeTotal} →
          </button>
        </div>
      </PanelBody>
    </Panel>
  );
}
