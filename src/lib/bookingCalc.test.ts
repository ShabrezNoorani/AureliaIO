import { describe, it, expect } from 'vitest';
import { computeDerivedBookingFields } from './bookingCalc';

const base = {
  pax_adult: 2, pax_youth: 0, pax_child: 1, pax_infant: 0,
  gross_revenue: 100, commission_rate: 30,
  ticket_cost: 10, guide_cost: 20, extra_cost: 5, gyg_cost: 0, marketplace_fee: 0,
};

describe('computeDerivedBookingFields', () => {
  it('sums the four pax fields into total_pax', () => {
    expect(computeDerivedBookingFields(base).total_pax).toBe(3);
  });

  it('computes commission_amount and net_revenue from gross_revenue and commission_rate', () => {
    const result = computeDerivedBookingFields(base);
    expect(result.commission_amount).toBe(30); // 100 * 30%
    expect(result.net_revenue).toBe(70); // 100 - 30
  });

  it('subtracts every cost plus commission and marketplace fee off gross for net_profit', () => {
    const result = computeDerivedBookingFields(base);
    // 100 - 10 - 20 - 5 - 0 - 30 (commission) - 0 (marketplace) = 35
    expect(result.net_profit).toBe(35);
  });

  it('subtracts commission and marketplace fee independently, never double-counting a channel that charges both', () => {
    const result = computeDerivedBookingFields({ ...base, marketplace_fee: 8 });
    // 100 - 10 - 20 - 5 - 0 - 30 (commission) - 8 (marketplace) = 27
    expect(result.net_profit).toBe(27);
  });

  it('treats null cost/revenue fields ("needs input") as 0 for the calculation only', () => {
    const result = computeDerivedBookingFields({
      ...base, gross_revenue: null, ticket_cost: null, guide_cost: null, extra_cost: null, gyg_cost: null,
    });
    expect(result.commission_amount).toBe(0);
    expect(result.net_revenue).toBe(0);
    expect(result.net_profit).toBe(0);
  });

  it('handles a zero-pax, zero-revenue booking without dividing by zero or producing NaN', () => {
    const result = computeDerivedBookingFields({
      pax_adult: 0, pax_youth: 0, pax_child: 0, pax_infant: 0,
      gross_revenue: 0, commission_rate: 30,
      ticket_cost: 0, guide_cost: 0, extra_cost: 0, gyg_cost: 0, marketplace_fee: 0,
    });
    expect(result).toEqual({ total_pax: 0, commission_amount: 0, net_revenue: 0, net_profit: 0 });
  });

  it('rounds money fields to 2 decimal places', () => {
    const result = computeDerivedBookingFields({ ...base, gross_revenue: 99.999, commission_rate: 33.333 });
    expect(result.commission_amount).toBeCloseTo(33.33, 2);
    expect(Number.isInteger(result.commission_amount * 100)).toBe(true);
  });

  // This function takes no `status` — a CANCELLED booking is summed exactly like any other (see
  // BookingPanel.tsx, which no longer auto-zeroes anything for a cancelled booking). A
  // cancellation with real costs and no revenue must compute as a genuine negative contribution,
  // never silently reduced to zero.
  it('a cancelled booking with costs and no revenue computes a negative net_profit (a real loss)', () => {
    const result = computeDerivedBookingFields({
      pax_adult: 2, pax_youth: 0, pax_child: 0, pax_infant: 0,
      gross_revenue: 0, commission_rate: 30,
      ticket_cost: 120, guide_cost: 50, extra_cost: 0, gyg_cost: 0, marketplace_fee: 0,
    });
    expect(result.net_profit).toBe(-170);
  });
});
