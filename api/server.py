"""
Driver Pulse — Flask API Server
--------------------------------
Reads CSV outputs from the backend pipeline and serves JSON to the Next.js frontend.
Filters everything for a single driver (DRIVER_ID env var, default DRV001).

Endpoints:
    GET /api/dashboard
    GET /api/safety
    GET /api/earnings
    GET /api/trips
    GET /api/flagged-events
    GET /api/anomaly-scores

Start:
    python3 api/server.py          # serves on http://localhost:5001
"""

import csv
import os
from pathlib import Path

from flask import Flask, jsonify
from flask_cors import CORS

# ── Config ────────────────────────────────────────────────────────────────────

BASE = Path(__file__).resolve().parent.parent
DRIVER_ID = os.environ.get("DRIVER_ID", "DRV001")
PORT = int(os.environ.get("PORT", 5001))

app = Flask(__name__)
CORS(app)

# ── CSV loaders ───────────────────────────────────────────────────────────────

def _read_csv(rel_path):
    path = BASE / rel_path
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _num(val, default=0):
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _int(val, default=0):
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


# ── Data loading (cached at startup) ─────────────────────────────────────────

def load_all():
    data = {}

    # Driver profile
    drivers = _read_csv("data/drivers/drivers.csv")
    driver = next((d for d in drivers if d["driver_id"] == DRIVER_ID), None)
    data["driver"] = driver

    # Trips for this driver
    all_trips = _read_csv("data/trips/trips.csv")
    data["trips"] = [t for t in all_trips if t["driver_id"] == DRIVER_ID]

    # Goals
    all_goals = _read_csv("data/earnings/driver_goals.csv")
    data["goals"] = [g for g in all_goals if g["driver_id"] == DRIVER_ID]

    # Earnings velocity log
    all_vel = _read_csv("data/earnings/earnings_velocity_log.csv")
    data["velocity"] = [v for v in all_vel if v["driver_id"] == DRIVER_ID]

    # Flagged moments
    all_flags = _read_csv("data/processed_outputs/flagged_moments.csv")
    data["flagged_moments"] = [f for f in all_flags if f["driver_id"] == DRIVER_ID]

    # Trip summaries
    all_summaries = _read_csv("data/processed_outputs/trip_summaries.csv")
    data["trip_summaries"] = [s for s in all_summaries if s["driver_id"] == DRIVER_ID]

    # Pulse scores
    all_pulse = _read_csv("outputs/driver_pulse_scores.csv")
    data["pulse_scores"] = [p for p in all_pulse if p["driver_id"] == DRIVER_ID]

    # Inference tagged (filter by driver's trip IDs)
    driver_trip_ids = {t["trip_id"] for t in data["trips"]}
    all_inference = _read_csv("outputs/combined/inference_tagged.csv")
    data["inference"] = [i for i in all_inference if i["trip_id"] in driver_trip_ids]

    # Motion flags (original — for this driver's trips)
    all_motion = _read_csv("outputs/motion/motion_flags.csv")
    data["motion_flags"] = [m for m in all_motion if m.get("trip_id") in driver_trip_ids]

    # Audio flags (original — for this driver's trips)
    all_audio = _read_csv("outputs/audio/audio_flags.csv")
    data["audio_flags"] = [a for a in all_audio if a.get("trip_id") in driver_trip_ids]

    return data


DATA = load_all()

# ── Helpers ───────────────────────────────────────────────────────────────────

RISK_THRESHOLDS = [
    (2.0,  "smooth_trip",     "Trip running smoothly."),
    (4.0,  "mild_signal",     "Minor disturbance picked up — nothing to worry about yet."),
    (5.5,  "elevated_stress", "Stress signal detected. Take a breath — you're doing fine."),
    (7.0,  "notable_event",   "Notable moment flagged. This may affect your trip quality score."),
    (8.5,  "high_stress",     "High stress detected. Your wellbeing matters — pace yourself."),
    (10.0, "critical_moment", "Significant event on this trip. Review it after your shift."),
]


def _risk_tag(risk_score):
    for mx, tag, guidance in RISK_THRESHOLDS:
        if risk_score <= mx:
            return tag, guidance
    return "critical_moment", RISK_THRESHOLDS[-1][2]


def _forecast_label(status):
    return {"ahead": "Ahead", "on_track": "On Track", "at_risk": "At Risk"}.get(status, "On Track")


