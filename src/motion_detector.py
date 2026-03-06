"""
motion_detector.py
------------------
Detects harsh driving events from accelerometer data.

Input:  data/sensor_data/accelerometer_data.csv
Output: list of motion flag records (same schema as audio_flags.csv)

Detection logic:
  magnitude = sqrt(accel_x² + accel_y² + (accel_z - 9.8)²)  [gravity-removed]

  The dataset has two kinds of readings:
    Sequential: gap to next/prev reading <= MAX_SEQ_GAP_SEC (90s)
                → group into events; use peak magnitude of the cluster
    Isolated:   gap > MAX_SEQ_GAP_SEC on both sides
                → treat each reading as a standalone snapshot

  A reading (or cluster) is flagged if peak magnitude > MODERATE_THRESHOLD.
    moderate_brake : 2.0 – 4.0 m/s²
    harsh_braking  : > 4.0 m/s²
"""

import csv
import math
from dataclasses import dataclass, asdict
from collections import defaultdict
from typing import List, Dict, Optional


# ── Thresholds ────────────────────────────────────────────────────────────────

MODERATE_THRESHOLD  = 2.0   # m/s²: minimum magnitude to flag
HARSH_THRESHOLD     = 4.0   # m/s²: harsh braking boundary
MAX_SEQ_GAP_SEC     = 90    # seconds: max gap to still be "sequential"
MOTION_SCORE_CEIL   = 8.0   # m/s²: normalization ceiling (score = mag / ceil)

SEVERITY_HIGH   = 0.70      # score above this → high
SEVERITY_MEDIUM = 0.35      # score above this → medium  (else → low)


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class AccelReading:
    sensor_id: str
    trip_id: str
    timestamp: str
    elapsed_seconds: int
    accel_x: float
    accel_y: float
    accel_z: float
    speed_kmh: float
    magnitude: float          # computed on load


@dataclass
class MotionFlag:
    trip_id: str
    timestamp: str
    elapsed_seconds: int
    flag_type: str            # "moderate_brake" | "harsh_braking"
    severity: str             # low / medium / high
    motion_score: float       # 0.0 – 1.0
    audio_score: float        # always 0.0 here; filled by signal_combiner
    combined_score: float     # equals motion_score until combiner merges audio
    explanation: str
    context: str
    # extra detail for combiner / debugging
    peak_magnitude: float
    peak_speed_kmh: float
    reading_count: int        # how many readings formed this event


# ── Loading ───────────────────────────────────────────────────────────────────

def _magnitude(x: float, y: float, z: float) -> float:
    """Gravity-removed acceleration magnitude."""
    return math.sqrt(x**2 + y**2 + (z - 9.8)**2)


def load_accel_data(path: str) -> Dict[str, List[AccelReading]]:
    """
    Read the CSV and return readings grouped by trip_id,
    sorted ascending by elapsed_seconds within each trip.
    """
    trips: Dict[str, List[AccelReading]] = defaultdict(list)

    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            x, y, z = float(row["accel_x"]), float(row["accel_y"]), float(row["accel_z"])
            reading = AccelReading(
                sensor_id=row["sensor_id"],
                trip_id=row["trip_id"],
                timestamp=row["timestamp"],
                elapsed_seconds=int(row["elapsed_seconds"]),
                accel_x=x,
                accel_y=y,
                accel_z=z,
                speed_kmh=float(row["speed_kmh"]),
                magnitude=_magnitude(x, y, z),
            )
            trips[reading.trip_id].append(reading)

    for readings in trips.values():
        readings.sort(key=lambda r: r.elapsed_seconds)

    return trips


# ── Event detection ───────────────────────────────────────────────────────────

def _flag_type(peak_mag: float) -> str:
    return "harsh_braking" if peak_mag >= HARSH_THRESHOLD else "moderate_brake"


def _severity(score: float) -> str:
    if score > SEVERITY_HIGH:
        return "high"
    if score > SEVERITY_MEDIUM:
        return "medium"
    return "low"


def _finalize_event(cluster: List[AccelReading]) -> MotionFlag:
    """Collapse one cluster of high-magnitude readings into a single MotionFlag."""
    peak_reading = max(cluster, key=lambda r: r.magnitude)
    peak_mag     = peak_reading.magnitude
    peak_speed   = peak_reading.speed_kmh

    motion_score = min(peak_mag / MOTION_SCORE_CEIL, 1.0)
    ftype        = _flag_type(peak_mag)
    sev          = _severity(motion_score)

    if len(cluster) > 1:
        explanation = (
            f"Sudden deceleration detected ({peak_mag:.1f} m/s² peak "
            f"over {len(cluster)} readings). Speed: {peak_speed:.0f} km/h."
        )
    else:
        explanation = (
            f"Sudden deceleration detected ({peak_mag:.1f} m/s² spike). "
            f"Speed: {peak_speed:.0f} km/h."
        )

    context = f"Motion: {ftype}"

    return MotionFlag(
        trip_id=cluster[0].trip_id,
        timestamp=cluster[0].timestamp,
        elapsed_seconds=cluster[0].elapsed_seconds,
        flag_type=ftype,
        severity=sev,
        motion_score=round(motion_score, 2),
        audio_score=0.0,
        combined_score=round(motion_score, 2),
        explanation=explanation,
        context=context,
        peak_magnitude=round(peak_mag, 2),
        peak_speed_kmh=peak_speed,
        reading_count=len(cluster),
    )


