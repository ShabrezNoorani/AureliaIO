import { RefreshCw, ArrowDown } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

/**
 * Shared chrome for BOTH AppLayout (owner) and GuideLayout (guide): a pull-to-refresh gesture
 * plus an always-visible manual refresh button, since the installed home-screen PWA has no
 * browser chrome/refresh button of its own. Mounted ONCE per layout rather than per-page, so
 * every current and future page gets both automatically, with no per-page wiring.
 *
 * Both actions do a full page reload rather than a soft per-page data refetch — deliberately: a
 * full reload can never leave a page's realtime subscriptions duplicated or stale regardless of
 * which one is active, and can't double-load since it's a single navigation, not a repeatable
 * in-page fetch. `usePullToRefresh` already guards against firing more than once per gesture.
 *
 * Positioned bottom-right (not top, where several pages — e.g. the Live Board's clock, the mobile
 * hamburger menu — already render their own fixed/header content) so this never visually
 * collides with anything page-specific; `fixed` + `pointer-events-none` on the pull indicator
 * means neither element affects document flow or scrolling on any page.
 */
export default function PullToRefreshChrome() {
  const { pullDistance, refreshing, threshold } = usePullToRefresh();
  const progress = Math.min(pullDistance / threshold, 1);
  const ready = progress >= 1;
  const showIndicator = refreshing || pullDistance > 0;

  return (
    <>
      {showIndicator && (
        <div
          className="fixed top-0 left-0 right-0 z-[200] flex items-start justify-center pointer-events-none overflow-hidden transition-[height] duration-150"
          style={{ height: refreshing ? 64 : Math.min(pullDistance, 90) }}
        >
          <div className="flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2 shadow-lg mt-3">
            {refreshing ? (
              <RefreshCw size={15} className="text-gold animate-spin" />
            ) : (
              <ArrowDown
                size={15}
                className={`text-gold transition-transform ${ready ? 'rotate-180' : ''}`}
                style={{ opacity: Math.max(progress, 0.3) }}
              />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
              {refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </div>
        </div>
      )}

      <button
        onClick={() => window.location.reload()}
        title="Refresh"
        aria-label="Refresh"
        className="fixed bottom-6 right-6 z-40 min-h-11 min-w-11 flex items-center justify-center bg-card border border-border rounded-full shadow-lg text-muted-foreground hover:text-gold hover:border-gold/30 active:scale-95 transition-all"
      >
        <RefreshCw size={18} />
      </button>
    </>
  );
}
