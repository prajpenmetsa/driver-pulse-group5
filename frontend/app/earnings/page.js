"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../components/LanguageContext";
import Card from "../../components/Card";
import CardGrid from "../../components/CardGrid";
import Badge from "../../components/Badge";
import ProgressBar from "../../components/ProgressBar";
import { api } from "../../lib/api";
import { getGoalProgressTimeline, trips as allTrips } from "../../lib/driverData";

export default function EarningsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const timeline = useMemo(() => getGoalProgressTimeline(), []);

  useEffect(() => {
    api.getEarnings().then(setData);
  }, []);

  const topTrips = useMemo(() => {
    const tripsSorted = [...(allTrips || [])].sort((a, b) => (b.fare || 0) - (a.fare || 0));
    return tripsSorted.slice(0, 5);
  }, []);

  if (!data) return null;

  const tone =
    data.forecast?.status === "ahead"
      ? "success"
      : data.forecast?.status === "at_risk"
        ? "danger"
        : "warning";

  return (
    <div className="page-section">
      <div className="row between wrap gap-3">
        <div className="col">
          <div className="page-title">{t("earnings")}</div>
          <div className="muted">Hourly performance and target tracking</div>
        </div>
        <Badge tone={tone}>{data.forecast?.label}</Badge>
      </div>

      <div className="mt-4">
        <CardGrid cols={3}>
          <Card title={t("earningsVelocity")} subtitle="Current ₹/hr earned">
            <div style={{ fontSize: 30, fontWeight: 900 }}>
              ₹{data.currentVelocity.toFixed(2)} <span className="muted" style={{ fontSize: 14, fontWeight: 800 }}>/ hr</span>
            </div>
            <div className="mt-3">
              <ProgressBar value={Math.min(100, Math.round((data.currentVelocity / (data.targetVelocity || 1)) * 100))} label="Velocity vs target" />
            </div>
          </Card>
          <Card title="Cumulative" subtitle="So far today">
            <div style={{ fontSize: 30, fontWeight: 900 }}>₹{data.currentEarnings.toFixed(2)}</div>
            <div className="muted mt-2">Projected: ₹{data.projectedEarnings.toFixed(2)}</div>
          </Card>
          <Card title="Target" subtitle="Goal for shift">
            <div style={{ fontSize: 30, fontWeight: 900 }}>₹{data.targetEarnings.toFixed(0)}</div>
            <div className="muted mt-2">₹{data.targetVelocity.toFixed(2)}/hr baseline</div>
          </Card>
        </CardGrid>
      </div>

      <div className="mt-4">
        <CardGrid cols={2}>
          <Card title="Hourly Earnings" subtitle="Simple trend (mock)">
            <svg width="100%" height="140" viewBox="0 0 600 140" role="img" aria-label="Hourly earnings chart">
              <polyline
                fill="none"
                stroke="rgba(16,185,129,0.95)"
                strokeWidth="4"
                points={(timeline || []).map((p, i) => `${i * 85},${130 - Math.round((p.percentOfGoal || 0))}`).join(" ")}
              />
            </svg>
            <div className="muted" style={{ fontSize: 13 }}>Progress: <b>{Math.round(data.progressPercent)}%</b></div>
          </Card>
          <Card title="Top Trips" subtitle="Highest fare trips">
            <div className="col gap-3">
              {topTrips.map((tr) => (
                <div key={tr.id} className="row between">
                  <div className="col">
                    <div style={{ fontWeight: 900 }}>{tr.from} → {tr.to}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{tr.time} • {tr.duration}</div>
                  </div>
                  <Badge tone="neutral">₹{(tr.fare || 0).toFixed(2)}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </CardGrid>
      </div>
    </div>
  );
}