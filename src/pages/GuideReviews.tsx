import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Star } from 'lucide-react';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';
import GuideOwnScoreCard from '@/components/guide/GuideOwnScoreCard';
import { useGuideOwnScore } from '@/hooks/use-guide-own-score';
import { DEFAULT_LEADERBOARD_PERIOD, type LeaderboardMetric, type LeaderboardPeriod } from '@/lib/guidePerformance';

function StarRow({ count, size = 14 }: { count: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5 text-gold">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < count ? 'fill-gold' : 'opacity-20'} />
      ))}
    </div>
  );
}

// Reviews are admin-entered only (guide_reviews has no guide-facing write path — see
// GuideDashboard.tsx's "Manage Reviews"), so this page is read-only: this guide's own score plus
// their own review list, both from the one guide_reviews-based system GuideHome.tsx also uses.
export default function GuideReviews() {
  const { guideId, guideUserId } = useAuth();

  const [scoreMetric, setScoreMetric] = useState<LeaderboardMetric>('perBooking');
  const [scorePeriod, setScorePeriod] = useState<LeaderboardPeriod>(DEFAULT_LEADERBOARD_PERIOD);
  const ownScore = useGuideOwnScore(guideId, guideUserId, scoreMetric, scorePeriod);
  const { myReviews } = ownScore;

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">My Reviews</h1>
        <p className="text-muted-foreground text-sm">How your reviews are scoring, and the reviews behind it.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-bold text-gold uppercase tracking-widest">My Score</h2>
          <ScoreInfoTooltip />
        </div>
        <GuideOwnScoreCard
          data={ownScore}
          metric={scoreMetric}
          onMetricChange={setScoreMetric}
          period={scorePeriod}
          onPeriodChange={setScorePeriod}
        />
        {!ownScore.loading && (
          myReviews.length > 0 ? (
            <div className="space-y-2">
              {myReviews
                .slice()
                .sort((a, b) => (b.review_date || '').localeCompare(a.review_date || ''))
                .map(r => (
                  <div key={r.id} className="aurelia-card p-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <StarRow count={r.stars} size={12} />
                        {r.platform && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{r.platform}</span>
                        )}
                        <span className="text-[11px] text-muted-foreground font-mono">{r.review_date}</span>
                      </div>
                      {r.reviewer_name && <p className="text-xs font-semibold text-foreground/80">{r.reviewer_name}</p>}
                      {r.comment && <p className="text-xs text-muted-foreground mt-0.5">{r.comment}</p>}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="aurelia-card p-8 text-center text-muted-foreground text-sm">No reviews logged yet.</div>
          )
        )}
      </section>
    </div>
  );
}
