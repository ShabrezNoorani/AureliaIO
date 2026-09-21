// Field-level "don't clobber an owner's edit" protection for bookings. Cost fields
// (gross_revenue/guide_cost/extra_cost/ticket_cost/gyg_cost) already got an informal version of
// this via gsheetSync's PROTECTED_MONEY_FIELDS: a blank cell parses to null, and a sync skips
// writing null over an existing value. That only protects against a blank re-read though — a
// sheet/Bokun row that comes back with a real (but stale, or simply different) value still
// overwrote whatever the owner had typed. manual_overrides makes protection explicit and
// unconditional: once a field is in this list, NO sync value for it is ever written, blank or
// not, until the owner edits that field again (or edits it back to match the source, which
// re-adds it here anyway).
export const PROTECTABLE_BOOKING_FIELDS = [
  'customer_name', 'customer_phone', 'travel_date', 'travel_time', 'option_name',
  'product_code', 'channel', 'pax_adult', 'pax_youth', 'pax_child', 'pax_infant', 'status',
  'gross_revenue', 'guide_cost', 'extra_cost', 'ticket_cost', 'gyg_cost',
] as const;

export type ProtectableBookingField = typeof PROTECTABLE_BOOKING_FIELDS[number];

const PROTECTABLE_SET = new Set<string>(PROTECTABLE_BOOKING_FIELDS);

export const isProtectableBookingField = (field: string): field is ProtectableBookingField =>
  PROTECTABLE_SET.has(field);

/**
 * The union of a booking's current manual_overrides with whichever protectable fields the owner
 * just changed in this save — sorted and de-duplicated. A field that ISN'T in
 * PROTECTABLE_BOOKING_FIELDS (e.g. a recomputed field like net_profit) is silently ignored, so a
 * caller can pass a raw list of "everything that changed" without pre-filtering it first.
 */
export function addManualOverrides(
  existing: string[] | null | undefined,
  justChanged: readonly string[]
): string[] {
  const set = new Set(existing || []);
  justChanged.forEach(f => { if (isProtectableBookingField(f)) set.add(f); });
  return Array.from(set).sort();
}

/**
 * Strips every key the owner has manually overridden out of an incoming sync payload — the ONE
 * place every ingestion path (gsheet, Bokun) must run a write through before it touches a row
 * that already exists, so a hand-corrected field is never silently reverted by a later re-sync no
 * matter what the source now reports for it.
 *
 * Only meaningful for a row that already exists: a brand-new booking has nothing recorded in
 * manual_overrides yet, so this is a no-op for inserts (callers can still call it unconditionally
 * — an empty/null overrides list returns the payload unchanged).
 */
export function stripManualOverrides<T extends Record<string, unknown>>(
  payload: T,
  overrides: string[] | null | undefined
): T {
  if (!overrides || overrides.length === 0) return payload;
  const blocked = new Set(overrides);
  const next: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(next)) {
    if (blocked.has(key)) delete next[key];
  }
  return next as T;
}
