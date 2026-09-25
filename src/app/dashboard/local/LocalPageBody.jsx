'use client';

import { Panel, PanelHeader } from '@/components/dashboard/Panel';
import KpiCard from '@/components/dashboard/KpiCard';
import Delta from '@/components/dashboard/Delta';
import StatusBar from '@/components/dashboard/StatusBar';
import { useClient } from '@/components/dashboard/ClientContext';
import { WARM_LEADS_ALL } from '@/lib/data/leads';

function AllDealerLocalEmpty() {
  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard label="Within 15 mi" value="—" mom={0} yoy={0} color="var(--acc)" />
        <KpiCard label="15–40 mi" value="—" mom={0} yoy={0} color="var(--green)" />
        <KpiCard label="Warm Leads" value="—" mom={0} yoy={0} color="var(--blue)" momFormat="abs" yoyFormat="abs" />
        <div className="kpi" style={{ '--kc': 'var(--orange)' }}>
          <div className="kpi-l">Avg Sessions / Lead</div>
          <div className="kpi-v">—</div>
          <div className="kpi-s" style={{ color: 'var(--t3)' }}>Select a dealer</div>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="All Warm Local Leads"
          badge={{ label: 'All Dealer', bg: 'var(--s3)', color: 'var(--t3)' }}
        />
        <div className="local-empty-state">
          <p className="local-empty-title">No local data for All Dealer</p>
          <p className="local-empty-sub">
            Choose a single dealer from the dropdown to view local intelligence.
          </p>
        </div>
      </Panel>
    </>
  );
}

function SingleDealerLocalContent() {
  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard label="Within 15 mi" value="13,024" mom={14} yoy={22} color="var(--acc)" />
        <KpiCard label="15–40 mi" value="7,606" mom={8} yoy={11} color="var(--green)" />
        <KpiCard label="Warm Leads" value="127" mom={23} yoy={41} color="var(--blue)" momFormat="abs" yoyFormat="abs" />
        <div className="kpi" style={{ '--kc': 'var(--orange)' }}>
          <div className="kpi-l">Avg Sessions / Lead</div>
          <div className="kpi-v">4.2</div>
          <div className="kpi-s">
            <Delta value={0.3} format="abs" /> MoM
          </div>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="All Warm Local Leads"
          badge={{ label: '127 not converted', bg: 'var(--acc-soft)', color: 'var(--acc)' }}
        />
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>ZIP</th>
                <th>City</th>
                <th>Distance</th>
                <th>Sessions</th>
                <th>Last Visit</th>
                <th>Make</th>
                <th>Cond.</th>
                <th>First Channel</th>
              </tr>
            </thead>
            <tbody>
              {WARM_LEADS_ALL.map((l) => (
                <tr key={l.zip}>
                  <td className="tn">{l.zip}</td>
                  <td>{l.city}</td>
                  <td>{l.distance}</td>
                  <td>{l.visits}</td>
                  <td>{l.lastVisit}</td>
                  <td>{l.make}</td>
                  <td>
                    <span
                      className={`delta ${l.cond === 'New' ? '' : 'up'}`}
                      style={
                        l.cond === 'New'
                          ? { background: 'var(--bld)', color: 'var(--blue)' }
                          : undefined
                      }
                    >
                      {l.cond}
                    </span>
                  </td>
                  <td>{l.firstChannel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

export default function LocalPageBody() {
  const { isAllDealer } = useClient();

  return (
    <>
      <div className="page-tabs">
        <div className="pt active">Local Intelligence</div>
        <div className="pt-right" />
      </div>

      <div className="content">
        {isAllDealer ? <AllDealerLocalEmpty /> : <SingleDealerLocalContent />}
      </div>

      <StatusBar
        items={[
          {
            label: isAllDealer
              ? 'All Dealer — no data loaded'
              : 'Digital Envoy · 30-day window',
            color: isAllDealer ? 'var(--t3)' : 'var(--green)',
          },
        ]}
      />
    </>
  );
}
