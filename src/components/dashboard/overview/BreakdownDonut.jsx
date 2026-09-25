'use client';

import { useMemo, useState } from 'react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import Delta from '../Delta';
import ChannelGroupToggle from './ChannelGroupToggle';
import { filterByExpandedGroups } from '@/lib/ga4/channelGroups';
import { useChannelGroupExpansion } from '@/hooks/useChannelGroupExpansion';
import { formatViewsK } from '@/lib/format/viewsK';

/** Midpoint angle (deg from top, clockwise) matches stroke-dash layout after SVG -90° rotation. */
function sliceMidAngleDeg(sliceOffset, dash, circ) {
  return ((sliceOffset + dash / 2) / circ) * 360;
}

function polarToXY(cx, cy, radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(rad),
    y: cy - radius * Math.cos(rad),
  };
}

function sliceAnchorGeometry(sliceOffset, dash, circ, size, r, stroke) {
  const midAngleDeg = sliceMidAngleDeg(sliceOffset, dash, circ);
  const cx = size / 2;
  const cy = size / 2;
  const anchor = polarToXY(cx, cy, r, midAngleDeg);
  return {
    midAngleDeg,
    anchorX: anchor.x,
    anchorY: anchor.y,
  };
}

/**
 * Reusable donut + breakdown list panel.
 *
 * Fully data-driven — pass `data` and it'll auto-render the donut and the
 * breakdown list. Handles the zero/empty state gracefully.
 *
 * Props
 *   title         — panel header title
 *   badge         — { label, bg, color } chip on the panel header
 *   data          — [{ name, color, value, pct }, ...]
 *   centerValue   — (optional) big number in the donut hole. If omitted,
 *                   computed from data.value sum (K-formatted, rounded up).
 *   centerLabel   — small caps label below it (e.g. "VDP VIEWS")
 *   totalLabel    — caption for the total row at the bottom of the list
 *   size, stroke  — donut sizing (defaults sized for a 50% column)
 */

function DonutSkeleton({ size = 200, rowCount = 5 }) {
  return (
    <div className="donut-lg-wrap donut-skeleton">
      <div
        className="donut-skel-ring"
        style={{ width: size, height: size, flexShrink: 0 }}
        aria-hidden
      />
      <div className="donut-lg-list" style={{ flex: 1 }}>
        {Array.from({ length: rowCount }, (_, i) => (
          <div key={i} className="donut-skel-row" aria-hidden />
        ))}
        <div className="donut-skel-total" aria-hidden />
      </div>
    </div>
  );
}

