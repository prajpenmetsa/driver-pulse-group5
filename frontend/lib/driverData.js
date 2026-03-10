/**
 * Driver Pulse - Frontend Data Layer
 * Core logic mirroring the sensor fusion pipeline:
 * Motion + Audio events → Safety score → Earnings velocity → Forecast status
 */

// --- Constants (thresholds from pipeline logic) ---
const HARSH_BRAKING_ALERT_THRESHOLD = 5
const AUDIO_SPIKE_ALERT_THRESHOLD = 3
const DEFAULT_TARGET_EARNINGS = 1400
const DEFAULT_TARGET_TRIPS = 3
const DEFAULT_TARGET_HOURS = 8
const DEFAULT_HOURS_ELAPSED = 2.82

// ── Anomaly tagging (mirrors tag_anomaly_scores.py) ──────────────────────────
// Risk scale: anomaly_score (0–1) × 10 = risk_score (0–10)
const RISK_THRESHOLDS = [
  { max: 2.0, tag: 'smooth_trip',      guidance: 'Trip running smoothly.' },
  { max: 4.0, tag: 'mild_signal',      guidance: 'Minor disturbance picked up — nothing to worry about yet.' },
  { max: 5.5, tag: 'elevated_stress',  guidance: "Stress signal detected. Take a breath — you're doing fine." },
  { max: 7.0, tag: 'notable_event',    guidance: 'Notable moment flagged. This may affect your trip quality score.' },
  { max: 8.5, tag: 'high_stress',      guidance: 'High stress detected. Your wellbeing matters — pace yourself.' },
  { max: 10.0,tag: 'critical_moment',  guidance: 'Significant event on this trip. Review it after your shift.' },
]
const SIGNAL_DETAIL = {
  motion:   'Flagged by: sharp maneuver.',
  audio:    'Flagged by: elevated cabin noise.',
  combined: 'Flagged by: sharp maneuver and elevated cabin noise.',
  none:     '',
}

function computeRiskTag(riskScore, signalDriver) {
  for (const { max, tag, guidance } of RISK_THRESHOLDS) {
    if (riskScore <= max) {
      const detail = riskScore > 5.5 ? SIGNAL_DETAIL[signalDriver] || '' : ''
      return { tag, guidance: detail ? `${guidance} ${detail}` : guidance }
    }
  }
  return { tag: 'critical_moment', guidance: RISK_THRESHOLDS[5].guidance }
}

// ── Real data from driver_pulse_scores.csv (driver_pulse_score.py output) ─────
// Formula: 100 − motion_penalties − audio_penalties + earnings_adj (clamped 0–100)
// earnings_adj: ahead→+5, on_track→0, at_risk→−5
const DRIVER_PULSE_SUMMARY = [
  { trip_id:'TRIP048', motion_events:0, audio_events:0, driver_pulse_score:100, status:'ahead'   },
  { trip_id:'TRIP151', motion_events:0, audio_events:0, driver_pulse_score:100, status:'ahead'   },
  { trip_id:'TRIP153', motion_events:0, audio_events:0, driver_pulse_score:100, status:'ahead'   },
]

// ── Real inference results from inference_tagged.csv (tag_anomaly_scores.py) ─
// Peak risk_score per trip + dominant signal + worst tag/guidance
// Peak risk_score per trip from inference_tagged.csv for Alex Kumar (DRV001)
const INFERENCE_TAGGED = {
  TRIP048: { peak_risk_score: 9.3, signal_driver: 'motion', risk_tag: 'critical_moment', driver_guidance: "Significant event on this trip. Review it after your shift. Flagged by: sharp maneuver." },
}

// --- Real data from pipeline outputs (motion_flags.csv, audio_flags.csv, trips.csv) ---
// motionFlags: non-Normal driving events only; severity mapped from dynamic_trip_score (>0.8=low, 0.6–0.8=medium, <0.6=high)
// motionFlags: flagged motion events for Alex Kumar (DRV001) from flagged_moments.csv
export const motionFlags = [
  { trip_id:'TRIP048', timestamp:'07:07', event_type:'harsh_braking',   severity:'high' },
  { trip_id:'TRIP151', timestamp:'07:01', event_type:'moderate_brake',  severity:'low'  },
]

