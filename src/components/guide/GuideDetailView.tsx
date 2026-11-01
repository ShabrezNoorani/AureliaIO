import { useMemo, useState } from 'react';
import {
  ArrowLeft, Mail, MessageCircle, BadgeCheck, Gift, FileDown, Star, Landmark, CheckCircle2, CalendarClock, Pencil,
} from 'lucide-react';
import {
  assignmentEarned, isAssignmentDone, type GuideAssignmentRow, type GuideReviewRow, type GuideMonthlyRow,
  type GuidePaymentSummary,
} from '@/lib/guidePerformance';
import type { MonthEndBonus } from '@/lib/guideBonus';
import GuideScorePill from './GuideScorePill';
import MonthlyInvoiceList from './MonthlyInvoiceList';
import ScoreInfoTooltip from './ScoreInfoTooltip';

// Admin-only full guide page (opened from a card or table row on GuideDashboard). Every number is
// passed in already scoped to the dashboard's selected period — this component computes nothing
// that could disagree with the cards. The only writes it can trigger are the parent's own
// handlers (bonus, mark paid); bank details are display-only.

export interface GuideDetailStats {
  toursDone: number;
  toursUpcoming: number;
  earned: number;
  paid: number;
  pending: number;
  bonus: number;
  combined: number | null;
  reviewScore: number | null;
  reviewCount: number;
  bookings: number;
  onTimeCount: number;
  countedArrivals: number;
}

export interface ScoreTrendPoint { month: string; label: string; score: number | null; reviews: number }

const eur = (v: number) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const shortDate = (d: string | null) => d
  ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  : '—';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');

