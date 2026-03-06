# src/earnings_engine.py
"""
Robust earnings engine.
Reads:
  - data/earnings/earnings_velocity_log.csv
  - data/earnings/driver_goals.csv
  - data/trips/trips.csv

Produces:
  - outputs/trip_summaries.csv

Drop this file in src/ and run:
    python src/earnings_engine.py
"""
import os
import sys
import math
import pandas as pd
from typing import List

# ---------- utils to handle flexible column names ----------

def find_col(df: pd.DataFrame, candidates: List[str], required: bool = False):
    """Return first matching column name from candidates present in df, else None."""
    for c in candidates:
        if c in df.columns:
            return c
    if required:
        raise KeyError(f"None of the expected columns {candidates} found. Available: {list(df.columns)}")
    return None

def safe_to_datetime(series: pd.Series, fmt: str = None):
    """Try to parse datetime robustly; fallback to dateutil if fmt fails."""
    if fmt:
        try:
            return pd.to_datetime(series, format=fmt, errors="coerce")
        except Exception:
            pass
    # fallback
    return pd.to_datetime(series, errors="coerce")

def safe_div(a, b):
    try:
        if b is None or b == 0 or (isinstance(b, float) and math.isnan(b)):
            return 0.0
        return float(a) / float(b)
    except Exception:
        return 0.0

# ---------- core classification rules (as discussed) ----------

def classify_forecast(row):
    delta = row.get("velocity_delta", 0.0)
    elapsed = row.get("elapsed_hours", 0.0)
    target_hours = row.get("target_hours", None)

    # Ahead: velocity_delta > 0 and elapsed_hours >= target_hours (driver already worked enough hours at higher pace)
    if delta > 0 and (target_hours is not None) and elapsed >= target_hours:
        return "ahead"
    # On track: velocity_delta >= 0 and elapsed_hours < target_hours (pace good but still working)
    if delta >= 0 and (target_hours is not None) and elapsed < target_hours:
        return "on_track"
    # If target_hours is missing, simple rule:
    if delta > 0:
        return "ahead"
    if abs(delta) <= 1e-6:
        return "on_track"
    return "at_risk"

# ---------- main pipeline ----------

