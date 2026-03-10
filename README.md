# Driver Pulse — Engineering Handoff
> Team 5

Driver Pulse gives rideshare drivers a clearer picture of two things that matter during every shift: how stressful individual trip moments were, and whether their earnings pace is on track. It works entirely from signals already present on the phone — motion patterns and aggregated cabin audio levels — without recording conversations or judging driver behaviour.

---

## Live Demo & Video

- **Deployment:** `https://driver-pulse-group5-nqflpoo2v-sauryas24s-projects.vercel.app/`
- **Demo video:** `https://drive.google.com/file/d/1CMngr83ZClM1fztDSvjUrKv15n53ZyPv/view?usp=sharing`

---

## Table of Contents

1. [Repo Structure](#repo-structure)
2. [Setup](#setup)
3. [Running the Pipeline](#running-the-pipeline)
4. [Output Files](#output-files)
5. [Algorithmic Decisions](#algorithmic-decisions)
6. [Trade-offs — Critical Analysis](#trade-offs--critical-analysis)
7. [Privacy Constraints](#privacy-constraints)

---

## Repo Structure

```
driver-pulse-group5/
├── data/                          # Raw input data (do not modify)
│   ├── drivers/drivers.csv
│   ├── trips/trips.csv
│   ├── sensor_data/
│   │   ├── accelerometer_data.csv
│   │   └── audio_intensity_data.csv
│   ├── earnings/
│   │   ├── driver_goals.csv
│   │   └── earnings_velocity_log.csv
│   └── processed_outputs/         # Reference outputs (ground truth — not ingested for training)
│       ├── flagged_moments.csv
│       └── trip_summaries.csv
│
├── preprocessing/                 # Signal detection + data expansion
│   ├── audio_processing.py        # Detects high-audio episodes per trip
│   ├── motion_processing.py       # Detects harsh driving events per trip
│   └── generate_audio_data.py     # Synthetic audio dataset expansion (MELAUDIS-calibrated)
│
├── src/                           # Core pipeline modules
│   ├── signal_combiner.py         # Time-window join + Isolation Forest training/inference
│   ├── earnings_engine.py         # Earnings velocity and goal forecasting
│   └── driver_pulse_score.py      # Composite Driver Pulse Score (0–100) per trip
│
├── analytics/                     # Post-processing and scoring
│   ├── tag_anomaly_scores.py      # Scales anomaly score → 0–10 + driver guidance tags
│   └── final_summary.py           # Legacy flat-penalty summary (deprecated)
│
├── api/                           # Backend API server (serves CSV data to frontend)
│   └── server.py                  # Flask REST API — reads pipeline outputs and serves JSON
│
├── frontend/                      # Next.js dashboard
│   ├── app/                       # Page routes (dashboard, safety, earnings, trips, etc.)
│   ├── components/                # Reusable UI components
│   ├── lib/                       # Data layer (api.js, driverData.js)
│   └── outputs/                   # Legacy mock CSVs (unused — frontend reads from API)
│
├── audio_raw/                     # MELAUDIS WAV files for calibrating synthetic audio
│
└── outputs/
    ├── audio/
    │   ├── audio_flags.csv             # Detected audio episodes (original 30 trips)
    │   └── audio_flags_expanded.csv    # Expanded to 1000 events, 50 trips using MELAUDIS dataset
    ├── motion/
    │   ├── motion_flags.csv            # Detected motion events (original 30 trips)
    │   └── motion_flags_expanded.csv   # Expanded dataset using Kaggle dataset
    ├── driver_pulse_scores.csv         # Composite Driver Pulse Score per trip (0–100)
    ├── driver_pulse_summary.csv        # Legacy summary (from analytics/final_summary.py)
    ├── trip_summaries.csv              # Earnings velocity output per driver
    └── combined/
        ├── combined_windows.csv        # Time-window joined feature table (all 50 trips)
        ├── anomaly_scores.csv          # Isolation Forest scores on held-out test set
        ├── inference_vs_ground_truth.csv  # Inference + TP/TN/FP/FN labels
        ├── inference_tagged.csv        # Final output with risk_score, risk_tag, driver_guidance
        └── isolation_forest.pkl        # Saved model + scaler + train/test split metadata
```

---

## Setup

### Prerequisites

- Python 3.9+
- pip

### Install dependencies

```bash
pip install numpy pandas scikit-learn soundfile scipy flask flask-cors
```

Or if using system Python on macOS:

```bash
pip install numpy pandas scikit-learn soundfile scipy flask flask-cors --break-system-packages
```

### Data

All raw data is included in `data/`. No external downloads required to run the pipeline.

The `audio_raw/` folder contains MELAUDIS WAV files used for calibrating synthetic audio distributions. These are required only if re-running `generate_audio_data.py`.

---

## Running the Pipeline

Run modules in this order. Each step reads from the previous step's outputs.

### 1. Detect audio episodes
```bash
python3 preprocessing/audio_processing.py
# Output: outputs/audio/audio_flags.csv
```

### 2. Detect motion events
```bash
python3 preprocessing/motion_processing.py
# Output: outputs/motion/motion_flags.csv
```

### 3. Expand datasets for ML
```bash
python3 preprocessing/generate_audio_data.py
# Output: outputs/audio/audio_flags_expanded.csv
```

> The expanded motion dataset (`outputs/motion/motion_flags_expanded.csv`) was generated from an external real-world driving dataset and is already included in the repo.

### 4. Combine signals + train Isolation Forest
```bash
python3 src/signal_combiner.py
# Outputs:
#   outputs/combined/combined_windows.csv
#   outputs/combined/anomaly_scores.csv    (test set inference)
#   outputs/combined/isolation_forest.pkl
```

### 5. Tag anomaly scores with driver guidance
```bash
python3 analytics/tag_anomaly_scores.py
# Output: outputs/combined/inference_tagged.csv
```

### 6. Earnings velocity
```bash
python3 src/earnings_engine.py
```

### 7. Driver Pulse Score
```bash
python3 src/driver_pulse_score.py
# Output: outputs/driver_pulse_scores.csv
```

### 8. Start the API server
```bash
python3 api/server.py
# Serves JSON endpoints at http://localhost:5001/api/...
```

### 9. Start the frontend
```bash
cd frontend && pnpm install && pnpm dev
# Dashboard at http://localhost:3000
```

---

## Output Files

### `inference_tagged.csv` — primary driver-facing output

| Column | Description |
|---|---|
| `trip_id` | Trip identifier |
| `elapsed_seconds` | Seconds into the trip when the event occurred |
| `anomaly_score` | Raw Isolation Forest score (0.0–1.0) |
| `risk_score` | Scaled to 0–10 (1 decimal place) for driver display |
| `signal_driver` | What drove the score: `motion`, `audio`, or `combined` |
| `risk_tag` | Machine-readable label (e.g. `high_stress`, `smooth_trip`) |
| `driver_guidance` | Actionable, plain-English message shown to the driver |

### Risk scale

| risk_score | risk_tag | driver_guidance |
|---|---|---|
| 0–2 | `smooth_trip` | Trip running smoothly. |
| 2.1–4 | `mild_signal` | Minor disturbance picked up — nothing to worry about yet. |
| 4.1–5.5 | `elevated_stress` | Stress signal detected. Take a breath — you're doing fine. |
| 5.6–7 | `notable_event` | Notable moment flagged. This may affect your trip quality score. |
| 7.1–8.5 | `high_stress` | High stress detected. Your wellbeing matters — pace yourself. |
| 8.6–10 | `critical_moment` | Significant event on this trip. Review it after your shift. |

---

### `driver_pulse_scores.csv` — per-trip composite score

| Column | Description |
|---|---|
| `trip_id` | Trip identifier |
| `driver_id` | Driver identifier |
| `motion_deduction` | Total points deducted for motion events (≤ 0) |
| `audio_deduction` | Total points deducted for audio events (≤ 0) |
| `earnings_adj` | Points added or removed based on earnings velocity |
| `forecast_status` | Driver's earnings pace: `ahead`, `on_track`, or `at_risk` |
| `pulse_score` | Final Driver Pulse Score (0–100) |
| `status` | Interpretation label |
| `motion_events` | Plain-English summary of motion events detected |
| `audio_events` | Plain-English summary of audio events detected |

### Driver Pulse Score — how it is calculated

Every trip starts at **100** and adjustments are applied in three steps:

**Step 1 — Motion penalties** (accelerometer events)

| Event | Penalty |
|---|---|
| `harsh_braking` | −5 |
| `moderate_brake` | −3 |

**Step 2 — Audio penalties** (cabin noise events)

| Classification | Penalty |
|---|---|
| `argument` | −4 |
| `very_loud` | −2 |
| `loud` | −1 |

**Step 3 — Earnings velocity adjustment**

| Forecast status | Adjustment |
|---|---|
| `ahead` | +5 |
| `on_track` | 0 |
| `at_risk` | −5 |

Score is clamped to [0, 100].

**Interpretation scale**

| pulse_score | status |
|---|---|
| 90–100 | Excellent |
| 75–89 | Good |
| 60–74 | Moderate risk |
| < 60 | High risk |

---

