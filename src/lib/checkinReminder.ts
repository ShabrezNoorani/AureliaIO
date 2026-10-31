import { isCancelled } from './utils';

// Guide-facing "don't forget to check in" nudge. Pure so it's unit-testable; GuideCheckin feeds
// it the same session/booking/checkin state it already renders from — no extra reads, no writes.

export interface ReminderBooking {
  booking_ref: string;
  status: string | null;
  pax_adult: number | null;
  pax_youth: number | null;
  pax_child: number | null;
  pax_infant: number | null;
}

export interface ReminderCheckin {
  booking_ref: string;
  status: string;
}

export interface CheckinReminder {
  /** Guests (pax) not yet checked in or marked no-show. */
  guests: number;
  bookings: number;
}

const pax = (b: ReminderBooking) =>
  (Number(b.pax_adult) || 0) + (Number(b.pax_youth) || 0) + (Number(b.pax_child) || 0) + (Number(b.pax_infant) || 0);

/** Counts non-cancelled bookings across the given (today's) sessions that have neither a
    checked_in nor a no_show record. Returns null when there's nothing left to remind about. */
export function computeCheckinReminder(
  bookingsBySession: Iterable<ReminderBooking[]>,
  checkins: ReminderCheckin[],
): CheckinReminder | null {
  const resolved = new Set(
    checkins.filter(c => c.status === 'checked_in' || c.status === 'no_show').map(c => c.booking_ref)
  );
  const seen = new Set<string>();
  let guests = 0;
  let bookings = 0;
  for (const list of bookingsBySession) {
    for (const b of list) {
      if (seen.has(b.booking_ref) || isCancelled(b.status) || resolved.has(b.booking_ref)) continue;
      seen.add(b.booking_ref);
      bookings++;
      guests += Math.max(1, pax(b));
    }
  }
  return bookings > 0 ? { guests, bookings } : null;
}
