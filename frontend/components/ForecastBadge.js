"use client";

import { useLanguage } from "./LanguageContext";

export default function ForecastBadge({ status }) {
  const { t } = useLanguage();
  const normalized = (status || "").toLowerCase();

  let label = t("statusOnTrack");
  let colorClass = "badge-ontrack";

  if (normalized === "ahead") {
    label = t("statusAhead");
    colorClass = "badge-ahead";
  } else if (normalized === "at_risk" || normalized === "at risk") {
    label = t("statusAtRisk");
    colorClass = "badge-atrisk";
  }

  return <span className={`forecast-badge ${colorClass}`}>{label}</span>;
}

