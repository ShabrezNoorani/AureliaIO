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

export function computeBalance(
  guides: BalanceGuideInput[],
  guests: BalanceGuestInput[]
): BalanceResult | BalanceError {
  const unlockedGuides = guides.filter(g => !g.locked);
  if (unlockedGuides.length === 0) {
    return { error: 'No unlocked guides to balance across.' };
  }

  const lockedGuideIds = new Set(guides.filter(g => g.locked).map(g => g.id));

  // Pool = every checked-in guest NOT currently allotted to a locked guide — i.e. guests on an
  // unlocked guide (unlocked guides are emptied first) plus anyone not yet allotted at all.
  const pool = guests.filter(g => !g.allottedGuideId || !lockedGuideIds.has(g.allottedGuideId));

  // Largest group first — never split a group, so the biggest groups need to be placed while
  // the most "room" is still available across guides.
  const sortedPool = [...pool].sort((a, b) => b.pax - a.pax);

  const totalsByGuideId: Record<string, number> = {};
  unlockedGuides.forEach(g => { totalsByGuideId[g.id] = 0; });

  const moves: BalanceMove[] = [];

  for (const guest of sortedPool) {
    const targetId = pickLeastLoadedGuide(unlockedGuides, totalsByGuideId)!; // unlockedGuides is non-empty (checked above)
    totalsByGuideId[targetId] = (totalsByGuideId[targetId] ?? 0) + guest.pax;
    if (guest.allottedGuideId !== targetId) {
      moves.push({ bookingRef: guest.bookingRef, newGuideId: targetId });
    }
  }

  return { moves, totalsByGuideId };
}
