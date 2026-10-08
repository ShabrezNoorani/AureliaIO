import { useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 70;
const MAX_PULL = 120;

/**
 * Detects a downward touch-drag starting from the very top of the page's scroll
 * (window.scrollY === 0) and triggers a full page reload once the pull exceeds PULL_THRESHOLD —
 * the standard "pull to refresh" gesture. Attached to `window` rather than a specific container
 * so it works uniformly across every page's own layout/scroll structure, without needing a ref
 * threaded through each one.
 *
 * Deliberately leaves everything else alone: any scroll already in progress (window.scrollY > 0),
 * an upward drag, or a horizontal gesture never engages this at all — `pullingRef` bails out the
 * instant either condition is detected, so normal scrolling and any page's own horizontal
 * swipe/scroll-snap areas (e.g. the Allocation board's guide columns) are never intercepted.
 *
 * A full page reload (not a soft per-page data refetch) is the deliberate action here — it's the
 * one thing that can never leave realtime subscriptions duplicated or stale regardless of which
 * page is active, and it can never double-load since it's a single navigation, guarded by
 * `refreshingRef` against firing more than once.
 */
export function usePullToRefresh(enabled = true) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0) {
        pullingRef.current = false;
        return;
      }
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || startYRef.current === null || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0 || window.scrollY > 0) {
        pullingRef.current = false;
        setPullDistance(0);
        return;
      }
      setPullDistance(Math.min(delta, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) {
        startYRef.current = null;
        return;
      }
      pullingRef.current = false;
      startYRef.current = null;
      // Reads the LATEST pull distance via the updater form rather than closing over state, so
      // this listener never needs to be torn down/re-attached mid-gesture as the pull progresses.
      setPullDistance((current) => {
        if (current >= PULL_THRESHOLD && !refreshingRef.current) {
          refreshingRef.current = true;
          setRefreshing(true);
          window.location.reload();
        }
        return 0;
      });
    };

    const onTouchCancel = () => {
      pullingRef.current = false;
      startYRef.current = null;
      setPullDistance(0);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [enabled]);

  return { pullDistance, refreshing, threshold: PULL_THRESHOLD };
}
