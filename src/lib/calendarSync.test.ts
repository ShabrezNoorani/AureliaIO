import { describe, it, expect } from 'vitest';
import { tourSessionWindowIso } from './calendarSync';

describe('tourSessionWindowIso', () => {
  it('converts a summer (CEST, UTC+2) Paris tour time to the correct UTC instant', () => {
    const { startISO, endISO } = tourSessionWindowIso('2026-09-26', '09:00');
    expect(startISO).toBe('2026-09-26T07:00:00.000Z');
    expect(endISO).toBe('2026-09-26T08:00:00.000Z');
  });

  it('converts a winter (CET, UTC+1) Paris tour time to the correct UTC instant', () => {
    const { startISO, endISO } = tourSessionWindowIso('2026-01-15', '09:00');
    expect(startISO).toBe('2026-01-15T08:00:00.000Z');
    expect(endISO).toBe('2026-01-15T09:00:00.000Z');
  });

  it('always makes the window exactly 60 minutes', () => {
    const { startISO, endISO } = tourSessionWindowIso('2026-06-01', '14:37');
    expect(new Date(endISO).getTime() - new Date(startISO).getTime()).toBe(60 * 60 * 1000);
  });

  it('is correct right at the spring-forward DST boundary (Paris: 29 Mar 2026, 02:00 -> 03:00 CEST)', () => {
    // 01:00 local, still CET (UTC+1) — before the jump.
    const before = tourSessionWindowIso('2026-03-29', '01:00');
    expect(before.startISO).toBe('2026-03-29T00:00:00.000Z');
    // 04:00 local, already CEST (UTC+2) — after the jump.
    const after = tourSessionWindowIso('2026-03-29', '04:00');
    expect(after.startISO).toBe('2026-03-29T02:00:00.000Z');
  });

  it('is correct right at the autumn fall-back boundary (Paris: 25 Oct 2026, 03:00 CEST -> 02:00 CET)', () => {
    // 01:00 local, still CEST (UTC+2) — before the fall-back.
    const before = tourSessionWindowIso('2026-10-25', '01:00');
    expect(before.startISO).toBe('2026-10-24T23:00:00.000Z');
    // 04:00 local, already CET (UTC+1) — after the fall-back.
    const after = tourSessionWindowIso('2026-10-25', '04:00');
    expect(after.startISO).toBe('2026-10-25T03:00:00.000Z');
  });
});
