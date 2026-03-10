'use client'

import { useState, useEffect } from 'react'
import AlertBanner from '../components/AlertBanner'
import { api } from '../lib/api'
import Link from 'next/link'
import Card from '../components/Card'
import CardGrid from '../components/CardGrid'
import Badge from '../components/Badge'
import ProgressBar from '../components/ProgressBar'

const TAG_ICON = {
  smooth_trip:     '✅',
  mild_signal:     '🟡',
  elevated_stress: '⚠️',
  notable_event:   '🔶',
  high_stress:     '🔴',
  critical_moment: '🚨',
}

const TAG_STYLE = {
  smooth_trip:     { bg: 'rgba(34,197,94,0.07)',  border: '#22c55e', text: '#14532d' },
  mild_signal:     { bg: 'rgba(250,204,21,0.10)', border: '#eab308', text: '#713f12' },
  elevated_stress: { bg: 'rgba(245,158,11,0.10)', border: '#f59e0b', text: '#78350f' },
  notable_event:   { bg: 'rgba(249,115,22,0.10)', border: '#f97316', text: '#7c2d12' },
  high_stress:     { bg: 'rgba(239,68,68,0.10)',  border: '#ef4444', text: '#7f1d1d' },
  critical_moment: { bg: 'rgba(220,38,38,0.12)',  border: '#dc2626', text: '#7f1d1d' },
}

