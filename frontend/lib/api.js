/**
 * Driver Pulse — API Layer
 *
 * Reads NEXT_PUBLIC_API_URL from env.
 * If the env var is set, fetches live data from your backend.
 * If not set (or the fetch fails), falls back to mock data from driverData.js.
 *
 * Expected backend endpoints:
 *   GET /api/dashboard          → getDashboardData() shape
 *   GET /api/safety             → getSafetyData() shape
 *   GET /api/earnings           → getEarningsData() shape
 *   GET /api/trips              → getTripsData() shape
 *   GET /api/flagged-events     → getFlaggedEvents() shape
 *   GET /api/anomaly-scores     → getAnomalyScores() shape
 */

import {
  getDashboardData,
  getSafetyData,
  getEarningsData,
  getTripsData,
  getFlaggedEvents,
  getAnomalyScores,
} from './driverData'

const API_URL = process.env.NEXT_PUBLIC_API_URL

async function apiFetch(path, fallback) {
  if (!API_URL) return fallback()
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn(`[Driver Pulse API] ${path} failed, using mock data:`, err.message)
    return fallback()
  }
}

export const api = {
  getDashboard: () => apiFetch('/api/dashboard', getDashboardData),
  getSafety: () => apiFetch('/api/safety', getSafetyData),
  getEarnings: () => apiFetch('/api/earnings', getEarningsData),
  getTrips: () => apiFetch('/api/trips', getTripsData),
  getFlaggedEvents: () => apiFetch('/api/flagged-events', getFlaggedEvents),
  getAnomalyScores: () => apiFetch('/api/anomaly-scores', getAnomalyScores),
}
