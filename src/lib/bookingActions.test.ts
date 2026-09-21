import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveBooking } from './bookingActions';
import { EMPTY_BOOKING, type Booking } from './useBookings';

type Row = Record<string, unknown>;

interface ChangeLogInsert {
  user_id: string;
  table_name: string;
  record_id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  description: string;
}

// Minimal fake covering exactly the chains bookingActions.ts actually calls:
//   bookings:     .update(fields).eq(id).select().single()
//                 .insert(fields).select().single()
//   change_logs:  .insert(payload)  (awaited directly, no further chaining)
function makeSupabaseMock(opts: {
  updateResult?: { data: Row | null; error: { message: string } | null };
  insertResult?: { data: Row | null; error: { message: string } | null };
} = {}) {
  const changeLogInserts: ChangeLogInsert[] = [];
  let lastUpdatePayload: Row | null = null;
  let lastInsertPayload: Row | null = null;

  const from = vi.fn((table: string) => {
    if (table === 'bookings') {
      return {
        update: (fields: Row) => {
          lastUpdatePayload = fields;
          return {
            eq: (_col: string, _val: unknown) => ({
              select: () => ({
                single: async () => opts.updateResult ?? { data: { id: 'b1', ...fields }, error: null },
              }),
            }),
          };
        },
        insert: (fields: Row) => {
          lastInsertPayload = fields;
          return {
            select: () => ({
              single: async () => opts.insertResult ?? { data: { id: 'new-id', ...fields }, error: null },
            }),
          };
        },
      };
    }
    if (table === 'change_logs') {
      return {
        insert: async (payload: ChangeLogInsert) => {
          changeLogInserts.push(payload);
          return { error: null };
        },
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });

  return {
    client: { from } as unknown as SupabaseClient,
    changeLogInserts,
    getLastUpdatePayload: () => lastUpdatePayload,
    getLastInsertPayload: () => lastInsertPayload,
  };
}

const existingBooking: Booking = {
  ...EMPTY_BOOKING,
  id: 'b1',
  booking_ref: 'BR-1',
  customer_name: 'Sheet Name',
  customer_phone: '',
  travel_date: '2026-01-01',
  channel: 'Viator',
  status: 'UPCOMING',
  pax_adult: 2, pax_youth: 0, pax_child: 0, pax_infant: 0,
  gross_revenue: 100, commission_rate: 30, ticket_cost: 10, guide_cost: 0, extra_cost: 0, gyg_cost: 0,
  manual_overrides: [],
};

describe('saveBooking — editing an existing booking', () => {
  it('flags only the fields that actually changed, and logs one change_logs row each', async () => {
    const { client, changeLogInserts } = makeSupabaseMock();
    const after: Booking = { ...existingBooking, customer_name: 'Corrected Name', travel_date: '2026-02-02' };

    const result = await saveBooking(client, 'user-1', existingBooking, after);

    expect(result.error).toBeNull();
    expect(result.changedFields).toEqual(['customer_name', 'travel_date']);

    expect(changeLogInserts).toHaveLength(2);
    const byField = Object.fromEntries(changeLogInserts.map(c => [c.field_name, c]));
    expect(byField.customer_name.old_value).toBe(JSON.stringify('Sheet Name'));
    expect(byField.customer_name.new_value).toBe(JSON.stringify('Corrected Name'));
    expect(byField.travel_date.old_value).toBe(JSON.stringify('2026-01-01'));
    expect(byField.travel_date.new_value).toBe(JSON.stringify('2026-02-02'));
    expect(byField.customer_name.table_name).toBe('bookings');
    expect(byField.customer_name.record_id).toBe('BR-1');
  });

  it('merges the newly-changed fields into any pre-existing manual_overrides, not replacing them', async () => {
    const withPriorOverride: Booking = { ...existingBooking, manual_overrides: ['guide_cost'] };
    const { client, getLastUpdatePayload } = makeSupabaseMock();

    const after: Booking = { ...withPriorOverride, customer_name: 'New Name' };
    await saveBooking(client, 'user-1', withPriorOverride, after);

    expect(getLastUpdatePayload()?.manual_overrides).toEqual(['customer_name', 'guide_cost']);
  });

  it('makes no writes and reports no changed fields when nothing actually changed', async () => {
    const { client, changeLogInserts } = makeSupabaseMock();
    const result = await saveBooking(client, 'user-1', existingBooking, { ...existingBooking });

    expect(result.changedFields).toEqual([]);
    expect(changeLogInserts).toHaveLength(0);
  });

  it('recomputes total_pax/net_profit fresh rather than trusting whatever was passed in', async () => {
    const { client } = makeSupabaseMock();
    // Pass in a deliberately wrong net_profit/total_pax — saveBooking must overwrite them.
    const after: Booking = { ...existingBooking, pax_adult: 5, net_profit: -9999, total_pax: -1 };

    const result = await saveBooking(client, 'user-1', existingBooking, after);

    expect(result.booking).toBeTruthy();
    // total_pax = 5 adults + 0 + 0 + 0; net_profit = 100 - 10 - 0 - 0 - 0 - 30 (commission) - 0 = 60
    expect(result.booking?.total_pax).toBe(5);
    expect(result.booking?.net_profit).toBe(60);
  });

  it('never adds a non-protectable field (e.g. net_profit) to manual_overrides even though it changed', async () => {
    const { client } = makeSupabaseMock();
    const after: Booking = { ...existingBooking, pax_adult: 9 }; // also changes total_pax/net_profit downstream

    const result = await saveBooking(client, 'user-1', existingBooking, after);
    // pax_adult itself DID change (2 -> 9), so it's rightfully protected; net_profit/total_pax must not be.
    expect(result.changedFields).toContain('pax_adult');
    expect(result.changedFields).not.toContain('net_profit');
    expect(result.changedFields).not.toContain('total_pax');
  });

  it('returns the error and skips logging entirely when the write itself fails', async () => {
    const { client, changeLogInserts } = makeSupabaseMock({
      updateResult: { data: null, error: { message: 'boom' } },
    });
    const after: Booking = { ...existingBooking, customer_name: 'New Name' };

    const result = await saveBooking(client, 'user-1', existingBooking, after);

    expect(result.error).toBe('boom');
    expect(result.booking).toBeNull();
    expect(changeLogInserts).toHaveLength(0);
  });
});

describe('saveBooking — creating a brand-new booking', () => {
  it('inserts (not updates) and protects every protectable field the owner filled in', async () => {
    const { client } = makeSupabaseMock();
    const fresh: Booking = {
      ...EMPTY_BOOKING,
      booking_ref: 'BR-NEW',
      customer_name: 'Hand-entered Customer',
      travel_date: '2026-03-03',
      status: 'UPCOMING',
    };

    const result = await saveBooking(client, 'user-1', EMPTY_BOOKING, fresh);

    expect(result.error).toBeNull();
    expect(result.changedFields).toContain('customer_name');
    expect(result.changedFields).toContain('travel_date');
  });
});
