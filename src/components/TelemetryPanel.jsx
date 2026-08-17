import React, { useEffect, useState } from 'react';
import { getTelemetry, getMetricHistory, watchMetric } from '../data/telemetry';
import Sparkline from './Sparkline';

/** Live telemetry panel with metric sparklines, keyed by part_id. */
export default function TelemetryPanel({ partId, onClose }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    watchMetric(partId);
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [partId]);

  const hist = getMetricHistory(partId);
  const cur = hist[hist.length - 1] || getTelemetry(partId);

  return (
    <div className="detail-panel">
      <div className="panel-header">
        <h4>Telemetry ({partId})</h4>
        <button className="close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="panel-body">
        <div className="data-row">
          <span>Condition</span>
          <span className={`status ${String(cur.condition).includes('Critical') ? 'critical' : 'optimal'}`}>
            {cur.condition}
          </span>
        </div>
        <div className="data-row">
          <span>Age</span>
          <span>{cur.age} days</span>
        </div>
        <div className="metric-row">
          <div className="metric-row__head">
            <span>Temperature</span>
            <span>{Number(cur.temp).toFixed(1)} &deg;C</span>
          </div>
          <Sparkline values={hist.map((s) => s.temp)} color="#ff8a4c" />
        </div>
        <div className="metric-row">
          <div className="metric-row__head">
            <span>Load</span>
            <span>{cur.load}%</span>
          </div>
          <Sparkline values={hist.map((s) => s.load)} color="#4f46e5" />
        </div>
        {cur.rpm != null && (
          <div className="metric-row">
            <div className="metric-row__head">
              <span>Fan RPM</span>
              <span>{Number(cur.rpm).toLocaleString()}</span>
            </div>
            <Sparkline values={hist.map((s) => s.rpm)} color="#35e0c6" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Hover metadata card for a part. */
export function HoverCard({ metadata }) {
  return (
    <div className="hover-popup">
      <div className="popup-header">
        <img src={metadata.logo} alt="" className="popup-logo" />
        <h4>{metadata.brand}</h4>
      </div>
      <div className="popup-body">
        <p><strong>Model:</strong> {metadata.model}</p>
        <p><strong>PN:</strong> {metadata.partNumber}</p>
        <p><strong>SN:</strong> {metadata.serialNumber}</p>
      </div>
    </div>
  );
}
