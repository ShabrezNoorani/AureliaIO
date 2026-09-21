import { supabase } from './supabase';
import { parseSessionStart } from './tourInvites';

/** The columns both boards actually render — deliberately no `id`, so an optimistic local row
    (not yet persisted, so it has no id) is the same shape as a fetched one. */
export interface ArrivalRow {
  session_id: string;
  guide_id: string;
  arrived_at: string;
  latitude: number | null;
  longitude: number | null;
  meeting_time: string | null;
  minutes_late: number | null;
}

export const ARRIVAL_COLUMNS = 'session_id, guide_id, arrived_at, latitude, longitude, meeting_time, minutes_late';

/** Retry-queue key for one session's arrival. Namespaced so it can never collide with the
    booking_ref keys check-in writes use in the same queue. */
export const arrivalRetryKey = (sessionId: string) => `arrival:${sessionId}`;

export const sessionIdFromArrivalKey = (key: string): string | null =>
  key.startsWith('arrival:') ? key.slice('arrival:'.length) : null;

/**
 * The arrivals equivalent of mergeGuardingPending(): a refresh that lands while an arrival write
 * is still queued must never revert the guide's status back to an un-tapped button. Keyed by
 * session rather than booking_ref.
 */
export function mergeArrivalsGuardingPending(
  serverRows: ArrivalRow[],
  prevRows: ArrivalRow[],
  pendingSessionIds: Set<string>,
): ArrivalRow[] {
  if (pendingSessionIds.size === 0) return serverRows;
  const serverSessionIds = new Set(serverRows.map(r => r.session_id));
  const carriedOver = prevRows.filter(
    r => pendingSessionIds.has(r.session_id) && !serverSessionIds.has(r.session_id),
  );
  return [...serverRows, ...carriedOver];
}

export interface ArrivalCoords {
  latitude: number;
  longitude: number;
}

/**
 * Best-effort geolocation fix. NEVER rejects and never hangs past `timeoutMs` — a denied
 * permission, an unavailable sensor, an insecure context (no navigator.geolocation) or a slow
 * fix all resolve to null so the arrival can still be recorded without coordinates. GPS is
 * decoration on an arrival record, never a precondition for one.
 */
export function getArrivalCoords(timeoutMs = 8000): Promise<ArrivalCoords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  return new Promise<ArrivalCoords | null>(resolve => {
    // Guards the (rare, but observed on mobile Safari) case of a geolocation call that never
    // invokes either callback: whichever lands first wins, and settle() makes the loser a no-op.
    let settled = false;
    const settle = (value: ArrivalCoords | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const fallbackTimer = setTimeout(() => settle(null), timeoutMs + 500);

    navigator.geolocation.getCurrentPosition(
      position => {
        clearTimeout(fallbackTimer);
        settle({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        clearTimeout(fallbackTimer);
        settle(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

/**
 * Whole minutes between the guide's arrival and the session's scheduled meeting time, in the
 * app's local timezone. Negative or 0 = early/on time, positive = late.
 *
 * Returns null when the session has no parsable start_time (it's free text and can be empty or
 * "No Time") — punctuality is meaningless without a schedule to measure against, and inventing
 * a default meeting time would manufacture lateness that never happened.
 *
 * Floored rather than rounded so the number always agrees with the arrival clock time shown
 * beside it: arriving 9:07:45 for a 9:00 meeting reads "Arrived 9:07 — 7 min late", not 8.
 */
export function computeMinutesLate(
  arrivedAt: Date,
  tourDate: string,
  startTime: string | null | undefined,
): number | null {
  const meetingAt = parseSessionStart(tourDate, startTime);
  if (!meetingAt) return null;

  return Math.floor((arrivedAt.getTime() - meetingAt.getTime()) / 60000);
}

/** Local wall-clock "H:MM" — matches the clock the guide is looking at, no timezone surprises. */
export function formatArrivalTime(arrivedAtIso: string): string {
  const d = new Date(arrivedAtIso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * "Arrived 8:58 — on time" / "Arrived 9:07 — 7 min late", or just "Arrived 8:58" when the
 * session had no scheduled time to measure against.
 *
 * `separator` carries its own spacing so callers can pick the joiner ("' — '" on the guide's
 * own big status, "', '" in the owner's denser per-guide list).
 */
export function formatArrivalStatus(
  arrivedAtIso: string,
  minutesLate: number | null,
  separator = ' — ',
): string {
  const time = `Arrived ${formatArrivalTime(arrivedAtIso)}`;
  if (minutesLate === null) return time;
  if (minutesLate <= 0) return `${time}${separator}on time`;
  return `${time}${separator}${minutesLate} min late`;
}

export interface BuildArrivalInput {
  /** The company/owner id that owns the session — guide_arrivals.user_id, not the guide's auth id. */
  ownerUserId: string;
  sessionId: string;
  guideId: string;
  /** Session's tour_date (YYYY-MM-DD) and free-text start_time, straight off tour_sessions. */
  tourDate: string;
  startTime: string | null;
  /** Captured when the guide TAPPED, not when the write finally lands (it may be retried later). */
  arrivedAt: Date;
  coords: ArrivalCoords | null;
}

export interface ArrivalPayload {
  user_id: string;
  session_id: string;
  guide_id: string;
  arrived_at: string;
  latitude: number | null;
  longitude: number | null;
  meeting_time: string | null;
  minutes_late: number | null;
}

export function buildArrivalPayload(input: BuildArrivalInput): ArrivalPayload {
  return {
    user_id: input.ownerUserId,
    session_id: input.sessionId,
    guide_id: input.guideId,
    arrived_at: input.arrivedAt.toISOString(),
    latitude: input.coords?.latitude ?? null,
    longitude: input.coords?.longitude ?? null,
    meeting_time: input.startTime,
    minutes_late: computeMinutesLate(input.arrivedAt, input.tourDate, input.startTime),
  };
}

/**
 * Persists one arrival, enforcing one row per (session_id, guide_id) from the client side:
 * insert-vs-update is re-derived from a fresh read on every call rather than upserted, because
 * no unique constraint on (session_id, guide_id) is assumed to exist (PostgREST's onConflict
 * upsert requires one, and errors 42P10 without it). Same approach writeCheckin() uses.
 *
 * That also makes this safe to run more than once for the same logical arrival: a retry whose
 * original attempt actually succeeded but lost its response finds the row and updates it in
 * place instead of inserting a duplicate.
 */
export async function saveArrival(payload: ArrivalPayload): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('guide_arrivals')
    .select('id')
    .eq('session_id', payload.session_id)
    .eq('guide_id', payload.guide_id)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase.from('guide_arrivals').update(payload).eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('guide_arrivals').insert(payload);
  if (error) throw error;
}
