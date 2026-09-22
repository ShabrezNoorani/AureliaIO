import { describe, it, expect } from 'vitest';
import { isCancelled, shortProductCode } from './utils';

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