// audioFlags: medium and high severity audio events from audio_flags.csv
// audioFlags: sustained stress flagged moment for Alex Kumar (DRV001)
export const audioFlags = [
  { trip_id:'TRIP151', timestamp:'07:07', event_type:'audio_spike', severity:'high' },
]

// tripSummaries: built from real trip_summaries.csv + driver_pulse_scores.csv for Alex Kumar (DRV001)
export const tripSummaries = [
  { trip_id:'TRIP048', harsh_brakes:3, sudden_maneuvers:0, audio_spikes:3, combined_events:1, safety_score:100, earnings:423, driver_pulse_score:100, motion_events:3, audio_events:3, anomaly_status:'ahead'  },
  { trip_id:'TRIP151', harsh_brakes:0, sudden_maneuvers:0, audio_spikes:0, combined_events:2, safety_score:100, earnings:273, driver_pulse_score:100, motion_events:0, audio_events:0, anomaly_status:'ahead'  },
  { trip_id:'TRIP153', harsh_brakes:1, sudden_maneuvers:0, audio_spikes:0, combined_events:0, safety_score:100, earnings:362, driver_pulse_score:100, motion_events:1, audio_events:0, anomaly_status:'ahead'  },
]

// trips: real trip routes for Alex Kumar (DRV001) from trips.csv + trip_summaries.csv
// safety_score = driver_pulse_score (100 for all Alex's trips)
// fare from trip_summaries.csv (corrected fares), distance_km and routes from trips.csv
export const trips = [
  { id:'TRIP048', from:'Indiranagar',      to:'Hitec City',    time:'06:36', duration:'38 min', rating:5, fare:423, harsh_brakes:3, safety_score:100, distance_km:10.4 },
  { id:'TRIP151', from:'Powai',            to:'Banjara Hills', time:'13:37', duration:'38 min', rating:5, fare:273, harsh_brakes:0, safety_score:100, distance_km:16.8 },
  { id:'TRIP153', from:'Connaught Place',  to:'South Delhi',   time:'15:51', duration:'24 min', rating:5, fare:362, harsh_brakes:1, safety_score:100, distance_km:9.9  },
]

// --- Core Logic Functions ---

/**
 * Compute forecast status from earnings velocity formula:
 * Ahead: vel_delta > 0 && hours_elapsed >= target_hours
 * On Track: vel_delta >= 0 && hours_elapsed < target_hours
 * At Risk: vel_delta < 0
 */
export function getForecastStatus(currentVelocity, targetVelocity, hoursElapsed, targetHours) {
  const velDelta = currentVelocity - targetVelocity

  if (velDelta > 0 && hoursElapsed >= targetHours) {
    return { status: 'ahead', label: 'Ahead' }
  }
  if (velDelta >= 0 && hoursElapsed < targetHours) {
    return { status: 'on_track', label: 'On Track' }
  }
  return { status: 'at_risk', label: 'At Risk' }
}

/**
 * Driver Pulse Score per README formula:
 * Start at 100 → deduct motion penalties → deduct audio penalties → apply earnings adj
 * Motion: harsh_braking −5, moderate_brake −3
 * Audio: argument −4, very_loud −2, loud −1
 * Earnings: ahead +5, on_track 0, at_risk −5
 * Clamped to [0, 100]
 */
export function computeDriverPulseScore(harshBrakes, moderateBrakes, argumentEvents, veryLoudEvents, loudEvents, forecastStatus) {
  const motionPenalty = harshBrakes * 5 + moderateBrakes * 3
  const audioPenalty  = argumentEvents * 4 + veryLoudEvents * 2 + loudEvents * 1
  const earningsAdj   = forecastStatus === 'ahead' ? 5 : forecastStatus === 'at_risk' ? -5 : 0
  return Math.min(100, Math.max(0, 100 - motionPenalty - audioPenalty + earningsAdj))
}

/**
 * Safety score from event counts (100 - penalties)
 * More bad events = lower score
 */
export function computeSafetyScore(harshBrakes, suddenManeuvers, audioSpikes, combinedEvents) {
  const penalty = harshBrakes * 5 + suddenManeuvers * 3 + audioSpikes * 2 + combinedEvents * 8
  return Math.max(0, Math.min(100, 100 - penalty))
}

/**
 * Generate alerts based on pipeline thresholds
 */
