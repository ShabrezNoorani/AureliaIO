// Pure client-side implementation of the "Balance" allocation algorithm — no Supabase calls here,
// callers persist the returned moves themselves. Keeping this pure makes the exact rule set
// (pool -> sort desc -> lowest-running-total assignment) easy to verify independently of I/O.

export interface BalanceGuideInput {
  id: string;
  locked: boolean;
}

export interface BalanceGuestInput {
  bookingRef: string;
  pax: number;
  allottedGuideId: string | null;
  /** The Allocation tab and Balance only ever operate on CHECKED-IN guests — callers must already
      have filtered `guests` down to isCheckedIn: true before calling computeBalance (a
      not-checked-in guest belongs on the Check-in tab only, never here). This flag is kept as a
      defensive, explicit re-check inside the pool filter below rather than trusted blindly, so a
      caller that ever forgets to pre-filter still can't leak a not-checked-in guest into a move.
      A checked-in guest's allottedGuideId does NOT lock them in place by itself — only an actual
      LOCKED guide does. If that guide is unlocked, this guest is just as movable as an unallotted
      one (see computeBalance's doc comment — this supersedes the old "check-in = ownership,
      never move" rule). Only a guest allotted to a guide with `locked: true` is untouched. */
  isCheckedIn: boolean;
}

export interface BalanceMove {
  bookingRef: string;
  newGuideId: string;
}

export interface BalanceResult {
  moves: BalanceMove[];
  /** Final pax total per UNLOCKED guide only — locked guides are excluded from this summary. */
  totalsByGuideId: Record<string, number>;
}

export interface BalanceError {
  error: string;
}

// Lowest running total wins; ties go to the lowest guide index. This is the one tie-break rule
// the whole allocation feature relies on — computeBalance applies it to a whole pool at once,
// TodayToursPage's auto-allot-on-check-in applies it one guest at a time — both call this so
// there's a single definition of "least loaded" instead of two copies that could drift apart.
export function pickLeastLoadedGuide(
  unlockedGuides: { id: string }[],
  totalsByGuideId: Record<string, number>
): string | null {
  if (unlockedGuides.length === 0) return null;

  let best = unlockedGuides[0];
  let bestTotal = totalsByGuideId[best.id] ?? 0;
  for (let i = 1; i < unlockedGuides.length; i++) {
    const candidate = unlockedGuides[i];
    const candidateTotal = totalsByGuideId[candidate.id] ?? 0;
    if (candidateTotal < bestTotal) {
      best = candidate;
      bestTotal = candidateTotal;
    }
  }
  return best.id;
}

// Balance redistributes CHECKED-IN guests across UNLOCKED guides. `guests` must already be
// CHECKED-IN GUESTS ONLY — the Allocation tab and Balance never see or touch a guest who hasn't
// checked in; that guest belongs on the Check-in tab only (see the caller-side filter in
// TodayToursPage.tsx/GuideCheckin.tsx). Within that checked-in population, the movable pool is:
//   - every checked-in guest with NO allotment yet (allottedGuideId null), PLUS
//   - every checked-in guest currently allotted to an UNLOCKED guide — being checked in under a
//     guide does NOT lock a guest in place by itself; only that guide actually being LOCKED does.
//     This supersedes an earlier version of this function where any already-allotted checked-in
//     guest was untouchable regardless of lock state.
// A checked-in guest allotted to a LOCKED guide is the only kind excluded from the pool: that
// guide's guests are entirely untouched, and since locked guides have no entry in
// totalsByGuideId at all, their pax is never seeded or considered anywhere in this computation —
// they simply don't exist from Balance's point of view. A not-checked-in guest is excluded
// regardless of allotment (defensive re-check, see BalanceGuestInput's doc comment).
export function computeBalance(
  guides: BalanceGuideInput[],
  guests: BalanceGuestInput[]
): BalanceResult | BalanceError {
  const unlockedGuides = guides.filter(g => !g.locked);
  if (unlockedGuides.length === 0) {
    return { error: 'No unlocked guides to balance across.' };
  }
  const unlockedGuideIds = new Set(unlockedGuides.map(g => g.id));

  const totalsByGuideId: Record<string, number> = {};
  unlockedGuides.forEach(g => { totalsByGuideId[g.id] = 0; });

  // Pool: unallotted checked-in guests, plus checked-in guests already on an unlocked guide (see
  // the module doc comment above). Everyone in the pool is being freshly (re)placed from scratch
  // below — totals intentionally start at zero rather than being seeded from current allotments,
  // since a guide's own existing guests are themselves part of what's about to be redistributed;
  // seeding would double-count them against the very total the algorithm is trying to balance.
  const pool = guests.filter(g => g.isCheckedIn && (!g.allottedGuideId || unlockedGuideIds.has(g.allottedGuideId)));

  // Largest group first — never split a group, so the biggest groups need to be placed while
  // the most "room" is still available across guides.
  const sortedPool = [...pool].sort((a, b) => b.pax - a.pax);

  const moves: BalanceMove[] = [];

  for (const guest of sortedPool) {
    const targetId = pickLeastLoadedGuide(unlockedGuides, totalsByGuideId)!; // unlockedGuides is non-empty (checked above)
    totalsByGuideId[targetId] = (totalsByGuideId[targetId] ?? 0) + guest.pax;
    // A guest landing right back on the guide they were already on is a no-op — recording it as
    // a "move" would just be a wasted write (and a spurious realtime event) for every caller that
    // persists this list, with nothing actually changing.
    if (targetId !== guest.allottedGuideId) {
      moves.push({ bookingRef: guest.bookingRef, newGuideId: targetId });
    }
  }

  return { moves, totalsByGuideId };
}
