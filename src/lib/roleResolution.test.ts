import { describe, it, expect } from 'vitest';
import {
  resolveDirectRole, resolveRepairUpgrade, RESOLVE_AGAIN_RETRY_POLICY, DEFAULT_DIRECT_LOOKUP_RETRY_POLICY,
} from './roleResolution';

const never = () => new Promise<never>(() => {}); // simulates a hanging call, for timeout tests
const singleAttempt = (ms = 50) => ({ firstTimeoutMs: ms, retryTimeoutMs: ms, maxRetries: 0 });

describe('resolveDirectRole', () => {
  it('a guide row found resolves to guide, carrying its id/name/user_id', () => {
    return resolveDirectRole(
      async () => ({ data: { id: 'g1', name: 'Maria', user_id: 'owner1' }, error: null }),
      singleAttempt()
    ).then((r) => {
      expect(r).toEqual({ role: 'guide', guideId: 'g1', guideName: 'Maria', guideUserId: 'owner1' });
    });
  });

  it('a lookup that completes successfully with no row resolves to OWNER, unconditionally', async () => {
    const r = await resolveDirectRole(async () => ({ data: null, error: null }), singleAttempt());
    expect(r).toEqual({ role: 'owner', guideId: null, guideName: null, guideUserId: null });
  });

  it('with zero retries, a thrown query error fails closed to guide, never owner', async () => {
    const r = await resolveDirectRole(async () => ({ data: null, error: new Error('network blip') }), singleAttempt());
    expect(r.role).toBe('guide');
    expect(r.guideId).toBeNull();
  });

  it('with zero retries, a lookup that never settles (hangs) times out and fails closed to guide', async () => {
    const r = await resolveDirectRole(never, singleAttempt(20));
    expect(r.role).toBe('guide');
    expect(r.guideId).toBeNull();
  });

  it('a timed-out FIRST attempt is retried fresh — a successful retry resolves correctly, never fails closed', async () => {
    let calls = 0;
    const lookup = () => {
      calls += 1;
      // First call hangs (simulates a cold-connection timeout); the retry succeeds immediately.
      if (calls === 1) return never();
      return Promise.resolve({ data: null, error: null });
    };
    const r = await resolveDirectRole(lookup, { firstTimeoutMs: 20, retryTimeoutMs: 50, maxRetries: 1 });
    expect(calls).toBe(2);
    expect(r).toEqual({ role: 'owner', guideId: null, guideName: null, guideUserId: null });
  });

  it('a thrown error on the first attempt is retried fresh too, not just a timeout', async () => {
    let calls = 0;
    const lookup = async () => {
      calls += 1;
      if (calls === 1) return { data: null, error: new Error('transient blip') };
      return { data: { id: 'g1', name: 'Maria', user_id: 'owner1' }, error: null };
    };
    const r = await resolveDirectRole(lookup, { firstTimeoutMs: 50, retryTimeoutMs: 50, maxRetries: 2 });
    expect(calls).toBe(2);
    expect(r.role).toBe('guide');
    expect(r.guideId).toBe('g1');
  });

  it('only fails closed to guide once EVERY attempt (first + all retries) is exhausted', async () => {
    let calls = 0;
    const lookup = () => {
      calls += 1;
      return never();
    };
    const r = await resolveDirectRole(lookup, { firstTimeoutMs: 15, retryTimeoutMs: 15, maxRetries: 2 });
    expect(calls).toBe(3); // first attempt + 2 retries, all exhausted
    expect(r.role).toBe('guide');
    expect(r.guideId).toBeNull();
  });

  it('a definitive result on ANY attempt stops retrying immediately — no attempts wasted after an answer is known', async () => {
    let calls = 0;
    const lookup = () => {
      calls += 1;
      if (calls === 1) return never();
      return Promise.resolve({ data: null, error: null }); // definitive owner on the 2nd attempt
    };
    const r = await resolveDirectRole(lookup, { firstTimeoutMs: 15, retryTimeoutMs: 50, maxRetries: 2 });
    expect(calls).toBe(2); // did NOT burn the 3rd attempt once an answer was already known
    expect(r.role).toBe('owner');
  });

  it('RESOLVE_AGAIN_RETRY_POLICY is a single attempt, no retries — appropriate for a later, already-past-cold-start re-resolution', () => {
    expect(RESOLVE_AGAIN_RETRY_POLICY.maxRetries).toBe(0);
  });

  it('DEFAULT_DIRECT_LOOKUP_RETRY_POLICY caps the worst case at 12s (6s + 6s), not the old 22s — the latency regression this fixes', () => {
    expect(DEFAULT_DIRECT_LOOKUP_RETRY_POLICY).toEqual({ firstTimeoutMs: 6000, retryTimeoutMs: 6000, maxRetries: 1 });
    const worstCaseMs = DEFAULT_DIRECT_LOOKUP_RETRY_POLICY.firstTimeoutMs
      + DEFAULT_DIRECT_LOOKUP_RETRY_POLICY.maxRetries * DEFAULT_DIRECT_LOOKUP_RETRY_POLICY.retryTimeoutMs;
    expect(worstCaseMs).toBe(12000);
  });

  it('with the DEFAULT policy, a definitive answer on attempt 1 still returns instantly — unaffected by the lower ceiling', async () => {
    const r = await resolveDirectRole(async () => ({ data: null, error: null }));
    expect(r.role).toBe('owner');
  });
});

