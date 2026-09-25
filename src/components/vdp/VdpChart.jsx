'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  Filler,
  Legend,
  Tooltip
);

/** Same feel as vdp_dashboard_prototype.html Chart.js defaults. */
const DEFAULT_ANIMATION = {
  duration: 900,
  easing: 'easeOutQuart',
};

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Deep copy that keeps functions (tooltip/tick callbacks) by reference.
 * JSON round-trips drop them, which silently disabled every callback.
 */
function cloneKeepingFns(value) {
  if (Array.isArray(value)) return value.map(cloneKeepingFns);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = cloneKeepingFns(v);
    return out;
  }
  return value;
}

function isPfmDarkTheme() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('.vdp-root.pfm-dash'));
}

function withDarkChartDefaults(rest) {
  if (!isPfmDarkTheme()) return rest;

  const tick = { color: '#94a3b8', ...(rest.scales?.x?.ticks || {}) };
  const tickY = { color: '#94a3b8', ...(rest.scales?.y?.ticks || {}) };
  const grid = { color: 'rgba(148, 163, 184, 0.12)' };
  const legendLabels = {
    color: '#cbd5e1',
    ...(rest.plugins?.legend?.labels || {}),
  };

  return {
    ...rest,
    plugins: {
      ...rest.plugins,
      legend: {
        ...rest.plugins?.legend,
        labels: legendLabels,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 17, 22, 0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(241, 245, 249, 0.12)',
        borderWidth: 1,
        ...rest.plugins?.tooltip,
      },
    },
    scales: rest.scales
      ? {
          ...rest.scales,
          ...(rest.scales.x
            ? {
                x: {
                  ...rest.scales.x,
                  ticks: { ...tick, ...(rest.scales.x.ticks || {}) },
                  grid: { ...grid, ...(rest.scales.x.grid || {}) },
                  border: { color: 'rgba(148, 163, 184, 0.2)' },
                },
              }
            : {}),
          ...(rest.scales.y
            ? {
                y: {
                  ...rest.scales.y,
                  ticks: { ...tickY, ...(rest.scales.y.ticks || {}) },
                  grid: { ...grid, ...(rest.scales.y.grid || {}) },
                  border: { color: 'rgba(148, 163, 184, 0.2)' },
                },
              }
            : {}),
        }
      : {
          x: { ticks: tick, grid },
          y: { ticks: tickY, grid },
        },
  };
}

function buildOptions(type, parsedOptions, fill, animate) {
  const userAnim = parsedOptions.animation;
  const { animation: _a, transitions: _t, ...rest } = parsedOptions;
  const indexAxis = rest.indexAxis === 'y' ? 'y' : 'x';
  const themed = withDarkChartDefaults(rest);

  // Horizontal bars grow on X; vertical bars grow on Y (HTML prototype feel)
  const growKey = indexAxis === 'y' ? 'x' : 'y';

  return {
    ...themed,
    responsive: true,
    maintainAspectRatio: fill ? false : true,
    animation: animate
      ? {
          ...DEFAULT_ANIMATION,
          ...(userAnim && typeof userAnim === 'object' ? userAnim : {}),
        }
      : false,
    animations: animate
      ? {
          [growKey]: {
            type: 'number',
            easing: 'easeOutQuart',
            duration: 900,
            from: 0,
          },
          ...(typeof themed.animations === 'object' ? themed.animations : {}),
        }
      : false,
    transitions: {
      active: { animation: { duration: animate ? 450 : 0 } },
      // Keep resize silent AFTER first paint so layout sync doesn't wipe the grow-in
      resize: { animation: { duration: 0 } },
      show: {
        animations: {
          [growKey]: { from: 0, duration: 900, easing: 'easeOutQuart' },
        },
      },
    },
  };
}

function containerReady(el) {
  if (!el) return false;
  const w = el.clientWidth;
  const h = el.clientHeight;
  return w > 8 && h > 8;
}

/**
 * @param {object} props
 * @param {boolean} [props.fill] — fill parent box (maintainAspectRatio: false)
 * @param {number} [props.height] — canvas height hint when not filling
 * @param {boolean} [props.animate] — play grow/draw animation (default true)
 */
export default function VdpChart({
  type,
  data,
  options,
  height = 130,
  fill = false,
  animate = true,
  className,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const typeRef = useRef(type);
  const readyRef = useRef(false);
  const optionsRef = useRef(options);
  const dataKey = JSON.stringify(data);
  const optionsKey = JSON.stringify(options || {});

  optionsRef.current = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const shouldAnimate = animate && !prefersReducedMotion();
    let cancelled = false;
    let raf = 0;
    let ro = null;

    const parsedData = () => JSON.parse(dataKey);
    const nextOptions = () =>
      buildOptions(
        type,
        cloneKeepingFns(optionsRef.current || {}),
        fill,
        shouldAnimate
      );

    const createChart = () => {
      if (cancelled || !canvasRef.current) return;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      typeRef.current = type;
      readyRef.current = true;
      chartRef.current = new Chart(canvasRef.current, {
        type,
        data: parsedData(),
        options: nextOptions(),
      });
    };

    const updateChart = () => {
      if (cancelled || !chartRef.current) return;
      if (typeRef.current !== type) {
        createChart();
        return;
      }
      chartRef.current.data = parsedData();
      chartRef.current.options = nextOptions();
      chartRef.current.update(shouldAnimate ? undefined : 'none');
    };

    const tryCreate = () => {
      if (cancelled) return;
      const host = fill ? wrapRef.current : canvas.parentElement;
      if (fill && !containerReady(host)) return false;
      createChart();
      return true;
    };

    if (chartRef.current && readyRef.current && typeRef.current === type) {
      // Existing chart — animate data change
      raf = window.requestAnimationFrame(updateChart);
    } else if (fill) {
      // Wait until fill box has real size, then create with grow-in animation
      const host = wrapRef.current;
      if (tryCreate()) {
        /* created */
      } else if (host && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
          if (!chartRef.current && tryCreate() && ro) {
            ro.disconnect();
            ro = null;
          }
        });
        ro.observe(host);
      } else {
        raf = window.requestAnimationFrame(() => {
          raf = window.requestAnimationFrame(() => {
            tryCreate();
          });
        });
      }
    } else {
      raf = window.requestAnimationFrame(() => {
        raf = window.requestAnimationFrame(createChart);
      });
    }

    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, [type, dataKey, optionsKey, fill, animate]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      readyRef.current = false;
    };
  }, []);

  if (fill) {
    return (
      <div ref={wrapRef} className={`vdp-chart-fill ${className || ''}`.trim()}>
        <canvas ref={canvasRef} />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      height={height}
      className={className}
      style={{ maxHeight: 320 }}
    />
  );
}
