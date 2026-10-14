import { GUIDE_SCORE_BAND_LABELS, GUIDE_SCORE_MIN_BOOKINGS } from '@/lib/guidePerformance';
import type { GuideOwnScore } from '@/hooks/use-guide-own-score';

/**
 * Renders a guide's own score (+ reviews/bookings context, verdict, anonymized rank/top-score,
 * and a display-only punctuality figure) — shared by GuideHome.tsx (leads the page with it,
 * `prominent`) and GuideReviews.tsx (shows it alongside the full review list, default size), so
 * the two can never visually or numerically drift apart. `data` comes from the useGuideOwnScore
 * hook — this component is pure rendering.
 */
export default function GuideOwnScoreCard({ data, prominent = false }: { data: GuideOwnScore; prominent?: boolean }) {
  const {
    loading, unlocked, bookingsCount, reviewCount, score, band, topScore, rank, totalRanked,
    onTimeCount, countedArrivals,
  } = data;

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="aurelia-card p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Your score appears after {GUIDE_SCORE_MIN_BOOKINGS} completed bookings.</p>
        <p className="text-xs text-muted-foreground mt-1">You're at {bookingsCount} of {GUIDE_SCORE_MIN_BOOKINGS} since Oct 1, 2026.</p>
      </div>
    );
  }

  const verdict = band ? GUIDE_SCORE_BAND_LABELS[band] : null;

  return (
    <div className={`aurelia-card border-l-[3px] border-l-gold space-y-4 ${prominent ? 'p-6' : 'p-5'}`}>
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Score</p>
          <span className={`${prominent ? 'text-5xl' : 'text-3xl'} font-extrabold ${score != null ? (score >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
            {score != null ? `${score >= 0 ? '+' : ''}${score.toFixed(2)}` : '—'}
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
      </div>

      {verdict && (
        <p className={`${prominent ? 'text-xl' : 'text-sm'} font-black leading-snug ${
          band === 'falling' ? 'text-red-600' : band === 'excellent' ? 'text-green-700' : 'text-foreground'
        }`}>
          {verdict}
        </p>
      )}

      {rank != null && (
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
          <span>Top score: <span className="font-bold text-foreground">{topScore != null ? `${topScore >= 0 ? '+' : ''}${topScore.toFixed(2)}` : '—'}</span></span>
          <span>Your rank: <span className="font-bold text-foreground">#{rank} of {totalRanked}</span></span>
        </div>
      )}

      {/* Display-only — doesn't affect the score above yet (see PUNCTUALITY_SCORE_WEIGHT). */}
      {countedArrivals > 0 && (
        <div className="pt-3 border-t border-border text-xs text-muted-foreground">
          Punctuality: <span className="font-bold text-foreground">On-time {onTimeCount}/{countedArrivals}</span>
        </div>
      )}
    </div>
  );
}
