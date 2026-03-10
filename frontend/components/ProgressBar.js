"use client";

import { useEffect, useState } from "react";

export default function ProgressBar({ value, label }) {
  const clamped = Math.max(0, Math.min(100, value || 0));
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimated(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  return (
    <div className="ui-progress" aria-label={label || "Progress"}>
      {label && <div className="muted">{label}</div>}
      <div className="ui-progress-track" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div className="ui-progress-fill" style={{ width: `${animated}%` }} />
      </div>
      <div className="muted">{clamped.toFixed(0)}%</div>
    </div>
  );
}