def _interpret_pulse(score):
    if score >= 90: return "Excellent"
    if score >= 75: return "Good"
    if score >= 60: return "Moderate risk"
    return "High risk"


def _build_trip_objects():
    """Build rich trip objects from trips.csv + trip_summaries."""
    trips = []
    for t in DATA["trips"]:
        tid = t["trip_id"]
        summary = next((s for s in DATA["trip_summaries"] if s["trip_id"] == tid), None)
        pulse = next((p for p in DATA["pulse_scores"] if p["trip_id"] == tid), None)

        pulse_score = _int(pulse["pulse_score"], 100) if pulse else 100
        fare = _num(summary["fare"]) if summary else _num(t["fare"])

        # Rating derived from pulse score
        if pulse_score >= 95: rating = 5
        elif pulse_score >= 85: rating = 4
        elif pulse_score >= 70: rating = 3
        else: rating = 2

        trips.append({
            "id": tid,
            "from": t["pickup_location"],
            "to": t["dropoff_location"],
            "time": t.get("start_time", ""),
            "duration": f"{_int(t['duration_min'])} min",
            "rating": rating,
            "fare": round(fare),
            "harsh_brakes": _int(summary["motion_events_count"]) if summary else 0,
            "safety_score": pulse_score,
            "distance_km": _num(t["distance_km"]),
        })
    return trips


def _build_trip_summaries():
    """Build tripSummaries array matching frontend shape."""
    summaries = []
    for s in DATA["trip_summaries"]:
        tid = s["trip_id"]
        pulse = next((p for p in DATA["pulse_scores"] if p["trip_id"] == tid), None)
        pulse_score = _int(pulse["pulse_score"], 100) if pulse else 100
        forecast = pulse["forecast_status"] if pulse else "on_track"

        summaries.append({
            "trip_id": tid,
            "harsh_brakes": _int(s["motion_events_count"]),
            "sudden_maneuvers": 0,
            "audio_spikes": _int(s["audio_events_count"]),
            "combined_events": _int(s["flagged_moments_count"]),
            "safety_score": pulse_score,
            "earnings": round(_num(s["fare"])),
            "driver_pulse_score": pulse_score,
            "motion_events": _int(s["motion_events_count"]),
            "audio_events": _int(s["audio_events_count"]),
            "anomaly_status": forecast,
        })
    return summaries


def _build_motion_flags():
    """Build motionFlags matching frontend shape from flagged_moments."""
    flags = []
    for f in DATA["flagged_moments"]:
        if f["flag_type"] in ("harsh_braking", "moderate_brake", "sudden_maneuver"):
            ts = f.get("timestamp", "")
            time_str = ts.split(" ")[-1][:5] if " " in ts else ts[:5]
            flags.append({
                "trip_id": f["trip_id"],
                "timestamp": time_str,
                "event_type": f["flag_type"],
                "severity": f["severity"],
            })
    return flags


def _build_audio_flags():
    """Build audioFlags matching frontend shape from flagged_moments."""
    flags = []
    for f in DATA["flagged_moments"]:
        if f["flag_type"] in ("sustained_stress", "audio_spike", "cabin_noise"):
            ts = f.get("timestamp", "")
            time_str = ts.split(" ")[-1][:5] if " " in ts else ts[:5]
            flags.append({
                "trip_id": f["trip_id"],
                "timestamp": time_str,
                "event_type": "audio_spike",
                "severity": f["severity"],
            })
    return flags


