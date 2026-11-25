import React, { useId, useState } from 'react';
import { fmtCompactRp, fmtRp } from '../lib/financeEngine';

interface SparkProps {
  values: number[];
  tone?: 'ocean' | 'danger';
}

export const SparkAreaTrend: React.FC<SparkProps> = ({ values, tone = 'ocean' }) => {
  const gradId = useId();
  const pts = values.length >= 2 ? values : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const W = 114;
  const H = 40;
  const padY = 5;

  const coords = pts.map((v, idx) => {
    const x = (idx / (pts.length - 1)) * W;
    const y = H - padY - ((v - min) / span) * (H - padY * 2);
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  const stroke = tone === 'danger' ? '#882D2D' : '#1C90C2';

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export interface LineSeriesBucket {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export const MultiLineChart: React.FC<{ data: LineSeriesBucket[] }> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 490;
  const H = 208;
  const padL = 56;
  const padR = 14;
  const padT = 14;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const safeData = data.length > 0 ? data : [{ label: '—', inflow: 0, outflow: 0, net: 0 }];
  const rawMax = Math.max(
    1,
    ...safeData.flatMap((d) => [Math.max(0, d.inflow), Math.max(0, d.outflow), Math.max(0, d.net)])
  );
  // Nice round ceiling for 4 grid intervals
  const stepMag = Math.pow(10, Math.max(0, Math.floor(Math.log10(rawMax)) - 1));
  const niceMax = Math.ceil((rawMax * 1.1) / stepMag) * stepMag || 1_000_000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(niceMax * t));

  const xAt = (i: number) =>
    safeData.length === 1 ? padL + plotW / 2 : padL + (i / (safeData.length - 1)) * plotW;
  const yAt = (v: number) => padT + plotH - (Math.max(0, v) / niceMax) * plotH;

  const buildPath = (key: 'inflow' | 'outflow' | 'net') =>
    safeData
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`)
      .join(' ');

  const activeIdx = hoverIdx !== null ? hoverIdx : safeData.length - 1;
  const activeItem = safeData[activeIdx] || safeData[0];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal gridlines */}
        {ticks.map((tv, idx) => {
          const y = yAt(tv);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E1E1E1" strokeWidth="1" />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fill="#717171"
                fontSize="11"
                fontWeight="700"
                className="tabular"
              >
                {tv === 0 ? '0' : fmtCompactRp(tv).replace('Rp', '')}
              </text>
            </g>
          );
        })}

        {/* Vertical subtle guides matching .fig */}
        {safeData.map((d, i) => {
          const x = xAt(i);
          return (
            <g key={d.label + i}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={padT + plotH}
                stroke={i === activeIdx ? '#1C90C2' : '#E9E9EE'}
                strokeDasharray={i === activeIdx ? '3 3' : undefined}
                strokeWidth="1"
              />
              <text
                x={x}
                y={H - 8}
                textAnchor="middle"
                fill={i === activeIdx ? '#000000' : '#717171'}
                fontSize="11.5"
                fontWeight="700"
              >
                {d.label}
              </text>
            </g>
          );
        })}

        {/* Three data lines: Cyan (Inflow), Ocean (Outflow), Navy (Surplus) */}
        <path d={buildPath('inflow')} fill="none" stroke="#5CD4E9" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={buildPath('outflow')} fill="none" stroke="#1C90C2" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={buildPath('net')} fill="none" stroke="#1A4673" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Active vertical hover points */}
        {activeItem && (
          <g>
            <circle cx={xAt(activeIdx)} cy={yAt(activeItem.inflow)} r="4.5" fill="#5CD4E9" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx={xAt(activeIdx)} cy={yAt(activeItem.outflow)} r="4.5" fill="#1C90C2" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx={xAt(activeIdx)} cy={yAt(activeItem.net)} r="4.5" fill="#1A4673" stroke="#FFFFFF" strokeWidth="1.5" />
          </g>
        )}

        {/* Invisible hit columns for smooth pointer interaction */}
        {safeData.map((_, i) => {
          const colW = plotW / Math.max(1, safeData.length);
          return (
            <rect
              key={i}
              x={xAt(i) - colW / 2}
              y={padT}
              width={colW}
              height={plotH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverIdx(i)}
              onClick={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>

      {/* Floating glass/neumorphic tooltip matching .fig Campaign Performance card */}
      {activeItem && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
            background: 'rgba(255, 255, 255, 0.90)',
            backdropFilter: 'blur(6px)',
            borderRadius: 12,
            padding: '7px 11px',
            boxShadow: '0 6px 18px rgba(26, 70, 115, 0.12)',
            border: '1px solid rgba(255,255,255,0.9)',
            fontSize: 11.5,
            lineHeight: 1.45,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 2, color: '#000' }}>{activeItem.label}</div>
          <div className="tabular" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5CD4E9' }} />
            <span>Masuk: <strong>{fmtCompactRp(activeItem.inflow)}</strong></span>
          </div>
          <div className="tabular" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1C90C2' }} />
            <span>Keluar: <strong>{fmtCompactRp(activeItem.outflow)}</strong></span>
          </div>
          <div className="tabular" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1A4673' }} />
            <span>Surplus: <strong>{fmtCompactRp(Math.max(0, activeItem.net))}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};

export interface BarBucket {
  label: string;
  value: number;
}

export const CyanCapBarChart: React.FC<{ data: BarBucket[] }> = ({ data }) => {
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 490;
  const H = 208;
  const padL = 56;
  const padR = 14;
  const padT = 26;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const safeData = data.length > 0 ? data : [{ label: 'M1', value: 0 }];
  const peakIdx = safeData.reduce((best, cur, i, arr) => (cur.value > arr[best].value ? i : best), 0);
  const activeIdx = hoverIdx !== null ? hoverIdx : peakIdx;

  const rawMax = Math.max(1, ...safeData.map((d) => d.value));
  const stepMag = Math.pow(10, Math.max(0, Math.floor(Math.log10(rawMax)) - 1));
  const niceMax = Math.ceil((rawMax * 1.15) / stepMag) * stepMag || 1_000_000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(niceMax * t));

  const yAt = (v: number) => padT + plotH - (Math.max(0, v) / niceMax) * plotH;
  const slotW = plotW / safeData.length;
  const barW = Math.min(54, Math.max(18, slotW * 0.78));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5BD9EF" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#5BD9EF" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {ticks.map((tv, idx) => {
        const y = yAt(tv);
        return (
          <g key={idx}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E1E1E1" strokeWidth="1" />
            <text
              x={padL - 8}
              y={y + 4}
              textAnchor="end"
              fill="#717171"
              fontSize="11"
              fontWeight="700"
              className="tabular"
            >
              {tv === 0 ? '0' : fmtCompactRp(tv).replace('Rp', '')}
            </text>
          </g>
        );
      })}

      {safeData.map((d, i) => {
        const cx = padL + slotW * i + slotW / 2;
        const bx = cx - barW / 2;
        const by = yAt(d.value);
        const bh = Math.max(0, padT + plotH - by);
        const isSelected = i === activeIdx;

        return (
          <g
            key={d.label + i}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoverIdx(i)}
            onClick={() => setHoverIdx(i)}
          >
            {bh > 0 && (
              <>
                <rect
                  x={bx}
                  y={by}
                  width={barW}
                  height={bh}
                  fill={`url(#${gradId})`}
                  opacity={isSelected ? 1 : 0.82}
                />
                <line
                  x1={bx}
                  y1={by}
                  x2={bx + barW}
                  y2={by}
                  stroke={isSelected ? '#1C90C2' : '#5BD9EF'}
                  strokeWidth="3"
                />
              </>
            )}

            {/* Floating callout pill above active/peak column matching .fig "+1,240" */}
            {isSelected && d.value > 0 && (
              <g transform={`translate(${cx}, ${Math.max(14, by - 14)})`}>
                <rect
                  x="-42"
                  y="-12"
                  width="84"
                  height="22"
                  rx="11"
                  fill="#F0F0F3"
                  stroke="#FFFFFF"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill="#000000"
                  fontSize="10.5"
                  fontWeight="800"
                  className="tabular"
                >
                  {fmtCompactRp(d.value)}
                </text>
              </g>
            )}

            <text
              x={cx}
              y={H - 8}
              textAnchor="middle"
              fill={isSelected ? '#000000' : '#717171'}
              fontSize="11.5"
              fontWeight="700"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export const NeumorphicDonutChart: React.FC<{ slices: DonutSlice[] }> = ({ slices }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);

  const size = 186;
  const cx = size / 2;
  const cy = size / 2;
  const R = 78;
  const r = 46;

  let startAngle = -Math.PI / 2;
  const nonZero = slices.filter((s) => s.value > 0);

  const arcs = nonZero.map((slice, idx) => {
    const frac = total > 0 ? slice.value / total : 0;
    const angle = Math.min(frac * Math.PI * 2, Math.PI * 2 - 0.0001);
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const x3 = cx + r * Math.cos(endAngle);
    const y3 = cy + r * Math.sin(endAngle);
    const x4 = cx + r * Math.cos(startAngle);
    const y4 = cy + r * Math.sin(startAngle);

    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    startAngle = endAngle;
    return { ...slice, d, pct: frac * 100, idx };
  });

  const focused = activeIdx !== null && arcs[activeIdx] ? arcs[activeIdx] : arcs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {total <= 0 ? (
            <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="#E1E1E1" strokeWidth={R - r} />
          ) : (
            arcs.map((arc, i) => (
              <path
                key={arc.label}
                d={arc.d}
                fill={arc.color}
                opacity={activeIdx === null || activeIdx === i ? 1 : 0.65}
                style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
              />
            ))
          )}
        </svg>

        {/* Signature raised neumorphic center medallion from .fig */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 84,
            height: 84,
            borderRadius: '50%',
            background: '#F0F0F3',
            boxShadow: '-5px -5px 12px rgba(255,255,255,0.85), 5px 5px 12px rgba(174,174,192,0.35)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 6,
            pointerEvents: 'none',
          }}
        >
          {focused && total > 0 ? (
            <>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#717171', lineHeight: 1.15 }}>
                {focused.label.split(' ')[0]}
              </span>
              <span className="tabular" style={{ fontSize: 15, fontWeight: 800, color: '#000', marginTop: 2 }}>
                {Math.round(focused.pct)}%
              </span>
            </>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#717171' }}>Rp0</span>
          )}
        </div>
      </div>

      {/* Compact legend */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div
              key={s.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#4A4B52' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                {s.label}
              </span>
              <span className="tabular" style={{ fontWeight: 700, color: '#000' }} title={fmtRp(s.value)}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
