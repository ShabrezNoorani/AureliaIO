import { useMemo } from 'react';
import { CalendarPlus, MessageCircle } from 'lucide-react';
import { assignmentEarned, type GuideAssignmentRow } from '@/lib/guidePerformance';
import { buildGoogleCalendarUrl, buildWhatsAppUrl } from '@/lib/tourInvites';

const fmtEuro = (v: number) => `€${v.toFixed(2)}`;

interface TourHistoryListProps {
  assignments: GuideAssignmentRow[];
  todayStr: string;
  /** Owner-only "Add to Calendar" / "Send WhatsApp" actions on upcoming tours — never shown on
      the guide's own view of their own history. */
  isOwner?: boolean;
  guideWhatsapp?: string | null;
}

export default function TourHistoryList({ assignments, todayStr, isOwner, guideWhatsapp }: TourHistoryListProps) {
  const sorted = useMemo(
    () => [...assignments].sort((a, b) => (b.travel_date || '').localeCompare(a.travel_date || '')),
    [assignments]
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No tour history yet.</p>;
  }

  return (
    <div className="space-y-2 max-h-[480px] overflow-y-auto aurelia-scrollbar pr-1">
      {sorted.map((a) => {
        const base = a.rate_override != null ? Number(a.rate_override) : (Number(a.calculated_pay) || 0);
        const bonus = Number(a.bonus) || 0;
        const total = assignmentEarned(a);
        const isUpcoming = !a.travel_date || a.travel_date >= todayStr;

        const calendarUrl = isOwner && isUpcoming && a.travel_date
          ? buildGoogleCalendarUrl({
              title: a.tour_name || 'Tour',
              details: [a.tour_type, a.language].filter(Boolean).join(' · ') || undefined,
              tourDate: a.travel_date,
              startTime: a.travel_time,
            })
          : null;
        const whatsAppUrl = isOwner && isUpcoming
          ? buildWhatsAppUrl(guideWhatsapp, `Hi! Reminder about your tour "${a.tour_name || 'Tour'}" on ${a.travel_date || 'TBC'}${a.travel_time ? ` at ${a.travel_time}` : ''}.`)
          : null;

        return (
          <div key={a.id} className="aurelia-card p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{a.tour_name || 'Untitled Tour'}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                  <span className="tabular-nums">{a.travel_date || '—'}</span>
                  {a.travel_time && <span>&middot; {a.travel_time}</span>}
                  {a.tour_type && <span>&middot; {a.tour_type}</span>}
                  {a.language && <span>&middot; {a.language}</span>}
                </div>
              </div>
              {a.is_paid ? (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-600/15 text-green-700 shrink-0">Paid</span>
              ) : (
                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-700 shrink-0">Pending</span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/60">
              <div className="flex items-center gap-3 text-[11px] tabular-nums">
                <span className="text-muted-foreground">Base <span className="text-foreground font-semibold">{fmtEuro(base)}</span></span>
                {bonus > 0 && <span className="text-muted-foreground">Bonus <span className="text-gold font-semibold">{fmtEuro(bonus)}</span></span>}
                <span className="text-muted-foreground">Total <span className="text-foreground font-bold">{fmtEuro(total)}</span></span>
              </div>

              {(calendarUrl || whatsAppUrl) && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {calendarUrl && (
                    <a
                      href={calendarUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Add to Google Calendar"
                      className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 rounded-md text-blue-700 transition-colors"
                    >
                      <CalendarPlus size={13} />
                    </a>
                  )}
                  {whatsAppUrl && (
                    <a
                      href={whatsAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Send WhatsApp"
                      className="p-1.5 bg-green-600/10 hover:bg-green-600/20 rounded-md text-green-700 transition-colors"
                    >
                      <MessageCircle size={13} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
