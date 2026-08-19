import type { SupabaseClient } from '@supabase/supabase-js';

// A booking can only ever be in one session (unique(user_id, booking_ref)) — moving it anywhere,
// including into a brand-new session or off a session entirely, means delete the old link then
// insert the new one. Shared by DispatchPage (bulk moves) and TodayToursPage (owner per-guest move)
// so both pages write session_bookings the same way.
export async function reassignSessionBookings(
  supabase: SupabaseClient,
  userId: string,
  bookingRefs: string[],
  targetSessionId: string | null
): Promise<void> {
  if (bookingRefs.length === 0) return;
  await supabase.from('session_bookings').delete().eq('user_id', userId).in('booking_ref', bookingRefs);
  if (targetSessionId) {
    await supabase.from('session_bookings').insert(
      bookingRefs.map(ref => ({ session_id: targetSessionId, booking_ref: ref, user_id: userId }))
    );
  }
}
