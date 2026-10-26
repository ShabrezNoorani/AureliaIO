import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { localDateStr } from '@/lib/utils';
import {
  computeAssignmentStats, groupMonthlyEarnings, sessionGuidesToAssignmentRows, buildUnifiedMonthlyRows,
  type GuideAssignmentRow, type GuideMonthlyRow, type SessionGuideForEarnings, type SessionForEarnings,
} from '@/lib/guidePerformance';
import GuideStatCards from '@/components/guide/GuideStatCards';
import TourHistoryList from '@/components/guide/TourHistoryList';
import MonthlyInvoiceList from '@/components/guide/MonthlyInvoiceList';

const GuideEarningsChart = lazy(() => import('@/components/guide/GuideEarningsChart'));

/**
 * The ONLY page an inactive guide (still inside their 60-day window) can reach — their own
 * earnings and pay history, nothing else. Same data sources and components as GuideHome's
 * "Tours & Pay" / "Invoices" sections, with two deliberate narrowings:
 *  - guide_assignments is selected WITHOUT clients/booking_ref/notes (guest names and booking
 *    detail never leave the DB for this view);
 *  - only PAST rows are shown (travel_date < today), so no upcoming tour is ever listed.
 * No session_bookings, bookings, checkins, my_session_team or realtime — nothing about guests.
 */
export default function GuideEarningsOnly() {
  const { guideId, guideName, guideUserId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<GuideAssignmentRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<GuideMonthlyRow[]>([]);
  const [perfSessionGuides, setPerfSessionGuides] = useState<SessionGuideForEarnings[]>([]);
  const [perfSessions, setPerfSessions] = useState<SessionForEarnings[]>([]);
  const today = localDateStr();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!guideId || !guideUserId) { setLoading(false); return; }
      setLoading(true);
      const [aRes, mRes, sgRes] = await Promise.all([
        supabase.from('guide_assignments')
          .select('id, guide_id, travel_date, travel_time, tour_name, tour_type, language, calculated_pay, rate_override, bonus, total_pay, is_paid, paid_date, product_code, option_name, pax_count')
          .eq('guide_id', guideId).lt('travel_date', today),
        supabase.from('guide_monthly')
          .select('id, guide_id, guide_name, month, tours_completed, amount_owed, invoice_received, invoice_amount, tva, difference, payment_sent, payment_date')
          .eq('guide_id', guideId),
        supabase.from('session_guides').select('session_id, guide_id, status, base_pay, bonus').eq('guide_id', guideId),
      ]);
      if (!mounted) return;
      setAssignments((aRes.data || []).map(a => ({ ...a, booking_ref: null, clients: null, notes: null })));
      setMonthlyRows(mRes.data || []);
      const mySessionGuides = sgRes.data || [];
      setPerfSessionGuides(mySessionGuides);
      const ids = Array.from(new Set(mySessionGuides.map(sg => sg.session_id)));
      if (ids.length > 0) {
        const { data } = await supabase.from('tour_sessions')
          .select('id, tour_date, start_time, label')
          .eq('user_id', guideUserId).in('id', ids).lt('tour_date', today);
        if (!mounted) return;
        setPerfSessions(data || []);
      } else {
        setPerfSessions([]);
      }
      setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, [guideId, guideUserId, today]);

  const paidMonthsByGuide = useMemo(
    () => new Set(monthlyRows.filter(m => m.payment_sent && m.guide_id).map(m => `${m.guide_id}:${m.month}`)),
    [monthlyRows]
  );
  // perfSessions is already past-only, so session rows for future sessions drop out here (no
  // matching session → sessionGuidesToAssignmentRows skips them).
  const sessionAssignmentRows = useMemo(
    () => sessionGuidesToAssignmentRows(perfSessionGuides, perfSessions, paidMonthsByGuide),
    [perfSessionGuides, perfSessions, paidMonthsByGuide]
  );
  const pastAssignments = useMemo(
    () => [...assignments, ...sessionAssignmentRows].filter(a => !!a.travel_date && a.travel_date < today),
    [assignments, sessionAssignmentRows, today]
  );
  const unifiedMonthlyRows = useMemo(
    () => guideId ? buildUnifiedMonthlyRows(guideId, guideName || '', monthlyRows, sessionAssignmentRows) : [],
    [guideId, guideName, monthlyRows, sessionAssignmentRows]
  );
  const stats = useMemo(() => computeAssignmentStats(pastAssignments, today), [pastAssignments, today]);
  const monthlyEarnings = useMemo(() => groupMonthlyEarnings(pastAssignments), [pastAssignments]);

  return (
    <div className="p-4 md:p-8 pb-32 max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">My Earnings</h1>
        <p className="text-muted-foreground text-sm">Your pay history and invoices.</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Pay History</h2>
            <GuideStatCards stats={stats} />
            <Suspense fallback={<div className="h-64 rounded-2xl bg-muted animate-pulse" />}>
              <GuideEarningsChart data={monthlyEarnings} />
            </Suspense>
            <TourHistoryList assignments={pastAssignments} todayStr={today} />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Invoices</h2>
            <MonthlyInvoiceList rows={unifiedMonthlyRows} />
          </section>
        </>
      )}
    </div>
  );
}
