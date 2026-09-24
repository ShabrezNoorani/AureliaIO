import { describe, it, expect } from 'vitest';
import { matchBookingsToSessions, pickBestSessionForBooking, type AutoPopBooking, type AutoPopSession, type AutoPopLink } from './sessionAutoPopulate';

const session = (id: string, tour_date = '2026-09-24'): AutoPopSession => ({ id, tour_date });
const booking = (overrides: Partial<AutoPopBooking> & { booking_ref: string }): AutoPopBooking => ({
  product_code: 'P13',
  option_name: 'Standard',
  travel_date: '2026-09-24',
  travel_time: '09:00',
  status: 'UPCOMING',
  ...overrides,
});
const link = (session_id: string, booking_ref: string): AutoPopLink => ({ session_id, booking_ref });

describe('matchBookingsToSessions', () => {
  it('matches a late booking with the same option and a time inside the session window', () => {
    const sessions = [session('S1')];
    const links = [
      link('S1', 'EXISTING_0845'),
      link('S1', 'EXISTING_0900'),
    ];
    const bookings = [
      booking({ booking_ref: 'EXISTING_0845', travel_time: '08:45' }),
      booking({ booking_ref: 'EXISTING_0900', travel_time: '09:00' }),
      // Late arrival at 08:50 — inside the derived [08:45, 09:00] window, same option.
      booking({ booking_ref: 'LATE_0850', travel_time: '08:50' }),
    ];
    const matches = matchBookingsToSessions(sessions, links, bookings);
    expect(matches).toEqual([{ session_id: 'S1', booking_ref: 'LATE_0850' }]);
  });

  it('does not match a booking with a different option, even at a matching time', () => {
    const sessions = [session('S1')];
    const links = [link('S1', 'EXISTING')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00' }),
      booking({ booking_ref: 'DIFFERENT_OPTION', travel_time: '09:00', option_name: 'VIP' }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });

  it('does not match a booking outside the derived time window', () => {
    const sessions = [session('S1')];
    const links = [link('S1', 'EXISTING')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00' }),
      booking({ booking_ref: 'TOO_LATE', travel_time: '11:00' }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });

  it('never matches a session with nothing linked yet (no derivable profile)', () => {
    const sessions = [session('EMPTY_SESSION')];
    const bookings = [booking({ booking_ref: 'B1' })];
    expect(matchBookingsToSessions(sessions, [], bookings)).toEqual([]);
  });

  it('excludes cancelled bookings', () => {
    const sessions = [session('S1')];
    const links = [link('S1', 'EXISTING')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00' }),
      booking({ booking_ref: 'CANCELLED_ONE', travel_time: '09:00', status: 'CANCELLED' }),
      booking({ booking_ref: 'CANCELLED_EARLY', travel_time: '09:00', status: 'CANCELLED_EARLY' }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });

  it('excludes a booking already linked to a session (its own or another)', () => {
    const sessions = [session('S1'), session('S2')];
    const links = [link('S1', 'EXISTING'), link('S2', 'ALREADY_ELSEWHERE')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00' }),
      booking({ booking_ref: 'ALREADY_ELSEWHERE', travel_time: '09:00' }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });

  it('excludes a booking with no travel_time (nothing to compare a window against)', () => {
    const sessions = [session('S1')];
    const links = [link('S1', 'EXISTING')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00' }),
      booking({ booking_ref: 'NO_TIME', travel_time: null }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });

  it('never crosses tour_date, even with an otherwise-matching option/time', () => {
    const sessions = [session('S1', '2026-09-24')];
    const links = [link('S1', 'EXISTING')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00', travel_date: '2026-09-24' }),
      booking({ booking_ref: 'TOMORROW', travel_time: '09:00', travel_date: '2026-09-25' }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });

  it('matches a merged session spanning two option keys and a wide window (the 08:45 + 09:00 merge example)', () => {
    const sessions = [session('MERGED')];
    const links = [
      link('MERGED', 'A_0845'),
      link('MERGED', 'B_0900_VIP'),
    ];
    const bookings = [
      booking({ booking_ref: 'A_0845', travel_time: '08:45', option_name: 'Standard' }),
      booking({ booking_ref: 'B_0900_VIP', travel_time: '09:00', option_name: 'VIP' }),
      // Late VIP arrival at 08:50 — within [08:45,09:00] and matches the VIP option key.
      booking({ booking_ref: 'LATE_VIP', travel_time: '08:50', option_name: 'VIP' }),
      // A Standard-option booking at 08:50 also matches (same window, the other linked option key).
      booking({ booking_ref: 'LATE_STANDARD', travel_time: '08:50', option_name: 'Standard' }),
    ];
    const matches = matchBookingsToSessions(sessions, links, bookings);
    expect(matches.sort((x, y) => x.booking_ref.localeCompare(y.booking_ref))).toEqual([
      { session_id: 'MERGED', booking_ref: 'LATE_STANDARD' },
      { session_id: 'MERGED', booking_ref: 'LATE_VIP' },
    ]);
  });

  it('matches no built session at all when a booking is a genuinely different product (last-minute case)', () => {
    const sessions = [session('S1')];
    const links = [link('S1', 'EXISTING')];
    const bookings = [
      booking({ booking_ref: 'EXISTING', travel_time: '09:00', product_code: 'P13' }),
      booking({ booking_ref: 'LOUVRE', travel_time: '10:00', product_code: 'LOUVRE', option_name: 'Skip the line' }),
    ];
    expect(matchBookingsToSessions(sessions, links, bookings)).toEqual([]);
  });
});

describe('pickBestSessionForBooking', () => {
  it('picks the same-option session over the merely-earliest one (the Cathedral/Louvre example)', () => {
    const sessions = [session('CATHEDRAL'), session('LOUVRE')];
    const links = [link('CATHEDRAL', 'C1'), link('LOUVRE', 'L1')];
    const linkedBookings = [
      booking({ booking_ref: 'C1', travel_time: '09:00', product_code: 'CATH', option_name: 'Standard' }),
      booking({ booking_ref: 'L1', travel_time: '11:00', product_code: 'LOUVRE', option_name: 'Skip the line' }),
    ];
    // A last-minute Louvre guest, arriving at a time closer to Cathedral's window than Louvre's —
    // must still go to Louvre because the option matches, not to the earlier Cathedral session.
    const lastMinuteLouvre = booking({ booking_ref: 'LM', travel_time: '09:30', product_code: 'LOUVRE', option_name: 'Skip the line' });
    expect(pickBestSessionForBooking(sessions, links, linkedBookings, lastMinuteLouvre)).toBe('LOUVRE');
  });

  it('falls back to nearest time when no session matches the option', () => {
    const sessions = [session('EARLY'), session('LATE')];
    const links = [link('EARLY', 'E1'), link('LATE', 'L1')];
    const linkedBookings = [
      booking({ booking_ref: 'E1', travel_time: '09:00' }),
      booking({ booking_ref: 'L1', travel_time: '15:00' }),
    ];
    // Different product entirely (no option matches either session) — nearest time wins: 10:00 is
    // 1h from EARLY's 09:00 and 5h from LATE's 15:00.
    const differentProduct = booking({ booking_ref: 'LM', travel_time: '10:00', product_code: 'OTHER', option_name: 'Something else' });
    expect(pickBestSessionForBooking(sessions, links, linkedBookings, differentProduct)).toBe('EARLY');
  });

  it('scores a time inside the window as closer than one outside it, same option', () => {
    const sessions = [session('S1'), session('S2')];
    const links = [link('S1', 'A1'), link('S2', 'B1')];
    const linkedBookings = [
      booking({ booking_ref: 'A1', travel_time: '08:00' }),
      booking({ booking_ref: 'B1', travel_time: '09:50' }),
    ];
    // 09:55 is only 5 min past S2's single-point window (09:50) but ~1h55 from S1's (08:00).
    const lm = booking({ booking_ref: 'LM', travel_time: '09:55' });
    expect(pickBestSessionForBooking(sessions, links, linkedBookings, lm)).toBe('S2');
  });

  it('returns null when no session has a derivable profile (nothing to rank)', () => {
    const sessions = [session('EMPTY_1'), session('EMPTY_2')];
    const lm = booking({ booking_ref: 'LM' });
    expect(pickBestSessionForBooking(sessions, [], [], lm)).toBeNull();
  });

  it('returns null when there are no sessions today at all', () => {
    const lm = booking({ booking_ref: 'LM' });
    expect(pickBestSessionForBooking([], [], [], lm)).toBeNull();
  });

  it('never crosses tour_date when ranking candidates', () => {
    const sessions = [session('TOMORROW', '2026-09-25')];
    const links = [link('TOMORROW', 'T1')];
    const linkedBookings = [booking({ booking_ref: 'T1', travel_time: '09:00', travel_date: '2026-09-25' })];
    const todayLm = booking({ booking_ref: 'LM', travel_date: '2026-09-24' });
    expect(pickBestSessionForBooking(sessions, links, linkedBookings, todayLm)).toBeNull();
  });
});
