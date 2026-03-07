"""
signal_combiner.py
------------------
Joins expanded motion and audio datasets by trip + time window,
then trains an Isolation Forest on the combined features to detect
anomalous (high-stress / conflict) moments without requiring labels.

Inputs:
    outputs/motion/motion_flags_expanded.csv
    outputs/audio/audio_flags_expanded.csv

Outputs:
    outputs/combined/combined_windows.csv   — joined feature table
    outputs/combined/anomaly_scores.csv     — scored + flagged windows
    outputs/combined/isolation_forest.pkl   — saved model

Key features for Isolation Forest:
    manuever_acceleration  — magnitude of directional accel change (m/s²)
    acc_dir_change         — angular direction change between readings (rad)
    peak_db                — cabin audio level (dB)
    peak_sustained_sec     — how long audio stayed elevated (s)
"""

import csv
import pickle
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

# ── Paths ─────────────────────────────────────────────────────────────────────

REPO        = Path(__file__).parent.parent
MOTION_CSV  = REPO / "outputs" / "motion" / "motion_flags_expanded.csv"
AUDIO_CSV   = REPO / "outputs" / "audio"  / "audio_flags_expanded.csv"
OUT_DIR     = REPO / "outputs" / "combined"
OUT_WINDOWS = OUT_DIR / "combined_windows.csv"
OUT_SCORES  = OUT_DIR / "anomaly_scores.csv"
OUT_MODEL   = OUT_DIR / "isolation_forest.pkl"

WINDOW_SEC      = 30     # max seconds between motion and audio reading to join
CONTAMINATION   = 0.10   # expected fraction of anomalous windows (~10%)
RANDOM_STATE    = 42

FEATURES = ["manuever_acceleration", "acc_dir_change",
            "peak_db", "peak_sustained_sec"]


# ── Loading ───────────────────────────────────────────────────────────────────

def load_motion(path: Path) -> dict[str, list[dict]]:
    """
    Load motion CSV. Convert absolute Timestamp → elapsed_seconds
    by subtracting each trip's first timestamp.
    Returns {trip_id: [row, ...]} sorted by elapsed_seconds.
    """
    by_trip = defaultdict(list)
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            by_trip[row["trip_id"]].append(row)

    result = {}
    def parse_ts(s: str) -> datetime:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M"):
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                pass
        raise ValueError(f"Unrecognised timestamp: {s!r}")

    for tid, rows in by_trip.items():
        rows.sort(key=lambda r: parse_ts(r["Timestamp"]))
        t0 = parse_ts(rows[0]["Timestamp"])
        processed = []
        for r in rows:
            t  = parse_ts(r["Timestamp"])
            el = int((t - t0).total_seconds())
            processed.append({
                "trip_id":              tid,
                "elapsed_seconds":      el,
                "manuever_acceleration": float(r["manuever_acceleration"]) if r["manuever_acceleration"] else 0.0,
                "acc_dir_change":        float(r["acc_dir_change"])        if r["acc_dir_change"]        else 0.0,
            })
        result[tid] = processed
    return result


def load_audio(path: Path) -> dict[str, list[dict]]:
    """
    Load audio CSV. Returns {trip_id: [row, ...]} sorted by elapsed_seconds.
    """
    by_trip = defaultdict(list)
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            by_trip[row["trip_id"]].append({
                "trip_id":              row["trip_id"],
                "elapsed_seconds":      int(row["elapsed_seconds"]),
                "peak_db":              float(row["peak_db"]),
                "peak_sustained_sec":   float(row["peak_sustained_sec"]),
                "audio_score":          float(row["audio_score"]),
                "peak_classification":  row["peak_classification"],
                "severity":             row["severity"],
            })

    for rows in by_trip.values():
        rows.sort(key=lambda r: r["elapsed_seconds"])
    return by_trip


# ── Time-window join ──────────────────────────────────────────────────────────

def nearest_audio(audio_rows: list[dict], elapsed: int) -> Optional[dict]:
    """
    Binary-search for the audio reading closest in time to `elapsed`.
    Returns it only if within WINDOW_SEC; otherwise None.
    """
    if not audio_rows:
        return None

    lo, hi = 0, len(audio_rows) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if audio_rows[mid]["elapsed_seconds"] < elapsed:
            lo = mid + 1
        else:
            hi = mid

    # check lo and lo-1
    candidates = [audio_rows[lo]]
    if lo > 0:
        candidates.append(audio_rows[lo - 1])

    best = min(candidates, key=lambda r: abs(r["elapsed_seconds"] - elapsed))
    if abs(best["elapsed_seconds"] - elapsed) <= WINDOW_SEC:
        return best
    return None


