"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../../components/LanguageContext";
import Card from "../../components/Card";
import CardGrid from "../../components/CardGrid";
import Badge from "../../components/Badge";
import { api } from "../../lib/api";
import { trips } from "../../lib/driverData";

const TAG_STYLE = {
  smooth_trip:     { bg: 'rgba(34,197,94,0.07)',  border: '#22c55e', text: '#14532d' },
  mild_signal:     { bg: 'rgba(250,204,21,0.10)', border: '#eab308', text: '#713f12' },
  elevated_stress: { bg: 'rgba(245,158,11,0.10)', border: '#f59e0b', text: '#78350f' },
  notable_event:   { bg: 'rgba(249,115,22,0.10)', border: '#f97316', text: '#7c2d12' },
  high_stress:     { bg: 'rgba(239,68,68,0.10)',  border: '#ef4444', text: '#7f1d1d' },
  critical_moment: { bg: 'rgba(220,38,38,0.12)',  border: '#dc2626', text: '#7f1d1d' },
}

const TAG_ICON = {
  smooth_trip: '✅', mild_signal: '🟡', elevated_stress: '⚠️',
  notable_event: '🔶', high_stress: '🔴', critical_moment: '🚨',
}

const SIGNAL_LABEL = {
  motion:   '🏎  Sharp maneuver detected',
  audio:    '🔊  Elevated cabin noise',
  combined: '⚡  Sharp maneuver + cabin noise',
  none:     '',
}

export default function SafetyPage() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getSafety().then(setData);
  }, []);

  if (!data) return null;

  return (
    <div className="page-section">
      <div className="row between wrap gap-3">
        <div className="col">
          <div className="page-title">{t("safety")}</div>
          <div className="muted">Events, timelines, and stability indicators</div>
        </div>
        <Badge tone={data.safetyScore >= 85 ? "success" : data.safetyScore >= 75 ? "warning" : "danger"}>
          Safety Score {data.safetyScore}
        </Badge>
      </div>

      {/* Live Guidance — flagged event details */}
      {data.liveGuidance && (() => {
        const g = data.liveGuidance
        const gs = TAG_STYLE[g.risk_tag] || TAG_STYLE['smooth_trip']
        const trip = trips.find((t) => t.id === g.trip_id)
        const guidanceTone =
          ['critical_moment', 'high_stress'].includes(g.risk_tag) ? 'danger' :
          ['notable_event', 'elevated_stress'].includes(g.risk_tag) ? 'warning' : 'neutral'
        return (
          <div
            className="mt-4"
            style={{
              background: gs.bg,
              border: `2px solid ${gs.border}`,
              borderRadius: 16,
              padding: '20px 24px',
            }}
            role="region"
            aria-label="Flagged event details"
          >
            <div className="row between wrap gap-3">
              <div className="row gap-3" style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>
                  {TAG_ICON[g.risk_tag] || '📍'}
                </span>
                <div className="col" style={{ gap: 6, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: gs.text, lineHeight: 1.35 }}>
                    {g.driver_guidance}
                  </div>
                  {g.signal_driver !== 'none' && (
                    <div style={{ fontSize: 13, color: gs.text, opacity: 0.72 }}>
                      {SIGNAL_LABEL[g.signal_driver]}
                    </div>
                  )}
                  {trip && (
                    <div style={{ fontSize: 13, color: gs.text, opacity: 0.72 }}>
                      {g.trip_id} · {trip.from} → {trip.to} · {trip.time} · {trip.duration}
                    </div>
                  )}
                </div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                <Badge tone={guidanceTone}>
                  {g.risk_tag?.replace(/_/g, ' ')}
                </Badge>
                <div style={{ fontSize: 12, color: gs.text, opacity: 0.6 }}>
                  Risk {g.peak_risk_score?.toFixed(1)} / 10
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="mt-4">
        <CardGrid cols={3}>
          <Card title="Total Events" subtitle="Motion + audio flags">
            <div style={{ fontSize: 34, fontWeight: 900 }}>
              {data.eventsTimeline?.length || 0}
            </div>
            <svg className="sparkline" viewBox="0 0 120 56" role="img" aria-label="Events sparkline">
              <polyline
                fill="none"
                stroke="rgba(245,158,11,0.95)"
                strokeWidth="3"
                points={[4, 40, 24, 34, 44, 38, 64, 24, 84, 30, 104, 18, 116, 22].join(" ")}
              />
            </svg>
          </Card>

          <Card title={t("safetyHarshBraking")} subtitle="Hard brake events">
            <div style={{ fontSize: 34, fontWeight: 900 }}>{data.totalHarshBrakes}</div>
            <div className="muted mt-2">Threshold alert: 5+</div>
          </Card>

          <Card title="Audio Stress" subtitle="High cabin noise indicators">
            <div style={{ fontSize: 34, fontWeight: 900 }}>{data.totalAudioSpikes}</div>
            <div className="muted mt-2">Keep volume low for stability</div>
          </Card>
        </CardGrid>
      </div>

      {/* Last 5 trips */}
      <div className="mt-4">
        <Card title="Recent Trips" subtitle="Last 5 trips with anomaly scores">
          <div className="col" style={{ gap: 0 }}>
            {(data.recentTrips || []).map((trip, i) => {
              const gs = TAG_STYLE[trip.risk_tag] || TAG_STYLE['smooth_trip']
              const tagTone =
                ['critical_moment', 'high_stress'].includes(trip.risk_tag) ? 'danger' :
                ['notable_event', 'elevated_stress'].includes(trip.risk_tag) ? 'warning' : 'neutral'
              return (
                <div
                  key={trip.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: i < (data.recentTrips.length - 1) ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  }}
                >
                  <div className="row between wrap gap-2">
                    <div className="col" style={{ gap: 3, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {trip.from} → {trip.to}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {trip.time} · {trip.duration} · ₹{trip.fare?.toFixed(2)}
                        {trip.rating && <span style={{ marginLeft: 8 }}>{'⭐'.repeat(trip.rating)}</span>}
                      </div>
                    </div>
                    <div className="row gap-2" style={{ alignItems: 'center', flexShrink: 0 }}>
                      {trip.driver_pulse_score !== null && (
                        <span style={{
                          fontWeight: 900,
                          fontSize: 15,
                          color: trip.driver_pulse_score >= 85 ? '#15803d' : trip.driver_pulse_score >= 60 ? '#92400e' : '#991b1b',
                        }}>
                          {trip.driver_pulse_score}
                        </span>
                      )}
                      {trip.risk_tag && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 10px',
                            borderRadius: 999,
                            background: gs.bg,
                            border: `1px solid ${gs.border}`,
                            fontSize: 12,
                            fontWeight: 800,
                            color: gs.text,
                          }}
                        >
                          <span>{TAG_ICON[trip.risk_tag]}</span>
                          {trip.risk_tag.replace(/_/g, ' ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Event Timeline */}
      <div className="mt-4">
        <Card title="Event Timeline" subtitle="Ordered by time">
          <div className="col gap-3">
            {(data.eventsTimeline || []).slice(0, 12).map((ev) => (
              <div key={`${ev.trip_id}_${ev.timestamp}_${ev.type}`} className="row between">
                <div className="col">
                  <div style={{ fontWeight: 900 }}>
                    {ev.source === "motion" ? "Motion" : "Audio"} • {ev.type}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Trip {ev.trip_id} • {ev.timestamp} • {ev.severity}
                  </div>
                </div>
                <Badge tone={ev.severity === "high" ? "danger" : ev.severity === "medium" ? "warning" : "neutral"}>
                  {ev.severity}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
