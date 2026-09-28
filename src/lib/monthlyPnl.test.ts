import { describe, it, expect } from 'vitest';
import {
  statusBucket, DEFAULT_PNL_STATUSES, filterPnlBookings, groupBookingsByPeriod,
  type PnlBooking, type PnlSessionBookingLink, type PnlSessionGuidePay, type PnlSession,
} from './monthlyPnl';

describe('statusBucket', () => {
  it('buckets the bare CANCELLED status', () => {
    expect(statusBucket('CANCELLED')).toBe('CANCELLED');
  });

  it('stays defensive against a not-yet-normalized legacy value', () => {
    expect(statusBucket('CANCELLED_EARLY')).toBe('CANCELLED');
    expect(statusBucket('CANCELLED_LATE')).toBe('CANCELLED');
  });

  it('passes through the other statuses unchanged', () => {
    expect(statusBucket('UPCOMING')).toBe('UPCOMING');
    expect(statusBucket('DONE')).toBe('DONE');
    expect(statusBucket('NO_SHOW')).toBe('NO_SHOW');
  });

  it('is null for no status', () => {
    expect(statusBucket(null)).toBeNull();
  });
});

describe('DEFAULT_PNL_STATUSES', () => {
  it('includes CANCELLED by default, so a cancellation with costs shows up without the owner having to opt in', () => {
    expect(DEFAULT_PNL_STATUSES).toContain('CANCELLED');
  });
});

const booking = (overrides: Partial<PnlBooking> = {}): PnlBooking => ({
  booking_ref: 'B1',
  travel_date: '2026-06-15',
  booking_date: '2026-06-01',
  status: 'DONE',
  channel: 'Viator',
  gross_revenue: 100,
  ticket_cost: 20,
  guide_cost: 10,
  extra_cost: 0,
  gyg_cost: 0,
  pax_adult: 2,
  pax_youth: 0,
  pax_child: 0,
  pax_infant: 0,
  ...overrides,
});

describe('filterPnlBookings — cancelled bookings included by default', () => {
  it('a cancelled booking passes the default status filter and its costs/revenue land in the period totals', () => {
    const cancelledLoss = booking({ status: 'CANCELLED', gross_revenue: 0, ticket_cost: 150, guide_cost: 50 });
    const opts = {
      dateField: 'travel' as const,
      range: { start: null, end: null },
      statuses: new Set(DEFAULT_PNL_STATUSES),
      channels: new Set(['Viator']),
    };

    const filtered = filterPnlBookings([cancelledLoss], opts);
    expect(filtered).toHaveLength(1);

    const rows = groupBookingsByPeriod(filtered, 'travel', 'month');
    expect(rows).toHaveLength(1);
    expect(rows[0].gross).toBe(0);
    expect(rows[0].tourCost).toBe(200);
    // A cancellation with real costs and no revenue is a genuine loss, not hidden from the total.
    expect(rows[0].tourProfit).toBe(-200);
  });

  it('the owner can still deliberately filter cancelled bookings OUT — this is a normal filter toggle, not a hardcoded exclusion', () => {
    const cancelled = booking({ status: 'CANCELLED' });
    const opts = {
      dateField: 'travel' as const,
      range: { start: null, end: null },
      statuses: new Set(['UPCOMING', 'DONE', 'NO_SHOW'] as const),
      channels: new Set(['Viator']),
    };
    expect(filterPnlBookings([cancelled], opts)).toHaveLength(0);
  });
});

