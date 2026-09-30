import { describe, it, expect } from 'vitest';
import { isCancelled, shortProductCode, checkinTime, normalizeTime, datePresetRange } from './utils';

describe('isCancelled', () => {
  it('matches the single "CANCELLED" status the DB now writes', () => {
    expect(isCancelled('CANCELLED')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isCancelled('cancelled')).toBe(true);
    expect(isCancelled('Cancelled')).toBe(true);
  });

  it('stays defensive against a not-yet-normalized legacy value', () => {
    expect(isCancelled('CANCELLED_EARLY')).toBe(true);
    expect(isCancelled('CANCELLED_LATE')).toBe(true);
  });

  it('is false for every other status', () => {
    expect(isCancelled('UPCOMING')).toBe(false);
    expect(isCancelled('DONE')).toBe(false);
    expect(isCancelled('NO_SHOW')).toBe(false);
  });

  it('is false for null/undefined/empty', () => {
    expect(isCancelled(null)).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
    expect(isCancelled('')).toBe(false);
  });
});

describe('shortProductCode (regression check, unrelated to this change)', () => {
  it('still extracts the trailing code', () => {
    expect(shortProductCode('5591586P13')).toBe('P13');
  });
});

describe('checkinTime', () => {
  it('is 15 minutes before a normal start time', () => {
    expect(checkinTime('09:00')).toBe('08:45');
  });

  it('handles a start time not on a 15-minute boundary', () => {
    expect(checkinTime('09:05')).toBe('08:50');
  });

  it('rolls back across an hour boundary', () => {
    expect(checkinTime('10:00')).toBe('09:45');
  });

  it('clamps at 00:00 instead of wrapping to the previous day', () => {
    expect(checkinTime('00:10')).toBe('00:00');
    expect(checkinTime('00:00')).toBe('00:00');
  });

  it('is null for a missing or unparseable start time', () => {
    expect(checkinTime(null)).toBeNull();
    expect(checkinTime(undefined)).toBeNull();
    expect(checkinTime('')).toBeNull();
    expect(checkinTime('not a time')).toBeNull();
  });

  it('tolerates a single-digit hour', () => {
    expect(checkinTime('9:00')).toBe('08:45');
  });
});

describe('normalizeTime', () => {
  it('is a no-op for an already-normalized "HH:MM" string', () => {
    expect(normalizeTime('09:00')).toBe('09:00');
    expect(normalizeTime('16:30')).toBe('16:30');
  });

  it('pads a single-digit hour with no minutes lost', () => {
    expect(normalizeTime('9:05')).toBe('09:05');
  });

  it('converts 12-hour AM/PM times to 24-hour', () => {
    expect(normalizeTime('9:00:00 AM')).toBe('09:00');
    expect(normalizeTime('9:00 AM')).toBe('09:00');
    expect(normalizeTime('9 AM')).toBe('09:00');
    expect(normalizeTime('2:30 PM')).toBe('14:30');
    expect(normalizeTime('2:30pm')).toBe('14:30');
  });

  it('handles the AM/PM midnight and noon edge cases', () => {
    expect(normalizeTime('12:00 AM')).toBe('00:00');
    expect(normalizeTime('12:00 PM')).toBe('12:00');
  });

  it('strips trailing seconds from an already-24h value', () => {
    expect(normalizeTime('23:00:00')).toBe('23:00');
    expect(normalizeTime('9:00:00')).toBe('09:00');
  });

  it('treats a bare hour with no minutes as :00', () => {
    expect(normalizeTime('9')).toBe('09:00');
  });

  it('returns null for anything that is not a recognizable time', () => {
    expect(normalizeTime('No Time')).toBeNull();
    expect(normalizeTime('TBD')).toBeNull();
    expect(normalizeTime('99:00')).toBeNull();
    expect(normalizeTime('25:00')).toBeNull();
  });

  it('is null-safe', () => {
    expect(normalizeTime(null)).toBeNull();
    expect(normalizeTime(undefined)).toBeNull();
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime('   ')).toBeNull();
  });
});

describe('datePresetRange', () => {
  // Wednesday — a mid-week anchor so "this week" isn't accidentally right on a boundary.
  const wed = new Date(2026, 8, 30); // 2026-09-30

  it('today/yesterday/tomorrow are each a single-day range, in LOCAL time', () => {
    expect(datePresetRange('today', wed)).toEqual({ start: '2026-09-30', end: '2026-09-30' });
    expect(datePresetRange('yesterday', wed)).toEqual({ start: '2026-09-29', end: '2026-09-29' });
    expect(datePresetRange('tomorrow', wed)).toEqual({ start: '2026-10-01', end: '2026-10-01' });
  });

  it('this week is Monday-to-Sunday of the week containing the anchor', () => {
    expect(datePresetRange('thisWeek', wed)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
  });

  it('this week anchored on a Sunday still resolves to THAT week (not the next one)', () => {
    const sunday = new Date(2026, 9, 4); // 2026-10-04, the Sunday from the range above
    expect(datePresetRange('thisWeek', sunday)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
  });

  it('this week anchored on a Monday starts on that same Monday', () => {
    const monday = new Date(2026, 8, 28); // 2026-09-28
    expect(datePresetRange('thisWeek', monday)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
  });

  it('this month is the 1st to the last day of the anchor\'s calendar month', () => {
    expect(datePresetRange('thisMonth', wed)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('tomorrow correctly rolls over a year boundary', () => {
    const newYearsEve = new Date(2026, 11, 31); // 2026-12-31
    expect(datePresetRange('tomorrow', newYearsEve)).toEqual({ start: '2027-01-01', end: '2027-01-01' });
  });

  it('this month handles a 31-day month correctly (no drift into next month)', () => {
    expect(datePresetRange('thisMonth', new Date(2026, 11, 15))).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});