def join(motion: dict, audio: dict) -> list[dict]:
    """
    For each motion reading, find nearest audio within WINDOW_SEC.
    Produces one combined row per motion reading.
    Audio-only trips are appended as motion-null rows.
    """
    windows = []
    matched_audio_keys = set()   # (trip_id, elapsed) to avoid duplicates

    # ── Motion-anchored join ──────────────────────────────────────────────────
    for tid, m_rows in motion.items():
        a_rows = audio.get(tid, [])
        for m in m_rows:
            a = nearest_audio(a_rows, m["elapsed_seconds"])
            row = {
                "trip_id":               tid,
                "elapsed_seconds":       m["elapsed_seconds"],
                # motion features
                "manuever_acceleration": m["manuever_acceleration"],
                "acc_dir_change":        m["acc_dir_change"],
                # audio features (NaN if no match)
                "peak_db":               a["peak_db"]            if a else np.nan,
                "peak_sustained_sec":    a["peak_sustained_sec"] if a else np.nan,
                "audio_score":           a["audio_score"]        if a else np.nan,
                "peak_classification":   a["peak_classification"] if a else "",
                "audio_severity":        a["severity"]           if a else "",
                "has_motion":            True,
                "has_audio":             a is not None,
            }
            windows.append(row)
            if a:
                matched_audio_keys.add((tid, a["elapsed_seconds"]))

    # ── Audio-only rows (trips with no motion data) ───────────────────────────
    for tid, a_rows in audio.items():
        if tid in motion:
            continue   # already handled above
        for a in a_rows:
            windows.append({
                "trip_id":               tid,
                "elapsed_seconds":       a["elapsed_seconds"],
                "manuever_acceleration": np.nan,
                "acc_dir_change":        np.nan,
                "peak_db":               a["peak_db"],
                "peak_sustained_sec":    a["peak_sustained_sec"],
                "audio_score":           a["audio_score"],
                "peak_classification":   a["peak_classification"],
                "audio_severity":        a["severity"],
                "has_motion":            False,
                "has_audio":             True,
            })

    windows.sort(key=lambda r: (r["trip_id"], r["elapsed_seconds"]))
    return windows


# ── Isolation Forest ──────────────────────────────────────────────────────────

def impute(X: np.ndarray) -> np.ndarray:
    """Replace NaN with column median (simple imputation for missing sensor)."""
    for col in range(X.shape[1]):
        col_data = X[:, col]
        median   = np.nanmedian(col_data)
        col_data[np.isnan(col_data)] = median
        X[:, col] = col_data
    return X


def train_isolation_forest(windows: list[dict]):
    """
    Train Isolation Forest on the four key features.
    Returns (model, scaler, scores_array).
    """
    X_raw = np.array([
        [w["manuever_acceleration"], w["acc_dir_change"],
         w["peak_db"], w["peak_sustained_sec"]]
        for w in windows
    ], dtype=float)

    X = impute(X_raw)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(X_scaled)

    # decision_function: lower (more negative) = more anomalous
    raw_scores  = model.decision_function(X_scaled)
    predictions = model.predict(X_scaled)   # -1 = anomaly, 1 = normal

    # Normalise raw_scores to 0–1 anomaly score (1 = most anomalous)
    lo, hi = raw_scores.min(), raw_scores.max()
    anomaly_scores = 1.0 - (raw_scores - lo) / (hi - lo + 1e-9)

    return model, scaler, anomaly_scores, predictions


def severity_from_anomaly(score: float) -> str:
    if score > 0.75:
        return "high"
    if score > 0.55:
        return "medium"
    if score > 0.40:
        return "low"
    return "none"


# ── Output helpers ────────────────────────────────────────────────────────────

def write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)


def _fmt(v) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    if isinstance(v, float):
        return f"{v:.4f}"
    return str(v)


# ── Train / test split by trip ────────────────────────────────────────────────

def trip_split(windows: list[dict], test_frac: float = 0.2, seed: int = RANDOM_STATE):
    """
    Split windows into train / test by trip_id (never splits a trip across sets).
    Returns (train_windows, test_windows, train_trip_ids, test_trip_ids).
    """
    all_trips = sorted(set(w["trip_id"] for w in windows))
    rng = np.random.default_rng(seed)
    rng.shuffle(all_trips)

    n_test  = max(1, int(len(all_trips) * test_frac))
    test_ids  = set(all_trips[:n_test])
    train_ids = set(all_trips[n_test:])

    train = [w for w in windows if w["trip_id"] in train_ids]
    test  = [w for w in windows if w["trip_id"] in test_ids]
    return train, test, train_ids, test_ids


# ── Main ──────────────────────────────────────────────────────────────────────

