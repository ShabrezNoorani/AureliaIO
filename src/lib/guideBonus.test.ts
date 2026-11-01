import { describe, it, expect } from 'vitest';
import { listMonthEndBonuses, sumMonthEndBonuses, bonusTotalsByGuide, monthEndBonusCostByMonth, isMissingBonusColumnError } from './guideBonus';
import { groupBookingsByPeriod, monthEndBonusCostsByPeriod, type PnlBooking } from './monthlyPnl';
import { monthBounds } from './guideInvoice';

const rows = [
  { id: 'm1', guide_id: 'g1', month: '2026-10', bonus: 50, bonus_note: 'Great month', payment_sent: true },
  { id: 'm2', guide_id: 'g1', month: '2026-11', bonus: 30, bonus_note: null, payment_sent: false },
  { id: 'm3', guide_id: 'g2', month: '2026-11', bonus: null, payment_sent: false },
  { id: 'm4', guide_id: null, month: '2026-11', bonus: 99, payment_sent: false }, // unlinked — ignored
];

describe('month-end bonus helpers', () => {
  it('lists only non-zero bonuses for real guides, newest first', () => {
    const list = listMonthEndBonuses(rows);
    expect(list.map(b => b.id)).toEqual(['m2', 'm1']);
    expect(list[1]).toMatchObject({ amount: 50, note: 'Great month', paid: true });
  });

  it('respects the window by month', () => {
    const nov = listMonthEndBonuses(rows, { bounds: monthBounds('2026-11') });
    expect(nov.map(b => b.month)).toEqual(['2026-11']);
    expect(listMonthEndBonuses(rows, { bounds: { start: '2026-10-01', end: '9999-12-31' } })).toHaveLength(2);
  });

  it('splits paid vs pending by the month payment status', () => {
    expect(sumMonthEndBonuses(listMonthEndBonuses(rows))).toEqual({ total: 80, paid: 50, pending: 30 });
    const byGuide = bonusTotalsByGuide(rows, { start: '0000-01-01', end: '9999-12-31' });
    expect(byGuide.get('g1')).toEqual({ total: 80, paid: 50, pending: 30 });
    expect(byGuide.has('g2')).toBe(false);
  });

  it('company cost per month sums every row once', () => {
    const cost = monthEndBonusCostByMonth(rows);
    expect(cost.get('2026-10')).toBe(50);
    expect(cost.get('2026-11')).toBe(129);
  });

  it('detects the not-yet-migrated column error', () => {
    expect(isMissingBonusColumnError({ message: 'column guide_monthly.bonus does not exist' })).toBe(true);
    expect(isMissingBonusColumnError({ message: 'permission denied' })).toBe(false);
    expect(isMissingBonusColumnError(null)).toBe(false);
  });

  it('monthBounds covers the whole month', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthBounds('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
  });
});

describe('P&L — month-end bonus is a guide-pay cost of its month', () => {
  const booking = (travel_date: string, gross: number): PnlBooking => ({
    booking_ref: `b-${travel_date}`, travel_date, booking_date: travel_date, status: 'CONFIRMED', channel: 'Direct',
    gross_revenue: gross, ticket_cost: 0, extra_cost: 0, gyg_cost: 0, guide_cost: 0,
    pax_adult: 1, pax_youth: 0, pax_child: 0, pax_infant: 0,
  } as unknown as PnlBooking);
  const pay = { sessionBookings: [], sessionGuides: [], sessions: [], monthEndBonuses: [{ month: '2026-11', bonus: 100 }] };

  it('adds the bonus to tour cost of that month only, once', () => {
    const rowsOut = groupBookingsByPeriod([booking('2026-11-05', 500), booking('2026-10-05', 300)], 'travel', 'month', pay);
    const nov = rowsOut.find(r => r.key === '2026-11')!;
    const oct = rowsOut.find(r => r.key === '2026-10')!;
    expect(nov.tourCost).toBe(100);
    expect(nov.tourProfit).toBe(400);
    expect(oct.tourCost).toBe(0);
    expect(nov.bookings).toBe(1); // never counted as a booking/tour
  });

  it('is ignored on booking-date grouping', () => {
    const rowsOut = groupBookingsByPeriod([booking('2026-11-05', 500)], 'booking', 'month', pay);
    expect(rowsOut[0].tourCost).toBe(0);
  });

  it('spreads evenly across days so the month total is preserved', () => {
    const byDay = monthEndBonusCostsByPeriod([{ month: '2026-11', bonus: 300 }], 'day');
    const total = Array.from(byDay.values()).reduce((s, v) => s + v, 0);
    expect(byDay.size).toBe(30);
    expect(total).toBeCloseTo(300);
  });
});