export function getAlerts(tripSummaries, motionFlags, audioFlags, forecastStatus) {
  const alerts = []

  const totalHarshBrakes = motionFlags.filter((m) => m.event_type === 'hard_brake').length
  if (totalHarshBrakes >= HARSH_BRAKING_ALERT_THRESHOLD) {
    alerts.push({
      id: 'harsh_braking',
      message: 'Frequent harsh braking detected',
      severity: 'warning',
    })
  }

  const totalAudioSpikes = audioFlags.length
  if (totalAudioSpikes >= AUDIO_SPIKE_ALERT_THRESHOLD) {
    alerts.push({
      id: 'audio_spikes',
      message: 'High cabin audio levels detected',
      severity: 'warning',
    })
  }

  if (forecastStatus === 'at_risk') {
    alerts.push({
      id: 'earnings_risk',
      message: "You are at risk of missing today's earnings target",
      severity: 'risk',
    })
  }

  return alerts
}

// --- Aggregated Dashboard Data ---

export function getDashboardData() {
  const totalEarnings = tripSummaries.reduce((sum, t) => sum + t.earnings, 0)
  const tripsCompleted = tripSummaries.length
  const hoursElapsed = DEFAULT_HOURS_ELAPSED
  const targetHours = DEFAULT_TARGET_HOURS
  const targetEarnings = DEFAULT_TARGET_EARNINGS
  const targetTrips = DEFAULT_TARGET_TRIPS

  const currentVelocity = totalEarnings / hoursElapsed
  const targetVelocity = targetEarnings / targetHours
  const velocityDelta = currentVelocity - targetVelocity
  const forecast = getForecastStatus(currentVelocity, targetVelocity, hoursElapsed, targetHours)

  const avgSafety = tripSummaries.length
    ? tripSummaries.reduce((s, t) => s + t.safety_score, 0) / tripSummaries.length
    : 85
  const earningsProgress = (totalEarnings / targetEarnings) * 100
  // Pulse score = average of real per-trip scores from driver_pulse_scores.csv (include earnings_adj)
  const pulseScore = DRIVER_PULSE_SUMMARY.length
    ? Math.round(DRIVER_PULSE_SUMMARY.reduce((s, t) => s + t.driver_pulse_score, 0) / DRIVER_PULSE_SUMMARY.length)
    : 85

  const totalHarshBrakes = motionFlags.filter((m) => m.event_type === 'hard_brake').length
  const totalSuddenManeuvers = motionFlags.filter((m) =>
    ['sudden_maneuver', 'sharp_turn', 'sudden_acceleration'].includes(m.event_type)
  ).length
  const totalAudioSpikes = audioFlags.length

  const alerts = getAlerts(tripSummaries, motionFlags, audioFlags, forecast.status)
  const stressfulMoments = getStressfulMoments()
  const actionPoints = getActionPoints(forecast.status, stressfulMoments)

  return {
    driverName: 'Alex',
    pulseScore,
    forecastStatus: forecast,
    tripsCompleted,
    totalEarnings,
    safetyScore: Math.round(avgSafety),
    currentVelocity,
    targetVelocity,
    velocityDelta,
    hoursElapsed,
    targetHours,
    targetEarnings,
    targetTrips,
    dailyProgress: Math.round((tripsCompleted / targetTrips) * 100),
    earningsProgress: Math.min(100, Math.round(earningsProgress)),
    totalHarshBrakes,
    totalSuddenManeuvers,
    totalAudioSpikes,
    alerts,
    liveTrip: {
      duration: 18,
      pickup: 'Andheri West',
      dropoff: 'BKC',
      distance: 8.2,
      fare: 145,
      rideType: 'UberX',
      progress: 60,
    },
    goalProgressTimeline: getGoalProgressTimeline(),
    stressfulMoments,
    actionPoints,
    drivingSmoothness: getDrivingSmoothness(),
    tripsForComparison: getTripsForComparison(),
    earningsEfficiency: getEarningsEfficiency(),
    eventDensity: getEventDensityByTime(),
    safetyTrend: getSafetyScoreTrend(),
    dailySummary: getDailySummary(),
    tripAnomalyScores: getAnomalyScores(),
    liveGuidance: getLiveGuidance(),
  }
}