def run_earnings_engine():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    earnings_path = os.path.join(base, "data", "earnings", "earnings_velocity_log.csv")
    goals_path    = os.path.join(base, "data", "earnings", "driver_goals.csv")
    trips_path    = os.path.join(base, "data", "trips", "trips.csv")
    out_dir       = os.path.join(base, "outputs")
    os.makedirs(out_dir, exist_ok=True)
    output_path   = os.path.join(out_dir, "trip_summaries.csv")

    # load files (fail gracefully with message)
    for p in [earnings_path, goals_path, trips_path]:
        if not os.path.exists(p):
            print(f"[ERROR] required file not found: {p}", file=sys.stderr)
            # continue anyway — don't crash immediately, but inform user
    try:
        earnings_df = pd.read_csv(earnings_path)
    except Exception as e:
        print(f"[ERROR] could not read earnings log: {e}", file=sys.stderr)
        return
    try:
        goals_df = pd.read_csv(goals_path)
    except Exception as e:
        print(f"[WARN] could not read driver goals (continuing with empty goals): {e}", file=sys.stderr)
        goals_df = pd.DataFrame()
    try:
        trips_df = pd.read_csv(trips_path)
    except Exception as e:
        print(f"[WARN] could not read trips file (trips_completed will be 0): {e}", file=sys.stderr)
        trips_df = pd.DataFrame()

    # flexible column mapping for earnings log
    ts_col = find_col(earnings_df, ["timestamp", "time", "datetime", "date_time", "date"], required=False)
    if ts_col:
        earnings_df["__timestamp_raw__"] = earnings_df[ts_col].astype(str)
        earnings_df["timestamp"] = safe_to_datetime(earnings_df["__timestamp_raw__"])
    else:
        earnings_df["timestamp"] = pd.NaT

    # ensure numeric fields exist
    cum_col = find_col(earnings_df, ["cumulative_earnings", "cumulative", "earnings", "current_earnings"], required=False)
    if cum_col is None:
        print("[WARN] cumulative earnings column not found; filling with 0", file=sys.stderr)
        earnings_df["cumulative_earnings"] = 0.0
    else:
        earnings_df["cumulative_earnings"] = pd.to_numeric(earnings_df[cum_col], errors="coerce").fillna(0.0)

    elapsed_col = find_col(earnings_df, ["elapsed_hours", "elapsed_hrs", "elapsed"], required=False)
    if elapsed_col is None:
        print("[WARN] elapsed_hours column not found; attempting to compute from timestamps (not implemented). Setting to 0", file=sys.stderr)
        earnings_df["elapsed_hours"] = 0.0
    else:
        earnings_df["elapsed_hours"] = pd.to_numeric(earnings_df[elapsed_col], errors="coerce").fillna(0.0)

    # driver id mapping
    driver_col = find_col(earnings_df, ["driver_id", "driver", "drv", "driverId"], required=True)
    earnings_df["driver_id"] = earnings_df[driver_col].astype(str)

    # --- goals mapping ---
    # default columns for target earnings/hours
    if not goals_df.empty:
        goals_driver_col = find_col(goals_df, ["driver_id", "driver", "drv"], required=True)
        goals_df["driver_id"] = goals_df[goals_driver_col].astype(str)
        target_earn_col = find_col(goals_df, ["target_earnings", "target", "target_amount", "target_earning"], required=False)
        target_hours_col = find_col(goals_df, ["target_hours", "target_hrs", "target_time_hours", "target_hours_work"], required=False)
        # numeric fallback
        if target_earn_col:
            goals_df["target_earnings"] = pd.to_numeric(goals_df[target_earn_col], errors="coerce").fillna(0.0)
        else:
            goals_df["target_earnings"] = 0.0
        if target_hours_col:
            goals_df["target_hours"] = pd.to_numeric(goals_df[target_hours_col], errors="coerce").fillna(0.0)
        else:
            goals_df["target_hours"] = 0.0
    else:
        # empty goals frame
        goals_df = pd.DataFrame(columns=["driver_id", "target_earnings", "target_hours"])

    # --- trips mapping ---
    # normalize trips end_time to datetime to count completed before given timestamp
    if not trips_df.empty:
        trips_driver_col = find_col(trips_df, ["driver_id", "driver", "drv"], required=True)
        trips_df["driver_id"] = trips_df[trips_driver_col].astype(str)
        end_col = find_col(trips_df, ["end_time", "end", "end_timestamp", "end_datetime"], required=False)
        # sometimes trip file has separate date + end_time ; handle that
        if end_col:
            trips_df["__end_raw__"] = trips_df[end_col].astype(str)
            trips_df["end_time"] = safe_to_datetime(trips_df["__end_raw__"])
        else:
            # try combining 'date' + 'end_time'
            date_col = find_col(trips_df, ["date", "trip_date"], required=False)
            end_time_col = find_col(trips_df, ["end_time_local", "end_local", "end_time_str", "end_time"], required=False)
            if date_col and end_time_col:
                combined = trips_df[date_col].astype(str).str.strip() + " " + trips_df[end_time_col].astype(str).str.strip()
                trips_df["end_time"] = safe_to_datetime(combined)
            else:
                trips_df["end_time"] = pd.NaT

        # trip_status column
        trip_status_col = find_col(trips_df, ["trip_status", "status", "ride_status"], required=False)
        if trip_status_col:
            trips_df["trip_status"] = trips_df[trip_status_col].astype(str).str.lower()
        else:
            trips_df["trip_status"] = "completed"  # optimistic default if unknown
    else:
        trips_df["driver_id"] = []
        trips_df["end_time"] = []

    # --- merge earnings with goals ---
    merged = pd.merge(earnings_df, goals_df[["driver_id", "target_earnings", "target_hours"]], on="driver_id", how="left")

    # fill missing target values with 0
    merged["target_earnings"] = merged.get("target_earnings", 0).fillna(0.0)
    merged["target_hours"] = merged.get("target_hours", 0).fillna(0.0)

    # compute velocities safely
    merged["current_velocity"] = merged.apply(lambda r: safe_div(r.get("cumulative_earnings", 0.0), r.get("elapsed_hours", 0.0)), axis=1)
    merged["target_velocity"] = merged.apply(lambda r: safe_div(r.get("target_earnings", 0.0), r.get("target_hours", 0.0)), axis=1)
    merged["velocity_delta"] = merged["current_velocity"] - merged["target_velocity"]

    # trips_completed: count completed trips for same driver with end_time <= earnings timestamp
    trips_completed_list = []
    if trips_df.empty:
        trips_completed_list = [0] * len(merged)
    else:
        # ensure trips_df['end_time'] is datetime
        trips_df["end_time"] = pd.to_datetime(trips_df["end_time"], errors="coerce")
        # for performance, sort trips by end_time
        trips_df_sorted = trips_df.sort_values("end_time")
        # build index by driver to speed repeated filtering
        trips_by_driver = {}
        for d, group in trips_df_sorted.groupby("driver_id"):
            # keep only completed if trip_status is present
            g = group
            if "trip_status" in g.columns:
                g = g[g["trip_status"].str.lower() == "completed"]
            trips_by_driver[d] = g

        for idx, row in merged.iterrows():
            drv = str(row["driver_id"])
            ts = row.get("timestamp", pd.NaT)
            if pd.isna(ts) or drv not in trips_by_driver:
                trips_completed_list.append(0)
                continue
            g = trips_by_driver[drv]
            # count end_time <= ts
            cnt = int(g[g["end_time"].notna() & (g["end_time"] <= ts)].shape[0])
            trips_completed_list.append(cnt)

    merged["trips_completed"] = trips_completed_list

    # forecast status label
    merged["forecast_status"] = merged.apply(lambda r: classify_forecast(r), axis=1)

    # select and order output columns (clean)
    out_cols = [
        "driver_id",
        "timestamp",
        "cumulative_earnings",
        "elapsed_hours",
        "current_velocity",
        "target_earnings",
        "target_hours",
        "target_velocity",
        "velocity_delta",
        "trips_completed",
        "forecast_status"
    ]
    # keep only those that exist
    out_cols = [c for c in out_cols if c in merged.columns]

    result = merged[out_cols].copy()

    # format timestamp column for readability
    if "timestamp" in result.columns:
        result["timestamp"] = pd.to_datetime(result["timestamp"], errors="coerce").dt.strftime("%Y-%m-%d %H:%M:%S")

    # write out
    try:
        result.to_csv(output_path, index=False)
        print(f"[OK] Trip summaries written to: {output_path}")
        print(f"Rows: {len(result)}")
    except Exception as e:
        print(f"[ERROR] Could not write output: {e}", file=sys.stderr)

if __name__ == "__main__":
    run_earnings_engine()