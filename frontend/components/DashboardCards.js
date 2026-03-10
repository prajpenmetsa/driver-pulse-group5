"use client";

import { useMemo } from "react";
import { useLanguage } from "./LanguageContext";
import ProgressBar from "./ProgressBar";
import ForecastBadge from "./ForecastBadge";

const mockDriverData = {
  pulse_score: 88,
  forecast_status: "ahead",
  trips_completed: 5,
  hours_elapsed: 2.2,
  earnings_velocity: 20.71,
  target_velocity: 18,
  safety_events: {
    harsh_braking: 1,
    moderate_brake: 1,
    audio_argument: 1,
  },
};

function computePulseScore(baseScore, safetyEvents, forecastStatus) {
  let score = typeof baseScore === "number" ? baseScore : 100;

  const harsh = safetyEvents?.harsh_braking || 0;
  const moderate = safetyEvents?.moderate_brake || 0;
  const audio = safetyEvents?.audio_argument || 0;

  score -= harsh * 5;
  score -= moderate * 3;
  score -= audio * 4;

  const status = (forecastStatus || "").toLowerCase();
  if (status === "ahead") {
    score += 5;
  } else if (status === "at_risk" || status === "at risk") {
    score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

function resolveScoreLabel(score, t) {
  if (score >= 90) return t("statusExcellent");
  if (score >= 75) return t("statusGood");
  if (score >= 60) return t("statusModerateRisk");
  return t("statusHighRisk");
}

function deriveForecastStatus(earningsVelocity, targetVelocity) {
  if (!targetVelocity || !earningsVelocity) return "on_track";
  const delta = earningsVelocity - targetVelocity;
  if (delta > 1) return "ahead";
  if (delta < -1) return "at_risk";
  return "on_track";
}

export default function DashboardCards() {
  const { t } = useLanguage();

  const {
    pulseScore,
    pulseLabel,
    effectiveForecastStatus,
    showVelocity,
    earningsVelocityDisplay,
    tripsCompleted,
    hoursElapsed,
    safetyEvents,
  } = useMemo(() => {
    const data = mockDriverData;

    const effectiveForecast = deriveForecastStatus(
      data.earnings_velocity,
      data.target_velocity
    );

    const score = computePulseScore(
      data.pulse_score,
      data.safety_events,
      effectiveForecast
    );

    const velocityEligible =
      data.trips_completed >= 3 || data.hours_elapsed >= 1;

    return {
      pulseScore: score,
      pulseLabel: resolveScoreLabel(score, t),
      effectiveForecastStatus: effectiveForecast,
      showVelocity: velocityEligible,
      earningsVelocityDisplay: data.earnings_velocity,
      tripsCompleted: data.trips_completed,
      hoursElapsed: data.hours_elapsed,
      safetyEvents: data.safety_events,
    };
  }, [t]);

  const shiftProgressPercent = Math.min(
    100,
    (tripsCompleted / 12) * 100 || 0
  );

  return (
    <div className="dashboard-grid">
      <section className="card card-hero">
        <div className="card-header">
          <h2 className="card-title">{t("driverPulseScore")}</h2>
        </div>
        <div className="pulse-score-main">
          <div className="pulse-score-value">{pulseScore.toFixed(0)}</div>
          <div className="pulse-score-label">{pulseLabel}</div>
        </div>
        <div className="pulse-score-footer">
          <div className="pulse-score-meta">
            <span className="pulse-score-meta-label">
              {t("forecastStatus")}:
            </span>
            <ForecastBadge status={effectiveForecastStatus} />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title">{t("earningsVelocity")}</h3>
        </div>
        <div className="card-body">
          {showVelocity ? (
            <div className="earnings-velocity-value">
              <span className="currency-symbol">$</span>
              <span className="earnings-velocity-number">
                {earningsVelocityDisplay.toFixed(2)}
              </span>
              <span className="earnings-velocity-unit">/hr</span>
            </div>
          ) : (
            <div className="earnings-velocity-placeholder">
              <div className="placeholder-primary">
                {t("calculatingVelocity")}
              </div>
              <div className="placeholder-secondary">
                {t("velocityAvailableAfter")}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title">{t("dailyProgress")}</h3>
        </div>
        <div className="card-body">
          <div className="progress-row">
            <div className="progress-stat">
              <div className="progress-stat-label">{t("tripsCompleted")}</div>
              <div className="progress-stat-value">{tripsCompleted}</div>
            </div>
            <div className="progress-stat">
              <div className="progress-stat-label">{t("hoursDriven")}</div>
              <div className="progress-stat-value">
                {hoursElapsed.toFixed(1)}
              </div>
            </div>
          </div>
          <ProgressBar value={shiftProgressPercent} />
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h3 className="card-title">{t("forecastStatus")}</h3>
        </div>
        <div className="card-body forecast-summary">
          <ForecastBadge status={effectiveForecastStatus} />
          <ul className="forecast-notes">
            <li>
              {t("safetyHarshBraking")}: {safetyEvents.harsh_braking}
            </li>
            <li>
              {t("safetyModerateBrake")}: {safetyEvents.moderate_brake}
            </li>
            <li>
              {t("safetyAudioArgument")}: {safetyEvents.audio_argument}
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

