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

  it('never touches an already-allotted checked-in guest (locked to whoever checked them in), and never moves a not-checked-in guest even if also unallotted', () => {
    const guides = [guide('a'), guide('b')];
    const guests = [
      guest('CHECKED_IN_ON_A', 4, 'a', true),      // locked to 'a' (checked in there), must never move
      guest('NOT_CHECKED_IN', 3, null, false),     // not checked in — must never appear as a move
      guest('UNALLOTTED_CHECKED_IN', 2, null, true), // checked in, but not yet placed — the only movable guest
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');

    // Only the checked-in, unallotted guest gets a move.
    expect(result.moves).toEqual([{ bookingRef: 'UNALLOTTED_CHECKED_IN', newGuideId: 'b' }]);
    // 'a' started at 4 (the already-allotted checked-in guest's pax, seeded not moved). 'b'
    // started at 0 and receives the new 2-pax guest since 0 < 4. The not-checked-in guest never
    // seeds anything (it has no allottedGuideId) and never moves.
    expect(result.totalsByGuideId).toEqual({ a: 4, b: 2 });
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

  // The exact scenario the check-in-locks-allocation safety rule depends on: check a guest in
  // (landing them on a specific guide), then run Balance with a mixed pool of that guest plus
  // freshly checked-in-but-unplaced guests, and confirm the already-placed guest is never among
  // the moves — matching "check a guest in, run Balance, confirm that guest stays with the guide
  // who checked them in."
  it('worked example: a guest checked in by Guide A stays with Guide A after Balance redistributes the rest', () => {
    const guides = [guide('guideA'), guide('guideB')];
    const guests = [
      guest('CHECKED_IN_BY_A', 4, 'guideA', true),  // X: checked in directly under A
      guest('LATE_ARRIVAL_1', 2, null, true),        // Y: checked in, not yet placed
      guest('LATE_ARRIVAL_2', 2, null, true),        // Z: checked in, not yet placed
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');

    const movedRefs = result.moves.map(m => m.bookingRef);
    expect(movedRefs).not.toContain('CHECKED_IN_BY_A');
    expect(movedRefs.sort()).toEqual(['LATE_ARRIVAL_1', 'LATE_ARRIVAL_2']);
    // Both late arrivals land on guideB (starts at 0, below guideA's seeded 4) until they're
    // roughly even; guideA never receives anything since it's already ahead.
    result.moves.forEach(m => expect(m.newGuideId).toBe('guideB'));
    expect(result.totalsByGuideId.guideA).toBe(4); // unchanged — X never moved
  });

  it('reports zero moves (not an error) when the pool is already empty', () => {
    const guides = [guide('a')];
    const guests = [guest('X', 3, 'a', true)];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.moves).toEqual([]);
  });
});
