"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./LanguageContext";

const NAV_ITEMS = [
  { href: "/", key: "dashboard", icon: "📊" },
  { href: "/safety", key: "safety", icon: "🛡️" },
  { href: "/earnings", key: "earnings", icon: "💰" },
  { href: "/trips", key: "trips", icon: "🚗" },
  { href: "/flagged-events", key: "flaggedEvents", icon: "🚨" },
  { href: "/settings", key: "settings", icon: "⚙️" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo-circle">DP</div>
        <div className="sidebar-title-group">
          <span className="sidebar-title">Driver Pulse</span>
          <span className="sidebar-subtitle">Operations</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span className="sidebar-link-label">{t(item.key)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
