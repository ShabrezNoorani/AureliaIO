import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Live sync for allocation-board lock toggles (session_guides.shuffle_locked).
//
// WHY THIS EXISTS: postgres_changes enforces RLS per subscriber — a client only receives an event
// for a row it could SELECT. A guide's raw SELECT on session_guides is restricted to their OWN
// row (co-guide pay privacy), so when guide A toggles their lock, guide B's session_guides
// subscription never fires — B's board stays stale until some unrelated refresh. (The same gap
// hit an owner lock for every co-guide except the one whose row changed.) Widening the SELECT
// policy would expose base_pay/bonus, so instead every successful lock write also sends a tiny
// Broadcast ping on a company-wide channel. Broadcast doesn't go through RLS; the ping carries no
// data at all — receivers just re-fetch through their own RLS-scoped paths (my_session_team() for
// guides, the owner's own session_guides query), so nothing is exposed that wasn't already.

const LOCK_EVENT = 'lock_changed';

/** One channel per company (keyed by the OWNER's user_id — the same value guides carry as
    guideUserId), shared by the owner's Today's Tours board and every guide's check-in board. */
export function subscribeLockSync(
  supabase: SupabaseClient,
  ownerUserId: string,
  onChange: () => void
): RealtimeChannel {
  return supabase
    .channel(`session-locks-${ownerUserId}`)
    .on('broadcast', { event: LOCK_EVENT }, () => { onChange(); })
    .subscribe();
}

/** Best-effort — the lock write itself has already committed; a failed ping only means other
    viewers pick the change up on their next refresh instead of instantly. */
export function broadcastLockChange(channel: RealtimeChannel | null) {
  if (!channel) return;
  channel.send({ type: 'broadcast', event: LOCK_EVENT, payload: {} }).catch((e) => {
    console.error('Lock sync broadcast failed:', e);
  });
}
