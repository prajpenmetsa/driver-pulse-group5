import pandas as pd

# Load data
motion = pd.read_csv("outputs/motion/motion_flags.csv")
audio = pd.read_csv("outputs/audio/audio_flags.csv")

# Count events per trip
motion_counts = motion.groupby("trip_id").size().reset_index(name="motion_events")
audio_counts = audio.groupby("trip_id").size().reset_index(name="audio_events")

# Merge motion + audio
summary = pd.merge(motion_counts, audio_counts, on="trip_id", how="outer").fillna(0)

# Convert to integers
summary["motion_events"] = summary["motion_events"].astype(int)
summary["audio_events"] = summary["audio_events"].astype(int)

# Calculate penalties
summary["motion_penalty"] = summary["motion_events"] * 3
summary["audio_penalty"] = summary["audio_events"] * 2

summary["total_penalty"] = summary["motion_penalty"] + summary["audio_penalty"]

# Driver Pulse Score
summary["driver_pulse_score"] = (100 - summary["total_penalty"]).clip(lower=0)

# Status category
def get_status(score):
    if score >= 85:
        return "ahead"
    elif score >= 60:
        return "on_track"
    else:
        return "at_risk"

summary["status"] = summary["driver_pulse_score"].apply(get_status)

# Save result
output_file = "outputs/driver_pulse_summary.csv"
summary.to_csv(output_file, index=False)

print("Driver Pulse summary created successfully")