def _build_anomaly_scores():
    """Per-trip anomaly scores from inference_tagged.csv — peak per trip."""
    by_trip = {}
    for row in DATA["inference"]:
        tid = row["trip_id"]
        rs = _num(row.get("risk_score", 0))
        if tid not in by_trip or rs > by_trip[tid]["peak_risk_score"]:
            by_trip[tid] = {
                "trip_id": tid,
                "peak_risk_score": rs,
                "signal_driver": row.get("signal_driver", "none"),
                "risk_tag": row.get("risk_tag", "smooth_trip"),
                "driver_guidance": row.get("driver_guidance", "Trip running smoothly."),
            }

    # Also include trips with pulse scores but no inference data
    for p in DATA["pulse_scores"]:
        tid = p["trip_id"]
        if tid not in by_trip:
            score = _int(p["pulse_score"], 100)
            risk_score = max(0, round((100 - score) / 10, 1))
            tag, guidance = _risk_tag(risk_score)
            by_trip[tid] = {
                "trip_id": tid,
                "peak_risk_score": risk_score,
                "signal_driver": "none",
                "risk_tag": tag,
                "driver_guidance": guidance,
            }

    result = []
    for tid in sorted(by_trip):
        entry = by_trip[tid]
        pulse = next((p for p in DATA["pulse_scores"] if p["trip_id"] == tid), None)
        entry["driver_pulse_score"] = _int(pulse["pulse_score"], 100) if pulse else 100
        entry["motion_events"] = 0
        entry["audio_events"] = 0
        entry["status"] = pulse["forecast_status"] if pulse else "on_track"

        # Count events from trip summaries
        summary = next((s for s in DATA["trip_summaries"] if s["trip_id"] == tid), None)
        if summary:
            entry["motion_events"] = _int(summary["motion_events_count"])
            entry["audio_events"] = _int(summary["audio_events_count"])

        result.append(entry)

    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.route("/api/dashboard")
