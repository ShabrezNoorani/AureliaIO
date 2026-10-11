// Pure(ish) role-resolution logic extracted from AuthContext.tsx's fetchRole, so the precedence
// rule between the direct guide-row lookup and the repair_guide_claim() safety net is unit-
// testable without a live Supabase client. AuthContext.tsx is the thin, stateful wrapper that
// supplies the real Supabase-backed lookups and applies the result to React state (see its own
// comments for the mountedRef/hydratedUserIdRef guards that matter there but not here).
//
// THE BUG THIS FIXES: the previous version ran the direct lookup, and whenever it returned null
// (true for every owner — they have no guide row) ALSO awaited repair_guide_claim() as a second
// sequential round-trip before concluding 'owner', with BOTH steps racing the same 3s timeout.
// On a cold connection right after login, the second step could time out and fall into a single
// shared catch block that failed closed to 'guide' — misclassifying a genuine owner. The fix:
// the repair step is a rare, best-effort UPGRADE attempted only after 'owner' is already the
// resolved answer, and its own failure/timeout can only ever leave that answer alone, never
// override it with 'guide'.

export type GuideRowLookupResult = { id: string; name: string; user_id: string } | null;

export interface RoleResolution {
  role: 'owner' | 'guide';
  guideId: string | null;
  guideName: string | null;
  guideUserId: string | null;
}

// Accepts a PromiseLike, not just a Promise — Supabase's own query/RPC builders are thenables
// (awaitable, but not actual Promise instances: no .catch/.finally/Symbol.toStringTag), which is
// exactly what AuthContext.tsx passes in directly.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms)),
  ]);
}

const OWNER_GUIDE_ROW = (data: NonNullable<GuideRowLookupResult>): RoleResolution => ({
  role: 'guide', guideId: data.id, guideName: data.name, guideUserId: data.user_id,
});
const RESOLVED_OWNER: RoleResolution = { role: 'owner', guideId: null, guideName: null, guideUserId: null };
const FAILED_CLOSED_GUIDE: RoleResolution = { role: 'guide', guideId: null, guideName: null, guideUserId: null };

export interface DirectLookupRetryPolicy {
  /** Timeout for the very first attempt — generous, since this runs right after login/bootstrap
      on a connection that may have no warm keep-alive yet (the slowest case in practice). */
  firstTimeoutMs: number;
  /** Timeout for each retry attempt, AFTER the first has already timed out/errored — the
      connection has had a moment to settle by then, so this can be tighter. */
  retryTimeoutMs: number;
  /** How many fresh retry attempts to make after the first, before giving up. "Once or twice" —
      a genuinely dead connection shouldn't retry forever, but ordinary cold-start latency
      deserves more than a single shot. */
  maxRetries: number;
}

/** The policy for the FIRST resolution after login/bootstrap: up to 2 attempts (6s + 6s = 12s
    worst case) before concluding anything short of a definitive result. A definitive answer on
    attempt 1 still returns instantly, unaffected — this ceiling only matters when the connection
    is genuinely struggling. Previously 3 attempts at 10s+6s+6s (22s worst case); that silent,
    un-differentiated 22s wait (see ProtectedRoute's own "still checking" message, added
    alongside this) was itself a latency regression this fixes — a real connection issue should
    surface as a legible, bounded wait, not a near-half-minute hang. Callers resolving again
    later (e.g. the fail-closed screen's own retry) should pass a lighter policy — the cold-start
    cost has already been paid by then. */
export const DEFAULT_DIRECT_LOOKUP_RETRY_POLICY: DirectLookupRetryPolicy = {
  firstTimeoutMs: 6000,
  retryTimeoutMs: 6000,
  maxRetries: 1,
};

/** For a LATER, explicit re-resolution attempt (the "Couldn't confirm your account" screen's
    auto-retry loop, or a user-triggered retry) — a single, moderate-timeout attempt. The cold-
    start cost the generous policy above exists for has already been paid by the time this runs;
    stacking a full multi-retry policy on top of an outer retry loop that already fires every few
    seconds would just compound delay for no benefit. */
export const RESOLVE_AGAIN_RETRY_POLICY: DirectLookupRetryPolicy = {
  firstTimeoutMs: 6000,
  retryTimeoutMs: 6000,
  maxRetries: 0,
};

/**
 * The ONLY step that may fail closed to 'guide'. A guide row found → 'guide'. The lookup
 * COMPLETING SUCCESSFULLY with no row → positively confirmed 'owner', unconditionally — nothing
 * downstream (repair_guide_claim) can override this, and no further attempt even runs once this
 * happens. A thrown error or a TIMEOUT on this lookup is not a definitive result — it's retried,
 * fresh, up to `policy.maxRetries` more times (each a brand-new call to `lookupGuideRow`, never
 * re-awaiting the same stuck promise) before falling back to the fail-closed 'guide' default.
 * Only exhausting every attempt without ever getting a definitive answer reaches that default —
 * not knowing the answer must never resolve to 'owner', but knowing the answer is 'owner' must
 * never be second-guessed by a separate, unrelated step's own unreliability (see
 * resolveRepairUpgrade below), nor by one slow attempt when a retry might simply succeed.
 */
export async function resolveDirectRole(
  lookupGuideRow: () => PromiseLike<{ data: GuideRowLookupResult; error: unknown }>,
  policy: DirectLookupRetryPolicy = DEFAULT_DIRECT_LOOKUP_RETRY_POLICY
): Promise<RoleResolution> {
  const totalAttempts = 1 + Math.max(0, policy.maxRetries);
  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const timeoutMs = attempt === 0 ? policy.firstTimeoutMs : policy.retryTimeoutMs;
    try {
      const { data, error } = await withTimeout(lookupGuideRow(), timeoutMs);
      if (error) throw error;
      return data ? OWNER_GUIDE_ROW(data) : RESOLVED_OWNER;
    } catch {
      if (attempt === totalAttempts - 1) return FAILED_CLOSED_GUIDE;
      // Not the last attempt — fall through and retry with a fresh call, no delay (the point is
      // to give the connection a second shot promptly, not to wait around).
    }
  }
  return FAILED_CLOSED_GUIDE; // unreachable (loop always returns), kept for TS's control-flow analysis
}

/**
 * Best-effort, meant to run AFTER resolveDirectRole has already resolved 'owner' — repairs a
 * guide account whose claim was interrupted (e.g. email confirmation required, so the claim page
 * never got a live session to finish linking — see migration 20260820120000). Returns the
 * upgraded resolution when (and only when) the repair actually found and linked a row AND the
 * retry lookup confirms it; returns null for every other outcome (nothing to repair, an error, a
 * timeout) — null means "leave the already-resolved owner exactly as it is," never "fail closed."
 */
export async function resolveRepairUpgrade(
  repairGuideClaim: () => PromiseLike<{ data: boolean | null; error: unknown }>,
  lookupGuideRow: () => PromiseLike<{ data: GuideRowLookupResult; error: unknown }>,
  timeoutMs: number
): Promise<RoleResolution | null> {
  try {
    const { data: repaired, error: repairError } = await withTimeout(repairGuideClaim(), timeoutMs);
    if (repairError || !repaired) return null;

    const { data: retryData, error: retryError } = await withTimeout(lookupGuideRow(), timeoutMs);
    if (retryError || !retryData) return null;
    return OWNER_GUIDE_ROW(retryData);
  } catch {
    return null;
  }
}
