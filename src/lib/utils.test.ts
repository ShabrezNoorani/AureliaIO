import { describe, it, expect } from 'vitest';
import { isCancelled, shortProductCode, checkinTime } from './utils';

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
