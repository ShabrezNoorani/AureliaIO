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

/**
 * The ONLY step that may fail closed to 'guide'. A guide row found → 'guide'. The lookup
 * COMPLETING SUCCESSFULLY with no row → positively confirmed 'owner', unconditionally — nothing
 * downstream (repair_guide_claim) can override this. A thrown error or a timeout on THIS lookup
 * is the one and only path to the fail-closed 'guide' default — not knowing the answer must never
 * resolve to 'owner', but knowing the answer is 'owner' must never be second-guessed by a
 * separate, unrelated step's own unreliability.
 */
export async function resolveDirectRole(
  lookupGuideRow: () => PromiseLike<{ data: GuideRowLookupResult; error: unknown }>,
  timeoutMs: number
): Promise<RoleResolution> {
  try {
    const { data, error } = await withTimeout(lookupGuideRow(), timeoutMs);
    if (error) throw error;
    return data ? OWNER_GUIDE_ROW(data) : RESOLVED_OWNER;
  } catch {
    return FAILED_CLOSED_GUIDE;
  }
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
