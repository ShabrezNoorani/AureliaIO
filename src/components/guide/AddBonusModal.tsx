import { useEffect, useState } from 'react';
import { X, Gift } from 'lucide-react';

/** Owner-only month-end bonus form. Pure UI — the caller does the single guide_monthly write
    (saveMonthEndBonus). `existingFor(month)` pre-fills when that month already has a bonus. */
export default function AddBonusModal({
  guideName, defaultMonth, existingFor, onSave, onClose,
}: {
  guideName: string;
  defaultMonth: string;
  existingFor: (month: string) => { bonus: number | null; bonus_note: string | null } | null;
  onSave: (month: string, amount: number | null, note: string | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const existing = existingFor(month);

  useEffect(() => {
    const e = existingFor(month);
    setAmount(e?.bonus ? String(e.bonus) : '');
    setNote(e?.bonus_note || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const save = async (clear = false) => {
    const value = clear ? null : Number(amount.replace(',', '.'));
    if (!clear && (!month || !value || !isFinite(value) || value <= 0)) { setError('Enter a month and an amount above 0.'); return; }
    setSaving(true);
    setError('');
    const err = await onSave(month, value, clear ? null : note);
    setSaving(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="bg-card border border-border rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2"><Gift size={18} className="text-gold" /> Month-end bonus</h2>
            <p className="text-xs text-muted-foreground mt-1">{guideName} · a lump sum for the month, not tied to a tour</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 rounded-lg bg-red-600/10 border border-red-600/20 text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="aurelia-input w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Amount (€)</label>
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 50" className="aurelia-input w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Great reviews in October" className="aurelia-input w-full" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Adds to this guide's earnings and pending for that month, and appears on their invoice. Paid together with the month.
          </p>
          <div className="flex gap-3 pt-1">
            {existing?.bonus ? (
              <button onClick={() => save(true)} disabled={saving} className="flex-1 py-3 rounded-xl font-bold border border-border hover:bg-muted text-sm disabled:opacity-50">
                Remove
              </button>
            ) : (
              <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold border border-border hover:bg-muted text-sm">Cancel</button>
            )}
            <button onClick={() => save()} disabled={saving} className="flex-[2] py-3 bg-gold text-black rounded-xl font-black text-sm uppercase tracking-widest disabled:opacity-50">
              {saving ? 'Saving…' : existing?.bonus ? 'Update bonus' : 'Add bonus'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
