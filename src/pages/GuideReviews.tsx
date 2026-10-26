import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Star, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { localDateStr } from '@/lib/utils';
import { submitGuideReview } from '@/lib/guideReviewActions';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';
import GuideOwnScoreCard from '@/components/guide/GuideOwnScoreCard';
import { useGuideOwnScore } from '@/hooks/use-guide-own-score';
import { DEFAULT_LEADERBOARD_PERIOD, REVIEW_PLATFORMS, isApprovedReview, type LeaderboardMetric, type LeaderboardPeriod } from '@/lib/guidePerformance';

function StarRow({ count, size = 14 }: { count: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5 text-gold">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < count ? 'fill-gold' : 'opacity-20'} />
      ))}
    </div>
  );
}

const emptyForm = () => ({
  stars: 5, reviewer_name: '', comment: '', platform: REVIEW_PLATFORMS[0] as string, review_date: localDateStr(),
});

// This guide's own score plus their own review list, from the one guide_reviews-based system
// GuideHome.tsx also uses. A guide can also SUBMIT a review here (same fields as the owner's
// form). It's stored 'pending' via submit_guide_review() and shown in the list with a "Pending
// approval" label, but it's excluded from the score card above (useGuideOwnScore drops pending
// rows) until the owner approves it on the Guide Dashboard.
export default function GuideReviews() {
  const { guideId, guideUserId } = useAuth();

  const [scoreMetric, setScoreMetric] = useState<LeaderboardMetric>('perBooking');
  const [scorePeriod, setScorePeriod] = useState<LeaderboardPeriod>(DEFAULT_LEADERBOARD_PERIOD);
  const ownScore = useGuideOwnScore(guideId, guideUserId, scoreMetric, scorePeriod);
  const { myReviews } = ownScore;

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await submitGuideReview(supabase, {
      stars: form.stars,
      reviewer_name: form.reviewer_name.trim() || null,
      comment: form.comment.trim() || null,
      platform: form.platform || null,
      review_date: form.review_date || localDateStr(),
    });
    setSubmitting(false);
    if (error) { toast.error(error); return; }
    toast.success('Review submitted — it will count once your tour company approves it.');
    setForm(emptyForm());
    setFormOpen(false);
    ownScore.reload();
  };

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">My Reviews</h1>
        <p className="text-muted-foreground text-sm">How your reviews are scoring, and the reviews behind it.</p>
      </div>

      <section className="space-y-3">
        {!formOpen ? (
          <button
            onClick={() => setFormOpen(true)}
            className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gold text-black text-sm font-bold uppercase tracking-wide shadow-sm active:scale-[0.98] transition-all"
          >
            <Plus size={16} /> Add a review
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="aurelia-card p-4 space-y-4">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Add a review</h2>
              <p className="text-xs text-muted-foreground mt-1">It will show as “Pending approval” and won't affect your score until your tour company approves it.</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Stars</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, stars: n }))}
                    className="min-h-11 min-w-11 flex items-center justify-center text-gold"
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  >
                    <Star size={26} className={n <= form.stars ? 'fill-gold' : 'opacity-25'} />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Platform</label>
                <select
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  className="aurelia-input appearance-none bg-muted w-full"
                >
                  {REVIEW_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Review date</label>
                <input
                  type="date"
                  value={form.review_date}
                  max={localDateStr()}
                  onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))}
                  className="aurelia-input w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Reviewer name</label>
              <input
                type="text"
                value={form.reviewer_name}
                onChange={e => setForm(f => ({ ...f, reviewer_name: e.target.value }))}
                className="aurelia-input w-full"
                placeholder="e.g. Sarah M."
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Comment</label>
              <textarea
                value={form.comment}
                onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                className="aurelia-input w-full min-h-[90px]"
                placeholder="What did they say?"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setFormOpen(false); setForm(emptyForm()); }}
                className="flex-1 min-h-11 rounded-xl border border-border text-sm font-bold text-foreground/80 hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-h-11 rounded-xl bg-gold text-black text-sm font-bold disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </div>
          </form>
        )}
      </section>

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
                        {!isApprovedReview(r) && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-600/15 text-amber-700">Pending approval</span>
                        )}
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
