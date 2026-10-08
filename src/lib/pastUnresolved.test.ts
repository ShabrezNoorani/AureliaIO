import { describe, it, expect } from 'vitest';
import { filterPastUnresolvedBookings } from './pastUnresolved';

const booking = (overrides: Partial<{ booking_ref: string; travel_date: string; status: string | null }> = {}) => ({
  booking_ref: 'B1',
  travel_date: '2026-10-01',
  status: 'CONFIRMED',
  ...overrides,
});

describe('filterPastUnresolvedBookings', () => {
  const today = '2026-10-15';

  it('includes a past booking with no checkins row at all', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-01' })];
    expect(filterPastUnresolvedBookings(bookings, [], today).map((b) => b.booking_ref)).toEqual(['B1']);
  });

  it('excludes a past booking already checked in', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-01' })];
    const checkins = [{ booking_ref: 'B1', status: 'checked_in' }];
    expect(filterPastUnresolvedBookings(bookings, checkins, today)).toEqual([]);
  });

  it('excludes a past booking already marked no-show', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-01' })];
    const checkins = [{ booking_ref: 'B1', status: 'no_show' }];
    expect(filterPastUnresolvedBookings(bookings, checkins, today)).toEqual([]);
  });

  it('excludes a cancelled booking even if unresolved', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-01', status: 'CANCELLED' })];
    expect(filterPastUnresolvedBookings(bookings, [], today)).toEqual([]);
  });

  it('excludes a booking dated today — only STRICTLY past ones are "unresolved backlog"', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: today })];
    expect(filterPastUnresolvedBookings(bookings, [], today)).toEqual([]);
  });

  it('excludes a future booking', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-20' })];
    expect(filterPastUnresolvedBookings(bookings, [], today)).toEqual([]);
  });

  it('a checkins row with some other non-terminal status still leaves the booking unresolved', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-01' })];
    const checkins = [{ booking_ref: 'B1', status: 'pending' }];
    expect(filterPastUnresolvedBookings(bookings, checkins, today).map((b) => b.booking_ref)).toEqual(['B1']);
  });

  it('never changes any booking\'s own status — it only filters, the caller decides what to render', () => {
    const bookings = [booking({ booking_ref: 'B1', travel_date: '2026-10-01', status: 'UPCOMING' })];
    const result = filterPastUnresolvedBookings(bookings, [], today);
    expect(result[0].status).toBe('UPCOMING');
  });

  it('handles a mix correctly', () => {
    const bookings = [
      booking({ booking_ref: 'B1', travel_date: '2026-10-01' }), // unresolved past — included
      booking({ booking_ref: 'B2', travel_date: '2026-10-02' }), // checked in — excluded
      booking({ booking_ref: 'B3', travel_date: '2026-10-03' }), // no-show — excluded
      booking({ booking_ref: 'B4', travel_date: '2026-10-04', status: 'CANCELLED' }), // cancelled — excluded
      booking({ booking_ref: 'B5', travel_date: today }), // today — excluded
      booking({ booking_ref: 'B6', travel_date: '2026-10-20' }), // future — excluded
    ];
    const checkins = [
      { booking_ref: 'B2', status: 'checked_in' },
      { booking_ref: 'B3', status: 'no_show' },
    ];
    expect(filterPastUnresolvedBookings(bookings, checkins, today).map((b) => b.booking_ref)).toEqual(['B1']);
  });
});