def dashboard():
    driver = DATA["driver"]
    driver_name = driver["name"].split()[0] if driver else "Driver"

    trip_summaries = _build_trip_summaries()
    motion_flags = _build_motion_flags()
    audio_flags = _build_audio_flags()
    trip_objects = _build_trip_objects()
    anomaly_scores = _build_anomaly_scores()

    total_earnings = sum(t["earnings"] for t in trip_summaries)
    trips_completed = len(trip_summaries)

    # Earnings velocity from log
    vel = DATA["velocity"][-1] if DATA["velocity"] else None
    hours_elapsed = _num(vel["elapsed_hours"], 6.0) if vel else 6.0
    forecast_status = vel["forecast_status"] if vel else "on_track"

    # Goals
    goal = DATA["goals"][0] if DATA["goals"] else None
    target_earnings = _num(goal["target_earnings"], 1400) if goal else 1400
    target_hours = _num(goal["target_hours"], 8) if goal else 8
    target_trips = max(trips_completed, 3)

    current_velocity = total_earnings / hours_elapsed if hours_elapsed > 0 else 0
    target_velocity = target_earnings / target_hours if target_hours > 0 else 0
    velocity_delta = current_velocity - target_velocity

    # Pulse score — average of per-trip scores
    pulse_scores_list = [_int(p["pulse_score"]) for p in DATA["pulse_scores"]]
    pulse_score = round(sum(pulse_scores_list) / len(pulse_scores_list)) if pulse_scores_list else 85

    avg_safety = pulse_score
    earnings_progress = min(100, round((total_earnings / target_earnings) * 100)) if target_earnings else 0

    total_harsh_brakes = sum(1 for f in DATA["flagged_moments"] if f["flag_type"] in ("harsh_braking", "moderate_brake"))
    total_sudden_maneuvers = sum(1 for f in motion_flags if f["event_type"] == "sudden_maneuver")
    total_audio_spikes = len(audio_flags)

    # Alerts
    alerts = []
    if total_harsh_brakes >= 5:
        alerts.append({"id": "harsh_braking", "message": "Frequent harsh braking detected", "severity": "warning"})
    if total_audio_spikes >= 3:
        alerts.append({"id": "audio_spikes", "message": "High cabin audio levels detected", "severity": "warning"})
    if forecast_status == "at_risk":
        alerts.append({"id": "earnings_risk", "message": "You are at risk of missing today's earnings target", "severity": "risk"})

    # Stressful moments from flagged_moments
    stressful_moments = []
    for f in DATA["flagged_moments"]:
        trip = next((t for t in trip_objects if t["id"] == f["trip_id"]), None)
        ts = f.get("timestamp", "")
        time_str = ts.split(" ")[-1][:5] if " " in ts else ts[:5]
        if f["severity"] in ("high", "medium"):
            stressful_moments.append({
                "id": f["flag_id"],
                "time": time_str,
                "type": "safety" if f["flag_type"] in ("harsh_braking", "moderate_brake") else "audio",
                "severity": f["severity"],
                "title": f["flag_type"].replace("_", " ").title(),
                "description": f"{trip['from']} → {trip['to']}" if trip else f["trip_id"],
                "icon": "brake" if "brak" in f["flag_type"] else "audio",
            })

    # Action points
    action_points = []
    if forecast_status == "at_risk":
        action_points.append({"id": "earnings", "type": "adjust", "title": "Extend your shift",
                              "detail": "You're behind target. Consider driving 1–2 extra hours or focusing on surge zones.", "priority": "high"})
    if any(m["severity"] == "high" for m in stressful_moments):
        action_points.append({"id": "safety", "type": "reflect", "title": "Smoother braking in rush hour",
                              "detail": "A few harsh brakes today. Leave more following distance in busy areas.", "priority": "medium"})
    action_points.append({"id": "peak", "type": "plan", "title": "Peak hours tomorrow",
                          "detail": "8–10 AM and 5–7 PM typically have the best fares. Plan to be online then.", "priority": "low"})
    action_points.append({"id": "rest", "type": "remember", "title": "Take breaks",
                          "detail": "Stretch every 2 hours. Fatigue affects safety and ratings.", "priority": "medium"})

    # Goal progress timeline
    goal_progress = _build_goal_progress(total_earnings, target_earnings, target_hours)

    # Driving smoothness
    total_events = len(motion_flags) + len(audio_flags)
    harsh_events = sum(1 for f in DATA["flagged_moments"] if f["severity"] == "high")
    smooth_events = max(0, total_events - harsh_events)
    smoothness_pct = round((smooth_events / total_events) * 100) if total_events > 0 else 100

    # Safety trend
    safety_trend = [{"label": t["time"].split(" ")[0] if " " in t["time"] else t["id"], "score": t["safety_score"]} for t in trip_objects]

    # Live guidance — worst anomaly
    live_guidance = None
    if anomaly_scores:
        worst = max(anomaly_scores, key=lambda a: a.get("peak_risk_score", 0))
        live_guidance = {
            "trip_id": worst["trip_id"],
            "risk_tag": worst["risk_tag"],
            "peak_risk_score": worst["peak_risk_score"],
            "signal_driver": worst["signal_driver"],
            "driver_guidance": worst["driver_guidance"],
        }

    # Live trip (latest trip)
    latest = trip_objects[-1] if trip_objects else None
    live_trip = {
        "duration": _int(latest["duration"].split()[0]) if latest else 0,
        "pickup": latest["from"] if latest else "",
        "dropoff": latest["to"] if latest else "",
        "distance": latest["distance_km"] if latest else 0,
        "fare": latest["fare"] if latest else 0,
        "rideType": "UberX",
        "progress": 100,
    } if latest else None

    # Event density
    event_density = _build_event_density(motion_flags, audio_flags)

    # Earnings efficiency
    safe_trips = [t for t in trip_summaries if t["safety_score"] >= 85]
    risky_trips = [t for t in trip_summaries if t["safety_score"] < 85]
    safe_earn = sum(t["earnings"] for t in safe_trips)
    risky_earn = sum(t["earnings"] for t in risky_trips)

    # Trips for comparison
    trips_comparison = []
    for t in trip_objects:
        summary = next((s for s in trip_summaries if s["trip_id"] == t["id"]), None)
        trips_comparison.append({
            **t,
            "harsh_brakes": summary["harsh_brakes"] if summary else 0,
            "sudden_maneuvers": summary.get("sudden_maneuvers", 0) if summary else 0,
            "audio_spikes": summary["audio_spikes"] if summary else 0,
            "eventCount": (summary["motion_events"] + summary["audio_events"]) if summary else 0,
            "durationMins": _int(t["duration"].split()[0]),
        })

    # Daily summary
    behavior_grade = "A" if avg_safety >= 80 and smoothness_pct >= 75 else ("B" if avg_safety >= 70 else "C")
    behavior_notes = {"A": "Excellent driving today", "B": "Good — minor improvements possible", "C": "Focus on smoother braking"}

    return jsonify({
        "driverName": driver_name,
        "pulseScore": pulse_score,
        "forecastStatus": {"status": forecast_status, "label": _forecast_label(forecast_status)},
        "tripsCompleted": trips_completed,
        "totalEarnings": total_earnings,
        "safetyScore": avg_safety,
        "currentVelocity": round(current_velocity, 2),
        "targetVelocity": round(target_velocity, 2),
        "velocityDelta": round(velocity_delta, 2),
        "hoursElapsed": hours_elapsed,
        "targetHours": target_hours,
        "targetEarnings": target_earnings,
        "targetTrips": target_trips,
        "dailyProgress": min(100, round((trips_completed / target_trips) * 100)),
        "earningsProgress": earnings_progress,
        "totalHarshBrakes": total_harsh_brakes,
        "totalSuddenManeuvers": total_sudden_maneuvers,
        "totalAudioSpikes": total_audio_spikes,
        "alerts": alerts,
        "liveTrip": live_trip,
        "goalProgressTimeline": goal_progress,
        "stressfulMoments": stressful_moments,
        "actionPoints": action_points,
        "drivingSmoothness": {"smoothnessPercent": smoothness_pct, "totalEvents": total_events, "harshEvents": harsh_events},
        "tripsForComparison": trips_comparison,
        "earningsEfficiency": {
            "earningsPerSafeTrip": f"{safe_earn / len(safe_trips):.2f}" if safe_trips else "0",
            "earningsPerRiskyTrip": f"{risky_earn / len(risky_trips):.2f}" if risky_trips else "—",
            "safeTripCount": len(safe_trips),
            "riskyTripCount": len(risky_trips),
        },
        "eventDensity": event_density,
        "safetyTrend": safety_trend,
        "dailySummary": {
            "tripsCompleted": trips_completed,
            "totalEarnings": total_earnings,
            "safetyScore": avg_safety,
            "behaviorGrade": behavior_grade,
            "behaviorNote": behavior_notes.get(behavior_grade, ""),
        },
        "tripAnomalyScores": anomaly_scores,
        "liveGuidance": live_guidance,
    })


