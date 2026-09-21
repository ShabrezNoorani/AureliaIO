import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompanyGuide {
  id: string;
  name: string;
  guide_number: string;
}

/**
 * Every other active guide at this guide's own company — powers the "Transfer to another guide"
 * picker on GuideHome.tsx/GuideCheckin.tsx. RLS only lets a guide SELECT their own `guides` row
 * directly, so this goes through the my_company_guides() security-definer RPC instead. Its
 * return shape has no `status` column, which is the RPC's own signal that it already filters to
 * active guides server-side — there's nothing further to filter client-side.
 */
export async function fetchCompanyGuides(
  supabase: SupabaseClient,
  excludeGuideId: string | null
): Promise<CompanyGuide[]> {
  const { data } = await supabase.rpc('my_company_guides');
  return (data || []).filter(g => g.id !== excludeGuideId);
}

/**
 * Guide-initiated hand-off of one of THEIR OWN assigned sessions to another guide at the same
 * company. Wraps the reassign_my_slot RPC — security-definer, so it's the RPC (not client-side
 * logic) that enforces a guide can only move a slot that's actually theirs. The transferring
 * guide's session_guides row moves to the target guide; on the next refresh it disappears from
 * the transferring guide's dashboard and appears on the target guide's.
 */
export async function transferTourToGuide(
  supabase: SupabaseClient,
  sessionId: string,
  toGuideId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reassign_my_slot', { p_session_id: sessionId, p_to_guide: toGuideId });
  return { error: error?.message || null };
}
