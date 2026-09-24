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
  /** A checked-in guest is locked to whoever checked them in — Balance must never move them
      (safety rule: check-in = ownership). Still counts toward that guide's running total below,
      just never enters the movable pool. */
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

// Balance only ever fills GAPS — it never reshuffles a guest someone (a check-in, a manual move,
// or an earlier Balance run) already placed. Given `guests` covering an ENTIRE session (checked-in
// and not, per the auto-population feature — a session can now hold not-yet-arrived guests too):
//   - A checked-in guest is locked to their current guide: excluded from the pool, but their pax
//     still seeds that guide's running total, so Balance never piles more guests onto a guide
//     who's already carrying a full checked-in load.
//   - An already-allotted-but-not-yet-checked-in guest (placed manually, or by an earlier Balance
//     run) is left exactly where it is too — same seeding, same pool exclusion.
//   - The pool is genuinely UNALLOTTED, not-checked-in guests only — auto-populated bookings sit
//     here until a human checks them in or runs Balance.
export function computeBalance(
  guides: BalanceGuideInput[],
  guests: BalanceGuestInput[]
): BalanceResult | BalanceError {
  const unlockedGuides = guides.filter(g => !g.locked);
  if (unlockedGuides.length === 0) {
    return { error: 'No unlocked guides to balance across.' };
  }

  const totalsByGuideId: Record<string, number> = {};
  unlockedGuides.forEach(g => { totalsByGuideId[g.id] = 0; });

  // Seed every unlocked guide's total from whichever guests are ALREADY on them (checked in or
  // not) — a locked guide's guests aren't tracked here at all (no key for them), matching how
  // totalsByGuideId has only ever covered unlocked guides.
  guests.forEach(g => {
    if (g.allottedGuideId && totalsByGuideId[g.allottedGuideId] !== undefined) {
      totalsByGuideId[g.allottedGuideId] += g.pax;
    }
  });

  const pool = guests.filter(g => !g.isCheckedIn && !g.allottedGuideId);

  // Largest group first — never split a group, so the biggest groups need to be placed while
  // the most "room" is still available across guides.
  const sortedPool = [...pool].sort((a, b) => b.pax - a.pax);

  const moves: BalanceMove[] = [];

  for (const guest of sortedPool) {
    const targetId = pickLeastLoadedGuide(unlockedGuides, totalsByGuideId)!; // unlockedGuides is non-empty (checked above)
    totalsByGuideId[targetId] = (totalsByGuideId[targetId] ?? 0) + guest.pax;
    moves.push({ bookingRef: guest.bookingRef, newGuideId: targetId });
  }

  return { moves, totalsByGuideId };
}