const SIGNAL_LABEL = {
  motion:   '🏎  Sharp maneuver detected',
  audio:    '🔊  Elevated cabin noise',
  combined: '⚡  Sharp maneuver + cabin noise',
  none:     '',
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [goals, setGoals] = useState({ targetTrips: null, targetEarnings: null })

  useEffect(() => {
    api.getDashboard().then(setData)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem('driver_pulse_goals')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setGoals({
          targetTrips: Number(parsed?.targetTrips) || null,
          targetEarnings: Number(parsed?.targetEarnings) || null,
        })
      } catch {}
    }
  }, [])

  if (!data) return null

  const {
    driverName,
    pulseScore,
    forecastStatus,
    tripsCompleted,
    totalEarnings,
    currentVelocity,
    targetTrips,
    hoursElapsed,
    liveTrip,
    alerts,
    liveGuidance,
  } = data

  const resolvedTargetTrips = goals.targetTrips || targetTrips
  const elapsedMinutes = Math.round((hoursElapsed || 0) * 60)
  const showVelocity = tripsCompleted >= 3 || elapsedMinutes >= 60

  const forecastTone =
    forecastStatus?.status === 'ahead' ? 'success' :
    forecastStatus?.status === 'at_risk' ? 'danger' : 'warning'

  const gs = TAG_STYLE[liveGuidance?.risk_tag] || TAG_STYLE['smooth_trip']
  const guidanceTone =
    ['critical_moment', 'high_stress'].includes(liveGuidance?.risk_tag) ? 'danger' :
    ['notable_event', 'elevated_stress'].includes(liveGuidance?.risk_tag) ? 'warning' : 'neutral'
  // Show full actionable guidance including signal detail
  const boldGuidance = liveGuidance?.driver_guidance || ''

  return (
    <div className="page-section">
      <div className="content-area">
        <div className="row between wrap gap-3">
          <div className="col">
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
              Welcome back, {driverName}
            </div>
            <div className="muted">Your performance at a glance</div>
          </div>
          <Badge tone={forecastTone}>{forecastStatus?.label}</Badge>
        </div>

        {/* ── Live Driver Guidance — front and center ── */}
        {liveGuidance && (
          <div
            className="mt-4"
            style={{
              background: gs.bg,
              border: `2px solid ${gs.border}`,
              borderRadius: 16,
              padding: '20px 24px',
            }}
            role="alert"
            aria-live="polite"
          >
            <div className="row between wrap gap-3">
              <div className="row gap-3" style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>
                  {TAG_ICON[liveGuidance.risk_tag] || '📍'}
                </span>
                <div className="col" style={{ gap: 4, minWidth: 0 }}>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: gs.text,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.35,
                  }}>
                    {boldGuidance}
                  </div>
                  {liveGuidance.signal_driver !== 'none' && (
                    <div style={{ fontSize: 13, color: gs.text, opacity: 0.72, marginTop: 2 }}>
                      {SIGNAL_LABEL[liveGuidance.signal_driver]}
                    </div>
                  )}
                </div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                <Badge tone={guidanceTone}>
                  {liveGuidance.risk_tag?.replace(/_/g, ' ')}
                </Badge>
                <div style={{ fontSize: 12, color: gs.text, opacity: 0.6 }}>
                  Risk {liveGuidance.peak_risk_score?.toFixed(1)} / 10
                </div>
                <Link
                  href="/safety"
                  style={{
                    marginTop: 2,
                    fontSize: 12,
                    fontWeight: 800,
                    color: gs.text,
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    opacity: 0.85,
                    whiteSpace: 'nowrap',
                  }}
                >
                  View Safety Insights →
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <AlertBanner alerts={alerts} />
        </div>

        {/* KPI cards */}
        <div className="mt-4">
          <CardGrid cols={3}>
            <Card title="Driver Pulse Score" subtitle="Composite score (0–100)" variant="elevated" ariaLabel="Driver Pulse Score">
              <div className="row between">
                <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: '-0.03em' }}>
                  {pulseScore}
                </div>
                <Badge tone={forecastTone}>
                  {forecastStatus?.status === 'ahead' ? 'Ahead' : forecastStatus?.status === 'at_risk' ? 'At Risk' : 'On Track'}
                </Badge>
              </div>
              <div className="mt-2 muted" style={{ fontSize: 13 }}>
                Safety · Consistency · Earnings
              </div>
            </Card>

            <Card title="Earnings Velocity" subtitle="₹/hr (suppressed early shift)" ariaLabel="Earnings Velocity">
              {showVelocity ? (
                <div className="col gap-2">
                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                    ₹{currentVelocity.toFixed(2)} <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>/ hr</span>
                  </div>
                  <ProgressBar value={Math.min(100, Math.round((currentVelocity / (data.targetVelocity || 1)) * 100))} label="Velocity vs target" />
                </div>
              ) : (
                <div className="col gap-2">
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Collecting data…</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    Velocity shown after 3 trips or 1 hour.
                  </div>
                </div>
              )}
            </Card>

            <Card title="Daily Progress" subtitle={`Trips: ${tripsCompleted} / ${resolvedTargetTrips}`} ariaLabel="Daily Progress">
              <ProgressBar value={Math.min(100, Math.round((tripsCompleted / (resolvedTargetTrips || 1)) * 100))} label="Shift progress" />
              <div className="mt-3 row between">
                <div className="muted">Trips</div>
                <div style={{ fontWeight: 800 }}>{tripsCompleted} / {resolvedTargetTrips}</div>
              </div>
              <div className="mt-2 row between">
                <div className="muted">Earnings</div>
                <div style={{ fontWeight: 800 }}>₹{totalEarnings.toFixed(2)}</div>
              </div>
            </Card>
          </CardGrid>
        </div>

        {/* Live Trip */}
        <div className="mt-4">
          <Card title="Live Trip" subtitle="Current ride snapshot" ariaLabel="Live trip">
            <div className="row between wrap gap-3">
              <div className="row gap-2">
                <span aria-hidden="true">🚗</span>
                <div className="col">
                  <div style={{ fontWeight: 900 }}>{liveTrip?.rideType || 'UberX'}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{elapsedMinutes} min online</div>
                </div>
              </div>
              <Badge tone="neutral">₹{(liveTrip?.fare || 0).toFixed(2)}</Badge>
            </div>
            <div className="mt-3 row gap-4 wrap">
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Pickup</div>
                <div style={{ fontWeight: 800 }}>{liveTrip?.pickup}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Dropoff</div>
                <div style={{ fontWeight: 800 }}>{liveTrip?.dropoff}</div>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar value={liveTrip?.progress || 0} label="Trip progress" />
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}
