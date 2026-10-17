import { SupabaseClient } from '@supabase/supabase-js';

export interface MeetingPointRow {
  id: string;
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  created_at: string | null;
}

export interface MeetingPointPayload {
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

export const DEFAULT_MEETING_POINT_RADIUS_M = 120;

/**
 * Great-circle distance in meters between two lat/long points (haversine formula) — accurate
 * enough at the scale of "how far is this guide from the meeting point" (a few meters to a few
 * km), and never needs anything fancier (ellipsoid correction, etc.) for that use case.
 */
export function haversineDistanceMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const EARTH_RADIUS_M = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

const isValidLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Pulls lat/long out of whatever the owner pasted — a Google Maps URL in one of its common
 * shapes, or just raw "lat,long" text. Tried in order from most to least specific so a URL that
 * happens to also look vaguely like "lat,long" elsewhere in its query string doesn't win over its
 * own, more precise "@lat,long,zoom" segment. Returns null (never throws) when nothing recognizable
 * is found — the caller is expected to show an error and offer "use my current location" or a raw
 * paste instead.
 */
export function parseLatLngFromInput(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // ".../@48.8530,2.3499,17z..." — covers both plain "@lat,long" links AND "/place/Name/@lat,long"
  // links, since the @ segment is in the same place either way.
  const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // "...?q=48.8530,2.3499" or "&q=48.8530,2.3499"
  const qMatch = trimmed.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    const lat = Number(qMatch[1]);
    const lng = Number(qMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Raw "lat,long" (or "lat, long") — the fallback the owner is told to use when a link won't
  // parse. Anchored (^...$) so it only matches a bare coordinate pair, never a substring of a URL
  // that happened to not match either pattern above.
  const rawMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (rawMatch) {
    const lat = Number(rawMatch[1]);
    const lng = Number(rawMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

/**
 * One-shot geolocation fix for the admin "Use my current location" button — unlike
 * getArrivalCoords() in lib/guideArrivals.ts (which must NEVER block recording an arrival and so
 * resolves null on any failure), this one REJECTS with a readable message on denial/timeout/an
 * insecure context, because here the owner is actively waiting on this single value and needs to
 * know why it didn't come through.
 */
export function getBrowserLocation(timeoutMs = 10000): Promise<{ lat: number; lng: number }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Location is not available on this device/browser.'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => reject(new Error(
        error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied.'
          : 'Could not get your current location. Please try again.'
      )),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export interface ArrivalGateResult {
  /** Whether this arrival may be recorded as-is. */
  accepted: boolean;
  /** Distance from the meeting point in meters — null when there was no meeting point to check
      against, or no GPS fix to measure from. */
  distanceM: number | null;
  /** Rejection reason for the guide, or null when accepted. */
  message: string | null;
}

/**
 * The one place the geo-verification decision gets made — pure, so it's testable without any
 * DOM/GPS involved. `coords` structurally matches lib/guideArrivals.ts's ArrivalCoords (duck
 * typed here rather than imported, to avoid a circular import between the two lib files).
 *
 * Rules: no meeting point configured on the session → always accept (unconfigured sessions keep
 * working exactly as before geo-verification existed). A meeting point IS configured → GPS is
 * required; a denied/unavailable fix is a REJECTION here, never a silent accept — that's the
 * opposite of getArrivalCoords()'s own "never block" rule, deliberately: that rule exists so an
 * UNCONFIGURED arrival is never lost to bad GPS, not so a configured one can be faked by turning
 * location off.
 */
export function evaluateArrivalGate(
  coords: { latitude: number; longitude: number } | null,
  meetingPoint: { name: string; latitude: number; longitude: number; radius_m: number } | null,
): ArrivalGateResult {
  if (!meetingPoint) {
    return { accepted: true, distanceM: null, message: null };
  }
  if (!coords) {
    return {
      accepted: false,
      distanceM: null,
      message: `Location is required to verify arrival at ${meetingPoint.name}.`,
    };
  }
  const distanceM = haversineDistanceMeters(coords.latitude, coords.longitude, meetingPoint.latitude, meetingPoint.longitude);
  if (distanceM > meetingPoint.radius_m) {
    return {
      accepted: false,
      distanceM,
      message: `You're ~${Math.round(distanceM)} m from ${meetingPoint.name} — you can only mark arrived at the meeting point.`,
    };
  }
  return { accepted: true, distanceM, message: null };
}

export async function fetchMeetingPoints(supabase: SupabaseClient, userId: string): Promise<MeetingPointRow[]> {
  const { data, error } = await supabase.from('meeting_points').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data || [];
}

export async function addMeetingPoint(
  supabase: SupabaseClient,
  userId: string,
  payload: MeetingPointPayload,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('meeting_points').insert({ user_id: userId, ...payload });
  return { error: error?.message ?? null };
}

export async function updateMeetingPoint(
  supabase: SupabaseClient,
  id: string,
  payload: MeetingPointPayload,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('meeting_points').update(payload).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteMeetingPoint(
  supabase: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('meeting_points').delete().eq('id', id);
  return { error: error?.message ?? null };
}
