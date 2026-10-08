import { SupabaseClient } from '@supabase/supabase-js';
import type { Booking } from './useBookings';
import { logChange } from './changeLog';
import { computeDerivedBookingFields } from './bookingCalc';
import { PROTECTABLE_BOOKING_FIELDS, addManualOverrides, type ProtectableBookingField } from './bookingOverrides';
import { normalizeTime } from './utils';

const FIELD_LABELS: Record<ProtectableBookingField, string> = {
  customer_name: 'Customer name',
  customer_phone: 'Customer phone',
  travel_date: 'Travel date',
  travel_time: 'Travel time',
  option_name: 'Option',
  product_code: 'Product code',
  channel: 'Channel',
  pax_adult: 'Adult pax',
  pax_youth: 'Youth pax',
  pax_child: 'Child pax',
  pax_infant: 'Infant pax',
  status: 'Status',
  gross_revenue: 'Gross revenue',
  guide_cost: 'Guide cost',
  extra_cost: 'Extra cost',
  ticket_cost: 'Ticket cost',
  gyg_cost: 'GYG cost',
};

export interface SaveBookingResult {
  error: string | null;
  booking: Booking | null;
  changedFields: ProtectableBookingField[];
}

/**
 * Single write path for every owner edit to a booking from the Financial Ledger — mirrors
 * updateGuideDetails() in lib/guideActions.ts. Four things happen together, in order, so they
 * can never drift apart:
 *   1. total_pax/commission_amount/net_revenue/net_profit are recomputed fresh from `after`
 *      (never trusts whatever the edit panel already had in state).
 *   2. Whichever PROTECTABLE_BOOKING_FIELDS actually changed value vs `before` get folded into
 *      manual_overrides, so a later Bokun/gsheet sync can never revert them (see
 *      lib/bookingOverrides.ts).
 *   3. If travel_date just changed on an EXISTING booking, any session_bookings link it had is
 *      removed — that link is scoped to a specific day's session, so a date change leaves it
 *      pointing at the wrong day (or nothing at all) otherwise. See the dedicated comment below;
 *      re-attaching to a session on the NEW date is left to the existing auto-populate logic
 *      (TodayToursPage/GuideCheckin's own loadData), not duplicated here.
 *   4. One change_logs row is written per changed field, old -> new.
 *
 * `before` is EMPTY_BOOKING for a brand-new booking — every protectable field the owner fills in
 * on a fresh manual entry is treated as "changed" and flagged, since a from-scratch manual
 * booking should never have its hand-entered data clobbered if its booking_ref later happens to
 * also appear in a sync.
 */
export async function saveBooking(
  supabase: SupabaseClient,
  userId: string,
  before: Booking,
  after: Booking
): Promise<SaveBookingResult> {
  const derived = computeDerivedBookingFields(after);
  // BookingPanel's native <input type="time"> already emits "HH:MM", but normalizing here too —
  // the one write chokepoint for both new bookings and edits — is a zero-cost guarantee against
  // any other caller of saveBooking ever landing a non-"HH:MM" value.
  const finalFields: Booking = { ...after, ...derived, travel_time: normalizeTime(after.travel_time) || after.travel_time };

  const changedFields = PROTECTABLE_BOOKING_FIELDS.filter(f => before[f] !== finalFields[f]);
  const manual_overrides = addManualOverrides(before.manual_overrides, changedFields);

  let saved: Booking | null = null;
  let error: string | null = null;

  if (after.id) {
    const { id, user_id, created_at, ...fields } = finalFields;
    const res = await supabase
      .from('bookings')
      .update({ ...fields, manual_overrides })
      .eq('id', id)
      .select()
      .single();
    saved = (res.data as Booking) ?? null;
    error = res.error?.message ?? null;
  } else {
    const res = await supabase
      .from('bookings')
      .insert({ ...finalFields, manual_overrides, user_id: userId })
      .select()
      .single();
    saved = (res.data as Booking) ?? null;
    error = res.error?.message ?? null;
  }

  if (error) return { error, booking: null, changedFields: [] };

  // CRITICAL: a session_bookings row links a booking to a specific day's session — if
  // travel_date just changed on an EXISTING booking (Oct 1 -> Oct 8), any such link now points at
  // a session for the WRONG day. Remove it so the booking stops showing on the old day's session;
  // it's picked back up and linked to a matching session on the NEW date the next time
  // TodayToursPage/Dispatch/GuideCheckin loads, via the SAME auto-populate matching every other
  // unsessioned booking already goes through — never duplicated or reimplemented here. A
  // brand-new booking (no `after.id` yet) has no prior link to clean up. This never touches
  // manual_overrides (a separate, already-handled concern above) and only ever DELETEs — it can't
  // leave session_bookings in a partial/corrupt state.
  if (after.id && changedFields.includes('travel_date') && saved?.booking_ref) {
    const { error: unlinkError } = await supabase
      .from('session_bookings')
      .delete()
      .eq('user_id', userId)
      .eq('booking_ref', saved.booking_ref);
    if (unlinkError) {
      // Not fatal to the save — the booking row itself is already correctly saved above; a
      // left-behind stale link would need manual cleanup, logged here for visibility.
      console.error('Failed to unlink booking from its old session after a travel_date change:', unlinkError);
    }
  }

  for (const field of changedFields) {
    await logChange(supabase, userId, {
      tableName: 'bookings',
      recordId: after.booking_ref || after.id || 'new',
      fieldName: field,
      oldValue: before[field],
      newValue: finalFields[field],
      description: `${FIELD_LABELS[field]} updated on booking ${after.booking_ref || '(new)'}`,
    });
  }

  return { error: null, booking: saved, changedFields };
}