describe('resolveRepairUpgrade', () => {
  it('returns the upgraded guide resolution when repair finds and links a row, confirmed by the retry lookup', async () => {
    const r = await resolveRepairUpgrade(
      async () => ({ data: true, error: null }),
      async () => ({ data: { id: 'g9', name: 'Late Claim', user_id: 'owner9' }, error: null }),
      50
    );
    expect(r).toEqual({ role: 'guide', guideId: 'g9', guideName: 'Late Claim', guideUserId: 'owner9' });
  });

  it('returns null when repair finds nothing to link (the common case for a genuine owner)', async () => {
    const r = await resolveRepairUpgrade(
      async () => ({ data: false, error: null }),
      async () => ({ data: null, error: null }),
      50
    );
    expect(r).toBeNull();
  });

  it('returns null — never a fail-closed signal — when the repair RPC itself errors', async () => {
    const r = await resolveRepairUpgrade(
      async () => ({ data: null, error: new Error('rpc failed') }),
      async () => ({ data: null, error: null }),
      50
    );
    expect(r).toBeNull();
  });

  it('returns null when the repair step TIMES OUT — this must never override an already-resolved owner', async () => {
    const r = await resolveRepairUpgrade(never, async () => ({ data: null, error: null }), 20);
    expect(r).toBeNull();
  });

  it('returns null when repair succeeds but the retry lookup itself fails', async () => {
    const r = await resolveRepairUpgrade(
      async () => ({ data: true, error: null }),
      async () => ({ data: null, error: new Error('retry lookup failed') }),
      50
    );
    expect(r).toBeNull();
  });
});

// THE exact regression scenario from the bug report: an owner's direct lookup positively returns
// null (resolve owner), and the repair step — run independently afterward — times out. The
// caller (AuthContext.fetchRole) only ever applies a repair result when resolveRepairUpgrade
// returns non-null, so simulating that contract here proves the owner resolution survives
// completely untouched by the repair step's own timeout.
describe('integration: direct lookup null + repair timeout → stays owner', () => {
  it('never flips away from owner when repair times out after a clean null', async () => {
    const direct = await resolveDirectRole(async () => ({ data: null, error: null }), singleAttempt());
    expect(direct.role).toBe('owner');

    const upgrade = await resolveRepairUpgrade(never, async () => ({ data: null, error: null }), 20);
    expect(upgrade).toBeNull();

    // The wrapper only ever overwrites state when `upgrade` is non-null — direct's 'owner'
    // result is what a real caller would still be left with here.
    const finalRole = upgrade ?? direct;
    expect(finalRole.role).toBe('owner');
  });
});
