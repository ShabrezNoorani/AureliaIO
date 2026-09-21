import { describe, it, expect } from 'vitest';
import {
  addManualOverrides, stripManualOverrides, isProtectableBookingField, PROTECTABLE_BOOKING_FIELDS,
} from './bookingOverrides';

describe('isProtectableBookingField', () => {
  it('recognizes every field the task listed as owner-editable', () => {
    for (const f of [
      'customer_name', 'customer_phone', 'travel_date', 'travel_time', 'option_name',
      'product_code', 'channel', 'pax_adult', 'pax_youth', 'pax_child', 'pax_infant', 'status',
      'gross_revenue', 'guide_cost', 'extra_cost', 'ticket_cost', 'gyg_cost',
    ]) {
      expect(isProtectableBookingField(f)).toBe(true);
    }
  });

  it('rejects derived/system fields that must always keep syncing', () => {
    for (const f of ['net_profit', 'net_revenue', 'commission_amount', 'total_pax', 'sync_source', 'id', 'user_id', 'booking_ref']) {
      expect(isProtectableBookingField(f)).toBe(false);
    }
  });
});

describe('addManualOverrides', () => {
  it('starts from an empty list when nothing has been overridden yet', () => {
    expect(addManualOverrides(null, ['customer_name'])).toEqual(['customer_name']);
    expect(addManualOverrides(undefined, ['customer_name'])).toEqual(['customer_name']);
  });

  it('unions with the existing overrides instead of replacing them', () => {
    expect(addManualOverrides(['customer_name'], ['travel_date'])).toEqual(['customer_name', 'travel_date']);
  });

  it('de-duplicates a field re-edited more than once', () => {
    expect(addManualOverrides(['customer_name'], ['customer_name'])).toEqual(['customer_name']);
  });

  it('silently ignores anything not in PROTECTABLE_BOOKING_FIELDS', () => {
    expect(addManualOverrides([], ['net_profit', 'id', 'customer_name'])).toEqual(['customer_name']);
  });

  it('returns a sorted list regardless of insertion order', () => {
    expect(addManualOverrides([], ['travel_time', 'channel', 'customer_name'])).toEqual(
      ['channel', 'customer_name', 'travel_time']
    );
  });
});

describe('stripManualOverrides', () => {
  it('returns the payload unchanged when there are no overrides', () => {
    const payload = { customer_name: 'New Name', travel_date: '2026-01-01' };
    expect(stripManualOverrides(payload, null)).toEqual(payload);
    expect(stripManualOverrides(payload, [])).toEqual(payload);
  });

  it('drops exactly the overridden keys, leaving everything else untouched', () => {
    const payload = { customer_name: 'Sheet Name', travel_date: '2026-01-01', channel: 'Viator' };
    const result = stripManualOverrides(payload, ['customer_name']);
    expect(result).toEqual({ travel_date: '2026-01-01', channel: 'Viator' });
    expect('customer_name' in result).toBe(false);
  });

  it('drops every overridden key when several fields are protected at once', () => {
    const payload = { customer_name: 'X', customer_phone: '123', travel_date: '2026-01-01', channel: 'GYG' };
    const result = stripManualOverrides(payload, ['customer_name', 'travel_date']);
    expect(result).toEqual({ customer_phone: '123', channel: 'GYG' });
  });

  it('never mutates the original payload object', () => {
    const payload = { customer_name: 'X' };
    stripManualOverrides(payload, ['customer_name']);
    expect(payload).toEqual({ customer_name: 'X' });
  });

  it('a field that was never overridden keeps syncing normally', () => {
    const payload = { gross_revenue: 150, guide_cost: 20 };
    const result = stripManualOverrides(payload, ['guide_cost']);
    expect(result.gross_revenue).toBe(150);
    expect('guide_cost' in result).toBe(false);
  });
});

describe('PROTECTABLE_BOOKING_FIELDS', () => {
  it('has no duplicate entries', () => {
    expect(new Set(PROTECTABLE_BOOKING_FIELDS).size).toBe(PROTECTABLE_BOOKING_FIELDS.length);
  });
});
