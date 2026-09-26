import type { SupabaseClient } from '@supabase/supabase-js';
import { isCancelled, shortProductCode } from './utils';

// Auto-populates built tour_sessions with late-arriving bookings that match them, so a booking
// that comes in after Dispatch was last touched still shows up at check-in instead of being
// invisible until someone manually re-opens Dispatch. Purely ADDITIVE to the existing
// session_bookings model — every row this writes is a completely normal session_bookings row
// (allotted_guide_id: null), indistinguishable from one Dispatch created by hand.

export interface AutoPopBooking {
  booking_ref: string;
  product_code: string | null;
  option_name: string | null;
  travel_date: string;
  travel_time: string | null;
  status: string | null;
}

export interface AutoPopSession {
  id: string;
  tour_date: string;
}

export interface AutoPopLink {
  session_id: string;
  booking_ref: string;
}

// Runs product_code through shortProductCode() before keying — an old gsheet row's "P13" and a
// newer Bokun row's "5591586P13" are the same tour and must match as the same option, even though
// their raw product_code strings differ.
const optionKey = (b: { product_code: string | null; option_name: string | null }) =>
  `${shortProductCode(b.product_code) || ''}||${b.option_name || ''}`;

interface SessionProfile {
  optionKeys: Set<string>;
  minTime: string;
  maxTime: string;
}

// A session has no separate "option" or "time window" column (see tour_sessions schema) — Dispatch
// builds a session purely by which bookings the owner puts in it, so that's the only correct
// source for "what does this session match": every (product_code, option_name) pair currently
// linked to it, and the [earliest, latest] travel_time among those links. A session with nothing
// linked yet (freshly created, empty) has no derivable profile and matches nothing until a human
// puts at least one booking in it — same as today's manual-only flow.
function buildSessionProfiles(
  sessions: AutoPopSession[],
  links: AutoPopLink[],
  bookingByRef: Map<string, AutoPopBooking>
): Map<string, SessionProfile> {
  const linkedBookingsBySession = new Map<string, AutoPopBooking[]>();
  links.forEach(link => {
    const b = bookingByRef.get(link.booking_ref);
    if (!b || !b.travel_time) return;
    const arr = linkedBookingsBySession.get(link.session_id) || [];
    arr.push(b);
    linkedBookingsBySession.set(link.session_id, arr);
  });

  const profiles = new Map<string, SessionProfile>();
  sessions.forEach(s => {
    const linked = linkedBookingsBySession.get(s.id);
    if (!linked || linked.length === 0) return;
    const times = linked.map(b => b.travel_time!).sort();
    profiles.set(s.id, {
      optionKeys: new Set(linked.map(optionKey)),
      minTime: times[0],
      maxTime: times[times.length - 1],
    });
  });
  return profiles;
}

/**
 * Pure matching pass — no I/O, so it's independently testable. Given the sessions built so far,
 * which bookings are already linked to them, and today's candidate bookings, returns the
 * (session_id, booking_ref) pairs that should be auto-added: same date, matches an EXISTING
 * (product_code, option_name) pair already in that session, and travel_time falls within that
 * session's derived [min, max] window (inclusive) — see buildSessionProfiles. Cancelled bookings,
 * already-linked bookings, and bookings with no travel_time (nothing to compare a window against)
 * are never matched. When a booking matches more than one session, the first candidate (by the
 * `sessions` array's own order) wins — ambiguity here is expected to be rare and always
 * correctable afterward via the existing manual move controls.
 */
