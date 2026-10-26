// What a logged-in guide is allowed to see, derived from their own guides row's status +
// inactivated_at. Pure so the 60-day countdown boundaries are unit-testable without a clock.
//
//  - active   → the normal guide shell, unchanged.
//  - limited  → status 'inactive', still inside the grace period: earnings/pay history ONLY (no
//               tours, guests, live board, allocation or check-in), plus a countdown banner.
//  - closed   → inactive for INACTIVE_GRACE_DAYS or more: login is fully blocked.

export const INACTIVE_GRACE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type GuideAccess =
  | { kind: 'active' }
  | { kind: 'limited'; daysLeft: number }
  | { kind: 'closed' };

export function isInactiveStatus(status: string | null | undefined): boolean {
  return (status || '').trim().toLowerCase() === 'inactive';
}

/**
 * daysLeft counts DOWN from 60: 60 on the day they were marked inactive, 59 once a full day has
 * passed, … 1 on the last day; at 60 full days it becomes 'closed'. An inactive row with no
 * inactivated_at (marked inactive before the column existed, or the column not migrated yet) is
 * treated as inactivated just now — limited with the full 60 days, never silently 'active' and
 * never instantly 'closed'. An unparseable date is treated the same way.
 */
export function resolveGuideAccess(
  status: string | null | undefined,
  inactivatedAt: string | null | undefined,
  now: Date = new Date()
): GuideAccess {
  if (!isInactiveStatus(status)) return { kind: 'active' };

  const since = inactivatedAt ? new Date(inactivatedAt).getTime() : NaN;
  if (Number.isNaN(since)) return { kind: 'limited', daysLeft: INACTIVE_GRACE_DAYS };

  const remainingMs = since + INACTIVE_GRACE_DAYS * DAY_MS - now.getTime();
  if (remainingMs <= 0) return { kind: 'closed' };
  return { kind: 'limited', daysLeft: Math.min(INACTIVE_GRACE_DAYS, Math.ceil(remainingMs / DAY_MS)) };
}
