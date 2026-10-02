import React from 'react';

/** The national flag of India (3:2), with the 24-spoke Ashoka Chakra. */
export default function IndiaFlag({ width = 27 }) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI * 2) / 24;
    return <line key={i} x1="45" y1="30" x2={45 + 8.6 * Math.cos(a)} y2={30 + 8.6 * Math.sin(a)} />;
  });
  return (
    <svg width={width} height={(width * 2) / 3} viewBox="0 0 90 60" role="img" aria-label="Flag of India" className="india-flag">
      <rect width="90" height="20" fill="#FF9933" />
      <rect y="20" width="90" height="20" fill="#FFFFFF" />
      <rect y="40" width="90" height="20" fill="#138808" />
      <g stroke="#000080" strokeWidth="0.9" fill="none">
        <circle cx="45" cy="30" r="9" strokeWidth="1.3" />
        {spokes}
      </g>
      <circle cx="45" cy="30" r="1.6" fill="#000080" />
    </svg>
  );
}
