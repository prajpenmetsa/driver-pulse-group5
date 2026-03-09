"""
driver_pulse_score.py
---------------------
Computes a Driver Pulse Score (0–100) per trip.

Step 1  — Initialize at 100
Step 2  — Deduct for motion events (harsh_braking, moderate_brake)
Step 3  — Deduct for audio events (argument, very_loud, loud)
Step 4  — Adjust for earnings velocity (ahead / on_track / at_risk)

Penalty / bonus table:
  Motion:
    harsh_braking   → −5
    moderate_brake  → −3
  Audio:
    argument        → −4
    very_loud       → −2
    loud            → −1
  Earnings:
    ahead           → +5
    on_track        →  0
    at_risk         → −5

Final score is clamped to [0, 100].

Interpretation:
  90–100  Excellent
  75–89   Good
  60–74   Moderate risk
  < 60    High risk

Reads:
  outputs/motion/motion_flags.csv
  outputs/audio/audio_flags.csv
  data/trips/trips.csv
  data/earnings/earnings_velocity_log.csv

Output:
  outputs/driver_pulse_scores.csv
"""

import csv
from pathlib import Path
from collections import defaultdict

# ── Paths ──────────────────────────────────────────────────────────────────────

BASE = Path(__file__).parent.parent

MOTION_CSV   = BASE / "outputs" / "motion"    / "motion_flags.csv"
AUDIO_CSV    = BASE / "outputs" / "audio"     / "audio_flags.csv"
TRIPS_CSV    = BASE / "data"    / "trips"     / "trips.csv"
EARNINGS_CSV = BASE / "data"    / "earnings"  / "earnings_velocity_log.csv"
OUT_CSV      = BASE / "outputs" / "driver_pulse_scores.csv"


# ── Penalty / bonus tables ─────────────────────────────────────────────────────

MOTION_PENALTY = {
    "harsh_braking": 5,
    "moderate_brake": 3,
}

AUDIO_PENALTY = {
    "argument":  4,
    "very_loud": 2,
    "loud":      1,
}

EARNINGS_ADJUSTMENT = {
    "ahead":    +5,
    "on_track":  0,
    "at_risk":  -5,
}


# ── Interpretation ─────────────────────────────────────────────────────────────

def interpret(score: float) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 60:
        return "Moderate risk"
    return "High risk"


# ── Loaders ────────────────────────────────────────────────────────────────────

def load_motion_penalties() -> dict[str, tuple[int, list[str]]]:
    """Returns {trip_id: (total_deduction, [event descriptions])}"""
    totals: dict[str, int] = defaultdict(int)
    events: dict[str, list[str]] = defaultdict(list)

    with open(MOTION_CSV, newline="") as f:
        for row in csv.DictReader(f):
            event = row.get("driving_event", "").strip()
            penalty = MOTION_PENALTY.get(event, 0)
            if penalty:
                tid = row["trip_id"].strip()
                totals[tid] += penalty
                events[tid].append(event)

    return {tid: (totals[tid], events[tid]) for tid in totals}


def load_audio_penalties() -> dict[str, tuple[int, list[str]]]:
    """Returns {trip_id: (total_deduction, [classification descriptions])}"""
    totals: dict[str, int] = defaultdict(int)
    events: dict[str, list[str]] = defaultdict(list)

    with open(AUDIO_CSV, newline="") as f:
        for row in csv.DictReader(f):
            cls = row.get("peak_classification", "").strip().lower()
            penalty = AUDIO_PENALTY.get(cls, 0)
            if penalty:
                tid = row["trip_id"].strip()
                totals[tid] += penalty
                events[tid].append(cls)

    return {tid: (totals[tid], events[tid]) for tid in totals}


def load_driver_forecast() -> dict[str, str]:
    """Returns {driver_id: forecast_status} — latest entry per driver."""
    latest: dict[str, str] = {}
    with open(EARNINGS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            did = row["driver_id"].strip()
            status = row.get("forecast_status", "on_track").strip().lower()
            latest[did] = status  # last row wins (log is ordered chronologically)
    return latest


def load_trips() -> list[dict]:
    """Returns list of trip dicts with trip_id and driver_id."""
    with open(TRIPS_CSV, newline="") as f:
        return [{"trip_id": r["trip_id"].strip(), "driver_id": r["driver_id"].strip()}
                for r in csv.DictReader(f)]


# ── Core scoring ───────────────────────────────────────────────────────────────

def compute_scores() -> list[dict]:
    motion_map   = load_motion_penalties()
    audio_map    = load_audio_penalties()
    forecast_map = load_driver_forecast()
    trips        = load_trips()

    results = []
    for trip in trips:
        tid = trip["trip_id"]
        did = trip["driver_id"]

        # Step 1
        score = 100

        # Step 2 — motion
        motion_deduction, motion_events = motion_map.get(tid, (0, []))
        score -= motion_deduction

        # Step 3 — audio
        audio_deduction, audio_events = audio_map.get(tid, (0, []))
        score -= audio_deduction

        # Step 4 — earnings velocity
        forecast = forecast_map.get(did, "on_track")
        earnings_adj = EARNINGS_ADJUSTMENT.get(forecast, 0)
        score += earnings_adj

        # Clamp
        score = max(0, min(100, score))

        # Summarise detected events for display
        motion_summary = (
            f"{len(motion_events)} motion event(s): "
            + ", ".join(f"{e} (−{MOTION_PENALTY[e]})" for e in motion_events)
            if motion_events else "none"
        )
        audio_summary = (
            f"{len(audio_events)} audio event(s): "
            + ", ".join(f"{e} (−{AUDIO_PENALTY[e]})" for e in audio_events)
            if audio_events else "none"
        )

        results.append({
            "trip_id":          tid,
            "driver_id":        did,
            "motion_deduction": -motion_deduction,
            "audio_deduction":  -audio_deduction,
            "earnings_adj":     f"+{earnings_adj}" if earnings_adj > 0 else str(earnings_adj),
            "forecast_status":  forecast,
            "pulse_score":      score,
            "status":           interpret(score),
            "motion_events":    motion_summary,
            "audio_events":     audio_summary,
        })

    return results


# ── Output ─────────────────────────────────────────────────────────────────────

def run():
    results = compute_scores()

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

    print(f"Written: {OUT_CSV}  ({len(results)} rows)\n")

    # ── Summary ───────────────────────────────────────────────────────────────
    from collections import Counter
    status_counts = Counter(r["status"] for r in results)
    print("--- Driver Pulse Score distribution ---")
    for label in ["Excellent", "Good", "Moderate risk", "High risk"]:
        c = status_counts.get(label, 0)
        print(f"  {label:15s}: {c:4d}  ({c / len(results) * 100:.1f}%)")

    scores = [r["pulse_score"] for r in results]
    print(f"\n  Mean score : {sum(scores)/len(scores):.1f}")
    print(f"  Min score  : {min(scores)}")
    print(f"  Max score  : {max(scores)}")

    # ── Sample rows ───────────────────────────────────────────────────────────
    print("\n--- Sample: trips with motion or audio penalties ---")
    penalised = [r for r in results
                 if r["motion_events"] != "none" or r["audio_events"] != "none"]
    for r in penalised[:8]:
        print(f"  {r['trip_id']}  score={r['pulse_score']:3d}  [{r['status']}]"
              f"  forecast={r['forecast_status']}")
        if r["motion_events"] != "none":
            print(f"    motion  → {r['motion_events']}")
        if r["audio_events"] != "none":
            print(f"    audio   → {r['audio_events']}")


if __name__ == "__main__":
    run()
