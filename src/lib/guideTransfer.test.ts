import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCompanyGuides, transferTourToGuide } from './guideTransfer';

describe('fetchCompanyGuides', () => {
  it('excludes the calling guide from the returned list', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { id: 'g1', name: 'Alice', guide_number: 'G1' },
        { id: 'g2', name: 'Bob', guide_number: 'G2' },
      ],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;

    const result = await fetchCompanyGuides(client, 'g1');

    expect(rpc).toHaveBeenCalledWith('my_company_guides');
    expect(result).toEqual([{ id: 'g2', name: 'Bob', guide_number: 'G2' }]);
  });

  it('returns an empty list rather than throwing when the RPC comes back empty/errored', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) } as unknown as SupabaseClient;
    expect(await fetchCompanyGuides(client, 'g1')).toEqual([]);
  });

  it('passes excludeGuideId as null through without filtering anything out', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'g1', name: 'Alice', guide_number: 'G1' }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await fetchCompanyGuides(client, null)).toEqual([{ id: 'g1', name: 'Alice', guide_number: 'G1' }]);
  });
});

describe('transferTourToGuide', () => {
  it('calls reassign_my_slot with the session and target guide', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const client = { rpc } as unknown as SupabaseClient;

    const result = await transferTourToGuide(client, 'session-1', 'guide-2');

    expect(rpc).toHaveBeenCalledWith('reassign_my_slot', { p_session_id: 'session-1', p_to_guide: 'guide-2' });
    expect(result.error).toBeNull();
  });

  it('surfaces the RPC error message rather than throwing', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ error: { message: 'not your slot' } }) } as unknown as SupabaseClient;
    const result = await transferTourToGuide(client, 'session-1', 'guide-2');
    expect(result.error).toBe('not your slot');
  });
});
