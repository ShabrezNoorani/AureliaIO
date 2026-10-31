import { supabase } from './supabase';
import type { AuditInput } from './dataAudit';

// READ-ONLY loader for the Health Check: SELECTs only, each scoped to the owner's own user_id
// (RLS enforces the same). guide_reviews uses '*' so the read still works if the approval_status
// column isn't migrated yet (a missing value is treated as approved, same as the app). Paged so large tables aren't silently cut at PostgREST's row cap.

const PAGE = 1000;
const MAX_ROWS = 100_000;

async function selectAll<T>(table: string, columns: string, ownerId: string, orderBy: string[] = ['id']): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    // Stable ordering so pages never skip/duplicate rows.
    let q = supabase.from(table as never).select(columns).eq('user_id', ownerId);
    orderBy.forEach(col => { q = q.order(col, { ascending: true }); });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read ${table}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function loadAuditInput(ownerId: string): Promise<AuditInput> {
  const [bookings, sessions, sessionBookings, sessionGuides, checkins, reviews, guideAssignments, guides] = await Promise.all([
    selectAll<AuditInput['bookings'][number]>('bookings',
      'booking_ref, travel_date, booking_date, status, channel, product_name, option_name, assigned_guide, gross_revenue, ticket_cost, guide_cost, extra_cost, gyg_cost, commission_amount, marketplace_fee, pax_adult, pax_youth, pax_child, pax_infant',
      ownerId),
    selectAll<AuditInput['sessions'][number]>('tour_sessions', 'id, tour_date, label, start_time, max_pax_per_guide, needs_guide', ownerId),
    selectAll<AuditInput['sessionBookings'][number]>('session_bookings', 'session_id, booking_ref, allotted_guide_id', ownerId, ['session_id', 'booking_ref']),
    selectAll<AuditInput['sessionGuides'][number]>('session_guides', 'session_id, guide_id, status, base_pay, bonus', ownerId, ['session_id', 'guide_id']),
    selectAll<AuditInput['checkins'][number]>('checkins', 'booking_ref, status, travel_date', ownerId),
    selectAll<AuditInput['reviews'][number]>('guide_reviews', '*', ownerId),
    selectAll<AuditInput['guideAssignments'][number]>('guide_assignments', 'guide_id, travel_date', ownerId),
    selectAll<AuditInput['guides'][number]>('guides', 'id, name', ownerId),
  ]);
  return { bookings, sessions, sessionBookings, sessionGuides, checkins, reviews, guideAssignments, guides };
}
