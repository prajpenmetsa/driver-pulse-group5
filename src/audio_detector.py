"""
audio_detector.py
-----------------
Detects time windows of unusually high cabin audio during a trip.

Input:  data/sensor_data/audio_intensity_data.csv
Output: list of flag records (same schema as processed_outputs/flagged_moments.csv)

Detection logic:
  A reading is "high" if sustained_duration_sec > 0 OR audio_level_db > 82.
  Consecutive high readings (gap <= MAX_EPISODE_GAP_SEC) form one episode.
  Each episode is scored and emitted as a flag record.
"""

import csv
from dataclasses import dataclass, asdict
from collections import defaultdict
from typing import List, Dict, Optional


# ── Thresholds ────────────────────────────────────────────────────────────────

DB_THRESHOLD = 82                # dB: numeric fallback trigger
MAX_EPISODE_GAP_SEC = 90         # gap between high readings before splitting episodes
MAX_SUSTAINED_SEC = 180.0        # normalization ceiling (max observed in dataset)

SEVERITY_HIGH_THRESHOLD   = 0.67  # audio_score > this → high   (≈ >120s sustained)
SEVERITY_MEDIUM_THRESHOLD = 0.33  # audio_score > this → medium (≈ >60s sustained)

HIGH_CLASSIFICATIONS = {"very_loud", "argument"}


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class AudioReading:
    audio_id: str
    trip_id: str
    timestamp: str
    elapsed_seconds: int
    audio_level_db: float
    audio_classification: str
    sustained_duration_sec: float


@dataclass
class AudioFlag:
    trip_id: str
    timestamp: str
    elapsed_seconds: int
    flag_type: str          # "audio_spike"
    severity: str           # low / medium / high
    motion_score: float     # always 0.0 here; filled by signal_combiner
    audio_score: float      # 0.0 – 1.0
    combined_score: float   # equals audio_score until combiner merges motion
    explanation: str
    context: str
    # extra detail for combiner / debugging
    peak_db: float
    peak_sustained_sec: float
    peak_classification: str


# ── Loading ───────────────────────────────────────────────────────────────────

def load_audio_data(path: str) -> Dict[str, List[AudioReading]]:
    """
    Read the CSV and return readings grouped by trip_id,
    sorted ascending by elapsed_seconds within each trip.
    """
    trips: Dict[str, List[AudioReading]] = defaultdict(list)

    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            reading = AudioReading(
                audio_id=row["audio_id"],
                trip_id=row["trip_id"],
                timestamp=row["timestamp"],
                elapsed_seconds=int(row["elapsed_seconds"]),
                audio_level_db=float(row["audio_level_db"]),
                audio_classification=row["audio_classification"],
                sustained_duration_sec=float(row["sustained_duration_sec"]),
            )
            trips[reading.trip_id].append(reading)

    for readings in trips.values():
        readings.sort(key=lambda r: r.elapsed_seconds)

    return trips


# ── Episode detection ─────────────────────────────────────────────────────────

def _is_high(reading: AudioReading) -> bool:
    """
    A reading qualifies as "high" if:
      - sustained_duration_sec > 0  (the primary reliable signal), OR
      - audio_level_db > DB_THRESHOLD  (numeric fallback for noisy classification rows)
    """
    return reading.sustained_duration_sec > 0 or reading.audio_level_db > DB_THRESHOLD


