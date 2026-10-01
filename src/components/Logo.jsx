import React from 'react';

/**
 * The Sparshika mark: an "S" traced like a dressed cable through three rack
 * units, ending at a live status light — the point where you "touch" the
 * hardware (sparsha, Sanskrit for touch).
 *
 * tone="light" draws for dark backgrounds, "dark" for light ones, "tile" is
 * the app-icon version on a fibre-yellow square.
 */
export function LogoMark({ size = 28, tone = 'light', title }) {
  const ink = tone === 'dark' || tone === 'tile' ? '#0A1220' : '#E8EEF6';
  const dot = tone === 'tile' ? '#0A1220' : '#F5C518';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true} aria-label={title} className="logo-mark">
      {tone === 'tile' && <rect width="32" height="32" rx="7" fill="#F5C518" />}
      <path d="M22 7.5H10.5a4.25 4.25 0 0 0 0 8.5h11a4.25 4.25 0 0 1 0 8.5H4" fill="none" stroke={ink}
        strokeWidth="3" strokeLinecap="round" />
      <circle className="logo-mark__dot" cx={tone === 'tile' ? 27.2 : 27.6} cy="7.5" r={tone === 'tile' ? 2.2 : 2.4} fill={dot} />
    </svg>
  );
}

/** Mark + wordmark. */
export default function Logo({ size = 28, tone = 'light', sub = false }) {
  return (
    <span className={`logo logo--${tone}`}>
      <LogoMark size={size} tone={tone} />
      <span className="logo__text">
        <span className="logo__word">sparshika</span>
        {sub && <span className="logo__sub">by Soni Tech Solutions</span>}
      </span>
    </span>
  );
}