export default function GuideDetailView({
  guide, periodLabel, todayStr, stats, assignments, reviews, scoreTrend, monthlyRows, bonuses,
  paymentSummary, onBack, onAddBonus, onEditBonus, onDownloadInvoice, onManageReviews, onUpdatePayment,
}: {
  guide: any;
  periodLabel: string;
  todayStr: string;
  stats: GuideDetailStats;
  assignments: GuideAssignmentRow[];
  reviews: GuideReviewRow[];
  scoreTrend: ScoreTrendPoint[];
  monthlyRows: GuideMonthlyRow[];
  bonuses: MonthEndBonus[];
  paymentSummary: GuidePaymentSummary;
  onBack: () => void;
  onAddBonus: () => void;
  onEditBonus: (month: string) => void;
  onDownloadInvoice: () => void;
  onManageReviews: () => void;
  onUpdatePayment: (row: GuideMonthlyRow, next: { payment_sent: boolean; payment_date: string | null }) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<'completed' | 'upcoming'>('completed');

  const { completed, upcoming } = useMemo(() => {
    const done: GuideAssignmentRow[] = [];
    const next: GuideAssignmentRow[] = [];
    for (const a of assignments) (isAssignmentDone(a, todayStr) ? done : next).push(a);
    const key = (a: GuideAssignmentRow) => `${a.travel_date || ''}${a.travel_time || ''}`;
    done.sort((a, b) => key(b).localeCompare(key(a)));
    next.sort((a, b) => key(a).localeCompare(key(b)));
    return { completed: done, upcoming: next };
  }, [assignments, todayStr]);

  const starCounts = useMemo(() => {
    const counts = [5, 4, 3, 2, 1].map(stars => ({ stars, n: reviews.filter(r => r.stars === stars).length }));
    const max = Math.max(1, ...counts.map(c => c.n));
    return { counts, max };
  }, [reviews]);

  const languages = String(guide.languages || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean);
  const isActive = (guide.status || 'active').toLowerCase() === 'active';
  const whatsapp = String(guide.whatsapp || guide.phone || '').replace(/[^\d]/g, '');
  const paidPct = stats.earned > 0 ? Math.min(100, (stats.paid / stats.earned) * 100) : 0;
  const list = tab === 'completed' ? completed : upcoming;

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> All guides
      </button>

      {/* HEADER */}
      <section className="aurelia-card p-6 md:p-8 border-l-[3px] border-l-gold">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gold/15 text-gold flex items-center justify-center text-2xl font-black shrink-0">
            {initials(guide.name || '?')}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight break-words">{guide.name}</h1>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${isActive ? 'bg-green-600/12 text-green-700' : 'bg-muted text-muted-foreground border border-border'}`}>
                {isActive ? 'Active' : (guide.status || 'Inactive')}
              </span>
              {guide.licensed && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gold/15 text-gold">
                  <BadgeCheck size={11} /> Licensed
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {guide.guide_number && <span className="font-mono uppercase tracking-widest">{guide.guide_number}</span>}
              {languages.map(l => <span key={l} className="px-2 py-0.5 rounded-md bg-muted border border-border text-foreground/80">{l}</span>)}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {guide.email && (
                <a href={`mailto:${guide.email}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold hover:border-gold/40">
                  <Mail size={13} /> {guide.email}
                </a>
              )}
              {whatsapp && (
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold hover:border-gold/40">
                  <MessageCircle size={13} /> WhatsApp
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-row md:flex-col gap-2 shrink-0">
            <button onClick={onAddBonus} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gold text-black text-xs font-black uppercase tracking-wide">
              <Gift size={14} /> Add bonus
            </button>
            <button onClick={onDownloadInvoice} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-muted border border-border text-xs font-bold uppercase tracking-wide hover:border-gold/40">
              <FileDown size={14} /> Invoice (PDF)
            </button>
          </div>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">Showing <span className="font-bold text-foreground">{periodLabel}</span> — every number on this page uses this period.</p>

      {/* KPI ROW */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Tours done', value: String(stats.toursDone) },
          { label: 'Upcoming', value: String(stats.toursUpcoming) },
          { label: 'Earned', value: eur(stats.earned), cls: 'text-gold' },
          { label: 'Paid', value: eur(stats.paid), cls: 'text-green-700' },
          { label: 'Pending', value: eur(stats.pending), cls: 'text-amber-700' },
        ].map(k => (
          <div key={k.label} className="aurelia-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums ${k.cls || ''}`}>{k.value}</p>
          </div>
        ))}
        <div className="aurelia-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1">Score <ScoreInfoTooltip /></p>
          <GuideScorePill combined={stats.combined} reviewCount={stats.reviewCount} />
        </div>
      </section>
      {stats.earned > 0 && (
        <div>
          <div className="h-2 rounded-full bg-amber-500/25 overflow-hidden">
            <div className="h-full bg-green-600" style={{ width: `${paidPct}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {eur(stats.paid)} paid · {eur(stats.pending)} pending{stats.bonus > 0 ? ` · includes ${eur(stats.bonus)} month-end bonus` : ''}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
        {/* TOURS */}
        <section className="aurelia-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Tours</h2>
            <div className="flex gap-1 bg-muted p-1 rounded-xl border border-border">
              {(['completed', 'upcoming'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${tab === t ? 'bg-card text-gold shadow-[var(--card-shadow)]' : 'text-muted-foreground'}`}>
                  {t === 'completed' ? `Completed (${completed.length})` : `Upcoming (${upcoming.length})`}
                </button>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No {tab} tours in this period.</p>
          ) : tab === 'upcoming' ? (
            <ul className="divide-y divide-border max-h-[460px] overflow-y-auto aurelia-scrollbar">
              {list.map(a => (
                <li key={a.id} className="py-3 flex items-center gap-4">
                  <div className="w-16 shrink-0 text-center rounded-lg bg-muted py-1.5">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{shortDate(a.travel_date).split(',')[0]}</p>
                    <p className="text-sm font-black">{a.travel_date?.slice(8, 10)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold break-words">{a.tour_name || a.option_name || a.product_code || 'Tour'}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarClock size={11} /> {shortDate(a.travel_date)}{a.travel_time ? ` · ${a.travel_time.slice(0, 5)}` : ''}
                      {a.tour_type ? ` · ${a.tour_type}` : ''}{a.pax_count != null ? ` · ${a.pax_count} pax` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums shrink-0">{eur(assignmentEarned(a))}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto aurelia-scrollbar">
              <table className="w-full text-left text-xs min-w-[640px]">
                <thead className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border sticky top-0 bg-card">
                  <tr>
                    <th className="py-2 pr-2">Date</th><th className="py-2 pr-2">Time</th><th className="py-2 pr-2">Tour</th>
                    <th className="py-2 pr-2">Type</th><th className="py-2 pr-2 text-right">Pax</th><th className="py-2 pr-2 text-right">Pay</th>
                    <th className="py-2 pr-2 text-right">Bonus</th><th className="py-2 pr-2 text-right">Total</th><th className="py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map(a => {
                    const total = assignmentEarned(a);
                    const bonus = Number(a.bonus) || 0;
                    return (
                      <tr key={a.id}>
                        <td className="py-2 pr-2 font-mono whitespace-nowrap text-muted-foreground">{a.travel_date}</td>
                        <td className="py-2 pr-2 text-muted-foreground">{a.travel_time?.slice(0, 5) || '—'}</td>
                        <td className="py-2 pr-2 font-semibold">{a.tour_name || a.option_name || a.product_code || '—'}</td>
                        <td className="py-2 pr-2 text-muted-foreground">{a.tour_type || '—'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{a.pax_count ?? '—'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{eur(total - bonus)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-gold">{bonus ? eur(bonus) : '—'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums font-bold">{eur(total)}</td>
                        <td className="py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${a.is_paid ? 'bg-green-600/15 text-green-700' : 'bg-amber-500/15 text-amber-700'}`}>
                            {a.is_paid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-6">
          {/* REVIEWS */}
          <section className="aurelia-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Reviews</h2>
              <button onClick={onManageReviews} className="text-[10px] font-bold uppercase tracking-widest text-gold hover:underline">Manage</button>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span>Review score <span className="font-bold text-foreground">{stats.reviewScore != null ? `${stats.reviewScore >= 0 ? '+' : ''}${stats.reviewScore.toFixed(2)}` : '—'}</span></span>
              <span>{stats.bookings} checked-in bookings</span>
              {stats.countedArrivals > 0 && <span>On-time {stats.onTimeCount}/{stats.countedArrivals}</span>}
            </div>
            <div className="space-y-1.5">
              {starCounts.counts.map(c => (
                <div key={c.stars} className="flex items-center gap-2 text-xs">
                  <span className="w-8 shrink-0 flex items-center gap-0.5 font-semibold">{c.stars}<Star size={10} className="fill-gold text-gold" /></span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${(c.n / starCounts.max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right tabular-nums text-muted-foreground">{c.n}</span>
                </div>
              ))}
            </div>
            {scoreTrend.length > 1 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Review score by month</p>
                <div className="flex items-end gap-1.5 h-20">
                  {scoreTrend.map(p => {
                    const h = p.score == null ? 4 : Math.max(4, ((Math.max(-1, Math.min(1, p.score)) + 1) / 2) * 100);
                    return (
                      <div key={p.month} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${p.label}: ${p.score == null ? '—' : p.score.toFixed(2)} (${p.reviews} reviews)`}>
                        <div className={`w-full rounded-t ${p.score == null ? 'bg-muted' : p.score >= 0 ? 'bg-green-600/70' : 'bg-red-600/70'}`} style={{ height: `${h}%` }} />
                        <span className="text-[9px] text-muted-foreground truncate">{p.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews in this period.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto aurelia-scrollbar">
                {[...reviews].sort((a, b) => b.review_date.localeCompare(a.review_date)).map(r => (
                  <li key={r.id} className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="flex text-gold">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={10} className={i < r.stars ? 'fill-gold' : 'opacity-20'} />)}</span>
                      <span className="font-mono text-muted-foreground">{r.review_date}</span>
                      {r.platform && <span className="text-muted-foreground">· {r.platform}</span>}
                      {r.excluded_from_score && <span className="text-red-700 font-bold">· excluded</span>}
                    </div>
                    {r.comment && <p className="text-xs mt-1 text-foreground/90">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* BANK DETAILS — read-only, admin only */}
          <section className="aurelia-card p-5 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Landmark size={14} /> Bank details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {[
                ['Account holder', guide.account_holder], ['IBAN', guide.iban], ['SWIFT / BIC', guide.swift_code], ['Bank', guide.bank_name],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono font-semibold break-all">{v || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {/* PAYMENTS */}
      <section className="aurelia-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Payments</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 size={12} />
            {paymentSummary.paidThroughMonth
              ? <>Paid through <span className="font-bold text-foreground">{monthLabel(paymentSummary.paidThroughMonth)}</span>{paymentSummary.lastPaymentDate ? ` · last paid ${paymentSummary.lastPaymentDate}` : ''}</>
              : 'No payments recorded yet'}
          </p>
        </div>
        {bonuses.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Month-end bonuses in this period</p>
            {bonuses.map(b => (
              <div key={b.month} className="flex flex-wrap items-center gap-3 rounded-lg bg-gold/8 border border-gold/20 px-3 py-2 text-xs">
                <Gift size={13} className="text-gold" />
                <span className="font-bold">{monthLabel(b.month)}</span>
                <span className="font-bold tabular-nums">{eur(b.amount)}</span>
                {b.note && <span className="text-muted-foreground">· {b.note}</span>}
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${b.paid ? 'bg-green-600/15 text-green-700' : 'bg-amber-500/15 text-amber-700'}`}>{b.paid ? 'Paid' : 'Pending'}</span>
                <button onClick={() => onEditBonus(b.month)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Edit bonus"><Pencil size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <MonthlyInvoiceList rows={monthlyRows} isOwner onUpdatePayment={onUpdatePayment} />
      </section>
    </div>
  );
}
