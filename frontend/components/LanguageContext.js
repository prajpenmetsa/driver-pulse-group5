"use client";

import { createContext, useContext, useEffect, useState } from "react";

const LanguageContext = createContext();

export const translations = {
  en: {
    languageCode: "en",
    languageLabel: "English",
    dashboard: "Dashboard",
    safety: "Safety Insights",
    earnings: "Earnings",
    trips: "Trips",
    settings: "Settings",
    language: "Language",
    preferredLanguage: "Preferred Language",
    driverPulseScore: "Driver Pulse Score",
    earningsVelocity: "Earnings Velocity",
    dailyProgress: "Daily Progress",
    forecastStatus: "Forecast Status",
    tripsCompleted: "Trips Completed",
    hoursDriven: "Hours Driven",
    calculatingVelocity: "Calculating earnings velocity...",
    velocityAvailableAfter: "Available after 3 trips or 1 hour.",
    tripsTableTripId: "Trip ID",
    tripsTableStart: "Start Location",
    tripsTableEnd: "End Location",
    tripsTableDuration: "Duration",
    tripsTableFare: "Fare",
    tripsTableRating: "Rating",
    safetyHarshBraking: "Harsh Braking",
    safetyModerateBrake: "Moderate Brake",
    safetyAudioArgument: "Audio Argument",
    statusExcellent: "Excellent",
    statusGood: "Good",
    statusModerateRisk: "Moderate Risk",
    statusHighRisk: "High Risk",
    statusAhead: "Ahead",
    statusOnTrack: "On Track",
    statusAtRisk: "At Risk",
    flaggedEvents: "Flagged Events",
    operations: "Operations",
    collectingData: "Collecting data…",
    velocitySuppressionHint:
      "Velocity shown after 3 trips or 1 hour to avoid early-shift inflation.",
  },
  hi: {
    languageCode: "hi",
    languageLabel: "Hindi",
    dashboard: "डैशबोर्ड",
    safety: "सुरक्षा जानकारी",
    earnings: "कमाई",
    trips: "यात्राएँ",
    settings: "सेटिंग्स",
    language: "भाषा",
    preferredLanguage: "पसंदीदा भाषा",
    driverPulseScore: "ड्राइवर पल्स स्कोर",
    earningsVelocity: "कमाई की गति",
    dailyProgress: "दैनिक प्रगति",
    forecastStatus: "पूर्वानुमान स्थिति",
    tripsCompleted: "पूरी की गई यात्राएँ",
    hoursDriven: "चलाई गई घंटे",
    calculatingVelocity: "कमाई की गति की गणना हो रही है...",
    velocityAvailableAfter: "3 यात्राओं या 1 घंटे के बाद उपलब्ध।",
    tripsTableTripId: "यात्रा आईडी",
    tripsTableStart: "प्रारंभ स्थान",
    tripsTableEnd: "समाप्ति स्थान",
    tripsTableDuration: "अवधि",
    tripsTableFare: "किराया",
    tripsTableRating: "रेटिंग",
    safetyHarshBraking: "तेज ब्रेक",
    safetyModerateBrake: "मध्यम ब्रेक",
    safetyAudioArgument: "ऑडियो बहस",
    statusExcellent: "उत्कृष्ट",
    statusGood: "अच्छा",
    statusModerateRisk: "मध्यम जोखिम",
    statusHighRisk: "उच्च जोखिम",
    statusAhead: "आगे",
    statusOnTrack: "पथ पर",
    statusAtRisk: "जोखिम में",
    flaggedEvents: "फ्लैग किए गए इवेंट",
    operations: "ऑपरेशन्स",
    collectingData: "डेटा एकत्र किया जा रहा है…",
    velocitySuppressionHint:
      "कमाई की गति 3 यात्राओं या 1 घंटे के बाद दिखाई जाएगी ताकि शुरुआती शिफ्ट में बढ़ोतरी से बचा जा सके।",
  },
  es: {
    languageCode: "es",
    languageLabel: "Spanish",
    dashboard: "Panel",
    safety: "Seguridad",
    earnings: "Ganancias",
    trips: "Viajes",
    settings: "Configuración",
    language: "Idioma",
    preferredLanguage: "Idioma preferido",
    driverPulseScore: "Puntaje de Pulso",
    earningsVelocity: "Velocidad de ganancias",
    dailyProgress: "Progreso diario",
    forecastStatus: "Estado del pronóstico",
    tripsCompleted: "Viajes completados",
    hoursDriven: "Horas conducidas",
    calculatingVelocity: "Calculando velocidad de ganancias...",
    velocityAvailableAfter: "Disponible después de 3 viajes o 1 hora.",
    tripsTableTripId: "ID de viaje",
    tripsTableStart: "Inicio",
    tripsTableEnd: "Destino",
    tripsTableDuration: "Duración",
    tripsTableFare: "Tarifa",
    tripsTableRating: "Calificación",
    safetyHarshBraking: "Frenado brusco",
    safetyModerateBrake: "Frenado moderado",
    safetyAudioArgument: "Discusión de audio",
    statusExcellent: "Excelente",
    statusGood: "Bueno",
    statusModerateRisk: "Riesgo moderado",
    statusHighRisk: "Alto riesgo",
    statusAhead: "Adelantado",
    statusOnTrack: "En camino",
    statusAtRisk: "En riesgo",
    flaggedEvents: "Eventos marcados",
    operations: "Operaciones",
    collectingData: "Recopilando datos…",
    velocitySuppressionHint:
      "La velocidad se muestra después de 3 viajes o 1 hora para evitar la inflación al inicio del turno.",
  },
};

const LANGUAGE_KEYS = [
  "en",
  "hi",
  "es",
];

const fallbackLabels = {
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("language");
    if (stored && LANGUAGE_KEYS.includes(stored)) {
      setLanguage(stored);
      return;
    }
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang && LANGUAGE_KEYS.includes(browserLang)) {
      setLanguage(browserLang);
      window.localStorage.setItem("language", browserLang);
    }
  }, []);

  const handleChangeLanguage = (code) => {
    setLanguage(code);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("language", code);
    }
  };

  const value = {
    language,
    setLanguage: handleChangeLanguage,
    t: (key) => {
      const pack = translations[language] || translations.en;
      const base = translations.en;
      return pack?.[key] ?? base?.[key] ?? key;
    },
    languages: LANGUAGE_KEYS.map((code) => ({
      code,
      label:
        translations[code]?.languageLabel || fallbackLabels[code] || code,
    })),
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