export function getSafetyData() {
  const totalHarshBrakes = motionFlags.filter((m) => m.event_type === 'hard_brake').length
  const totalSuddenManeuvers = motionFlags.filter((m) =>
    ['sudden_maneuver', 'sharp_turn', 'sudden_acceleration'].includes(m.event_type)
  ).length
  const totalAudioSpikes = audioFlags.length

  const avgSafety =
    tripSummaries.length > 0
      ? tripSummaries.reduce((s, t) => s + t.safety_score, 0) / tripSummaries.length
      : 85

  // Timeline: merge motion + audio by time
  const allEvents = [
    ...motionFlags.map((m) => ({ ...m, source: 'motion', type: m.event_type })),
    ...audioFlags.map((a) => ({ ...a, source: 'audio', type: 'audio_spike' })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const weeklyEvents = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
    const eventsToday = allEvents.filter(() => Math.random() > 0.5).length
    return {
      day,
      date: i + 2,
      good: Math.max(0, tripSummaries.length - eventsToday),
      warning: motionFlags.filter(m => m.severity === 'high').length + audioFlags.filter(a => a.severity === 'high').length,
    }
  })

  return {
    safetyScore: Math.round(avgSafety),
    totalHarshBrakes,
    totalSuddenManeuvers,
    totalAudioSpikes,
    eventsTimeline: allEvents,
    weeklyEvents,
    tips: [
      'Maintain safe following distance',
      'Avoid sudden braking',
      'Keep cabin noise levels low',
    ],
    recentTrips: (() => {
      const anomalyScores = getAnomalyScores()
      return trips.slice(0, 5).map((t) => {
        const summary = tripSummaries.find((s) => s.trip_id === t.id)
        const anomaly = anomalyScores.find((a) => a.trip_id === t.id)
        return {
          id: t.id,
          from: t.from,
          to: t.to,
          time: t.time,
          duration: t.duration,
          fare: t.fare,
          rating: t.rating,
          safety_score: t.safety_score,
          driver_pulse_score: summary?.driver_pulse_score ?? null,
          risk_tag: anomaly?.risk_tag ?? null,
        }
      })
    })(),
    liveGuidance: getLiveGuidance(),
  }
}

export function getEarningsData() {
  const totalEarnings = tripSummaries.reduce((sum, t) => sum + t.earnings, 0)
  const hoursElapsed = DEFAULT_HOURS_ELAPSED
  const targetHours = DEFAULT_TARGET_HOURS
  const targetEarnings = DEFAULT_TARGET_EARNINGS

  const currentVelocity = totalEarnings / hoursElapsed
  const targetVelocity = targetEarnings / targetHours
  const velocityDelta = currentVelocity - targetVelocity
  const forecast = getForecastStatus(currentVelocity, targetVelocity, hoursElapsed, targetHours)
  const projectedEarnings = currentVelocity * targetHours
  const progressPercent = Math.min((totalEarnings / targetEarnings) * 100, 100)

  return {
    currentEarnings: totalEarnings,
    targetEarnings,
    projectedEarnings: Math.round(projectedEarnings * 100) / 100,
    currentVelocity,
    targetVelocity,
    velocityDelta,
    hoursElapsed,
    targetHours,
    forecast,
    progressPercent,
    breakdown: [
      { label: 'Trip Fares', amount: Math.round(totalEarnings * 0.92), color: 'green' },
      { label: 'Tips', amount: Math.round(totalEarnings * 0.08), color: 'blue' },
    ],
  }
}

export function getTripsData() {
  const totalDistance = trips.reduce((sum, t) => sum + (t.distance_km || 0), 0)

  return {
    tripsCompleted: trips.length,
    drivingHours: '6h',
    totalDistance: `${Math.round(totalDistance)} km`,
    trips,
  }
}

// --- Goal Progress Timeline — earnings vs target based on Alex's velocity log ---
export function getGoalProgressTimeline() {
  const targetEarnings = 1400
  const targetHours = 8
  const hoursElapsed = 2.82
  const cumulative = 1461
  const rate = cumulative / hoursElapsed
  const targetRate = targetEarnings / targetHours

  const steps = [
    { time: 'Start', earnings: 0, targetAtTime: 0, percentOfGoal: 0 },
    { time: '1h', earnings: Math.round(rate * 1), targetAtTime: Math.round(targetRate * 1), percentOfGoal: Math.round((rate * 1 / targetEarnings) * 100) },
    { time: '2h', earnings: Math.round(rate * 2), targetAtTime: Math.round(targetRate * 2), percentOfGoal: Math.round((rate * 2 / targetEarnings) * 100) },
    { time: 'Now', earnings: cumulative, targetAtTime: Math.round(targetRate * hoursElapsed), percentOfGoal: Math.min(100, Math.round((cumulative / targetEarnings) * 100)) },
  ]
  return steps
}

