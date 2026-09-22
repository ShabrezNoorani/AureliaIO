import { describe, it, expect } from 'vitest';
import { statusBucket, DEFAULT_PNL_STATUSES, filterPnlBookings, groupBookingsByPeriod, type PnlBooking } from './monthlyPnl';

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
