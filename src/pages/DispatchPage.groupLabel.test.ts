import { describe, it, expect } from 'vitest';
import { groupLabel } from './DispatchPage';

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
