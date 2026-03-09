import pandas as pd

df = pd.read_csv("outputs/combined/anomaly_scores.csv")

# Scale anomaly_score (0–1) to risk_score (0–10)
df["risk_score"] = (df["anomaly_score"] * 10).round(1)

THRESHOLDS = [
    (0,  2,  "all_clear",    "Smooth ride — great job!"),
    (2,  4,  "heads_up",     "Minor disturbance detected — stay alert"),
    (4,  6,  "drive_calmly", "Elevated stress — ease off the brakes, stay composed"),
    (6,  8,  "take_a_break", "High stress detected — consider a short stop soon"),
    (8,  10, "stop_safely",  "Critical event — pull over safely when possible"),
]

def tag(score):
    for lo, hi, label, guidance in THRESHOLDS:
        if score <= hi:
            return label, guidance
    return "stop_safely", "Critical event — pull over safely when possible"

df[["guidance_tag", "driver_guidance"]] = df["risk_score"].apply(
    lambda s: pd.Series(tag(s))
)

df.to_csv("outputs/combined/anomaly_scores.csv", index=False)
print(f"Tagged {len(df)} rows.")
print(df["guidance_tag"].value_counts())
