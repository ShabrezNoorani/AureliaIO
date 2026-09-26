import { describe, it, expect } from 'vitest';
import { computeSessionCapacity, buildStaffingAlerts, type StaffingAlertSessionInput, type StaffingAlertBookingInput } from './staffingAlerts';

describe('computeSessionCapacity', () => {
  it('is not flagged when pax is within capacity', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: 10, needsGuide: false, assignedGuideCount: 2, totalPax: 20 });
    expect(r.capacity).toBe(20);
    expect(r.isFlagged).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it('flags red when pax exceeds capacity, with a readable reason', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: 10, needsGuide: false, assignedGuideCount: 2, totalPax: 25 });
    expect(r.capacity).toBe(20);
    expect(r.isFlagged).toBe(true);
    expect(r.reasons).toEqual(['over capacity: 25 pax / 20 cap']);
  });

  it('is not flagged at exactly capacity (pax must EXCEED, not just meet, capacity)', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: 10, needsGuide: false, assignedGuideCount: 2, totalPax: 20 });
    expect(r.isFlagged).toBe(false);
  });

  it('flags red with zero guides assigned and any pax, when a limit is set (capacity = 0)', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: 10, needsGuide: false, assignedGuideCount: 0, totalPax: 1 });
    expect(r.capacity).toBe(0);
    expect(r.isFlagged).toBe(true);
    expect(r.reasons).toEqual(['over capacity: 1 pax / 0 cap']);
  });

  it('has no capacity ceiling at all when no limit is set — never flags from pax alone', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: null, needsGuide: false, assignedGuideCount: 1, totalPax: 999 });
    expect(r.capacity).toBeNull();
    expect(r.isFlagged).toBe(false);
  });

  it('flags red via the manual needs_guide toggle regardless of pax/capacity', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: null, needsGuide: true, assignedGuideCount: 1, totalPax: 2 });
    expect(r.isFlagged).toBe(true);
    expect(r.reasons).toEqual(['manually flagged']);
  });

  it('reports BOTH reasons when a session is both over capacity and manually flagged', () => {
    const r = computeSessionCapacity({ maxPaxPerGuide: 10, needsGuide: true, assignedGuideCount: 1, totalPax: 15 });
    expect(r.reasons).toEqual(['over capacity: 15 pax / 10 cap', 'manually flagged']);
  });
});

describe('buildStaffingAlerts', () => {
  const session = (overrides: Partial<StaffingAlertSessionInput> & { id: string; tour_date: string }): StaffingAlertSessionInput => ({
    label: null, start_time: '09:00', max_pax_per_guide: null, needs_guide: false, ...overrides,
  });
  const booking = (overrides: Partial<StaffingAlertBookingInput> & { booking_ref: string }): StaffingAlertBookingInput => ({
    pax_adult: 1, pax_youth: 0, pax_child: 0, pax_infant: 0, status: 'UPCOMING', option_name: 'Standard', product_code: 'P13', ...overrides,
  });

  it('includes only flagged sessions, in the correct shape', () => {
    const sessions = [
      session({ id: 'S1', tour_date: '2026-09-26', max_pax_per_guide: 10 }),
      session({ id: 'S2', tour_date: '2026-09-26', max_pax_per_guide: 10 }),
    ];
    const sessionBookings = [
      { session_id: 'S1', booking_ref: 'B1' },
      { session_id: 'S2', booking_ref: 'B2' },
    ];
    const sessionGuides = [
      { session_id: 'S1', guide_id: 'G1', status: 'accepted' },
      { session_id: 'S2', guide_id: 'G2', status: 'accepted' },
    ];
    const bookings = [
      booking({ booking_ref: 'B1', pax_adult: 25 }), // over 10-cap for 1 guide
      booking({ booking_ref: 'B2', pax_adult: 5 }),  // under cap
    ];
    const alerts = buildStaffingAlerts(sessions, sessionBookings, sessionGuides, bookings);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ sessionId: 'S1', totalPax: 25, guideCount: 1, capacity: 10, reasons: ['over capacity: 25 pax / 10 cap'] });
  });

  it('labels an alert as "{short code} — {option name}" from the session\'s first linked booking', () => {
    const sessions = [session({ id: 'S1', tour_date: '2026-09-26', needs_guide: true, label: 'Custom label' })];
    const sessionBookings = [{ session_id: 'S1', booking_ref: 'B1' }];
    const sessionGuides: { session_id: string; guide_id: string; status: string }[] = [];
    const bookings = [booking({ booking_ref: 'B1', product_code: '5591586P13', option_name: 'Guided Tour & Cathedral Visit' })];
    const alerts = buildStaffingAlerts(sessions, sessionBookings, sessionGuides, bookings);
    expect(alerts[0].label).toBe('P13 — Guided Tour & Cathedral Visit');
  });

  it('falls back to the session\'s own label when no booking is linked yet', () => {
    const sessions = [session({ id: 'S1', tour_date: '2026-09-26', needs_guide: true, label: 'Custom label' })];
    const alerts = buildStaffingAlerts(sessions, [], [], []);
    expect(alerts[0].label).toBe('Custom label');
  });

  it('never counts a cancelled booking toward pax (so it never causes a false over-capacity flag)', () => {
    const sessions = [session({ id: 'S1', tour_date: '2026-09-26', max_pax_per_guide: 5 })];
    const sessionBookings = [
      { session_id: 'S1', booking_ref: 'B1' },
      { session_id: 'S1', booking_ref: 'B2' },
    ];
    const sessionGuides = [{ session_id: 'S1', guide_id: 'G1', status: 'accepted' }];
    const bookings = [
      booking({ booking_ref: 'B1', pax_adult: 4 }),
      booking({ booking_ref: 'B2', pax_adult: 10, status: 'CANCELLED' }),
    ];
    const alerts = buildStaffingAlerts(sessions, sessionBookings, sessionGuides, bookings);
    expect(alerts).toHaveLength(0);
  });

  it('sorts by tour_date then start_time', () => {
    const sessions = [
      session({ id: 'LATE', tour_date: '2026-09-27', start_time: '14:00', needs_guide: true }),
      session({ id: 'EARLY_TODAY', tour_date: '2026-09-26', start_time: '08:00', needs_guide: true }),
      session({ id: 'LATE_TODAY', tour_date: '2026-09-26', start_time: '16:00', needs_guide: true }),
    ];
    const alerts = buildStaffingAlerts(sessions, [], [], []);
    expect(alerts.map((a) => a.sessionId)).toEqual(['EARLY_TODAY', 'LATE_TODAY', 'LATE']);
  });

  it('shows a plain "All staffed" state by simply returning an empty array when nothing is flagged', () => {
    const sessions = [session({ id: 'S1', tour_date: '2026-09-26', max_pax_per_guide: 10 })];
    const sessionBookings = [{ session_id: 'S1', booking_ref: 'B1' }];
    const sessionGuides = [{ session_id: 'S1', guide_id: 'G1', status: 'accepted' }];
    const bookings = [booking({ booking_ref: 'B1', pax_adult: 5 })];
    expect(buildStaffingAlerts(sessions, sessionBookings, sessionGuides, bookings)).toEqual([]);
  });
});
