import { describe, it, expect } from 'vitest';
import { groupLabel, naturalGroupKey } from './DispatchPage';

describe('groupLabel', () => {
  it('shows the short code (id-prefixed product_code) — option_name, per the task examples', () => {
    expect(groupLabel({ product_code: '5591586P13', option_name: 'Guided Tour & Cathedral Visit' }))
      .toBe('P13 — Guided Tour & Cathedral Visit');
  });

  it('shows the short code for a G-code tour', () => {
    expect(groupLabel({ product_code: '5647756G5', option_name: 'Premium Interior Tour' }))
      .toBe('G5 — Premium Interior Tour');
  });

  it('handles a bare short code with no id prefix', () => {
    expect(groupLabel({ product_code: 'P13', option_name: 'Standard' })).toBe('P13 — Standard');
  });

  it('never falls back to a long product name — only the code, or "Unknown" when there is none', () => {
    expect(groupLabel({ product_code: null, option_name: 'Guided Tour & Cathedral Visit' }))
      .toBe('Unknown — Guided Tour & Cathedral Visit');
  });

  it('falls back to the raw product_code when it does not match the P/G+digits pattern, still never product_name', () => {
    expect(groupLabel({ product_code: 'CUSTOM-CODE', option_name: 'Standard' })).toBe('CUSTOM-CODE — Standard');
  });
});

describe('naturalGroupKey', () => {
  const base = { travel_time: '09:00', product_name: 'Cathedral Tour', option_name: 'Guided Tour & Cathedral Visit' };

  it('produces the SAME key for an old gsheet row ("P13") and a newer Bokun row ("5591586P13") for the same tour', () => {
    const oldRow = { ...base, product_code: 'P13' };
    const newRow = { ...base, product_code: '5591586P13' };
    expect(naturalGroupKey(oldRow)).toBe(naturalGroupKey(newRow));
  });

  it('still produces a DIFFERENT key for a genuinely different product/time/option', () => {
    const p13 = { ...base, product_code: 'P13' };
    const g5 = { ...base, product_code: '5647756G5' };
    expect(naturalGroupKey(p13)).not.toBe(naturalGroupKey(g5));

    const laterTime = { ...base, product_code: 'P13', travel_time: '10:00' };
    expect(naturalGroupKey(p13)).not.toBe(naturalGroupKey(laterTime));

    const differentOption = { ...base, product_code: 'P13', option_name: 'Skip the line' };
    expect(naturalGroupKey(p13)).not.toBe(naturalGroupKey(differentOption));
  });

  it('falls back to product_name (never product_code=null merging into a wrong bucket) when there is no code at all', () => {
    const noCodeA = { ...base, product_code: null, product_name: 'Cathedral Tour' };
    const noCodeB = { ...base, product_code: null, product_name: 'Louvre Tour' };
    expect(naturalGroupKey(noCodeA)).not.toBe(naturalGroupKey(noCodeB));
  });

  it('treats a missing travel_time as "No Time", grouped separately from a timed booking', () => {
    const noTime = { ...base, product_code: 'P13', travel_time: null };
    const timed = { ...base, product_code: 'P13' };
    expect(naturalGroupKey(noTime)).not.toBe(naturalGroupKey(timed));
  });
});
