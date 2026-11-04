import {
  LOCATION_FRESHNESS_STATES,
  LOCATION_FRESHNESS_THRESHOLDS_SECONDS
} from '@veerxcape/shared-constants';
import type { LocationFreshnessEvaluation } from '@veerxcape/shared-types';

/**
 * Standardized location freshness evaluator shared across the Mobile App,
 * Authority Portal, Dealer/Company Portal, Admin Console, and Cloud Functions.
 *
 * Rules:
 * - LIVE: location age <= 60s AND heartbeat age <= 90s
 * - RECENT: location age <= 300s (1-5 min) AND heartbeat age <= 600s
 * - STALE: location age > 300s while heartbeat age <= 600s (never labeled as live)
 * - OFFLINE: missing location, or heartbeat age > 600s, or location age > 600s without recent heartbeat
 */
export function computeLocationFreshness(params: {
  lastLocationRecordedAt?: string | null;
  lastHeartbeatAt?: string | null;
  nowMs?: number;
}): LocationFreshnessEvaluation {
  const nowMs = params.nowMs ?? Date.now();

  const parseAgeSec = (iso?: string | null): number | null => {
    if (!iso) return null;
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) return null;
    return Math.max(0, Math.floor((nowMs - parsed) / 1000));
  };

  const locationAgeSeconds = parseAgeSec(params.lastLocationRecordedAt);
  const heartbeatAgeSeconds = parseAgeSec(params.lastHeartbeatAt);

  if (
    locationAgeSeconds === null ||
    (heartbeatAgeSeconds !== null &&
      heartbeatAgeSeconds > LOCATION_FRESHNESS_THRESHOLDS_SECONDS.OFFLINE_HEARTBEAT_AGE_SEC) ||
    (heartbeatAgeSeconds === null &&
      locationAgeSeconds > LOCATION_FRESHNESS_THRESHOLDS_SECONDS.OFFLINE_HEARTBEAT_AGE_SEC)
  ) {
    return {
      state: LOCATION_FRESHNESS_STATES.OFFLINE,
      locationAgeSeconds,
      heartbeatAgeSeconds,
      isLive: false,
      displayLabel:
        locationAgeSeconds !== null
          ? `DEVICE OFFLINE (Last location ${Math.floor(locationAgeSeconds / 60)}m ago)`
          : 'DEVICE OFFLINE (No GNSS Fix Recorded)',
      warningBanner:
        'Device is currently offline. Displayed coordinates represent historical last-known location prior to disconnect.'
    };
  }

  const effectiveHeartbeatAge = heartbeatAgeSeconds ?? locationAgeSeconds;

  if (
    locationAgeSeconds <= LOCATION_FRESHNESS_THRESHOLDS_SECONDS.LIVE_MAX_LOCATION_AGE_SEC &&
    effectiveHeartbeatAge <= LOCATION_FRESHNESS_THRESHOLDS_SECONDS.LIVE_MAX_HEARTBEAT_AGE_SEC
  ) {
    return {
      state: LOCATION_FRESHNESS_STATES.LIVE,
      locationAgeSeconds,
      heartbeatAgeSeconds,
      isLive: true,
      displayLabel: `LIVE (${locationAgeSeconds}s ago)`,
      warningBanner: null
    };
  }

  if (locationAgeSeconds <= LOCATION_FRESHNESS_THRESHOLDS_SECONDS.RECENT_MAX_LOCATION_AGE_SEC) {
    const mins = Math.max(1, Math.floor(locationAgeSeconds / 60));
    return {
      state: LOCATION_FRESHNESS_STATES.RECENT,
      locationAgeSeconds,
      heartbeatAgeSeconds,
      isLive: false,
      displayLabel: `RECENT (Updated ${mins}m ago)`,
      warningBanner: null
    };
  }

  const staleMins = Math.floor(locationAgeSeconds / 60);
  return {
    state: LOCATION_FRESHNESS_STATES.STALE,
    locationAgeSeconds,
    heartbeatAgeSeconds,
    isLive: false,
    displayLabel: `STALE (${staleMins}m old)`,
    warningBanner:
      'Location data is stale (> 5 minutes old). Showing last received coordinates — do not treat as real-time vehicle position.'
  };
}

