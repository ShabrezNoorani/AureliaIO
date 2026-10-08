import { isCancelled } from '@/lib/utils';

// A booking whose tour date has PASSED but was never checked in or marked no-show stays UPCOMING
// forever otherwise — Today's Tours/Today's Check-in only ever show TODAY, so nothing ever
// surfaces it again for the guide/owner to resolve. This is the ONE place that finds those
// bookings, for both the owner (TodayToursPage.tsx) and the guide (GuideCheckin.tsx) to render in
// their own "Past / Unresolved" section — never auto-changed, only surfaced for a real manual
// DONE/NO_SHOW decision via the exact same check-in/no-show actions used everywhere else.

export interface PastUnresolvedBooking {
  booking_ref: string;
  travel_date: string;
  status: string | null;
}

export interface CheckinStatusRow {
  booking_ref: string;
  status: string | null;
}

/** A booking is past-and-unresolved when its travel_date is strictly before today, it isn't
    cancelled, and it has no checkins row with a terminal status (checked_in or no_show) — exactly
    mirroring the terminal-status check writeCheckin() itself already uses, so "resolved" means
    the same thing here as it does to the write path. */
export function filterPastUnresolvedBookings<B extends PastUnresolvedBooking>(
  bookings: B[],
  checkins: CheckinStatusRow[],
  todayStr: string
): B[] {
  const resolvedRefs = new Set(
    checkins.filter((c) => c.status === 'checked_in' || c.status === 'no_show').map((c) => c.booking_ref)
  );
  return bookings.filter((b) =>
    b.travel_date < todayStr && !isCancelled(b.status) && !resolvedRefs.has(b.booking_ref)
  );
}
