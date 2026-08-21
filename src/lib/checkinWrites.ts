import { supabase } from '@/lib/supabase';

// Shared, idempotent low-level checkins writes used by both GuideCheckin.tsx and
// TodayToursPage.tsx's retry-queued actions. There is no unique constraint on
// (user_id, booking_ref, travel_date) in the schema (verified directly against the database —
// only a primary key on id and a foreign key on user_id), so a DB-level upsert can't target that
// tuple. Idempotency is instead achieved by having every attempt — including retries — re-read
// current state and converge toward the target, rather than blindly repeating a raw insert. A
// retry after a write that actually landed server-side (but whose response was lost to a network
// drop) finds the row already in a terminal state and no-ops instead of inserting a duplicate.

export async function findCheckinRow(userId: string, bookingRef: string, travelDate: string) {
  const { data } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('booking_ref', bookingRef)
    .eq('travel_date', travelDate)
    .maybeSingle();
  return data;
}

/**
 * Converges the checkins row toward `status`. Matches the app's existing rule that once a guest
 * is checked_in or no_show, only an explicit Reset changes it — so on retry, finding either
 * terminal status already set (most likely by an earlier attempt of this very action) is treated
 * as success, not overwritten.
 */
export async function writeCheckin(params: {
  userId: string;
  bookingRef: string;
  travelDate: string;
  status: 'checked_in' | 'no_show';
  checkedInBy: string;
  pax: number;
  photoBase64: string | null;
}): Promise<void> {
  const { userId, bookingRef, travelDate, status, checkedInBy, pax, photoBase64 } = params;
  const existing = await findCheckinRow(userId, bookingRef, travelDate);
  if (existing?.status === 'checked_in' || existing?.status === 'no_show') return;

  const fields = {
    checked_in_at: new Date().toISOString(),
    checked_in_by: checkedInBy,
    pax_checked_in: status === 'checked_in' ? pax : 0,
    status,
    ticket_photo: photoBase64,
  };

  if (existing) {
    const { error } = await supabase.from('checkins').update(fields).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('checkins').insert({
      user_id: userId,
      booking_ref: bookingRef,
      travel_date: travelDate,
      ...fields,
    });
    if (error) throw error;
  }
}

/** Converges the checkins row toward "deleted". A retry that finds it already gone (deleted by an
    earlier attempt of this same action) is a no-op, not an error. */
export async function deleteCheckin(userId: string, bookingRef: string, travelDate: string): Promise<void> {
  const existing = await findCheckinRow(userId, bookingRef, travelDate);
  if (!existing) return;
  const { error } = await supabase.from('checkins').delete().eq('id', existing.id);
  if (error) throw error;
}

/**
 * Merges a fresh server read with current local state, keeping the LOCAL row for any booking_ref
 * that still has a write in flight (queued/retrying) instead of the fetched one. Without this, a
 * realtime event or a manual/periodic refresh that lands while a write is being retried would
 * overwrite the optimistic card back to its pre-tap state — visible flicker, and a direct
 * violation of "never revert the card" while sync is pending. Once the queue drains for that
 * booking, the next refresh trusts the server again.
 */
export function mergeGuardingPending<T extends { booking_ref: string }>(
  serverRows: T[],
  prevRows: T[],
  pendingBookingRefs: Set<string>
): T[] {
  if (pendingBookingRefs.size === 0) return serverRows;
  const prevByRef = new Map(prevRows.map((r) => [r.booking_ref, r]));
  const merged = serverRows.map((row) => (
    pendingBookingRefs.has(row.booking_ref) ? (prevByRef.get(row.booking_ref) ?? row) : row
  ));
  // A pending optimistic row that the server doesn't know about yet at all (e.g. a fresh insert
  // still in flight) wouldn't appear in serverRows — carry it forward too.
  const serverRefs = new Set(serverRows.map((r) => r.booking_ref));
  prevByRef.forEach((localRow, ref) => {
    if (pendingBookingRefs.has(ref) && !serverRefs.has(ref)) merged.push(localRow);
  });
  return merged;
}
