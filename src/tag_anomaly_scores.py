"""
tag_anomaly_scores.py
---------------------
Takes inference_vs_ground_truth.csv and adds three driver-facing columns:

    risk_score     — anomaly_score scaled to 0–10 (1 decimal place)
    signal_driver  — what drove the score: motion | audio | combined | none
    driver_guidance — actionable, empathetic tag + message for the driver

Risk scale:
    0.0–2.0   smooth_trip       "Trip running smoothly."
    2.1–4.0   mild_signal       "Minor disturbance picked up — nothing to worry about yet."
    4.1–5.5   elevated_stress   "Stress signal detected. Take a breath — you're doing fine."
    5.6–7.0   notable_event     "Notable moment flagged. This may affect your trip quality score."
    7.1–8.5   high_stress       "High stress detected. Your wellbeing matters — pace yourself."
    8.6–10.0  critical_moment   "Significant event on this trip. Review it after your shift."

signal_driver logic:
    has_motion=True  AND has_audio=False  → motion
    has_motion=False AND has_audio=True   → audio
    has_motion=True  AND has_audio=True   → combined
    neither                                → none
"""

import csv
from pathlib import Path

IN_CSV  = Path(__file__).parent.parent / "outputs" / "combined" / "inference_vs_ground_truth.csv"
OUT_CSV = Path(__file__).parent.parent / "outputs" / "combined" / "inference_tagged.csv"


# ── Threshold definitions ─────────────────────────────────────────────────────

THRESHOLDS = [
    # (max_risk_score, tag, guidance)
    (2.0,  "smooth_trip",
     "Trip running smoothly."),

    (4.0,  "mild_signal",
     "Minor disturbance picked up — nothing to worry about yet."),

    (5.5,  "elevated_stress",
     "Stress signal detected. Take a breath — you're doing fine."),

    (7.0,  "notable_event",
     "Notable moment flagged. This may affect your trip quality score."),

    (8.5,  "high_stress",
     "High stress detected. Your wellbeing matters — pace yourself."),

    (10.0, "critical_moment",
     "Significant event on this trip. Review it after your shift."),
]

# Per-signal-type detail appended when the tag is notable_event or above
SIGNAL_DETAIL = {
    "motion":   "Flagged by: sharp maneuver.",
    "audio":    "Flagged by: elevated cabin noise.",
    "combined": "Flagged by: sharp maneuver and elevated cabin noise.",
    "none":     "",
}


def risk_score(anomaly_score: float) -> float:
    """Scale anomaly_score (0–1) to 0–10, 1 decimal place."""
    return round(anomaly_score * 10, 1)


def signal_driver(has_motion: str, has_audio: str) -> str:
    m = has_motion.strip().lower() == "true"
    a = has_audio.strip().lower()  == "true"
    if m and a:
        return "combined"
    if m:
        return "motion"
    if a:
        return "audio"
    return "none"


def tag(rs: float, sig: str) -> tuple[str, str]:
    """Return (tag_label, full_guidance_string)."""
    for max_rs, label, base_msg in THRESHOLDS:
        if rs <= max_rs:
            # Append signal detail only when the event is notable or worse
            if rs > 5.5 and SIGNAL_DETAIL[sig]:
                guidance = f"{base_msg} {SIGNAL_DETAIL[sig]}"
            else:
                guidance = base_msg
            return label, guidance
    # Fallback (shouldn't happen)
    return "critical_moment", THRESHOLDS[-1][2]


def run():
    with open(IN_CSV, newline="") as f:
        rows = list(csv.DictReader(f))

    tagged = []
    for r in rows:
        rs  = risk_score(float(r["anomaly_score"]))
        sig = signal_driver(r["has_motion"], r["has_audio"])
        label, guidance = tag(rs, sig)

        tagged.append({
            **r,
            "risk_score":      rs,
            "signal_driver":   sig,
            "risk_tag":        label,
            "driver_guidance": guidance,
        })

    with open(OUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=tagged[0].keys())
        writer.writeheader()
        writer.writerows(tagged)

    print(f"Written: {OUT_CSV}  ({len(tagged)} rows)")

    # ── Summary ───────────────────────────────────────────────────────────────
    from collections import Counter
    tag_counts = Counter(r["risk_tag"] for r in tagged)
    sig_counts = Counter(r["signal_driver"] for r in tagged)

    print("\n--- Risk tag distribution ---")
    for max_rs, label, _ in THRESHOLDS:
        c = tag_counts.get(label, 0)
        print(f"  {label:20s}: {c:4d}  ({c/len(tagged)*100:.1f}%)")

    print("\n--- Signal driver distribution ---")
    for sig, c in sig_counts.most_common():
        print(f"  {sig:10s}: {c:4d}  ({c/len(tagged)*100:.1f}%)")

    print("\n--- Sample rows (one per tag) ---")
    seen = set()
    for r in sorted(tagged, key=lambda x: float(x["risk_score"]), reverse=True):
        if r["risk_tag"] not in seen:
            seen.add(r["risk_tag"])
            print(f"  [{r['risk_score']:4.1f}] {r['risk_tag']:20s} | "
                  f"sig={r['signal_driver']:8s} | {r['trip_id']} t={r['elapsed_seconds']}s")
            print(f"         → \"{r['driver_guidance']}\"")
    print()

    # ── TP/FP/FN rows with tags (so we can see how tags map to model correctness) ---
    print("--- Tag distribution by result ---")
    result_tags: dict = {}
    for r in tagged:
        result_tags.setdefault(r["result"], Counter())[r["risk_tag"]] += 1
    for result in ["TP", "TN", "FP", "FN"]:
        if result in result_tags:
            top = result_tags[result].most_common(3)
            print(f"  {result}: {dict(top)}")


if __name__ == "__main__":
    run()
