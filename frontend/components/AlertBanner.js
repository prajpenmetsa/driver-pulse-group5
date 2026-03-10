'use client'

import Link from 'next/link'

export default function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null

  return (
    <div className="alerts-container">
      {alerts.map((alert) => {
        const isEarningsRisk = alert.id === 'earnings_risk'
        const Wrapper = isEarningsRisk ? Link : 'div'
        const wrapperProps = isEarningsRisk ? { href: '/earnings' } : {}

        return (
          <Wrapper
            key={alert.id}
            className={`alert-banner alert-${alert.severity} ${isEarningsRisk ? 'alert-clickable' : ''}`}
            role="alert"
            {...wrapperProps}
          >
            <svg
              className="alert-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="alert-message">{alert.message}</span>
            {isEarningsRisk && (
              <span className="alert-cta">
                View earnings →
              </span>
            )}
          </Wrapper>
        )
      })}
    </div>
  )
}
