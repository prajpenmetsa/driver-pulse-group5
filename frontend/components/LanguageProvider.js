"use client";

import { LanguageProvider as InnerLanguageProvider } from "./LanguageContext";

export default function LanguageProvider({ children }) {
  return <InnerLanguageProvider>{children}</InnerLanguageProvider>;
}

