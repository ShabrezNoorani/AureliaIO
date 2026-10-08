import { describe, it, expect } from 'vitest';
import { computeBalance, pickLeastLoadedGuide, type BalanceGuestInput } from './allocationBalance';

const guide = (id: string, locked = false) => ({ id, locked });
const guest = (bookingRef: string, pax: number, allottedGuideId: string | null, isCheckedIn = false): BalanceGuestInput => (
  { bookingRef, pax, allottedGuideId, isCheckedIn }
);

describe('pickLeastLoadedGuide', () => {
  it('picks the lowest running total, ties going to the earlier guide', () => {
    expect(pickLeastLoadedGuide([{ id: 'a' }, { id: 'b' }], { a: 3, b: 1 })).toBe('b');
    expect(pickLeastLoadedGuide([{ id: 'a' }, { id: 'b' }], { a: 2, b: 2 })).toBe('a');
  });

  it('returns null with no unlocked guides', () => {
    expect(pickLeastLoadedGuide([], {})).toBeNull();
  });
});

describe('computeBalance', () => {
  it('errors when every guide is locked', () => {
    const result = computeBalance([guide('a', true)], [guest('B1', 2, null)]);
    expect(result).toEqual({ error: 'No unlocked guides to balance across.' });
  });

  it('distributes unallotted, CHECKED-IN guests evenly, largest group first', () => {
    const guides = [guide('a'), guide('b')];
    const guests = [guest('B1', 5, null, true), guest('B2', 1, null, true), guest('B3', 3, null, true)];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');
    // B1 (5) -> a (0), B3 (3) -> b (0), B2 (1) -> b (3) since b(3) < a(5)
    expect(result.moves).toEqual([
      { bookingRef: 'B1', newGuideId: 'a' },
      { bookingRef: 'B3', newGuideId: 'b' },
      { bookingRef: 'B2', newGuideId: 'b' },
    ]);
    expect(result.totalsByGuideId).toEqual({ a: 5, b: 4 });
  });

  it('NEVER moves a not-checked-in guest, even if unallotted — the pool is checked-in guests only', () => {
    const guides = [guide('a'), guide('b')];
    const guests = [guest('NOT_CHECKED_IN', 5, null, false)];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.moves).toEqual([]);
    // Not counted toward any guide's total either — not-checked-in guests are invisible to
    // Balance entirely (the Allocation tab must never even show them, and callers are expected to
    // filter them out before calling computeBalance at all — this pins the defensive fallback).
    expect(result.totalsByGuideId).toEqual({ a: 0, b: 0 });
  });

  // REGRESSION / NEW RULE: a checked-in guest's allotment does NOT lock them in place by itself
  // — only a guide actually being LOCKED does. Exercises all four cases together: movable off an
  // unlocked guide, untouched on a locked guide, a plain unallotted guest still placed, and a
  // not-checked-in guest excluded regardless of anything else.
  it('pool = checked-in guests on unlocked guides + unallotted; checked-in guests on a locked guide are untouched; not-checked-in guests are always excluded', () => {
    const guides = [guide('a'), guide('b'), guide('locked', true)];
    const guests = [
      guest('ON_A_1', 6, 'a', true),         // checked-in, on UNLOCKED 'a' — movable
      guest('ON_A_2', 6, 'a', true),         // checked-in, on UNLOCKED 'a' — movable (second group)
      guest('ON_LOCKED', 10, 'locked', true), // checked-in, on a LOCKED guide — must stay, excluded
      guest('UNALLOTTED', 4, null, true),     // checked-in, unallotted — movable
      guest('NOT_CHECKED_IN', 99, null, false), // not checked in — excluded no matter what
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');

    const movedRefs = result.moves.map(m => m.bookingRef);
    // ON_LOCKED never moves and never even appears — it's excluded from the pool entirely.
    expect(movedRefs).not.toContain('ON_LOCKED');
    // NOT_CHECKED_IN is never touched regardless of its (null) allotment.
    expect(movedRefs).not.toContain('NOT_CHECKED_IN');
    // At least one of guide 'a's own checked-in guests gets moved off 'a' during redistribution —
    // proving they were NOT locked in place just by having checked in there.
    const onA = guests.filter(g => g.allottedGuideId === 'a').map(g => g.bookingRef);
    expect(result.moves.some(m => onA.includes(m.bookingRef))).toBe(true);
    // The unallotted guest is still placed somewhere, same as before.
    expect(movedRefs).toContain('UNALLOTTED');
    // Locked guide 'locked' has no entry at all — its guests (and their pax) are invisible here.
    expect(result.totalsByGuideId).not.toHaveProperty('locked');
    expect(Object.keys(result.totalsByGuideId).sort()).toEqual(['a', 'b']);
  });

  it('excludes a locked guide from both the pool and the totals summary, even for its own guests', () => {
    const guides = [guide('a', true), guide('b')];
    const guests = [
      guest('ON_LOCKED', 10, 'a', true),
      guest('UNALLOTTED', 1, null, true),
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.moves).toEqual([{ bookingRef: 'UNALLOTTED', newGuideId: 'b' }]);
    expect(result.totalsByGuideId).toEqual({ b: 1 }); // 'a' (locked) never appears here
  });

  // WORKED EXAMPLE from the fix spec: 2 unlocked guides, all guests checked-in and currently all
  // on guide A — after Balance they split across A and B instead of staying put ("already
  // balanced"). This is the exact scenario that was previously broken: the old rule treated
  // CHECKED_IN_BY_A-style guests as untouchable, so Balance reported nothing to do.
  it('worked example: guests all checked in under guide A split across A and B once both are unlocked', () => {
    const guides = [guide('guideA'), guide('guideB')];
    const guests = [
      guest('ON_A_BIG', 8, 'guideA', true),
      guest('ON_A_SMALL', 2, 'guideA', true),
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');

    // The smaller group moves off guideA onto guideB — proving a checked-in guest is NOT locked
    // to the guide who checked them in merely because that guide isn't locked.
    expect(result.moves).toEqual([{ bookingRef: 'ON_A_SMALL', newGuideId: 'guideB' }]);
    expect(result.totalsByGuideId).toEqual({ guideA: 8, guideB: 2 });
  });

  // Second half of the same worked example: lock guideA and re-run. guideA's guests must now stay
  // put (locked guides are entirely out of the redistribution); only guests on the remaining
  // unlocked guide(s) are eligible to move.
  it('worked example continued: locking guide A keeps its guests in place; only the rest redistribute', () => {
    const guides = [guide('guideA', true), guide('guideB'), guide('guideC')];
    const guests = [
      guest('ON_A', 8, 'guideA', true),        // locked guide's own guest — stays, excluded
      guest('ON_C_BIG', 7, 'guideC', true),     // on unlocked guideC, the larger pool group
      guest('ON_B_SMALL', 1, 'guideB', true),   // on unlocked guideB, the smaller pool group
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');

    const movedRefs = result.moves.map(m => m.bookingRef);
    // Nothing on locked guideA ever appears as a move.
    expect(movedRefs).not.toContain('ON_A');
    // guideA has no entry at all in the totals — entirely out of the redistribution.
    expect(result.totalsByGuideId).not.toHaveProperty('guideA');
    expect(Object.keys(result.totalsByGuideId).sort()).toEqual(['guideB', 'guideC']);
    // Largest-group-first picks the tied (both start at 0) FIRST unlocked guide (guideB) for the
    // 7-pax group, then the now-least-loaded guideC for the 1-pax group — redistributing both,
    // proving neither was locked in place just by already being checked in somewhere.
    expect(result.moves).toEqual([
      { bookingRef: 'ON_C_BIG', newGuideId: 'guideB' },
      { bookingRef: 'ON_B_SMALL', newGuideId: 'guideC' },
    ]);
    expect(result.totalsByGuideId).toEqual({ guideB: 7, guideC: 1 });
  });

  it('reports zero GENUINE moves when every guest already resolves back to its own (sole) guide', () => {
    const guides = [guide('a')];
    const guests = [guest('X', 3, 'a', true)];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');
    // X is in the pool now (its guide 'a' is unlocked), but with only one unlocked guide it
    // always resolves right back to 'a' — a no-op, so no move is recorded for it.
    expect(result.moves).toEqual([]);
    expect(result.totalsByGuideId).toEqual({ a: 3 });
  });
});
