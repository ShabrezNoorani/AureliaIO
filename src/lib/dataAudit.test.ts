import { describe, it, expect } from 'vitest';
import { runDataAudit, summarizeFindingsForAi, isPrivateBooking, type AuditInput, type AuditBooking } from './dataAudit';

const TODAY = '2026-10-31';
const booking = (o: Partial<AuditBooking>): AuditBooking => ({
  booking_ref: 'B1', travel_date: TODAY, booking_date: '2026-10-01', status: 'UPCOMING', channel: 'Web',
  product_name: 'Louvre Tour', option_name: 'Group', assigned_guide: null, gross_revenue: 100,
  ticket_cost: 10, guide_cost: null, extra_cost: 0, gyg_cost: 0, commission_amount: 0, marketplace_fee: 0,
  pax_adult: 2, pax_youth: 0, pax_child: 0, pax_infant: 0, ...o,
});
const empty = (): AuditInput => ({ bookings: [], sessions: [], sessionBookings: [], sessionGuides: [], checkins: [], reviews: [], guideAssignments: [], guides: [] });
const session = (id: string, o: Partial<AuditInput['sessions'][number]> = {}) =>
  ({ id, tour_date: TODAY, label: 'Morning', start_time: '09:00', max_pax_per_guide: null, needs_guide: false, ...o });
const types = (input: AuditInput) => runDataAudit(input, TODAY).map(f => f.type);

describe('runDataAudit', () => {
  it('returns no findings for consistent data', () => {
    const input = empty();
    input.bookings = [booking({ booking_ref: 'B1', status: 'DONE', assigned_guide: 'Ana', travel_date: '2026-10-30' })];
    expect(runDataAudit(input, TODAY)).toEqual([]);
  });

  it('flags a session with pax but no guide', () => {
    const input = empty();
    input.bookings = [booking({})];
    input.sessions = [session('S1')];
    input.sessionBookings = [{ session_id: 'S1', booking_ref: 'B1', allotted_guide_id: null }];
    expect(types(input)).toContain('session_needs_guide');
  });

  it('flags over capacity using guides × max pax', () => {
    const input = empty();
    input.bookings = [booking({ pax_adult: 12 })];
    input.sessions = [session('S1', { max_pax_per_guide: 10 })];
    input.sessionBookings = [{ session_id: 'S1', booking_ref: 'B1', allotted_guide_id: null }];
    input.sessionGuides = [{ session_id: 'S1', guide_id: 'G1', status: 'accepted', base_pay: 0, bonus: 0 }];
    expect(types(input)).toContain('over_capacity');
    expect(types(input)).not.toContain('session_needs_guide');
  });

  it('flags private mixed with group', () => {
    const input = empty();
    input.bookings = [booking({ booking_ref: 'P1', option_name: 'Private Tour' }), booking({ booking_ref: 'G1' })];
    input.sessions = [session('S1')];
    input.sessionBookings = ['P1', 'G1'].map(r => ({ session_id: 'S1', booking_ref: r, allotted_guide_id: null }));
    input.sessionGuides = [{ session_id: 'S1', guide_id: 'X', status: 'accepted', base_pay: 0, bonus: 0 }];
    expect(types(input)).toContain('mixed_private_group');
    expect(isPrivateBooking({ option_name: 'Visite privée', product_name: null })).toBe(true);
    expect(isPrivateBooking({ option_name: 'Privileged access', product_name: null })).toBe(false);
  });

  it('flags a review with no checked-in tour for that guide, and not one that matches', () => {
    const input = empty();
    input.guides = [{ id: 'G1', name: 'Amala' }];
    input.reviews = [
      { id: 'R1', guide_id: 'G1', review_date: '2026-10-20', stars: 5, approval_status: 'approved', reviewer_name: 'Guest' },
    ];
    expect(types(input)).toEqual(['review_no_tour']);
    input.guideAssignments = [{ guide_id: 'G1', travel_date: '2026-10-19' }];
    expect(types(input)).toEqual([]);
  });

  it('flags missing price/option and past UPCOMING', () => {
    const input = empty();
    input.bookings = [booking({ travel_date: '2026-11-05', gross_revenue: null, option_name: '' })];
    const f = runDataAudit(input, TODAY);
    expect(f.find(x => x.type === 'missing_data')?.detail).toMatch(/price, option/);
    input.bookings = [booking({ travel_date: '2026-10-20', assigned_guide: 'Ana' })];
    expect(types(input)).toContain('past_unresolved');
  });

  it('flags a missing guide only for today/future bookings, never past ones', () => {
    const input = empty();
    input.bookings = [
      booking({ booking_ref: 'PAST', travel_date: '2026-10-29', status: 'DONE' }),
      booking({ booking_ref: 'TODAY', travel_date: TODAY }),
      booking({ booking_ref: 'FUTURE', travel_date: '2026-11-03' }),
    ];
    const guideFlags = runDataAudit(input, TODAY).filter(f => f.type === 'missing_data' && /missing guide/.test(f.detail)).map(f => f.detail);
    expect(guideFlags.some(d => d.startsWith('TODAY'))).toBe(true);
    expect(guideFlags.some(d => d.startsWith('FUTURE'))).toBe(true);
    expect(guideFlags.some(d => d.startsWith('PAST'))).toBe(false);
  });

  it('still flags a missing price on a past booking', () => {
    const input = empty();
    input.bookings = [booking({ travel_date: '2026-10-29', status: 'DONE', gross_revenue: null })];
    expect(runDataAudit(input, TODAY).find(f => f.type === 'missing_data')?.detail).toMatch(/missing price$|missing price\./);
  });

  it('flags a P&L vs Ledger gap from an unrecognised status', () => {
    const input = empty();
    input.bookings = [booking({ travel_date: '2026-11-02', status: 'WEIRD' })];
    const f = runDataAudit(input, TODAY).find(x => x.type === 'pnl_ledger_mismatch');
    expect(f?.detail).toMatch(/unrecognised status/);
  });

  it('does not flag commission as a P&L/Ledger gap', () => {
    const input = empty();
    input.bookings = [booking({ travel_date: '2026-11-02', commission_amount: 20, marketplace_fee: 5 })];
    expect(types(input)).not.toContain('pnl_ledger_mismatch');
  });

  it('flags cancelled revenue and checked-in-but-unallotted', () => {
    const input = empty();
    input.bookings = [booking({ booking_ref: 'C1', status: 'CANCELLED', travel_date: '2026-11-02' }), booking({ booking_ref: 'B2' })];
    input.sessions = [session('S1')];
    input.sessionBookings = [{ session_id: 'S1', booking_ref: 'B2', allotted_guide_id: null }];
    input.sessionGuides = [{ session_id: 'S1', guide_id: 'X', status: 'accepted', base_pay: 0, bonus: 0 }];
    input.checkins = [{ booking_ref: 'B2', status: 'checked_in', travel_date: TODAY }];
    const details = runDataAudit(input, TODAY).filter(f => f.type === 'other').map(f => f.detail).join(' | ');
    expect(details).toMatch(/CANCELLED but still shows/);
    expect(details).toMatch(/isn't allotted/);
  });

  it('strips reviewer names from the AI payload', () => {
    const input = empty();
    input.reviews = [{ id: 'R1', guide_id: 'G1', review_date: '2026-10-20', stars: 5, approval_status: null, reviewer_name: 'Jane Doe' }];
    const payload = JSON.stringify(summarizeFindingsForAi(runDataAudit(input, TODAY)));
    expect(payload).not.toContain('Jane Doe');
  });
});