@app.route("/api/safety")
def safety():
    motion_flags = _build_motion_flags()
    audio_flags = _build_audio_flags()
    trip_summaries = _build_trip_summaries()
    trip_objects = _build_trip_objects()
    anomaly_scores = _build_anomaly_scores()

    total_harsh = sum(1 for f in motion_flags if f["event_type"] in ("harsh_braking", "moderate_brake", "hard_brake"))
    total_maneuvers = sum(1 for f in motion_flags if f["event_type"] in ("sudden_maneuver", "sharp_turn", "sudden_acceleration"))
    total_audio = len(audio_flags)

    pulse_scores = [_int(p["pulse_score"]) for p in DATA["pulse_scores"]]
    avg_safety = round(sum(pulse_scores) / len(pulse_scores)) if pulse_scores else 85

    # Events timeline
    all_events = sorted(
        [{"trip_id": m["trip_id"], "timestamp": m["timestamp"], "source": "motion", "type": m["event_type"], "severity": m["severity"]} for m in motion_flags] +
        [{"trip_id": a["trip_id"], "timestamp": a["timestamp"], "source": "audio", "type": "audio_spike", "severity": a["severity"]} for a in audio_flags],
        key=lambda e: e["timestamp"]
    )

    # Weekly events (derive from flagged_moments dates)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekly_events = []
    for i, day in enumerate(days):
        good_count = max(0, len(trip_summaries) - sum(1 for t in trip_summaries if t["safety_score"] < 85))
        warn_count = sum(1 for f in DATA["flagged_moments"] if f["severity"] == "high")
        weekly_events.append({
            "day": day, "date": i + 2,
            "good": round(good_count / 7) if i < 5 else 0,
            "warning": round(warn_count / 7) if i < 5 else 0,
        })

    # Recent trips
    recent = trip_objects[:5]
    recent_trips = []
    for t in recent:
        summary = next((s for s in trip_summaries if s["trip_id"] == t["id"]), None)
        anomaly = next((a for a in anomaly_scores if a["trip_id"] == t["id"]), None)
        recent_trips.append({
            "id": t["id"], "from": t["from"], "to": t["to"],
            "time": t["time"], "duration": t["duration"], "fare": t["fare"],
            "rating": t["rating"], "safety_score": t["safety_score"],
            "driver_pulse_score": summary["driver_pulse_score"] if summary else None,
            "risk_tag": anomaly["risk_tag"] if anomaly else None,
        })

    # Live guidance
    live_guidance = None
    if anomaly_scores:
        worst = max(anomaly_scores, key=lambda a: a.get("peak_risk_score", 0))
        live_guidance = {
            "trip_id": worst["trip_id"], "risk_tag": worst["risk_tag"],
            "peak_risk_score": worst["peak_risk_score"],
            "signal_driver": worst["signal_driver"],
            "driver_guidance": worst["driver_guidance"],
        }

    return jsonify({
        "safetyScore": avg_safety,
        "totalHarshBrakes": total_harsh,
        "totalSuddenManeuvers": total_maneuvers,
        "totalAudioSpikes": total_audio,
        "eventsTimeline": all_events,
        "weeklyEvents": weekly_events,
        "tips": [
            "Maintain safe following distance",
            "Avoid sudden braking",
            "Keep cabin noise levels low",
        ],
        "recentTrips": recent_trips,
        "liveGuidance": live_guidance,
    })


