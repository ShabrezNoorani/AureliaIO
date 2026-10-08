import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Star } from 'lucide-react';
import { localDateStr } from '@/lib/utils';
import {
  computeGuideReviewScore, computeDoneBookingRecords, countDoneBookingsByGuide,
  computeGuideLeaderboard, getScoreBand, GUIDE_SCORE_BAND_LABELS, GUIDE_SCORE_MIN_TOURS,
  ADMIN_DEFAULT_FILTER_START,
  type GuideReviewRow, type CheckinForGuiding, type SessionBookingForGuiding, type SessionDateForGuiding,
} from '@/lib/guidePerformance';
import ScoreInfoTooltip from '@/components/guide/ScoreInfoTooltip';

interface RatingRow {
  id: string;
  guide_id: string;
  stars: number;
  quantity: number;
  source: string | null;
  note: string | null;
  verified: boolean | null;
  verified_at: string | null;
  created_at: string | null;
}

function StarRow({ count, size = 14 }: { count: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5 text-gold">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={size} className={i < count ? 'fill-gold' : 'opacity-20'} />
      ))}
    </div>
  );
}

export default function GuideReviews() {
  const { guideId, guideUserId } = useAuth();
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formStars, setFormStars] = useState(5);
  const [formQuantity, setFormQuantity] = useState(1);
  const [formSource, setFormSource] = useState('');
  const [formNote, setFormNote] = useState('');

  // Individually admin-entered reviews about THIS guide only (guide_reviews) — read-only here; a
  // guide never writes to this table, only the owner does (see guideReviewActions.ts). A
  // completely separate, newer concept from the self-reported guide_ratings log below.
  const [myReviews, setMyReviews] = useState<GuideReviewRow[]>([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(true);

  const loadRatings = async () => {
    if (!guideId) return;
    setLoading(true);
    const { data } = await supabase
      .from('guide_ratings')
      .select('*')
      .eq('guide_id', guideId)
      .order('created_at', { ascending: false });
    setRatings(data || []);
    setLoading(false);
  };

  // Own score, the leaderboard's top score (number only), and own rank — all computed from the
  // SAME done/upcoming rule and the SAME leaderboard function the admin dashboard uses
  // (computeDoneBookingRecords/computeGuideLeaderboard), so a guide's own numbers and the admin's
  // can never disagree. Privacy: the `guides` query below selects ONLY `id`, never `name` — no
  // other guide's name is ever fetched into this page, let alone rendered. `myReviews` (the list
  // rendered further down) is a SEPARATE, narrowly-scoped fetch (`.eq('guide_id', guideId)`) from
  // the broader company-wide data used only for the anonymous leaderboard arithmetic below; the
  // broader fetch's individual review rows (other guides' comments/reviewer names) are never
  // rendered anywhere on this page.
  const [allGuideIds, setAllGuideIds] = useState<string[]>([]);
  const [allReviewsSinceOct1, setAllReviewsSinceOct1] = useState<GuideReviewRow[]>([]);
  const [overallDoneCounts, setOverallDoneCounts] = useState<Map<string, number>>(new Map());

  const loadMyReviewsAndScore = async () => {
    if (!guideId || !guideUserId) return;
    setMyReviewsLoading(true);
    const todayStr = localDateStr();
    const [myReviewsRes, allReviewsRes, guidesRes, sbRes, sessRes, checkinsRes] = await Promise.all([
      supabase.from('guide_reviews').select('*').eq('guide_id', guideId),
      // Anonymous leaderboard arithmetic only needs the STAR VALUE tied to a guide_id — never
      // reviewer_name/comment/platform (someone else's actual review text) for any OTHER guide,
      // so this query never selects those columns at all; they simply never leave the server for
      // this fetch, rather than being fetched and merely not rendered.
      supabase.from('guide_reviews').select('id, guide_id, stars, review_date').gte('review_date', ADMIN_DEFAULT_FILTER_START),
      supabase.from('guides').select('id').eq('user_id', guideUserId), // id ONLY — never name
      supabase.from('session_bookings').select('booking_ref, allotted_guide_id, session_id').eq('user_id', guideUserId),
      supabase.from('tour_sessions').select('id, tour_date').eq('user_id', guideUserId),
      supabase.from('checkins').select('booking_ref, status')
        .eq('user_id', guideUserId).eq('status', 'checked_in').gte('travel_date', ADMIN_DEFAULT_FILTER_START),
    ]);
    const sessionBookings: SessionBookingForGuiding[] = sbRes.data || [];
    const sessions: SessionDateForGuiding[] = sessRes.data || [];
    const checkins: CheckinForGuiding[] = checkinsRes.data || [];
    const records = computeDoneBookingRecords(sessionBookings, sessions, checkins, ADMIN_DEFAULT_FILTER_START, todayStr);
    setOverallDoneCounts(countDoneBookingsByGuide(records));
    setAllGuideIds((guidesRes.data || []).map((g: { id: string }) => g.id));
    // Pads the never-fetched text fields back in (always null) purely to satisfy GuideReviewRow's
    // shape — computeGuideReviewScore only ever reads `.stars`, so this is inert, not a leak.
    setAllReviewsSinceOct1((allReviewsRes.data || []).map((r: { id: string; guide_id: string; stars: number; review_date: string }) => ({
      ...r, reviewer_name: null, comment: null, platform: null,
    })));
    setMyReviews(myReviewsRes.data || []);
    setMyReviewsLoading(false);
  };

  const myDoneTours = overallDoneCounts.get(guideId || '') || 0;
  const myReviewsSinceOct1 = useMemo(
    () => myReviews.filter(r => r.review_date >= ADMIN_DEFAULT_FILTER_START),
    [myReviews]
  );
  const myReviewScore = useMemo(
    () => computeGuideReviewScore(myReviewsSinceOct1, myDoneTours),
    [myReviewsSinceOct1, myDoneTours]
  );
  const myScoreUnlocked = myDoneTours >= GUIDE_SCORE_MIN_TOURS;

  // The anonymized leaderboard — built with guide IDs only (computeGuideLeaderboard never takes
  // names), so "top score" and "my rank" are derivable without ever knowing who anyone else is.
  const leaderboard = useMemo(() => {
    if (!myScoreUnlocked) return [];
    const reviewsByGuide = new Map<string, GuideReviewRow[]>();
    allReviewsSinceOct1.forEach(r => {
      const arr = reviewsByGuide.get(r.guide_id) || [];
      arr.push(r);
      reviewsByGuide.set(r.guide_id, arr);
    });
    return computeGuideLeaderboard(allGuideIds, reviewsByGuide, overallDoneCounts);
  }, [myScoreUnlocked, allGuideIds, allReviewsSinceOct1, overallDoneCounts]);
  const topScore = leaderboard[0]?.score ?? null;
  const myRankEntry = guideId ? leaderboard.find(e => e.guide_id === guideId) : undefined;
  const myScoreBand = getScoreBand(myReviewScore.score);

  useEffect(() => {
    loadRatings();
    loadMyReviewsAndScore();
  }, [guideId, guideUserId]);

  const { verifiedAvg, verifiedCount, pendingCount } = useMemo(() => {
    const verified = ratings.filter(r => r.verified);
    const pending = ratings.filter(r => !r.verified);
    const verifiedQty = verified.reduce((sum, r) => sum + r.quantity, 0);
    const weighted = verified.reduce((sum, r) => sum + r.stars * r.quantity, 0);
    return {
      verifiedAvg: verifiedQty > 0 ? weighted / verifiedQty : 0,
      verifiedCount: verifiedQty,
      pendingCount: pending.reduce((sum, r) => sum + r.quantity, 0),
    };
  }, [ratings]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('add_my_rating', {
        p_stars: formStars,
        p_quantity: formQuantity,
        p_source: formSource.trim(),
        p_note: formNote.trim(),
      });
      if (rpcError) throw rpcError;

      setFormStars(5);
      setFormQuantity(1);
      setFormSource('');
      setFormNote('');
      await loadRatings();
    } catch (e) {
      console.error('Failed to submit rating:', e);
      setError('Could not submit that review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 pb-32 max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">My Reviews</h1>
        <p className="text-muted-foreground text-sm">Log reviews you've received and track verification.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xs font-bold text-gold uppercase tracking-widest">My Score · Since Oct 1, 2026</h2>
          <ScoreInfoTooltip />
        </div>
        {myReviewsLoading ? (
          <div className="flex justify-center p-8"><div className="w-6 h-6 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
        ) : !myScoreUnlocked ? (
          <div className="aurelia-card p-6 text-center">
            <p className="text-sm font-semibold text-foreground">Your score appears after 3 completed tours.</p>
            <p className="text-xs text-muted-foreground mt-1">You're at {myDoneTours} of {GUIDE_SCORE_MIN_TOURS} since Oct 1, 2026.</p>
          </div>
        ) : (
          <>
            <div className="aurelia-card p-5 border-l-[3px] border-l-gold space-y-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Score</p>
                  <span className={`text-3xl font-extrabold ${myReviewScore.score != null ? (myReviewScore.score >= 0 ? 'text-green-700' : 'text-red-600') : ''}`}>
                    {myReviewScore.score != null ? `${myReviewScore.score >= 0 ? '+' : ''}${myReviewScore.score.toFixed(2)}` : '—'}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Reviews</p>
                  <span className="text-3xl font-extrabold">{myReviewScore.reviewCount}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Done Tours</p>
                  <span className="text-3xl font-extrabold">{myReviewScore.bookingsGuided}</span>
                </div>
              </div>
              {myScoreBand && (
                <p className={`text-sm font-bold ${myScoreBand === 'falling' ? 'text-red-600' : myScoreBand === 'excellent' ? 'text-green-700' : 'text-foreground'}`}>
                  {GUIDE_SCORE_BAND_LABELS[myScoreBand]}
                </p>
              )}
              {myRankEntry && (
                <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
                  <span>Top score: <span className="font-bold text-foreground">{topScore != null ? `${topScore >= 0 ? '+' : ''}${topScore.toFixed(2)}` : '—'}</span></span>
                  <span>Your rank: <span className="font-bold text-foreground">#{myRankEntry.rank} of {leaderboard.length}</span></span>
                </div>
              )}
            </div>
            {myReviews.length > 0 && (
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
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4">
        <div className="aurelia-card p-5 border-l-[3px] border-l-gold">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Verified Rating</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">{verifiedCount > 0 ? verifiedAvg.toFixed(1) : '—'}</span>
            {verifiedCount > 0 && <Star size={18} className="text-gold fill-gold" />}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{verifiedCount} verified review{verifiedCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="aurelia-card p-5 border-l-[3px] border-l-amber-500">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Pending</p>
          <span className="text-3xl font-extrabold">{pendingCount}</span>
          <p className="text-xs text-muted-foreground mt-1">awaiting verification</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-600/10 border border-red-600/20 text-sm text-red-700">{error}</div>
      )}

      <section className="aurelia-card p-5 space-y-4">
        <h2 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-border pb-2">Log a Review</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Stars</label>
            <select value={formStars} onChange={e => setFormStars(Number(e.target.value))} className="aurelia-input appearance-none bg-muted text-foreground w-full">
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">How Many</label>
            <input type="number" min={1} value={formQuantity} onChange={e => setFormQuantity(Math.max(1, Number(e.target.value)))} className="aurelia-input" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Source (optional)</label>
          <input value={formSource} onChange={e => setFormSource(e.target.value)} className="aurelia-input" placeholder="e.g. Viator, TripAdvisor" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Note (optional)</label>
          <textarea rows={2} value={formNote} onChange={e => setFormNote(e.target.value)} className="aurelia-input resize-none" placeholder="Anything worth remembering about this feedback" />
        </div>
        <button onClick={handleSubmit} disabled={submitting} className="aurelia-gold-btn w-full py-2.5 font-bold disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">History</h2>
        {loading ? (
          <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" /></div>
        ) : ratings.length === 0 ? (
          <div className="aurelia-card p-8 text-center text-muted-foreground text-sm">No reviews logged yet.</div>
        ) : (
          <div className="space-y-2">
            {ratings.map(r => (
              <div key={r.id} className="aurelia-card p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <StarRow count={r.stars} />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {r.quantity > 1 ? `×${r.quantity} · ` : ''}{r.source || 'General'}
                    </p>
                    {r.note && <p className="text-xs text-muted-foreground truncate max-w-xs">{r.note}</p>}
                  </div>
                </div>
                {r.verified ? (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-600/15 text-green-700 shrink-0">Verified</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-700 shrink-0">Pending verification</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
