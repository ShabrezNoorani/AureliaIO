import {
  filterAssignmentsByDateRange, computeGuidePaymentSummary,
  type GuideAssignmentRow, type GuideMonthlyRow, type DateRangeBounds,
} from './guidePerformance';
import { listMonthEndBonuses } from './guideBonus';
import type { GuideInvoiceGuide } from './generateInvoice';

/** Inclusive YYYY-MM-DD bounds for one YYYY-MM month. */
export function monthBounds(month: string): DateRangeBounds {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * Builds and downloads ONE guide's invoice PDF for a window. Shared by the admin dashboard (any
 * guide) and the guide's own earnings views (their own rows only — the caller only ever holds
 * that guide's data). Every input is already-loaded data; this reads and writes nothing in the
 * database. Returns false when there is nothing to invoice in the window.
 */
export async function downloadGuideInvoice(params: {
  guide: GuideInvoiceGuide & { id: string };
  assignments: GuideAssignmentRow[];
  monthlyRows: GuideMonthlyRow[];
  bounds: DateRangeBounds;
  periodLabel: string;
  companyName?: string | null;
}): Promise<boolean> {
  const { guide, bounds } = params;
  const tours = filterAssignmentsByDateRange(params.assignments.filter(a => a.guide_id === guide.id), bounds);
  const guideMonthly = params.monthlyRows.filter(m => m.guide_id === guide.id);
  const bonuses = listMonthEndBonuses(guideMonthly, { guideId: guide.id, bounds });
  if (tours.length === 0 && bonuses.length === 0) return false;

  // Never print an open-ended sentinel date ('0000-01-01' / '9999-12-31') on the invoice.
  const dates = tours.map(a => a.travel_date!).sort();
  const from = bounds.start.startsWith('0000') ? (dates[0] || bonuses[bonuses.length - 1]?.month + '-01') : bounds.start;
  const to = bounds.end.startsWith('9999') ? (dates[dates.length - 1] || monthBounds(bonuses[0].month).end) : bounds.end;

  const { generateGuidePeriodInvoice } = await import('./generateInvoice');
  generateGuidePeriodInvoice({
    guide,
    assignments: tours,
    monthBonuses: [...bonuses].reverse().map(b => ({ month: b.month, amount: b.amount, note: b.note, paid: b.paid })),
    companyName: params.companyName,
    periodLabel: params.periodLabel,
    dateRange: { from, to },
    paidThroughMonth: computeGuidePaymentSummary(guideMonthly).paidThroughMonth,
  });
  return true;
}

/**
 * Guide-side: downloads the signed-in guide's OWN invoice for one month. Reads only their own
 * guides row (name, number, bank details — the same row their Profile page already reads) and
 * uses only the rows the calling page already holds for this guide.
 */
export async function downloadOwnMonthInvoice(
  supabase: { from: (table: string) => any },
  params: { guideId: string; guideName: string; month: string; assignments: GuideAssignmentRow[]; monthlyRows: GuideMonthlyRow[] }
): Promise<void> {
  const { data } = await supabase.from('guides')
    .select('id, name, guide_number, account_holder, iban, swift_code, bank_name')
    .eq('id', params.guideId).maybeSingle();
  const guide = data || { id: params.guideId, name: params.guideName || 'Guide', guide_number: null };
  const [y, m] = params.month.split('-').map(Number);
  const ok = await downloadGuideInvoice({
    guide,
    assignments: params.assignments,
    monthlyRows: params.monthlyRows,
    bounds: monthBounds(params.month),
    periodLabel: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  });
  if (!ok) alert('Nothing to invoice for this month yet.');
}
