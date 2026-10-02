import React from 'react';

/**
 * Tiny inline-SVG sparkline — no dependencies. Draws a filled line chart of a
 * recent metric series, auto-scaled to its own min/max.
 */
export default function Sparkline({ values, color = '#8b7bff', width = 150, height = 26 }) {
  const pts = (values || []).filter((v) => v != null && !Number.isNaN(v));
  if (pts.length < 2) {
    return <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />;
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = width / (pts.length - 1);
  const y = (v) => height - 2 - ((v - min) / range) * (height - 4);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} fillOpacity="0.14" stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