@app.route("/api/earnings")
def earnings():
    trip_summaries = _build_trip_summaries()
    total_earnings = sum(t["earnings"] for t in trip_summaries)

    vel = DATA["velocity"][-1] if DATA["velocity"] else None
    hours_elapsed = _num(vel["elapsed_hours"], 6.0) if vel else 6.0
    forecast_status = vel["forecast_status"] if vel else "on_track"

    goal = DATA["goals"][0] if DATA["goals"] else None
    target_earnings = _num(goal["target_earnings"], 1400) if goal else 1400
    target_hours = _num(goal["target_hours"], 8) if goal else 8

    current_velocity = total_earnings / hours_elapsed if hours_elapsed > 0 else 0
    target_velocity = target_earnings / target_hours if target_hours > 0 else 0
    velocity_delta = current_velocity - target_velocity
    projected = current_velocity * target_hours
    progress = min(100, round((total_earnings / target_earnings) * 100)) if target_earnings else 0

    # Breakdown: base fare vs surge vs tips (plausible split)
    base_total = sum(_num(t.get("fare", 0)) for t in DATA["trips"])
    surge_total = sum(_num(t.get("fare", 0)) * max(0, _num(t.get("surge_multiplier", 1)) - 1) for t in DATA["trips"])
    tip_estimate = round(total_earnings * 0.08)
    fare_portion = total_earnings - tip_estimate

    return jsonify({
        "currentEarnings": total_earnings,
        "targetEarnings": target_earnings,
        "projectedEarnings": round(projected, 2),
        "currentVelocity": round(current_velocity, 2),
        "targetVelocity": round(target_velocity, 2),
        "velocityDelta": round(velocity_delta, 2),
        "hoursElapsed": hours_elapsed,
        "targetHours": target_hours,
        "forecast": {"status": forecast_status, "label": _forecast_label(forecast_status)},
        "progressPercent": progress,
        "breakdown": [
            {"label": "Trip Fares", "amount": fare_portion, "color": "green"},
            {"label": "Tips", "amount": tip_estimate, "color": "blue"},
            {"label": "Surge Bonus", "amount": round(surge_total), "color": "yellow"},
        ],
    })


@app.route("/api/trips")
def trips_endpoint():
    trip_objects = _build_trip_objects()
    total_distance = sum(t["distance_km"] for t in trip_objects)

    vel = DATA["velocity"][-1] if DATA["velocity"] else None
    hours = _num(vel["elapsed_hours"], 6.0) if vel else 6.0

    return jsonify({
        "tripsCompleted": len(trip_objects),
        "drivingHours": f"{hours:.1f}h",
        "totalDistance": f"{round(total_distance)} km",
        "trips": trip_objects,
    })