def run(motion_path=MOTION_CSV, audio_path=AUDIO_CSV):
    print("[1/5] Loading data...")
    motion = load_motion(motion_path)
    audio  = load_audio(audio_path)
    print(f"      Motion: {sum(len(v) for v in motion.values())} readings, "
          f"{len(motion)} trips")
    print(f"      Audio:  {sum(len(v) for v in audio.values())} readings, "
          f"{len(audio)} trips")

    print("\n[2/5] Time-window join (±30s)...")
    windows = join(motion, audio)
    both   = sum(1 for w in windows if w["has_motion"] and w["has_audio"])
    m_only = sum(1 for w in windows if w["has_motion"] and not w["has_audio"])
    a_only = sum(1 for w in windows if not w["has_motion"] and w["has_audio"])
    print(f"      Total windows: {len(windows)}")
    print(f"        both sensors : {both}")
    print(f"        motion only  : {m_only}")
    print(f"        audio only   : {a_only}")

    write_csv(
        [{k: _fmt(v) if isinstance(v, float) else v for k, v in w.items()}
         for w in windows],
        OUT_WINDOWS,
    )
    print(f"      Written → {OUT_WINDOWS}")

    print("\n[3/5] Train / test split (80 / 20 by trip)...")
    train_w, test_w, train_ids, test_ids = trip_split(windows, test_frac=0.2)
    print(f"      Train: {len(train_w)} windows across {len(train_ids)} trips")
    print(f"      Test:  {len(test_w)}  windows across {len(test_ids)}  trips")
    print(f"      Test trips: {sorted(test_ids)}")

    print("\n[4/5] Training Isolation Forest on train set...")
    model, scaler, train_scores, train_preds = train_isolation_forest(train_w)
    n_anom_train = int((train_preds == -1).sum())
    print(f"      Train anomalies: {n_anom_train} / {len(train_w)} "
          f"({n_anom_train/len(train_w)*100:.1f}%)")

    # ── Inference on held-out test set ───────────────────────────────────────
    print("\n[5/5] Inference on held-out test set...")
    X_test_raw = np.array([
        [w["manuever_acceleration"], w["acc_dir_change"],
         w["peak_db"], w["peak_sustained_sec"]]
        for w in test_w
    ], dtype=float)
    X_test = impute(X_test_raw)
    X_test_scaled    = scaler.transform(X_test)
    test_raw_scores  = model.decision_function(X_test_scaled)
    test_preds       = model.predict(X_test_scaled)

    lo = test_raw_scores.min(); hi = test_raw_scores.max()
    test_scores = 1.0 - (test_raw_scores - lo) / (hi - lo + 1e-9)

    n_anom_test = int((test_preds == -1).sum())
    print(f"      Test  anomalies: {n_anom_test} / {len(test_w)} "
          f"({n_anom_test/len(test_w)*100:.1f}%)")
    print(f"      Test anomaly score: min={test_scores.min():.3f}  "
          f"max={test_scores.max():.3f}  mean={test_scores.mean():.3f}")

    # ── Write inference results ───────────────────────────────────────────────
    scored = []
    for w, score, pred in zip(test_w, test_scores, test_preds):
        sev = severity_from_anomaly(float(score))
        scored.append({
            "trip_id":               w["trip_id"],
            "elapsed_seconds":       w["elapsed_seconds"],
            "manuever_acceleration": _fmt(w["manuever_acceleration"]),
            "acc_dir_change":        _fmt(w["acc_dir_change"]),
            "peak_db":               _fmt(w["peak_db"]),
            "peak_sustained_sec":    _fmt(w["peak_sustained_sec"]),
            "audio_score":           _fmt(w["audio_score"]),
            "peak_classification":   w["peak_classification"],
            "has_motion":            w["has_motion"],
            "has_audio":             w["has_audio"],
            "anomaly_score":         f"{score:.4f}",
            "is_anomaly":            pred == -1,
            "severity":              sev,
            "split":                 "test",
        })

    write_csv(scored, OUT_SCORES)
    print(f"      Written → {OUT_SCORES}")

    OUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_MODEL, "wb") as f:
        pickle.dump({"model": model, "scaler": scaler, "features": FEATURES,
                     "train_trips": sorted(train_ids),
                     "test_trips":  sorted(test_ids)}, f)
    print(f"      Model  → {OUT_MODEL}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== Top 10 anomalous windows (test set) ===")
    top = sorted(scored, key=lambda r: float(r["anomaly_score"]), reverse=True)[:10]
    print(f"  {'trip':8s}  {'t(s)':6s}  {'score':6s}  {'sev':6s}  "
          f"{'man_acc':8s}  {'dir_chg':8s}  {'dB':6s}  {'sus':6s}  classification")
    for r in top:
        print(f"  {r['trip_id']:8s}  {r['elapsed_seconds']:6}  "
              f"{float(r['anomaly_score']):.3f}   {r['severity']:6s}  "
              f"{r['manuever_acceleration']:8s}  {r['acc_dir_change']:8s}  "
              f"{r['peak_db']:6s}  {r['peak_sustained_sec']:6s}  "
              f"{r['peak_classification']}")

    sev_counts = {"high": 0, "medium": 0, "low": 0, "none": 0}
    for r in scored:
        sev_counts[r["severity"]] += 1
    print("\n=== Severity breakdown (test set) ===")
    for s, c in sev_counts.items():
        print(f"  {s:6s}: {c:4d}  ({c/len(scored)*100:.1f}%)")

    return scored, model, scaler


if __name__ == "__main__":
    run()