def _split_into_segments(readings: List[AccelReading]) -> List[List[AccelReading]]:
    """
    Split a trip's sorted readings into sequential segments.
    A segment is a group of consecutive readings where each gap <= MAX_SEQ_GAP_SEC.
    Isolated readings become single-element segments.
    """
    if not readings:
        return []

    segments: List[List[AccelReading]] = []
    current: List[AccelReading] = [readings[0]]

    for i in range(1, len(readings)):
        gap = readings[i].elapsed_seconds - readings[i - 1].elapsed_seconds
        if gap <= MAX_SEQ_GAP_SEC:
            current.append(readings[i])
        else:
            segments.append(current)
            current = [readings[i]]

    segments.append(current)
    return segments


def detect_events(readings: List[AccelReading]) -> List[MotionFlag]:
    """
    Scan one trip's sorted readings and return one MotionFlag per detected event.

    Sequential segment (>1 reading, gaps <= MAX_SEQ_GAP_SEC):
      Find contiguous runs of readings above MODERATE_THRESHOLD.
      Each run → one event using its peak magnitude.

    Isolated reading (single element in segment):
      Flag directly if magnitude > MODERATE_THRESHOLD.
    """
    flags: List[MotionFlag] = []

    for segment in _split_into_segments(readings):
        if len(segment) == 1:
            # Isolated reading — standalone check
            r = segment[0]
            if r.magnitude > MODERATE_THRESHOLD:
                flags.append(_finalize_event([r]))
        else:
            # Sequential segment — find high-magnitude runs
            run: List[AccelReading] = []
            for r in segment:
                if r.magnitude > MODERATE_THRESHOLD:
                    run.append(r)
                else:
                    if run:
                        flags.append(_finalize_event(run))
                        run = []
            if run:
                flags.append(_finalize_event(run))

    return flags


# ── Entry point ───────────────────────────────────────────────────────────────

def run_motion_detection(
    input_path: str,
    output_path: Optional[str] = None,
) -> List[MotionFlag]:
    """
    Run the full motion detection pipeline.

    Args:
        input_path:  path to accelerometer_data.csv
        output_path: if provided, write results to this CSV path

    Returns:
        List of MotionFlag records, one per detected event.
    """
    trips = load_accel_data(input_path)

    all_flags: List[MotionFlag] = []
    for readings in trips.values():
        all_flags.extend(detect_events(readings))

    all_flags.sort(key=lambda f: (f.trip_id, f.elapsed_seconds))

    if output_path:
        _write_csv(all_flags, output_path)
        print(f"[motion_detector] Wrote {len(all_flags)} flags → {output_path}")

    return all_flags


def _write_csv(flags: List[MotionFlag], path: str) -> None:
    if not flags:
        return
    rows = [asdict(f) for f in flags]
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)


# ── Quick sanity check (run directly) ────────────────────────────────────────

if __name__ == "__main__":
    import os

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_path  = os.path.join(base, "data", "sensor_data", "accelerometer_data.csv")
    output_path = os.path.join(base, "outputs", "motion_flags.csv")

    flags = run_motion_detection(input_path, output_path)

    print(f"\nDetected {len(flags)} motion events across "
          f"{len(set(f.trip_id for f in flags))} trips\n")

    type_counts = {"moderate_brake": 0, "harsh_braking": 0}
    sev_counts  = {"low": 0, "medium": 0, "high": 0}
    for f in flags:
        type_counts[f.flag_type] += 1
        sev_counts[f.severity]   += 1

    print("Flag type breakdown:")
    for t, c in type_counts.items():
        print(f"  {t:16s}: {c}")
    print("\nSeverity breakdown:")
    for s, c in sev_counts.items():
        print(f"  {s:6s}: {c}")

    print("\nHarsh events (mag > 4.0 m/s²):")
    for f in flags:
        if f.peak_magnitude > HARSH_THRESHOLD:
            print(f"  [{f.severity:6s}] {f.trip_id} @ t={f.elapsed_seconds}s "
                  f"| mag={f.peak_magnitude:.2f} | score={f.motion_score:.2f} "
                  f"| readings={f.reading_count} | {f.explanation}")
