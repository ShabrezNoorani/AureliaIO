import { GUIDE_SCORE_BAND_LABELS, GUIDE_SCORE_MIN_BOOKINGS, type LeaderboardMetric, type LeaderboardPeriod } from '@/lib/guidePerformance';
import type { GuideOwnScore } from '@/hooks/use-guide-own-score';
import LeaderboardControls from './LeaderboardControls';

/** perBooking/perTour are points-per-unit (roughly -1..+1) — shown with a sign, 2 decimals, same
    as always. punctuality/combined are already 0-100 — shown as a plain rounded percentage. */
function formatMetricValue(metric: LeaderboardMetric, value: number | null): string {
  if (value == null) return '—';
  if (metric === 'punctuality' || metric === 'combined') return `${Math.round(value)}%`;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/**
 * Renders a guide's own score for the selected metric/period (+ reviews/bookings context,
 * verdict, anonymized rank/top-score, and a display-only punctuality figure), the metric + time
 * toggle itself, and a display-only punctuality figure — shared by GuideHome.tsx (leads the page
 * with it, `prominent`) and GuideReviews.tsx (shows it alongside the full review list, default
 * size), so the two can never visually or numerically drift apart. `data` comes from the
 * useGuideOwnScore hook — metric/period state lives in the CALLER (so GuideHome's and
 * GuideReviews' toggles are independent), passed through here as controlled props.
 */
export default function GuideOwnScoreCard({
  data, metric, onMetricChange, period, onPeriodChange, prominent = false,
}: {
  data: GuideOwnScore;
  metric: LeaderboardMetric;
  onMetricChange: (m: LeaderboardMetric) => void;
  period: LeaderboardPeriod;
  onPeriodChange: (p: LeaderboardPeriod) => void;
  prominent?: boolean;
}) {
  const {
    loading, unlocked, bookingsCount, toursCount, reviewCount, score, band, topScore, rank, totalRanked,
    onTimeCount, countedArrivals,
  } = data;

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  const verdict = band ? GUIDE_SCORE_BAND_LABELS[band] : null;

  return (
    <div className={`aurelia-card border-l-[3px] border-l-gold space-y-4 ${prominent ? 'p-6' : 'p-5'}`}>
      <LeaderboardControls metric={metric} onMetricChange={onMetricChange} period={period} onPeriodChange={onPeriodChange} compact={!prominent} />

      {!unlocked ? (
        <div className="text-center py-2">
          <p className="text-sm font-semibold text-foreground">Your score appears after {GUIDE_SCORE_MIN_BOOKINGS} checked-in bookings.</p>
          <p className="text-xs text-muted-foreground mt-1">You're at {bookingsCount} of {GUIDE_SCORE_MIN_BOOKINGS} in this period.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {metric === 'punctuality' ? 'On-time' : metric === 'combined' ? 'Combined' : 'Score'}
              </p>
              <span className={`${prominent ? 'text-5xl' : 'text-3xl'} font-extrabold ${score != null ? (metric === 'punctuality' || metric === 'combined' ? 'text-foreground' : (score >= 0 ? 'text-green-700' : 'text-red-600')) : ''}`}>
                {formatMetricValue(metric, score)}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Reviews</p>
              <span className="text-3xl font-extrabold">{reviewCount}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Bookings</p>
              <span className="text-3xl font-extrabold">{bookingsCount}</span>
            </div>
            {metric === 'perTour' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Tours</p>
                <span className="text-3xl font-extrabold">{toursCount}</span>
              </div>
            )}
          </div>

          {verdict && (
            <p className={`${prominent ? 'text-xl' : 'text-sm'} font-black leading-snug ${
              band === 'falling' ? 'text-red-600' : band === 'excellent' ? 'text-green-700' : 'text-foreground'
            }`}>
              {verdict}
            </p>
          )}

          {metric === 'combined' && (
            <p className="text-xs text-muted-foreground italic leading-snug">
              Punctuality is still building — the combined score firms up as more verified arrivals are recorded.
            </p>
          )}

          {rank != null && (
            <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
              <span>Top score: <span className="font-bold text-foreground">{formatMetricValue(metric, topScore)}</span></span>
              <span>Your rank: <span className="font-bold text-foreground">#{rank} of {totalRanked}</span></span>
            </div>
          )}

          {/* Display-only, shown regardless of the selected metric — see
              computeCombinedGuideScore's own doc comment for why this never affects the "real"
              per-booking score yet. */}
          {countedArrivals > 0 && metric !== 'punctuality' && metric !== 'combined' && (
            <div className="pt-3 border-t border-border text-xs text-muted-foreground">
              Punctuality: <span className="font-bold text-foreground">On-time {onTimeCount}/{countedArrivals}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