// --- Stressful / Risky Moments (from motion + audio flags) ---
export function getStressfulMoments() {
  const moments = []
  const highSeverityMotion = motionFlags.filter((m) => m.severity === 'high')
  const highSeverityAudio = audioFlags.filter((a) => a.severity === 'high')
  const lowSafetyTrips = tripSummaries.filter((t) => t.safety_score < 80)

  highSeverityMotion.forEach((m) => {
    const trip = trips.find((t) => t.id === m.trip_id)
    moments.push({
      id: `motion_${m.trip_id}_${m.timestamp}`,
      time: m.timestamp,
      type: 'safety',
      severity: 'high',
      title: 'Harsh braking / sudden maneuver',
      description: trip ? `${trip.from} → ${trip.to}` : 'Trip in progress',
      icon: 'brake',
    })
  })

  highSeverityAudio.forEach((a) => {
    moments.push({
      id: `audio_${a.trip_id}_${a.timestamp}`,
      time: a.timestamp,
      type: 'audio',
      severity: 'high',
      title: 'High cabin noise detected',
      description: 'Consider reducing volume or closing windows',
      icon: 'audio',
    })
  })

  lowSafetyTrips.forEach((t) => {
    if (!moments.some((m) => m.id?.includes(t.trip_id))) {
      const trip = trips.find((tr) => tr.id === t.trip_id)
      moments.push({
        id: `trip_${t.trip_id}`,
        time: trip?.time?.split(' ')[0] || '—',
        type: 'trip',
        severity: 'medium',
        title: `Low safety score (${t.safety_score})`,
        description: trip ? `${trip.from} → ${trip.to}` : 'Trip summary',
        icon: 'shield',
      })
    }
  })

  return moments.sort((a, b) => a.time.localeCompare(b.time))
}

// --- Action Points & Things to Remember for Next Shift ---
export function getActionPoints(forecastStatus, stressfulMoments) {
  const actions = []

  if (forecastStatus === 'at_risk') {
    actions.push({
      id: 'earnings',
      type: 'adjust',
      title: 'Extend your shift',
      detail: "You're behind target. Consider driving 1–2 extra hours or focusing on surge zones.",
      priority: 'high',
    })
  }

  if (stressfulMoments.some((m) => m.severity === 'high')) {
    actions.push({
      id: 'safety',
      type: 'reflect',
      title: 'Smoother braking in rush hour',
      detail: 'A few harsh brakes today. Leave more following distance in busy areas.',
      priority: 'medium',
    })
  }

  actions.push({
    id: 'peak',
    type: 'plan',
    title: 'Peak hours tomorrow',
    detail: '8–10 AM and 5–7 PM typically have the best fares. Plan to be online then.',
    priority: 'low',
  })

  actions.push({
    id: 'rest',
    type: 'remember',
    title: 'Take breaks',
    detail: 'Stretch every 2 hours. Fatigue affects safety and ratings.',
    priority: 'medium',
  })

  return actions
}

// --- Driving Smoothness Meter ---
export function getDrivingSmoothness() {
  const totalEvents = motionFlags.length + audioFlags.length
  const harshEvents = motionFlags.filter((m) => m.event_type === 'hard_brake').length +
    motionFlags.filter((m) => ['sudden_maneuver', 'sharp_turn'].includes(m.event_type)).length +
    audioFlags.filter((a) => a.severity === 'high').length
  const smoothEvents = Math.max(0, totalEvents - harshEvents)
  const smoothnessPercent = totalEvents > 0 ? Math.round((smoothEvents / totalEvents) * 100) : 100
  return { smoothnessPercent, totalEvents, harshEvents }
}

