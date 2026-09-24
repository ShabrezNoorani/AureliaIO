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

  it('distributes unallotted, not-checked-in guests evenly, largest group first', () => {
    const guides = [guide('a'), guide('b')];
    const guests = [guest('B1', 5, null), guest('B2', 1, null), guest('B3', 3, null)];
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

  it('never touches a checked-in guest, and never moves an already-allotted-but-not-checked-in guest', () => {
    const guides = [guide('a'), guide('b')];
    const guests = [
      guest('CHECKED_IN', 4, 'a', true),      // locked to 'a', must never move
      guest('PRE_ALLOTTED', 2, 'b', false),   // manually placed already, must also stay put
      guest('UNALLOTTED', 3, null, false),    // the only guest Balance may actually place
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');

    // Only the genuinely unallotted guest gets a move.
    expect(result.moves).toEqual([{ bookingRef: 'UNALLOTTED', newGuideId: 'b' }]);
    // 'a' started at 4 (checked-in guest's pax, seeded not moved), 'b' started at 2 (pre-allotted)
    // + gets the new 3-pax guest since 2 < 4 at decision time -> b ends at 5, a stays 4.
    expect(result.totalsByGuideId).toEqual({ a: 4, b: 5 });
  });

  it('excludes a locked guide from both the pool and the totals summary, even for its own guests', () => {
    const guides = [guide('a', true), guide('b')];
    const guests = [
      guest('ON_LOCKED', 10, 'a', false),
      guest('UNALLOTTED', 1, null, false),
    ];
    const result = computeBalance(guides, guests);
    if ('error' in result) throw new Error('unexpected error');
    expect(result.moves).toEqual([{ bookingRef: 'UNALLOTTED', newGuideId: 'b' }]);
    expect(result.totalsByGuideId).toEqual({ b: 1 }); // 'a' (locked) never appears here
  });

  // The exact scenario the check-in-locks-allocation safety rule depends on: check a guest in,
  // then run Balance with a mixed pool of checked-in + freshly auto-populated guests, and confirm
  // the checked-in guest is never among the moves — matching "check a guest in, run Balance,
  // confirm that guest stays with the guide who checked them in."
  it('worked example: a guest checked in by Guide A stays with Guide A after Balance redistributes the rest', () => {
    const guides = [guide('guideA'), guide('guideB')];
    const guests = [
      guest('CHECKED_IN_BY_A', 4, 'guideA', true),  // X: checked in by A
      guest('LATE_ARRIVAL_1', 2, null, false),       // Y: auto-populated, unallotted
      guest('LATE_ARRIVAL_2', 2, null, false),       // Z: auto-populated, unallotted
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
