# Driver Pulse — Engineering Handoff
> Team 5

Driver Pulse gives rideshare drivers a clearer picture of two things that matter during every shift: how stressful individual trip moments were, and whether their earnings pace is on track. It works entirely from signals already present on the phone — motion patterns and aggregated cabin audio levels — without recording conversations or judging driver behaviour.

---

## Live Demo & Video

- **Deployment:** `[DEPLOYMENT LINK PLACEHOLDER]`
- **Demo video:** `[DEMO VIDEO LINK PLACEHOLDER]`

---

## Table of Contents

1. [Repo Structure](#repo-structure)
2. [Setup](#setup)
3. [Running the Pipeline](#running-the-pipeline)
4. [Output Files](#output-files)
5. [System Architecture](#system-architecture)
6. [Algorithmic Decisions](#algorithmic-decisions)
7. [Trade-offs — Critical Analysis](#trade-offs--critical-analysis)
8. [Privacy Constraints](#privacy-constraints)

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
├── src/                           # Core pipeline modules
│   ├── audio_detector.py          # Detects high-audio episodes per trip
│   ├── motion_detector.py         # Detects harsh driving events per trip
│   ├── signal_combiner.py         # Time-window join + Isolation Forest training/inference
│   ├── tag_anomaly_scores.py      # Scales anomaly score → 0–10 + driver guidance tags
│   └── earnings_engine.py         # Earnings velocity and goal forecasting
│
├── preprocessing/
│   ├── exploration_notes.txt      # Full data exploration findings
│   └── generate_audio_data.py     # Synthetic audio dataset expansion (MELAUDIS-calibrated)
│
│
└── outputs/
    ├── audio/
    │   ├── audio_flags.csv             # Detected audio episodes (original 30 trips)
    │   └── audio_flags_expanded.csv    # Expanded to 1000 events, 50 trips using MELAUDIS dataset
    │                                       # (https://figshare.com/articles/dataset/_b_MELAUDIS_The_First_Acoustic_ITS_Dataset_in_Urban_Environment_b_/27115870)
    │                                       # Features used: outdoor vehicle dB levels (cars, trams, motorcycles), attenuated 20 dB for in-cabin baseline
    ├── motion/
    │   ├── motion_flags.csv            # Detected motion events (original 30 trips)
    │   └── motion_flags_expanded.csv   # Expanded dataset using Kaggle "Driver Behaviour Analysis Using Sensor" dataset
    │                                       # (https://www.kaggle.com/datasets/eishkaran/driver-behaviour-analysis-using-sensor)
    │                                       # Features used: manuever_acceleration, acc_dir_change
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
pip install numpy pandas scikit-learn soundfile scipy
```

Or if using system Python on macOS:

```bash
pip install numpy pandas scikit-learn soundfile scipy --break-system-packages
```

### Data

All raw data is included in `data/`. No external downloads required to run the pipeline.

The `audio_raw/` folder contains MELAUDIS WAV files used for calibrating synthetic audio distributions. These are required only if re-running `generate_audio_data.py`.

---

## Running the Pipeline

Run modules in this order. Each step reads from the previous step's outputs.

### 1. Detect audio episodes
```bash
python3 src/audio_detector.py
# Output: outputs/audio/audio_flags.csv
```

### 2. Detect motion events
```bash
python3 src/motion_detector.py
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
python3 src/tag_anomaly_scores.py
# Output: outputs/combined/inference_tagged.csv
```

### 6. Earnings velocity
```bash
python3 src/earnings_engine.py
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

## System Architecture

```
Phone sensors (on-device)
    │
    ├── Accelerometer (accel_x/y/z, speed)
    │       ↓
    │   motion_detector.py
    │   • gravity-removed magnitude
    │   • manuever_acceleration (|Δmagnitude|)
    │   • acc_dir_change (angular shift between readings)
    │   • events flagged if magnitude > 2 m/s²
    │
    └── Microphone (aggregated dB only — no raw audio)
            ↓
        audio_detector.py
        • sustained_duration_sec > 0  OR  dB > 82 → high episode
        • episode score = peak_sustained / 180s

            │                    │
            └──────── join ───────┘
                  signal_combiner.py
                  • time-window join: ±30s
                  • 4 features: manuever_acceleration,
                    acc_dir_change, peak_db, peak_sustained_sec
                  • Isolation Forest (unsupervised)
                        │
                        ↓
                  anomaly_score (0–1)
                        │
                  tag_anomaly_scores.py
                        │
                        ↓
              risk_score (0–10) + driver_guidance
                        │
                   Driver app UI
```

**Edge vs cloud:** All detection logic runs on-device (Python scripts deployable as a lightweight inference service). The saved `isolation_forest.pkl` is ~50 KB. Raw audio never leaves the device.

---

## Algorithmic Decisions

### Why Isolation Forest, not a supervised classifier?

We have no real labelled ground truth — the reference `flagged_moments.csv` is itself a synthetic output. Training a supervised model on self-generated labels would produce a model that learns our own rules back, adding no value. Isolation Forest finds statistical outliers in the combined motion + audio feature space without requiring labels.

### Why these four features?

`manuever_acceleration` and `acc_dir_change` capture *directional* changes in force, not just magnitude — a phone lying flat on a seat registers high z-axis during a pothole but low `acc_dir_change`, while genuine sharp braking shifts both. `peak_db` and `peak_sustained_sec` separately capture how loud and how long the cabin noise was elevated, since a brief spike (door slam) and a sustained argument have different implications.

### Why a 30-second join window?

The sensor sampling interval is approximately 30 seconds. A 30-second join window ensures that motion and audio readings from the same physical event are paired, while readings from clearly separate moments (e.g. a bump at t=300s and a loud passenger at t=600s) are not incorrectly combined.

### Why not LSTM / deep learning?

Sampling intervals are 30 seconds and irregular. There is insufficient sequential density for a recurrent model to extract meaningful temporal patterns. Random Forest and Isolation Forest on tabular features are the appropriate tools for this data density.

---

## Trade-offs — Critical Analysis

### 1. Sensor coverage is too sparse to be reliable

Only 30 of 220 trips (14%) have sensor data. The model trains on expanded synthetic data calibrated to real-world distributions, but the expansion is not a substitute for actual trip recordings. Every statistical claim about "normal driving" is based on synthesised data, not observed driver behaviour. A production system would require months of real trip data before the Isolation Forest's notion of "normal" is trustworthy.

### 2. The expanded datasets are not aligned by design

The audio expansion (`generate_audio_data.py`) was generated independently from the motion expansion. They share trip IDs but their timestamps are not derived from the same underlying trip. The 30-second join window pairs readings that happen to fall within a time band, not readings from the same physical second. This means a `combined` window (both sensors matched) does not necessarily represent a moment where both signals were simultaneously elevated — it represents two readings that occurred within 30 seconds of each other on the same trip.

### 3. MELAUDIS calibration is an outdoor-to-indoor approximation

The [MELAUDIS dataset](https://figshare.com/articles/dataset/_b_MELAUDIS_The_First_Acoustic_ITS_Dataset_in_Urban_Environment_b_/27115870) consists of outdoor traffic recordings (cars, trams, motorcycles passing a roadside microphone). We apply a 20 dB cabin attenuation estimate to derive in-cabin baselines. This is a common acoustic engineering approximation but it is not measured for rideshare vehicles specifically. Different car models, window positions, and road surfaces produce different attenuation profiles. The synthetic dB distributions carry this uncertainty.

### 4. Isolation Forest contamination is hand-tuned

The `contamination=0.10` parameter was set manually, implying we expect 10% of windows to be anomalous. This was chosen to roughly match the proportion of flagged moments in the reference output, not from any principled study of how often rideshare trips contain stress events. Setting it higher increases recall but produces more false positives; lower reduces false positives but misses genuine events.

### 5. Anomaly score normalisation is batch-relative

We normalise raw Isolation Forest scores to 0–1 by subtracting the batch minimum and dividing by the batch range. This means the same physical event scores differently depending on what other events are in the inference batch. A high-stress event in a mostly-calm batch scores higher than the same event in a batch containing multiple high-stress trips. For a driver-facing bar, the absolute number could therefore be misleading.

### 6. Precision is 0.06 and recall is 0.03

The model as evaluated is not reliable as a binary classifier. This is partly a threshold problem (lowering the anomaly score cutoff from 0.40 to 0.25 would catch more low-severity GT flags) and partly a data problem (the test set contains only 10 GT flags across 10 trips — too few to draw strong conclusions). The decision to display the raw risk score as a continuous bar rather than a binary flag is a direct response to this limitation: we surface the signal without making a hard claim about whether something dangerous occurred.

### 7. NaN imputation introduces bias

Windows with only one sensor present (motion-only or audio-only) have the missing sensor's features replaced with the column median. This means a window with unusually high motion but no audio reading inherits a median audio value, which could push it above or below the anomaly threshold compared to what a true combined reading would produce. A better approach would be to train separate models for motion-only and audio-only windows, but this requires more data.

### 8. The earnings velocity early-shift inflation is unhandled in the UI

`current_velocity` is mathematically inflated for the first 1–2 trips because elapsed time is small. A driver who earned 300 INR in their first 20 minutes has a computed velocity of 900 INR/hr, which is not a reliable predictor of shift outcome. The earnings engine should suppress velocity display until at least 3 trips or 1 hour of driving have elapsed.

---

## Privacy Constraints

- **No raw audio is stored or transmitted.** The microphone pipeline processes only aggregated dB levels sampled at 30-second intervals.
- **`sustained_duration_sec` is the only audio feature used in the model.** This is a measure of how long noise stayed elevated, not what was said or who was speaking.
- **GPS coordinates** are present in the accelerometer data but are not used in any detection or scoring logic.
- **Driver guidance language** is deliberately non-specific about what was detected — "elevated cabin noise" rather than "argument detected" — because the system cannot distinguish a passenger argument from loud music.
- All inference runs locally. No sensor data needs to leave the device.
