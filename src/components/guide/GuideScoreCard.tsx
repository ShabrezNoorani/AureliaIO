import { Award, Star, Info } from 'lucide-react';
import type { GuideScoreResult } from '@/lib/guidePerformance';

/** Combined score is computed 0-100 internally (see computeGuideScore) but always PRESENTED out
    of 5, to sit naturally next to the star rating it's 60% built from. */
const scoreOutOf5 = (score: number) => score / 20;

const fmtPct = (v: number | null) => (v != null ? `${v.toFixed(0)}%` : '—');
const fmtStars = (v: number | null) => (v != null ? v.toFixed(1) : '—');

/**
 * "Quality 4.8 · 72% reviewed · 90% on-time (12 tours, 8 reviews, 10 arrivals)" — the exact
 * breakdown line, built once here so the guide's own dashboard and the owner's guide detail can
 * never drift into showing different wording for the same numbers.
 */
export function formatGuideScoreBreakdown(score: GuideScoreResult): string {
  const quality = `Quality ${fmtStars(score.quality.stars)}`;
  const engagement = `${fmtPct(score.engagement.pct)} reviewed`;
  const punctuality = `${fmtPct(score.punctuality.pct)} on-time`;
  const counts = `${score.engagement.toursDone} tour${score.engagement.toursDone !== 1 ? 's' : ''}, ` +
    `${score.quality.reviewCount} review${score.quality.reviewCount !== 1 ? 's' : ''}, ` +
    `${score.punctuality.arrivalsCount} arrival${score.punctuality.arrivalsCount !== 1 ? 's' : ''}`;
  return `${quality} · ${engagement} · ${punctuality} (${counts})`;
}

interface GuideScoreCardProps {
  score: GuideScoreResult;
  /** Shortens the label for tighter layouts (the owner's guide-detail panel is denser than the
      guide's own full-width dashboard). */
  compact?: boolean;
}

/** Shared, read-only score display — reused verbatim by the guide's own "How am I doing" section
    (GuideHome.tsx) and the owner's per-guide detail panel (GuideDashboard.tsx), so both sides
    always show the exact same number computed the exact same way. Never renders a fabricated 0:
    every "—" here means "no data yet", not "scored zero". */
export default function GuideScoreCard({ score, compact }: GuideScoreCardProps) {
  return (
    <div className="aurelia-card p-5 border-l-[3px] border-l-gold space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Award size={14} />
          <p className="text-[10px] font-bold uppercase tracking-widest">
            {compact ? 'Score' : 'Overall Score'}
          </p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold">
            {score.score != null ? scoreOutOf5(score.score).toFixed(1) : '—'}
          </span>
          <span className="text-xs font-bold text-muted-foreground">/ 5</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted rounded-xl p-3 border border-border">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Quality</p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-extrabold">{fmtStars(score.quality.stars)}</span>
            {score.quality.stars != null && <Star size={12} className="text-gold fill-gold" />}
          </div>
        </div>
        <div className="bg-muted rounded-xl p-3 border border-border">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Engagement</p>
          <span className="text-lg font-extrabold">{fmtPct(score.engagement.pct)}</span>
        </div>
        <div className="bg-muted rounded-xl p-3 border border-border">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Punctuality</p>
          <span className="text-lg font-extrabold">{fmtPct(score.punctuality.pct)}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{formatGuideScoreBreakdown(score)}</p>

      <p className="text-[10px] text-muted-foreground/70 flex items-start gap-1.5 pt-1 border-t border-border">
        <Info size={11} className="shrink-0 mt-0.5" />
        Punctuality only counts arrivals recorded since arrival tracking started (going forward);
        reviews from before a guide joined AURELIA aren't included.
      </p>
    </div>
  );
}
