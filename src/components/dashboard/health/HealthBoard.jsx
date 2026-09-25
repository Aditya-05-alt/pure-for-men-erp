import DealerCard from './DealerCard';

export default function HealthBoard({ down, ok, up }) {
  return (
    <div className="health-board">
      <div className="hcol">
        <div className="hcol-head hcol-head-dn">
          ⬇ Down &gt;10%
          <span className="hcol-count hcol-count-dn">{down.length}</span>
        </div>
        {down.map((d) => (
          <DealerCard key={d.name} d={d} />
        ))}
      </div>
      <div className="hcol">
        <div className="hcol-head hcol-head-ok">
          — Stable (±10%)
          <span className="hcol-count hcol-count-ok">{ok.length}</span>
        </div>
        {ok.map((d) => (
          <DealerCard key={d.name} d={d} />
        ))}
      </div>
      <div className="hcol">
        <div className="hcol-head hcol-head-up">
          ⬆ Up &gt;10%
          <span className="hcol-count hcol-count-up">{up.length}</span>
        </div>
        {up.map((d) => (
          <DealerCard key={d.name} d={d} />
        ))}
      </div>
    </div>
  );
}
