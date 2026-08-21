import { CheckCircle2, Clock, Euro, Wallet } from 'lucide-react';
import type { AssignmentStats } from '@/lib/guidePerformance';

const fmtEuro = (v: number) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Four-up "Tours & Pay" summary — shared verbatim between the guide's own dashboard and the
    owner's per-guide detail view, so both sides always show the same numbers the same way. */
export default function GuideStatCards({ stats }: { stats: AssignmentStats }) {
  const paidPct = stats.totalEarned > 0 ? Math.round((stats.paidAmount / stats.totalEarned) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="aurelia-card p-5 border-l-[3px] border-l-gold">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <CheckCircle2 size={14} />
          <p className="text-[10px] font-bold uppercase tracking-widest">Tours Done</p>
        </div>
        <p className="text-2xl md:text-3xl font-extrabold">{stats.toursDone}</p>
      </div>
      <div className="aurelia-card p-5 border-l-[3px] border-l-blue-500">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Clock size={14} />
          <p className="text-[10px] font-bold uppercase tracking-widest">Upcoming</p>
        </div>
        <p className="text-2xl md:text-3xl font-extrabold">{stats.toursUpcoming}</p>
      </div>
      <div className="aurelia-card p-5 border-l-[3px] border-l-green-500">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Euro size={14} />
          <p className="text-[10px] font-bold uppercase tracking-widest">Total Earned</p>
        </div>
        <p className="text-2xl md:text-3xl font-extrabold text-green-700 tabular-nums">{fmtEuro(stats.totalEarned)}</p>
      </div>
      <div className="aurelia-card p-5 border-l-[3px] border-l-purple-500">
        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
          <Wallet size={14} />
          <p className="text-[10px] font-bold uppercase tracking-widest">Paid vs Pending</p>
        </div>
        <div className="flex items-baseline justify-between text-xs font-bold tabular-nums mb-1.5">
          <span className="text-green-700">{fmtEuro(stats.paidAmount)}</span>
          <span className="text-amber-700">{fmtEuro(stats.pendingAmount)}</span>
        </div>
        <div className="h-1.5 bg-amber-600/20 rounded-full overflow-hidden">
          <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
        </div>
      </div>
    </div>
  );
}
