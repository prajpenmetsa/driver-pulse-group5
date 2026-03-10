"use client";

import { useLanguage } from "./LanguageContext";

export default function LanguageDropdown({ variant = "full" }) {
  const { language, setLanguage, languages } = useLanguage();
  const current = languages.find((l) => l.code === language);

  return (
    <div className={`language-dropdown language-dropdown-${variant}`}>
      <span className="language-icon" aria-hidden="true">
        🌐
      </span>
      <select
        className="language-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        aria-label="Select language"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
      <span className="language-caret" aria-hidden="true">
        ▾
      </span>
    </div>
  );
}

