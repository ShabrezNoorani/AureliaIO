import type { Booking } from './useBookings';

const numOrZero = (v: number | null | undefined) => v ?? 0;

export interface DerivedBookingFields {
  total_pax: number;
  commission_amount: number;
  net_revenue: number;
  net_profit: number;
}

type BookingCalcInput = Pick<Booking,
  | 'pax_adult' | 'pax_youth' | 'pax_child' | 'pax_infant'
  | 'gross_revenue' | 'commission_rate'
  | 'ticket_cost' | 'guide_cost' | 'extra_cost' | 'gyg_cost' | 'marketplace_fee'
>;

/**
 * The ONE place total_pax/commission_amount/net_revenue/net_profit get (re)computed — both
 * BookingPanel's live edit preview and LedgerPage's actual save path (lib/bookingActions.ts) run
 * every edit through this, so a save can never persist a total_pax or net_profit that disagrees
 * with what the owner was shown while editing.
 *
 * gross_revenue/ticket_cost/guide_cost/extra_cost/gyg_cost can each be null ("needs input" — see
 * lib/useBookings.ts) — treated as 0 for this calculation only, never mutated back into the field
 * itself. A CANCELLED_EARLY booking's gross_revenue/ticket_cost are expected to already be zeroed
 * by the caller (BookingPanel does this on every status change) before reaching here — this
 * function has no status of its own to branch on, it just sums whatever it's given.
 */
export function computeDerivedBookingFields(b: BookingCalcInput): DerivedBookingFields {
  const total_pax = numOrZero(b.pax_adult) + numOrZero(b.pax_youth) + numOrZero(b.pax_child) + numOrZero(b.pax_infant);

  const gross = numOrZero(b.gross_revenue);
  const commission_amount = +(gross * numOrZero(b.commission_rate) / 100).toFixed(2);
  const net_revenue = +(gross - commission_amount).toFixed(2);
  // Subtracts commission/marketplace directly off gross (not via net_revenue) so a channel that
  // charges both is never double- or under-counted.
  const net_profit = +(
    gross
    - numOrZero(b.ticket_cost)
    - numOrZero(b.guide_cost)
    - numOrZero(b.extra_cost)
    - numOrZero(b.gyg_cost)
    - commission_amount
    - numOrZero(b.marketplace_fee)
  ).toFixed(2);

  return { total_pax, commission_amount, net_revenue, net_profit };
}
