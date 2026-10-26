import { describe, it, expect } from 'vitest';
import { resolveGuideAccess, INACTIVE_GRACE_DAYS } from './guideAccountStatus';

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-10-01T09:00:00Z');
const at = (days: number) => new Date(t0.getTime() + days * DAY);

describe('resolveGuideAccess', () => {
  it('active guides are untouched, regardless of inactivated_at', () => {
    expect(resolveGuideAccess('active', null, t0)).toEqual({ kind: 'active' });
    expect(resolveGuideAccess('Active', t0.toISOString(), at(400))).toEqual({ kind: 'active' });
    expect(resolveGuideAccess(null, null, t0)).toEqual({ kind: 'active' });
  });

  it('shows 60 on the day of inactivation and counts down one per full day', () => {
    expect(resolveGuideAccess('inactive', t0.toISOString(), t0)).toEqual({ kind: 'limited', daysLeft: 60 });
    expect(resolveGuideAccess('inactive', t0.toISOString(), at(0.5))).toEqual({ kind: 'limited', daysLeft: 60 });
    expect(resolveGuideAccess('inactive', t0.toISOString(), at(1))).toEqual({ kind: 'limited', daysLeft: 59 });
    expect(resolveGuideAccess('inactive', t0.toISOString(), at(59.5))).toEqual({ kind: 'limited', daysLeft: 1 });
  });

  it('is closed once 60 full days have passed', () => {
    expect(resolveGuideAccess('inactive', t0.toISOString(), at(INACTIVE_GRACE_DAYS))).toEqual({ kind: 'closed' });
    expect(resolveGuideAccess('INACTIVE', t0.toISOString(), at(90))).toEqual({ kind: 'closed' });
  });

  it('an inactive guide with no (or a bad) date gets the full limited window, never active or closed', () => {
    expect(resolveGuideAccess('inactive', null, t0)).toEqual({ kind: 'limited', daysLeft: 60 });
    expect(resolveGuideAccess('inactive', 'not-a-date', t0)).toEqual({ kind: 'limited', daysLeft: 60 });
  });

  it('a future inactivated_at (clock skew) never shows more than 60', () => {
    expect(resolveGuideAccess('inactive', at(2).toISOString(), t0)).toEqual({ kind: 'limited', daysLeft: 60 });
  });
});
