import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Star } from 'lucide-react';

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
  const { guideId } = useAuth();
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formStars, setFormStars] = useState(5);
  const [formQuantity, setFormQuantity] = useState(1);
  const [formSource, setFormSource] = useState('');
  const [formNote, setFormNote] = useState('');

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

  useEffect(() => {
    loadRatings();
  }, [guideId]);

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
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
      )}

      <section className="aurelia-card p-5 space-y-4">
        <h2 className="text-xs font-bold text-gold uppercase tracking-widest border-b border-white/5 pb-2">Log a Review</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Stars</label>
            <select value={formStars} onChange={e => setFormStars(Number(e.target.value))} className="aurelia-input appearance-none bg-[#1a1a1f] w-full">
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n !== 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">How Many</label>
            <input type="number" min={1} value={formQuantity} onChange={e => setFormQuantity(Math.max(1, Number(e.target.value)))} className="aurelia-input" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Source (optional)</label>
          <input value={formSource} onChange={e => setFormSource(e.target.value)} className="aurelia-input" placeholder="e.g. Viator, TripAdvisor" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Note (optional)</label>
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
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 shrink-0">Verified</span>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 shrink-0">Pending verification</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
