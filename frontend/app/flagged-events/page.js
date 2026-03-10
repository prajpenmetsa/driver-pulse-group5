"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../../components/LanguageContext";
import Card from "../../components/Card";
import CardGrid from "../../components/CardGrid";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import { api } from "../../lib/api";

const INITIAL_SHOW = 5;

export default function FlaggedEventsPage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [showAllBraking, setShowAllBraking] = useState(false);
  const [showAllNoise, setShowAllNoise] = useState(false);
  const [showAllGoalTrips, setShowAllGoalTrips] = useState(false);

  useEffect(() => {
    api.getFlaggedEvents().then(setData);
  }, []);

  if (!data) return null;

  const totalFlags =
    data.harshBraking.length +
    data.noiseSpikes.length +
    (data.goalRisk.status === "at_risk" ? 1 : 0);

  const goalTone =
    data.goalRisk.status === "ahead" ? "success" :
    data.goalRisk.status === "at_risk" ? "danger" : "warning";

  return (
    <div className="page-section">
      {/* Header row */}
      <div className="row between wrap gap-3">
        <div className="col">
          <div className="page-title">{t("flaggedEvents")}</div>
          <div className="muted">Harsh braking, noise spikes, and goal risk by trip</div>
        </div>
        <Badge tone={totalFlags > 3 ? "danger" : totalFlags > 0 ? "warning" : "success"}>
          {totalFlags} flag{totalFlags !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Summary counts */}
      <div className="mt-4">
        <CardGrid cols={3}>
          <Card title="Harsh Braking" subtitle="Hard brake events">
            <div style={{ fontSize: 34, fontWeight: 900 }}>{data.harshBraking.length}</div>
            <div className="muted mt-2">
              {data.harshBraking.filter((e) => e.severity === "high").length} high severity
            </div>
          </Card>
          <Card title="Noise Spikes" subtitle="High cabin audio events">
            <div style={{ fontSize: 34, fontWeight: 900 }}>{data.noiseSpikes.length}</div>
            <div className="muted mt-2">
              {data.noiseSpikes.filter((e) => e.severity === "high").length} high severity
            </div>
          </Card>
          <Card title="Goal Risk" subtitle="Earnings forecast">
            <div style={{
              fontSize: 28, fontWeight: 900,
              color: data.goalRisk.status === "at_risk" ? "#ef4444" :
                     data.goalRisk.status === "ahead" ? "#22c55e" : "#f59e0b"
            }}>
              {data.goalRisk.label}
            </div>
            <div className="muted mt-2">
              ₹{data.goalRisk.totalEarnings.toFixed(0)} of ₹{data.goalRisk.targetEarnings} target
            </div>
          </Card>
        </CardGrid>
      </div>

      {/* Detailed lists — side by side */}
      <div className="mt-4">
        <CardGrid cols={3}>

          {/* Harsh Braking */}
          <Card title="Harsh Braking" subtitle="By trip">
            {data.harshBraking.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No harsh braking recorded.</div>
            ) : (
              <div className="col" style={{ gap: 0 }}>
                {(showAllBraking ? data.harshBraking : data.harshBraking.slice(0, INITIAL_SHOW)).map((e, i, arr) => (
                  <div
                    key={`brake_${e.trip_id}_${i}`}
                    style={{
                      padding: "10px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none"
                    }}
                  >
                    <div className="row between">
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{e.trip_id}</div>
                      <Badge tone={e.severity === "high" ? "danger" : e.severity === "medium" ? "warning" : "neutral"}>
                        {e.severity}
                      </Badge>
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {e.tripLabel}
                    </div>
                    {e.timestamp && (
                      <div className="muted" style={{ fontSize: 11 }}>{e.timestamp}</div>
                    )}
                  </div>
                ))}
                {data.harshBraking.length > INITIAL_SHOW && (
                  <div style={{ paddingTop: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      ariaLabel={showAllBraking ? "Show less braking events" : "See more braking events"}
                      onClick={() => setShowAllBraking((v) => !v)}
                    >
                      {showAllBraking ? "Show less" : `See more (${data.harshBraking.length - INITIAL_SHOW} more)`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Noise Spikes */}
          <Card title="Noise Spikes" subtitle="By trip">
            {data.noiseSpikes.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No noise spikes recorded.</div>
            ) : (
              <div className="col" style={{ gap: 0 }}>
                {(showAllNoise ? data.noiseSpikes : data.noiseSpikes.slice(0, INITIAL_SHOW)).map((e, i, arr) => (
                  <div
                    key={`audio_${e.trip_id}_${i}`}
                    style={{
                      padding: "10px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none"
                    }}
                  >
                    <div className="row between">
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{e.trip_id}</div>
                      <Badge tone={e.severity === "high" ? "danger" : e.severity === "medium" ? "warning" : "neutral"}>
                        {e.severity}
                      </Badge>
                    </div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {e.tripLabel}
                    </div>
                    {e.timestamp && (
                      <div className="muted" style={{ fontSize: 11 }}>{e.timestamp}</div>
                    )}
                  </div>
                ))}
                {data.noiseSpikes.length > INITIAL_SHOW && (
                  <div style={{ paddingTop: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      ariaLabel={showAllNoise ? "Show less noise events" : "See more noise events"}
                      onClick={() => setShowAllNoise((v) => !v)}
                    >
                      {showAllNoise ? "Show less" : `See more (${data.noiseSpikes.length - INITIAL_SHOW} more)`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Goal Risk */}
          <Card title="Goal Risk" subtitle={`₹${data.goalRisk.currentVelocity}/hr vs ₹${data.goalRisk.targetVelocity}/hr target`}>
            <Badge tone={goalTone} style={{ marginBottom: 10 }}>{data.goalRisk.label}</Badge>

            {data.goalRisk.status === "at_risk" && (
              <div style={{
                padding: "8px 10px", marginTop: 8, marginBottom: 12,
                background: "rgba(239,68,68,0.07)",
                borderLeft: "3px solid #ef4444",
                borderRadius: 6, fontSize: 12
              }}>
                Below target pace — projected shortfall at end of shift.
              </div>
            )}

            <div className="col" style={{ gap: 0, marginTop: 4 }}>
              {(showAllGoalTrips ? data.goalRisk.trips : data.goalRisk.trips.slice(0, INITIAL_SHOW)).map((trip, i, arr) => (
                <div
                  key={trip.trip_id}
                  style={{
                    padding: "9px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none"
                  }}
                >
                  <div className="row between">
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{trip.trip_id}</div>
                    <div className="row gap-2">
                      <span style={{ fontWeight: 800, fontSize: 13 }}>₹{trip.earnings.toFixed(2)}</span>
                      {trip.belowPace && <Badge tone="warning">↓ low</Badge>}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{trip.tripLabel}</div>
                </div>
              ))}
              {data.goalRisk.trips.length > INITIAL_SHOW && (
                <div style={{ paddingTop: 8 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    ariaLabel={showAllGoalTrips ? "Show less trips" : "See more trips"}
                    onClick={() => setShowAllGoalTrips((v) => !v)}
                  >
                    {showAllGoalTrips ? "Show less" : `See more (${data.goalRisk.trips.length - INITIAL_SHOW} more)`}
                  </Button>
                </div>
              )}
            </div>
          </Card>

        </CardGrid>
      </div>
    </div>
  );
}