def _severity_from_score(score: float) -> str:
    if score > SEVERITY_HIGH_THRESHOLD:
        return "high"
    if score > SEVERITY_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def _finalize_episode(episode: List[AudioReading]) -> AudioFlag:
    """
    Collapse a list of consecutive high readings into a single AudioFlag.
    The flag is anchored to the first reading of the episode.
    """
    peak_db        = max(r.audio_level_db for r in episode)
    peak_sustained = max(r.sustained_duration_sec for r in episode)
    # most severe classification wins: argument > very_loud > loud > ...
    severity_rank  = {"argument": 2, "very_loud": 1}
    peak_class     = max(
        (r.audio_classification for r in episode),
        key=lambda c: severity_rank.get(c, 0),
    )

    audio_score    = min(peak_sustained / MAX_SUSTAINED_SEC, 1.0)
    severity       = _severity_from_score(audio_score)

    if peak_sustained > 0:
        explanation = (
            f"Sustained elevated cabin audio ({peak_db:.0f} dB) "
            f"for {peak_sustained:.0f}s."
        )
    else:
        explanation = f"Audio spike detected ({peak_db:.0f} dB). No sustained duration recorded."
    context = f"Audio: {peak_class}"

    return AudioFlag(
        trip_id=episode[0].trip_id,
        timestamp=episode[0].timestamp,
        elapsed_seconds=episode[0].elapsed_seconds,
        flag_type="audio_spike",
        severity=severity,
        motion_score=0.0,
        audio_score=round(audio_score, 2),
        combined_score=round(audio_score, 2),
        explanation=explanation,
        context=context,
        peak_db=peak_db,
        peak_sustained_sec=peak_sustained,
        peak_classification=peak_class,
    )


def detect_episodes(readings: List[AudioReading]) -> List[AudioFlag]:
    """
    Scan one trip's sorted readings and return one AudioFlag per episode.

    Episode rules:
      - starts when a reading is "high"
      - continues as long as the next high reading is within MAX_EPISODE_GAP_SEC
      - ends (and a new one may start) when the gap is exceeded or the trip ends
    """
    flags: List[AudioFlag] = []
    episode: List[AudioReading] = []

    for reading in readings:
        if _is_high(reading):
            if episode and (reading.elapsed_seconds - episode[-1].elapsed_seconds) > MAX_EPISODE_GAP_SEC:
                # gap too large → close current episode, start fresh
                flags.append(_finalize_episode(episode))
                episode = []
            episode.append(reading)
        else:
            if episode:
                flags.append(_finalize_episode(episode))
                episode = []

    if episode:  # trip ended while episode was still active
        flags.append(_finalize_episode(episode))

    return flags


# ── Entry point ───────────────────────────────────────────────────────────────

def run_audio_detection(
    input_path: str,
    output_path: Optional[str] = None,
) -> List[AudioFlag]:
    """
    Run the full audio detection pipeline.

    Args:
        input_path:  path to audio_intensity_data.csv
        output_path: if provided, write results to this CSV path

    Returns:
        List of AudioFlag records, one per detected high-audio episode.
    """
    trips = load_audio_data(input_path)

    all_flags: List[AudioFlag] = []
    for readings in trips.values():
        all_flags.extend(detect_episodes(readings))

    # stable output order: by trip_id then timestamp
    all_flags.sort(key=lambda f: (f.trip_id, f.elapsed_seconds))

    if output_path:
        _write_csv(all_flags, output_path)
        print(f"[audio_detector] Wrote {len(all_flags)} flags → {output_path}")

    return all_flags


def _write_csv(flags: List[AudioFlag], path: str) -> None:
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
    input_path  = os.path.join(base, "data", "sensor_data", "audio_intensity_data.csv")
    output_path = os.path.join(base, "outputs", "audio_flags.csv")

    flags = run_audio_detection(input_path, output_path)

    print(f"\nDetected {len(flags)} audio episodes across "
          f"{len(set(f.trip_id for f in flags))} trips\n")

    severity_counts = {"low": 0, "medium": 0, "high": 0}
    for f in flags:
        severity_counts[f.severity] += 1

    print("Severity breakdown:")
    for sev, count in severity_counts.items():
        print(f"  {sev:6s}: {count}")

    print("\nSample flags:")
    for f in flags[:5]:
        print(f"  [{f.severity:6s}] {f.trip_id} @ t={f.elapsed_seconds}s "
              f"| score={f.audio_score:.2f} | {f.explanation}")