@app.route("/api/flagged-events")
def flagged_events():
    motion_flags = _build_motion_flags()
    audio_flags = _build_audio_flags()
    trip_summaries = _build_trip_summaries()
    trip_objects = _build_trip_objects()

    # Harsh braking
    harsh_braking = []
    for f in motion_flags:
        if f["event_type"] in ("harsh_braking", "moderate_brake", "hard_brake"):
            trip = next((t for t in trip_objects if t["id"] == f["trip_id"]), None)
            harsh_braking.append({
                **f,
                "tripLabel": f"{trip['from']} → {trip['to']}" if trip else f["trip_id"],
            })

    # Noise spikes
    noise_spikes = []
    for a in audio_flags:
        trip = next((t for t in trip_objects if t["id"] == a["trip_id"]), None)
        noise_spikes.append({
            **a,
            "tripLabel": f"{trip['from']} → {trip['to']}" if trip else a["trip_id"],
        })

    # Goal risk
    total_earnings = sum(t["earnings"] for t in trip_summaries)
    vel = DATA["velocity"][-1] if DATA["velocity"] else None
    hours_elapsed = _num(vel["elapsed_hours"], 6.0) if vel else 6.0
    forecast_status = vel["forecast_status"] if vel else "on_track"

    goal = DATA["goals"][0] if DATA["goals"] else None
    target_earnings = _num(goal["target_earnings"], 1400) if goal else 1400
    target_hours = _num(goal["target_hours"], 8) if goal else 8

    current_velocity = total_earnings / hours_elapsed if hours_elapsed > 0 else 0
    target_velocity = target_earnings / target_hours if target_hours > 0 else 0
    avg_per_trip = total_earnings / len(trip_summaries) if trip_summaries else 0

    goal_risk_trips = []
    for t in trip_summaries:
        trip = next((tr for tr in trip_objects if tr["id"] == t["trip_id"]), None)
        goal_risk_trips.append({
            "trip_id": t["trip_id"],
            "earnings": t["earnings"],
            "tripLabel": f"{trip['from']} → {trip['to']}" if trip else t["trip_id"],
            "belowPace": t["earnings"] < avg_per_trip,
        })

    return jsonify({
        "harshBraking": harsh_braking,
        "noiseSpikes": noise_spikes,
        "goalRisk": {
            "status": forecast_status,
            "label": _forecast_label(forecast_status),
            "currentVelocity": round(current_velocity, 1),
            "targetVelocity": round(target_velocity, 1),
            "totalEarnings": total_earnings,
            "targetEarnings": target_earnings,
            "trips": goal_risk_trips,
        },
    })


@app.route("/api/anomaly-scores")
def anomaly_scores():
    return jsonify(_build_anomaly_scores())


# ── Helper builders ───────────────────────────────────────────────────────────

def _build_goal_progress(total_earnings, target_earnings, target_hours):
    """Build plausible goal progress timeline from velocity log."""
    vel = DATA["velocity"][-1] if DATA["velocity"] else None
    elapsed = _num(vel["elapsed_hours"], 6.0) if vel else 6.0
    cumulative = _num(vel["cumulative_earnings"], total_earnings) if vel else total_earnings

    # Build timeline: earnings grew roughly linearly
    steps = []
    rate = cumulative / elapsed if elapsed > 0 else 0
    target_rate = target_earnings / target_hours if target_hours > 0 else 0

    hours = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    for h in hours:
        if h > elapsed:
            break
        earn = round(rate * h)
        target_at = round(target_rate * h)
        pct = round((earn / target_earnings) * 100) if target_earnings else 0
        label = f"{int(h)}h" if h > 0 else "Start"
        steps.append({
            "time": label,
            "earnings": earn,
            "targetAtTime": target_at,
            "percentOfGoal": min(100, pct),
        })

    # Add "Now" point
    steps.append({
        "time": "Now",
        "earnings": round(cumulative),
        "targetAtTime": round(target_rate * elapsed),
        "percentOfGoal": min(100, round((cumulative / target_earnings) * 100)) if target_earnings else 0,
    })

    return steps


def _build_event_density(motion_flags, audio_flags):
    """Event density by time slot."""
    slots = [
        {"label": "6–8", "min": 6, "max": 8},
        {"label": "8–10", "min": 8, "max": 10},
        {"label": "10–12", "min": 10, "max": 12},
        {"label": "12–14", "min": 12, "max": 14},
        {"label": "14+", "min": 14, "max": 24},
    ]

    all_events = motion_flags + audio_flags
    density = []
    for s in slots:
        count = sum(
            1 for e in all_events
            if e.get("timestamp") and _safe_hour(e["timestamp"]) >= s["min"] and _safe_hour(e["timestamp"]) < s["max"]
        )
        density.append({"slot": s["label"], "count": count})

    mx = max((d["count"] for d in density), default=1) or 1
    return [{"slot": d["slot"], "count": d["count"], "height": round((d["count"] / mx) * 100)} for d in density]


def _safe_hour(ts):
    try:
        return int(ts.split(":")[0])
    except (ValueError, IndexError):
        return 0


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Driver Pulse API — serving data for driver {DRIVER_ID}")
    print(f"  Driver: {DATA['driver']['name'] if DATA['driver'] else 'unknown'}")
    print(f"  Trips:  {len(DATA['trips'])}")
    print(f"  Flagged moments: {len(DATA['flagged_moments'])}")
    print(f"  Inference rows:  {len(DATA['inference'])}")
    print(f"  Pulse scores:    {len(DATA['pulse_scores'])}")
    print(f"\nListening on http://localhost:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