// --- Trip Comparison (trips with full details) ---
export function getTripsForComparison() {
  return trips.map((t) => {
    const summary = tripSummaries.find((s) => s.trip_id === t.id)
    const tripEvents = motionFlags.filter((m) => m.trip_id === t.id).concat(
      audioFlags.filter((a) => a.trip_id === t.id)
    )
    return {
      ...t,
      harsh_brakes: summary?.harsh_brakes ?? t.harsh_brakes ?? 0,
      sudden_maneuvers: summary?.sudden_maneuvers ?? 0,
      audio_spikes: summary?.audio_spikes ?? 0,
      eventCount: tripEvents.length,
      durationMins: parseInt(t.duration) || 20,
    }
  })
}

// --- Earnings Efficiency (safe vs risky trips) ---
const SAFE_TRIP_THRESHOLD = 85
export function getEarningsEfficiency() {
  const safeTrips = tripSummaries.filter((t) => t.safety_score >= SAFE_TRIP_THRESHOLD)
  const riskyTrips = tripSummaries.filter((t) => t.safety_score < SAFE_TRIP_THRESHOLD)
  const safeEarnings = safeTrips.reduce((s, t) => s + t.earnings, 0)
  const riskyEarnings = riskyTrips.reduce((s, t) => s + t.earnings, 0)
  return {
    earningsPerSafeTrip: safeTrips.length > 0 ? (safeEarnings / safeTrips.length).toFixed(2) : '0',
    earningsPerRiskyTrip: riskyTrips.length > 0 ? (riskyEarnings / riskyTrips.length).toFixed(2) : '—',
    safeTripCount: safeTrips.length,
    riskyTripCount: riskyTrips.length,
  }
}

// --- Event Density by Time (when incidents occur during trips) ---
export function getEventDensityByTime() {
  const slots = [
    { label: '6–8', min: 6, max: 8 },
    { label: '8–10', min: 8, max: 10 },
    { label: '10–12', min: 10, max: 12 },
    { label: '12–14', min: 12, max: 14 },
    { label: '14+', min: 14, max: 24 },
  ]
  const events = [...motionFlags, ...audioFlags]
  const density = slots.map(({ label, min, max }) => {
    const count = events.filter((e) => {
      const h = parseInt(e.timestamp.split(':')[0], 10)
      return h >= min && h < max
    }).length
    return { slot: label, count }
  })
  const max = Math.max(...density.map((d) => d.count), 1)
  return density.map((d) => ({ ...d, height: (d.count / max) * 100 }))
}

// --- Safety Score Trend (over time) ---
export function getSafetyScoreTrend() {
  return trips.map((t) => ({
    label: t.time?.split(' ')[0] || t.id,
    score: t.safety_score,
  })).reverse()
}

// --- Anomaly Scores per trip (from driver_pulse_summary.csv + inference_tagged.csv) ---
// For trips with real inference data → use exact risk_tag/guidance from inference_tagged.csv
// For trips without inference data → derive risk_score from total_penalty as proxy anomaly_score
export function getAnomalyScores() {
  return DRIVER_PULSE_SUMMARY.map((t) => {
    const inferred = INFERENCE_TAGGED[t.trip_id]
    if (inferred) {
      return {
        trip_id: t.trip_id,
        driver_pulse_score: t.driver_pulse_score,
        motion_events: t.motion_events,
        audio_events: t.audio_events,
        status: t.status,
        peak_risk_score: inferred.peak_risk_score,
        signal_driver: inferred.signal_driver,
        risk_tag: inferred.risk_tag,
        driver_guidance: inferred.driver_guidance,
      }
    }
    // Proxy: derive risk from real severity counts in motionFlags / audioFlags
    // Weights: high-severity motion ×3, medium ×1.5, high-severity audio ×2.5, medium ×1
    const highMotion = motionFlags.filter(f => f.trip_id === t.trip_id && f.severity === 'high').length
    const medMotion  = motionFlags.filter(f => f.trip_id === t.trip_id && f.severity === 'medium').length
    const highAudio  = audioFlags.filter(f => f.trip_id === t.trip_id && f.severity === 'high').length
    const medAudio   = audioFlags.filter(f => f.trip_id === t.trip_id && f.severity === 'medium').length
    const riskScore  = Math.min(10, Math.round((highMotion * 3 + medMotion * 1.5 + highAudio * 2.5 + medAudio * 1) * 10) / 10)
    const sigDriver  = (highMotion + medMotion) > 0
      ? ((highAudio + medAudio) > 0 ? 'combined' : 'motion')
      : ((highAudio + medAudio) > 0 ? 'audio' : 'none')
    const { tag, guidance } = computeRiskTag(riskScore, sigDriver)
    return {
      trip_id: t.trip_id,
      driver_pulse_score: t.driver_pulse_score,
      motion_events: t.motion_events,
      audio_events: t.audio_events,
      status: t.status,
      peak_risk_score: riskScore,
      signal_driver: sigDriver,
      risk_tag: tag,
      driver_guidance: guidance,
    }
  })
}

