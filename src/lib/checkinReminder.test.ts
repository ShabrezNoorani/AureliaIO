import { describe, it, expect } from 'vitest';
import { computeCheckinReminder } from './checkinReminder';

const b = (ref: string, adults: number, status: string | null = 'UPCOMING') =>
  ({ booking_ref: ref, status, pax_adult: adults, pax_youth: 0, pax_child: 0, pax_infant: 0 });

describe('computeCheckinReminder', () => {
  it('counts guests on unchecked, non-cancelled bookings', () => {
    const r = computeCheckinReminder([[b('A', 2), b('B', 3)], [b('C', 1, 'CANCELLED')]], [{ booking_ref: 'B', status: 'checked_in' }]);
    expect(r).toEqual({ guests: 2, bookings: 1 });
  });

  it('treats no-show as resolved and returns null when everyone is handled', () => {
    const r = computeCheckinReminder([[b('A', 2), b('B', 1)]], [
      { booking_ref: 'A', status: 'checked_in' }, { booking_ref: 'B', status: 'no_show' },
    ]);
    expect(r).toBeNull();
  });

  it('does not double-count a booking listed in two sessions', () => {
    expect(computeCheckinReminder([[b('A', 2)], [b('A', 2)]], [])).toEqual({ guests: 2, bookings: 1 });
  });
});