describe('groupBookingsByPeriod — session-based guide pay (sessionPay param)', () => {
  const sessionGuide = (overrides: Partial<PnlSessionGuidePay> = {}): PnlSessionGuidePay => ({
    session_id: 'S1',
    status: 'accepted',
    base_pay: 80,
    bonus: 20,
    ...overrides,
  });
  const session = (overrides: Partial<PnlSession> = {}): PnlSession => ({
    id: 'S1',
    tour_date: '2026-06-15',
    ...overrides,
  });
  const link = (overrides: Partial<PnlSessionBookingLink> = {}): PnlSessionBookingLink => ({
    booking_ref: 'B1',
    session_id: 'S1',
    ...overrides,
  });

  it('a session-linked booking excludes its own stale guide_cost and uses the session\'s real pay instead (travel basis)', () => {
    const b = booking({ booking_ref: 'B1', gross_revenue: 425.17, ticket_cost: 0, guide_cost: 999, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'month', {
      sessionBookings: [link()],
      sessionGuides: [sessionGuide({ base_pay: 100, bonus: 30 })],
      sessions: [session()],
    });
    expect(rows).toHaveLength(1);
    // The stale 999 guide_cost never appears — only the real session pay (100+30=130).
    expect(rows[0].tourCost).toBe(130);
    expect(rows[0].tourProfit).toBe(425.17 - 130);
  });

  it('a booking NOT linked to any session keeps using its own guide_cost fallback, even when sessionPay is provided', () => {
    // The unrelated session/booking are in a DIFFERENT month so this genuinely isolates the
    // fallback behavior from period-level session-pay attachment (covered separately below).
    const b = booking({ booking_ref: 'UNSESSIONED', travel_date: '2026-06-15', gross_revenue: 100, ticket_cost: 20, guide_cost: 10, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'month', {
      sessionBookings: [link({ booking_ref: 'SOME_OTHER_BOOKING', session_id: 'S2' })],
      sessionGuides: [sessionGuide({ session_id: 'S2' })],
      sessions: [session({ id: 'S2', tour_date: '2026-07-10' })],
    });
    expect(rows).toHaveLength(1);
    // Its own guide_cost (10) is kept; the unrelated (different-month) session's pay never
    // attaches to it.
    expect(rows[0].tourCost).toBe(30); // ticket 20 + guide_cost 10
  });

  it('session pay attributes to whichever period the session\'s tour_date falls in, adding on top of any unrelated qualifying bookings already in that period', () => {
    const b = booking({ booking_ref: 'UNSESSIONED', travel_date: '2026-06-15', gross_revenue: 100, ticket_cost: 20, guide_cost: 10, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'month', {
      sessionBookings: [link({ booking_ref: 'SOME_OTHER_BOOKING' })],
      sessionGuides: [sessionGuide()], // base_pay 80 + bonus 20 = 100
      sessions: [session({ tour_date: '2026-06-20' })], // same month as b
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tourCost).toBe(130); // booking's own 30 (ticket 20 + guide_cost 10) + session's 100
  });

  it('never inflates session pay via a join — many bookings in one session still count that session\'s guide pay ONCE', () => {
    const b1 = booking({ booking_ref: 'B1', gross_revenue: 200, ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0 });
    const b2 = booking({ booking_ref: 'B2', gross_revenue: 200, ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0 });
    const b3 = booking({ booking_ref: 'B3', gross_revenue: 200, ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b1, b2, b3], 'travel', 'month', {
      sessionBookings: [link({ booking_ref: 'B1' }), link({ booking_ref: 'B2' }), link({ booking_ref: 'B3' })],
      // Two guides on the one session — each counted once, never once per booking.
      sessionGuides: [sessionGuide({ base_pay: 100, bonus: 0 }), sessionGuide({ base_pay: 50, bonus: 0 })],
      sessions: [session()],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].bookings).toBe(3);
    expect(rows[0].gross).toBe(600);
    // 100 + 50 = 150, NOT (100+50) * 3 bookings.
    expect(rows[0].tourCost).toBe(150);
    expect(rows[0].tourProfit).toBe(450);
  });

  it('REGRESSION: a single booking in a 2-guide session has its revenue counted exactly once, never once per guide', () => {
    // Mirrors the reported bug shape: one booking (€85 revenue) in a session with 2 accepted
    // guides (€100 + €30 pay) — gross must be exactly the booking's own revenue, not doubled to
    // match the guide count, and cost must be exactly the two guides' combined pay, not per-guide
    // multiplied against the booking.
    const b = booking({ booking_ref: 'VIA-99883843', travel_date: '2026-09-28', gross_revenue: 85, ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'day', {
      sessionBookings: [link({ booking_ref: 'VIA-99883843', session_id: 'S1' })],
      sessionGuides: [
        sessionGuide({ session_id: 'S1', base_pay: 100, bonus: 0 }),
        sessionGuide({ session_id: 'S1', base_pay: 30, bonus: 0 }),
      ],
      sessions: [session({ id: 'S1', tour_date: '2026-09-28' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].bookings).toBe(1);
    expect(rows[0].gross).toBe(85); // NOT 170 (85 * 2 guides)
    expect(rows[0].tourCost).toBe(130); // 100 + 30, once each — NOT 260
    expect(rows[0].tourProfit).toBe(85 - 130);
  });

  it('a non-accepted session_guides row contributes no pay', () => {
    const b = booking({ booking_ref: 'B1', gross_revenue: 100, ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'month', {
      sessionBookings: [link()],
      sessionGuides: [sessionGuide({ status: 'offered' })],
      sessions: [session()],
    });
    expect(rows[0].tourCost).toBe(0);
    expect(rows[0].tourProfit).toBe(100);
  });

  it('booking-date grouping excludes a session-linked booking\'s stale guide_cost but does NOT add session pay (no natural booking-date home for it)', () => {
    const b = booking({ booking_ref: 'B1', booking_date: '2026-05-01', gross_revenue: 100, ticket_cost: 0, guide_cost: 999, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'booking', 'month', {
      sessionBookings: [link()],
      sessionGuides: [sessionGuide({ base_pay: 100, bonus: 30 })],
      sessions: [session()],
    });
    expect(rows).toHaveLength(1);
    // Stale guide_cost excluded (never trusted for a session-linked booking) but the real session
    // pay isn't added either — booking-date view has no home for a travel-date-scoped cost.
    expect(rows[0].tourCost).toBe(0);
    expect(rows[0].tourProfit).toBe(100);
  });

  it('session pay for a period with no qualifying booking row is silently omitted (same "zero-activity periods are omitted" rule as admin costs)', () => {
    // The only booking is in June; the session with pay is in July — no June booking to attach
    // July's pay to, and no row is fabricated just to carry it.
    const b = booking({ booking_ref: 'UNRELATED', travel_date: '2026-06-15', ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'month', {
      sessionBookings: [link({ booking_ref: 'SOME_JULY_BOOKING' })],
      sessionGuides: [sessionGuide()],
      sessions: [session({ tour_date: '2026-07-10' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('2026-06');
    expect(rows[0].tourCost).toBe(0);
  });

  it('backward compatible: omitting sessionPay entirely behaves exactly as before (booking.guide_cost always used)', () => {
    const b = booking({ ticket_cost: 20, guide_cost: 10, extra_cost: 0, gyg_cost: 0 });
    const rows = groupBookingsByPeriod([b], 'travel', 'month');
    expect(rows[0].tourCost).toBe(30);
  });
});
