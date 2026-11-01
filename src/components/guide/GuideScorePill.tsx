import { getCombinedScoreBand, type ScoreBand } from '@/lib/guidePerformance';

// One coloured pill for a guide's COMBINED score (review 65% + punctuality 35%, from the shared
// computeMetricValue('combined', …)). Short owner-facing labels; "—" when there's no score yet.
const PILL: Record<ScoreBand, { label: string; cls: string }> = {
  excellent: { label: 'Excellent', cls: 'bg-green-600/12 text-green-700 border-green-600/25' },
  good: { label: 'Good', cls: 'bg-blue-600/12 text-blue-700 border-blue-600/25' },
  needs_improvement: { label: 'Needs work', cls: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  falling: { label: 'Falling', cls: 'bg-red-600/12 text-red-700 border-red-600/25' },
};

export default function GuideScorePill({ combined, reviewCount, size = 'sm' }: {
  combined: number | null;
  reviewCount: number;
  size?: 'sm' | 'md';
}) {
  const band = getCombinedScoreBand(combined);
  const pad = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-[11px]';
  const reviews = `(${reviewCount} review${reviewCount === 1 ? '' : 's'})`;
  if (!band || combined == null) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted text-muted-foreground font-semibold ${pad}`}>
        No score yet <span className="font-normal opacity-80">{reviews}</span>
      </span>
    );
  }
  const p = PILL[band];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${p.cls} ${pad}`}>
      {p.label} · {Math.round(combined)}% <span className="font-normal opacity-80">{reviews}</span>
    </span>
  );
}
