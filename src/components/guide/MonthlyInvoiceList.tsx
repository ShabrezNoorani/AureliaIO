import { useMemo, useState } from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import type { GuideMonthlyRow } from '@/lib/guidePerformance';
import { localDateStr } from '@/lib/utils';

const fmtEuro = (v: number | null) => v == null ? '—' : `€${v.toFixed(2)}`;

const monthLabel = (month: string | null) => {
  if (!month) return 'Unknown month';
  const [y, m] = month.split('-');
  if (!y || !m) return month;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

interface MonthlyInvoiceListProps {
  rows: GuideMonthlyRow[];
  /** Owner-only "mark paid" / payment-date controls — never shown on the guide's own statement view. */
  isOwner?: boolean;
  onUpdatePayment?: (row: GuideMonthlyRow, next: { payment_sent: boolean; payment_date: string | null }) => void | Promise<void>;
}

export default function MonthlyInvoiceList({ rows, isOwner, onUpdatePayment }: MonthlyInvoiceListProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.month || '').localeCompare(a.month || '')),
    [rows]
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No monthly statements yet.</p>;
  }

  return (
    <div className="space-y-2 max-h-[480px] overflow-y-auto aurelia-scrollbar pr-1">
      {sorted.map((r) => (
        <MonthlyInvoiceRow key={r.id} row={r} isOwner={!!isOwner} onUpdatePayment={onUpdatePayment} />
      ))}
    </div>
  );
}

function MonthlyInvoiceRow({
  row,
  isOwner,
  onUpdatePayment,
}: {
  row: GuideMonthlyRow;
  isOwner: boolean;
  onUpdatePayment?: MonthlyInvoiceListProps['onUpdatePayment'];
}) {
  const [saving, setSaving] = useState(false);
  const [dateDraft, setDateDraft] = useState(row.payment_date || '');

  const handleTogglePaid = async () => {
    if (!onUpdatePayment || saving) return;
    setSaving(true);
    const nextSent = !row.payment_sent;
    const nextDate = nextSent ? (row.payment_date || dateDraft || localDateStr()) : row.payment_date;
    await onUpdatePayment(row, { payment_sent: nextSent, payment_date: nextDate });
    setSaving(false);
  };

  const handleDateBlur = async () => {
    if (!onUpdatePayment || saving || dateDraft === (row.payment_date || '')) return;
    setSaving(true);
    await onUpdatePayment(row, { payment_sent: !!row.payment_sent, payment_date: dateDraft || null });
    setSaving(false);
  };

  return (
    <div className="aurelia-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{monthLabel(row.month)}</p>
        {isOwner ? (
          <button
            onClick={handleTogglePaid}
            disabled={saving}
            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0 ${
              row.payment_sent ? 'bg-green-600/15 text-green-700 hover:bg-green-600/25' : 'bg-amber-600/15 text-amber-700 hover:bg-amber-600/25'
            }`}
          >
            <CheckCircle2 size={10} />
            {row.payment_sent ? 'Paid' : 'Mark Paid'}
          </button>
        ) : row.payment_sent ? (
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-600/15 text-green-700 shrink-0">Paid</span>
        ) : (
          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-600/15 text-amber-700 shrink-0">Pending</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-border/60 text-[11px]">
        <div>
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">Tours</p>
          <p className="text-foreground font-semibold tabular-nums">{row.tours_completed ?? '—'}</p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">Owed</p>
          <p className="text-foreground font-semibold tabular-nums">{fmtEuro(row.amount_owed)}</p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">Invoiced</p>
          <p className="text-foreground font-semibold tabular-nums">{fmtEuro(row.invoice_amount)}</p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">TVA</p>
          <p className="text-foreground font-semibold tabular-nums">{fmtEuro(row.tva)}</p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">Difference</p>
          <p className={`font-semibold tabular-nums ${(row.difference || 0) < 0 ? 'text-red-700' : 'text-foreground'}`}>{fmtEuro(row.difference)}</p>
        </div>
        <div className="col-span-2 min-w-0">
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">Invoice File</p>
          <p className="text-foreground font-semibold truncate flex items-center gap-1">
            {row.invoice_received ? (<><FileText size={11} className="shrink-0 text-muted-foreground" /> {row.invoice_received}</>) : '—'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground uppercase tracking-wide text-[9px] font-bold mb-0.5">Payment Date</p>
          {isOwner ? (
            <input
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              onBlur={handleDateBlur}
              disabled={saving}
              className="bg-background border border-border rounded-md text-[10px] px-1 py-0.5 text-foreground outline-none w-full disabled:opacity-50"
            />
          ) : (
            <p className="text-foreground font-semibold tabular-nums">{row.payment_date || '—'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
