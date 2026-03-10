'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import LanguageDropdown from './LanguageDropdown'
import { useLanguage } from './LanguageContext'
import { getDashboardData } from '../lib/driverData'
import IconButton from './IconButton'

function resolveTitle(pathname, t) {
  if (pathname === '/') return t('dashboard')
  if (pathname.startsWith('/safety')) return t('safety')
  if (pathname.startsWith('/earnings')) return t('earnings')
  if (pathname.startsWith('/trips')) return t('trips')
  if (pathname.startsWith('/flagged-events')) return t('flaggedEvents')
  if (pathname.startsWith('/settings')) return t('settings')
  return 'Driver Pulse'
}

export default function Header() {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [time, setTime] = useState('')
  const [q, setQ] = useState('')

  const dashData = useMemo(() => {
    try { return getDashboardData() } catch { return null }
  }, [])

  const driverName = dashData?.driverName || 'Driver'
  const pulseScore = dashData?.pulseScore ?? null
  const forecastStatus = dashData?.forecastStatus

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  const scoreTone =
    pulseScore >= 90 ? '#22c55e' : pulseScore >= 75 ? '#f59e0b' : '#ef4444'

  return (
    <header className="top-nav" role="banner">
      <div className="top-nav-left">
        <div className="top-nav-title">{resolveTitle(pathname, t)}</div>
        <div className="top-nav-meta">
          <span className="shift-dot" aria-hidden="true" />
          <span className="top-nav-subtitle">Shift Active · {time}</span>
        </div>
      </div>

      <div className="header-right">
        {pulseScore !== null && (
          <div className="pulse-chip" title="Driver Pulse Score">
            <span className="pulse-chip-label">Pulse</span>
            <span className="pulse-chip-score" style={{ color: scoreTone }}>{pulseScore}</span>
            {forecastStatus && (
              <span
                className="pulse-chip-status"
                style={{
                  background:
                    forecastStatus.status === 'ahead' ? 'rgba(34,197,94,0.12)' :
                    forecastStatus.status === 'at_risk' ? 'rgba(239,68,68,0.12)' :
                    'rgba(245,158,11,0.12)',
                  color:
                    forecastStatus.status === 'ahead' ? '#15803d' :
                    forecastStatus.status === 'at_risk' ? '#991b1b' :
                    '#92400e',
                }}
              >
                {forecastStatus.label}
              </span>
            )}
          </div>
        )}

        <div className="search-pill" role="search" aria-label="Search">
          <span aria-hidden="true">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search trips, zones, metrics…"
            aria-label="Search"
          />
        </div>

        <LanguageDropdown variant="compact" />

        <div className="top-nav-divider" aria-hidden="true" />

        <IconButton
          ariaLabel="Notifications"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
          onClick={() => {}}
        />

        <div className="user-chip" role="group" aria-label="User">
          <div className="user-avatar" aria-hidden="true">
            {driverName?.slice(0, 1)?.toUpperCase() || 'D'}
          </div>
          <div className="user-chip-meta">
            <div className="user-chip-name">{driverName}</div>
            <div className="user-chip-sub">{t('operations')}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
