import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveGuideAccess, type GuideAccess } from '@/lib/guideAccountStatus';

const RETRY_MS = 5000;
const RECHECK_MS = 5 * 60 * 1000;

/**
 * This guide's own access level (active / limited / closed — see lib/guideAccountStatus.ts),
 * read from their own guides row. Returns null while not yet known.
 *
 * FAIL-CLOSED: until a read has actually succeeded, the result stays null and GuideLayout shows
 * neither the full shell nor the earnings view, so a slow or failed read can never briefly show
 * the board to an inactive guide. A failed read retries every few seconds. In practice this costs
 * active guides nothing: the role lookup that ran moments earlier needed the same connection.
 *
 * select('*') rather than naming inactivated_at means the read keeps working before the column
 * migration is applied (resolveGuideAccess treats a missing date as "inactivated just now").
 *
 * Re-checked when the tab regains focus and every few minutes, so an owner deactivating a guide
 * mid-shift takes effect without the guide having to log out.
 */
export function useGuideAccess(guideId: string | null): GuideAccess | null {
  const [access, setAccess] = useState<GuideAccess | null>(null);
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (!guideId) return;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    try {
      const { data, error } = await supabase.from('guides').select('*').eq('id', guideId).maybeSingle();
      if (error || !data) throw error || new Error('guide row not found');
      if (!mountedRef.current) return;
      const row = data as { status: string | null; inactivated_at?: string | null };
      setAccess(resolveGuideAccess(row.status, row.inactivated_at ?? null));
    } catch (e) {
      console.error('Guide access check failed:', e);
      // Keep the last known answer if there is one; otherwise stay null (fail closed) and retry.
      if (mountedRef.current) retryTimerRef.current = setTimeout(() => { check(); }, RETRY_MS);
    }
  }, [guideId]);

  useEffect(() => {
    mountedRef.current = true;
    setAccess(null);
    check();
    const interval = setInterval(() => { check(); }, RECHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  return access;
}