export default function BreakdownDonut({
  title,
  badge,
  data = [],
  /** Donut slices only (defaults to `data`). List always uses `data`. */
  chartData,
  centerValue,
  centerLabel = '',
  totalLabel = 'Total',
  size = 200,
  stroke = 24,
  loading = false,
  error = null,
  headerExtra = null,
  totalViews,
  disabled = false,
  disabledMessage = 'VDP data only',
  disabledSubtext = '',
  emptyMessage = null,
  skeletonRows = 5,
  pctDecimals = 2,
  listScrollable = false,
  /** Hide the breakdown list beside the donut (inventory report uses a table instead). */
  hideList = false,
  /** Render chart body only — no outer Panel wrapper. */
  embedded = false,
  /** % change vs compare period — shown on the right (green up / red down). */
  totalDelta = null,
  /** Tooltip unit label, e.g. "units" → `fifth-wheel: 100 units (22.6%)` */
  sliceTooltipUnit = '',
}) {
  const { expanded, isExpanded, toggle } = useChannelGroupExpansion(false);
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const listSeries = data;
  const visibleListSeries = useMemo(
    () => filterByExpandedGroups(listSeries, expanded),
    [listSeries, expanded]
  );
  const showGroupColumn = useMemo(
    () => listSeries.some((s) => s.isGroupRollup && s.collapsible),
    [listSeries]
  );
  const donutSeries = chartData ?? data;
  const sliceTotal = listSeries.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const donutTotal = donutSeries.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const grandTotal =
    totalViews !== undefined && totalViews !== null
      ? Number(totalViews) || 0
      : sliceTotal;
  const isEmpty = donutTotal <= 0 && grandTotal <= 0;

  const center =
    centerValue !== undefined
      ? centerValue
      : formatViewsK(grandTotal);

  let offset = 0;

  const slicePct = (slice, total) => {
    if (slice?.pct != null && slice.pct !== '') {
      return Number(slice.pct) || 0;
    }
    const value = Number(slice?.value) || 0;
    return total > 0 ? (value / total) * 100 : 0;
  };

  const chartBody = (
    <>
      {error && (
        <div className="donut-err" role="alert">
          {error}
        </div>
      )}
      {disabled ? (
        <div className="donut-disabled">
          <div className="donut-disabled-title">{disabledMessage}</div>
          {disabledSubtext && (
            <div className="donut-disabled-sub">{disabledSubtext}</div>
          )}
        </div>
      ) : loading ? (
        <DonutSkeleton size={size} rowCount={skeletonRows} />
      ) : emptyMessage ? (
        <div className="donut-empty-msg">{emptyMessage}</div>
      ) : (
        <div
          className={`donut-lg-wrap${hideList ? ' donut-lg-wrap--donut-only' : ''}`}
        >
          {/* ── Donut ── */}
          <div
            className="donut-chart-stage"
            style={{ width: size, flexShrink: 0 }}
            onMouseLeave={() => setHoveredSlice(null)}
          >
            <div
              className="donut-chart-wrap"
              style={{
                position: 'relative',
                width: size,
                height: size,
              }}
            >
              <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ transform: 'rotate(-90deg)' }}
              >
              {/* faint track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--s3)"
                strokeWidth={stroke}
              />
              {!isEmpty &&
                donutSeries.map((s) => {
                  const dash =
                    (Number(s.value) / Math.max(donutTotal, 1)) * circ;
                  if (dash <= 0) return null;
                  const sliceOffset = offset;
                  offset += dash;
                  const isHovered = hoveredSlice?.name === s.name;
                  const pct = slicePct(s, donutTotal);
                  return (
                    <g
                      key={s.name}
                      className="donut-slice-group"
                      onMouseEnter={() =>
                        setHoveredSlice({
                          name: s.name,
                          value: Number(s.value) || 0,
                          pct,
                          color: s.color,
                          ...sliceAnchorGeometry(
                            sliceOffset,
                            dash,
                            circ,
                            size,
                            r,
                            stroke
                          ),
                        })
                      }
                    >
                      <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={stroke}
                        strokeLinecap="butt"
                        strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-sliceOffset}
                        className={`donut-slice${isHovered ? ' donut-slice--hover' : ''}`}
                      />
                      <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={r}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={stroke + 14}
                        strokeLinecap="butt"
                        strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-sliceOffset}
                        className="donut-slice-hit"
                      />
                    </g>
                  );
                })}
              </svg>

              {hoveredSlice && (
                <span
                  className="donut-slice-arrow"
                  aria-hidden
                  style={{
                    left: hoveredSlice.anchorX,
                    top: hoveredSlice.anchorY,
                    '--slice-color': hoveredSlice.color,
                    transform: `translate(-50%, 0) rotate(${hoveredSlice.midAngleDeg}deg)`,
                  }}
                />
              )}

              <div
                className="donut-chart-center"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="font-display"
                  style={{
                    fontSize: 38,
                    fontWeight: 700,
                    color: 'var(--t)',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {center}
                </div>
                {centerLabel && (
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--t3)',
                      textTransform: 'uppercase',
                      letterSpacing: '.08em',
                      marginTop: 5,
                      fontWeight: 600,
                    }}
                  >
                    {centerLabel}
                  </div>
                )}
              </div>
            </div>

            <div className="donut-slice-callout-slot" aria-live="polite">
              {hoveredSlice && (
                <div
                  className="donut-slice-callout"
                  role="tooltip"
                  style={{ '--slice-color': hoveredSlice.color }}
                >
                  <div className="donut-slice-callout-title">
                    <span
                      className="donut-slice-tip-swatch"
                      style={{ background: hoveredSlice.color }}
                      aria-hidden
                    />
                    {hoveredSlice.name}
                  </div>
                  <div className="donut-slice-callout-body">
                    {hoveredSlice.value.toLocaleString()}
                    {sliceTooltipUnit ? ` ${sliceTooltipUnit}` : ''}
                    <span className="donut-slice-callout-pct">
                      {hoveredSlice.pct.toFixed(pctDecimals)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!hideList && (
          <div
            className={`donut-lg-list-col${listScrollable ? ' donut-lg-list-col--scroll' : ''}${totalDelta != null ? ' donut-lg-list-col--compare' : ''}${showGroupColumn ? ' donut-lg-list-col--with-toggle-col' : ''}`}
          >
            <div className="donut-lg-list-hscroll">
              <div className="donut-lg-list-track">
                {totalDelta != null && (
                  <div className="donut-lg-list-header" aria-hidden>
                    <span className="donut-lg-list-header-spacer" />
                    <span className="donut-lg-list-header-delta">Δ vs left</span>
                  </div>
                )}
                <div
                  className={
                    listScrollable
                      ? 'donut-lg-list-rows donut-lg-list--scroll'
                      : 'donut-lg-list-rows'
                  }
                >
                  {visibleListSeries.map((s) => (
                    <div
                      key={`${s.groupKey || 'solo'}-${s.name}`}
                      className={[
                        'donut-lg-row',
                        showGroupColumn ? 'donut-lg-row--with-toggle-col' : '',
                        s.delta != null ? 'donut-lg-row--compare' : '',
                        s.isGroupRollup ? 'donut-lg-row--group-rollup' : '',
                        s.isGroupMember ? 'donut-lg-row--group-member' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {showGroupColumn && (
                        s.isGroupRollup && s.collapsible ? (
                          <ChannelGroupToggle
                            expanded={isExpanded(s.groupKey)}
                            onToggle={() => toggle(s.groupKey)}
                            label={s.name}
                          />
                        ) : (
                          <span className="donut-lg-toggle-spacer" aria-hidden />
                        )
                      )}
                      <div
                        className="donut-lg-swatch"
                        style={{ background: s.color }}
                      />
                      <span
                        className={`donut-lg-name${s.isGroupMember ? ' donut-lg-name--member' : ''}`}
                        title={s.fullName || s.name}
                      >
                        {s.name}
                      </span>
                      <span className="donut-lg-value">
                        {(Number(s.value) || 0).toLocaleString()}
                      </span>
                      <span className="donut-lg-pct">
                        {(Number(s.pct) || 0).toFixed(pctDecimals)}%
                      </span>
                      {s.delta != null && (
                        <span className="donut-lg-delta">
                          <Delta value={s.delta} size={10} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div
                  className={`donut-lg-total donut-lg-total--fixed${totalDelta != null ? ' donut-lg-total--compare' : ''}${showGroupColumn ? ' donut-lg-total--with-toggle-col' : ''}`}
                >
                  {showGroupColumn && (
                    <span className="donut-lg-toggle-spacer" aria-hidden />
                  )}
                  <span className="donut-lg-swatch donut-lg-total-swatch" aria-hidden />
                  <span className="donut-lg-total-label">{totalLabel}</span>
                  <span className="donut-lg-total-value">
                    {(Number(grandTotal) || 0).toLocaleString()}
                  </span>
                  <span className="donut-lg-total-pct-spacer" aria-hidden />
                  {totalDelta != null && (
                    <span className="donut-lg-total-delta">
                      <Delta value={totalDelta} size={11} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return chartBody;
  }

  return (
    <Panel className="breakdown-donut-panel">
      <PanelHeader title={title} badge={badge}>
        {headerExtra}
      </PanelHeader>
      <PanelBody className="breakdown-donut-body">{chartBody}</PanelBody>
    </Panel>
  );
}