export function matchBookingsToSessions(
  sessions: AutoPopSession[],
  links: AutoPopLink[],
  bookings: AutoPopBooking[]
): AutoPopLink[] {
  const linkedRefs = new Set(links.map(l => l.booking_ref));
  const bookingByRef = new Map(bookings.map(b => [b.booking_ref, b]));
  const profiles = buildSessionProfiles(sessions, links, bookingByRef);

  const sessionsByDate = new Map<string, AutoPopSession[]>();
  sessions.forEach(s => {
    const arr = sessionsByDate.get(s.tour_date) || [];
    arr.push(s);
    sessionsByDate.set(s.tour_date, arr);
  });

  const matches: AutoPopLink[] = [];
  bookings.forEach(b => {
    if (linkedRefs.has(b.booking_ref)) return;
    if (isCancelled(b.status)) return;
    if (!b.travel_time) return;

    const key = optionKey(b);
    const candidates = sessionsByDate.get(b.travel_date) || [];
    const match = candidates.find(s => {
      const profile = profiles.get(s.id);
      if (!profile) return false;
      if (!profile.optionKeys.has(key)) return false;
      return b.travel_time! >= profile.minTime && b.travel_time! <= profile.maxTime;
    });
    if (match) matches.push({ session_id: match.id, booking_ref: b.booking_ref });
  });
  return matches;
}

const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * For a last-minute booking that matched NO built session (see matchBookingsToSessions above —
 * this is the softer fallback used only when a guide/owner explicitly checks such a guest in),
 * ranks today's sessions by: same (product_code, option_name) first, then nearest time to the
 * session's derived window (0 if the booking's travel_time actually falls inside it). Only
 * sessions with a derivable profile (something already linked — see buildSessionProfiles) are
 * considered; a freshly-built, still-empty session has nothing to compare against. Returns null
 * when there's nothing to rank at all (no sessions today, or none has a profile yet) — the caller
 * decides what "no best match" means for them (a guide falls back to their earliest session
 * regardless; an owner leaves the guest in the last-minute area rather than guessing).
 */
export function pickBestSessionForBooking(
  sessions: AutoPopSession[],
  links: AutoPopLink[],
  linkedBookings: AutoPopBooking[],
  booking: AutoPopBooking
): string | null {
  const bookingByRef = new Map(linkedBookings.map(b => [b.booking_ref, b]));
  const profiles = buildSessionProfiles(sessions, links, bookingByRef);
  const key = optionKey(booking);

  const candidates = sessions.filter(s => s.tour_date === booking.travel_date && profiles.has(s.id));
  if (candidates.length === 0) return null;

  const scored = candidates.map(s => {
    const profile = profiles.get(s.id)!;
    const sameOption = profile.optionKeys.has(key);
    let timeDistance = Infinity;
    if (booking.travel_time) {
      if (booking.travel_time >= profile.minTime && booking.travel_time <= profile.maxTime) {
        timeDistance = 0;
      } else {
        timeDistance = Math.min(
          Math.abs(toMinutes(booking.travel_time) - toMinutes(profile.minTime)),
          Math.abs(toMinutes(booking.travel_time) - toMinutes(profile.maxTime)),
        );
      }
    }
    return { sessionId: s.id, sameOption, timeDistance };
  });

  scored.sort((a, b) => {
    if (a.sameOption !== b.sameOption) return a.sameOption ? -1 : 1;
    return a.timeDistance - b.timeDistance;
  });

  return scored[0].sessionId;
}

/**
 * Persists auto-matched pairs as UNALLOTTED session_bookings rows (allotted_guide_id: null) — this
 * never runs Balance and never picks a guide; a matched booking just becomes visible/checkinable,
 * exactly like a booking Dispatch placed by hand. Each row is inserted independently (not as one
 * batch) so one race (another client/tick linking the same booking first, tripping the
 * unique(user_id, booking_ref) constraint) can't roll back the others in the same pass — that kind
 * of failure is expected and harmless under concurrent auto-population and is swallowed here; a
 * genuine failure just gets retried the next time this runs (on load, or on the next realtime
 * bookings-table event).
 */
export async function autoPopulateSessionBookings(
  supabase: SupabaseClient,
  userId: string,
  matches: AutoPopLink[]
): Promise<void> {
  await Promise.all(matches.map(async (m) => {
    const { error } = await supabase.from('session_bookings').insert({
      user_id: userId,
      session_id: m.session_id,
      booking_ref: m.booking_ref,
      allotted_guide_id: null,
    });
    if (error) {
      console.error('Auto-populate: failed to link', m.booking_ref, 'to session', m.session_id, error);
    }
  }));
}
