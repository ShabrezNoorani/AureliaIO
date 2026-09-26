import { describe, it, expect } from 'vitest';
import { isCancelled, shortProductCode, checkinTime, normalizeTime } from './utils';

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