// --- Live Guidance (most critical event from the current/latest trip) ---
// In a real backend this would reflect the live sensor stream.
// Here we surface the single highest-risk event from recent inference data.
export function getLiveGuidance() {
  const scored = getAnomalyScores()
  if (!scored.length) return null
  const worst = scored.reduce((a, b) =>
    (a.peak_risk_score || 0) >= (b.peak_risk_score || 0) ? a : b
  )
  return {
    trip_id: worst.trip_id,
    risk_tag: worst.risk_tag,
    peak_risk_score: worst.peak_risk_score,
    signal_driver: worst.signal_driver,
    driver_guidance: worst.driver_guidance,
  }
}

// --- Flagged Events (Harsh Braking, Noise Spikes, Goal Risk) ---
export function getFlaggedEvents() {
  const harshBraking = motionFlags
    .filter((m) => m.event_type === 'hard_brake')
    .map((m) => {
      const trip = trips.find((t) => t.id === m.trip_id)
      return {
        ...m,
        tripLabel: trip ? `${trip.from} → ${trip.to}` : m.trip_id,
      }
    })

  const noiseSpikes = audioFlags.map((a) => {
    const trip = trips.find((t) => t.id === a.trip_id)
    return {
      ...a,
      tripLabel: trip ? `${trip.from} → ${trip.to}` : a.trip_id,
    }
  })

  const hoursElapsed = DEFAULT_HOURS_ELAPSED
  const targetHours = DEFAULT_TARGET_HOURS
  const targetEarnings = DEFAULT_TARGET_EARNINGS
  const targetVelocity = targetEarnings / targetHours
  const totalEarnings = tripSummaries.reduce((s, t) => s + t.earnings, 0)
  const currentVelocity = totalEarnings / hoursElapsed
  const forecast = getForecastStatus(currentVelocity, targetVelocity, hoursElapsed, targetHours)

  const avgEarningsPerTrip = totalEarnings / tripSummaries.length
  const goalRiskTrips = tripSummaries.map((t) => {
    const trip = trips.find((tr) => tr.id === t.trip_id)
    return {
      trip_id: t.trip_id,
      earnings: t.earnings,
      tripLabel: trip ? `${trip.from} → ${trip.to}` : t.trip_id,
      belowPace: t.earnings < avgEarningsPerTrip,
    }
  })

  return {
    harshBraking,
    noiseSpikes,
    goalRisk: {
      status: forecast.status,
      label: forecast.label,
      currentVelocity: Math.round(currentVelocity * 10) / 10,
      targetVelocity: Math.round(targetVelocity * 10) / 10,
      totalEarnings,
      targetEarnings,
      trips: goalRiskTrips,
    },
  }
}

// --- Daily Driver Summary ---
export function getDailySummary() {
  const totalEarnings = tripSummaries.reduce((sum, t) => sum + t.earnings, 0)
  const avgSafety = tripSummaries.length > 0
    ? tripSummaries.reduce((s, t) => s + t.safety_score, 0) / tripSummaries.length
    : 0
  const { smoothnessPercent } = getDrivingSmoothness()
  let behaviorGrade = 'A'
  if (avgSafety < 70 || smoothnessPercent < 60) behaviorGrade = 'C'
  else if (avgSafety < 80 || smoothnessPercent < 75) behaviorGrade = 'B'

  return {
    tripsCompleted: tripSummaries.length,
    totalEarnings,
    safetyScore: Math.round(avgSafety),
    behaviorGrade,
    behaviorNote: behaviorGrade === 'A' ? 'Excellent driving today' : behaviorGrade === 'B' ? 'Good — minor improvements possible' : 'Focus on smoother braking',
  }
}
