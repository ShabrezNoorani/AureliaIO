import { useState, useMemo } from 'react';
import { Plus, Trash2, Pencil, RefreshCw } from 'lucide-react';
import { useAdminCosts, ADMIN_CATEGORIES, type AdminCost } from '@/lib/useAdminCosts';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { syncAdminCosts } from '@/lib/gsheetSync';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtEuro(v: number) {
  return '€' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const EMPTY_COST: AdminCost = {
  label: '',
  category: 'Other',
  amount: 0,
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
};

export default function AdminCostsPage() {
  const { costs, loading, addCost, updateCost, deleteCost, refresh } = useAdminCosts();
  const { user } = useAuth();

  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminCost>({ ...EMPTY_COST });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Filter costs by month/year
  const monthCosts = useMemo(() =>
    costs.filter((c) => c.month === viewMonth && c.year === viewYear),
    [costs, viewMonth, viewYear]
  );

  const totalMonth = useMemo(() => monthCosts.reduce((s, c) => s + c.amount, 0), [monthCosts]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of monthCosts) {
      map[c.category] = (map[c.category] || 0) + c.amount;
    }
    return map;
  }, [monthCosts]);

  const handleEdit = (cost: AdminCost) => {
    setDraft({ ...cost });
    setEditId(cost.id || null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (editId) {
      const { id, user_id, created_at, ...fields } = draft;
      await updateCost(editId, fields);
    } else {
      await addCost({ ...draft, month: draft.month || viewMonth, year: draft.year || viewYear });
    }
    setShowForm(false);
    setEditId(null);
    setDraft({ ...EMPTY_COST, month: viewMonth, year: viewYear });
  };

  const handleDelete = async (cost: AdminCost) => {
    if (!cost.id) return;
    if (confirm(`Delete "${cost.label}"?`)) {
      await deleteCost(cost.id);
    }
  };

  const handleAdd = () => {
    setEditId(null);
    setDraft({ ...EMPTY_COST, month: viewMonth, year: viewYear });
    setShowForm(true);
  };

  const handleGsheetSync = async () => {
    const sheetId = localStorage.getItem('gsheet_id');
    if (!sheetId) {
      setSyncMsg('⚠ No Spreadsheet ID configured. Go to Settings first.');
      return;
    }
    if (!user) return;
    setSyncing(true);
    setSyncMsg('Syncing costs…');
    try {
      const res = await syncAdminCosts(sheetId, user.id, supabase);
      if (res.error) {
        setSyncMsg(`❌ ${res.error}`);
      } else {
        setSyncMsg(`✅ Imported ${res.imported} costs`);
        await refresh();
      }
    } catch {
      setSyncMsg('❌ Sync failed. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Costs</h1>
          <p className="text-sm text-muted-foreground mt-1">Monthly overhead and recurring costs.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="aurelia-input w-24"
            value={viewMonth}
            onChange={(e) => setViewMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input
            type="number"
            className="aurelia-input w-20 text-center"
            value={viewYear}
            onChange={(e) => setViewYear(Number(e.target.value))}
          />
          <button onClick={handleAdd} className="aurelia-gold-btn flex items-center gap-2">
            <Plus size={14} /> Add Cost
          </button>
          <button onClick={handleGsheetSync} disabled={syncing}
            className="aurelia-ghost-btn flex items-center gap-2 border border-border disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync from Google Sheets'}
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className={`p-3 rounded-lg text-xs font-medium mb-4 border animate-fade-in ${
          syncMsg.startsWith('✅') ? 'bg-green-500/10 border-green-500/20 text-green-400' :
          syncMsg.startsWith('❌') || syncMsg.startsWith('⚠') ? 'bg-red-500/10 border-red-500/20 text-red-400' :
          'bg-blue-500/10 border-blue-500/20 text-blue-400'
        }`}>
          {syncMsg}
          <button onClick={() => setSyncMsg('')} className="ml-3 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Summary */}
      <div className="aurelia-card p-6 mb-6 border-l-[3px] border-l-gold">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </span>
          <span className="text-lg font-bold text-foreground tabular-nums">{fmtEuro(totalMonth)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(categoryBreakdown).map(([cat, amount]) => (
            <span key={cat} className="px-3 py-1 rounded-lg text-xs font-semibold border border-border bg-card tabular-nums">
              {cat}: <span className="text-foreground">{fmtEuro(amount)}</span>
            </span>
          ))}
          {Object.keys(categoryBreakdown).length === 0 && (
            <span className="text-xs text-muted-foreground">No costs this month.</span>
          )}
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="aurelia-card p-5 mb-6 animate-fade-in">
          <h3 className="aurelia-section-title mb-4">{editId ? 'Edit Cost' : 'Add Cost'}</h3>
          <div className="grid grid-cols-[1fr_140px_120px_80px_80px] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Label</label>
              <input className="aurelia-input" value={draft.label} placeholder="e.g. Google Ads"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Category</label>
              <select className="aurelia-input" value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as AdminCost['category'] })}>
                {ADMIN_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount €</label>
              <input type="number" min={0} className="aurelia-input" value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: Math.max(0, Number(e.target.value)) })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Month</label>
              <select className="aurelia-input text-xs" value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Year</label>
              <input type="number" className="aurelia-input text-xs" value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSave} className="aurelia-gold-btn text-xs">Save</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="aurelia-ghost-btn text-xs">Cancel</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Costs table */}
      {!loading && monthCosts.length > 0 && (
        <div className="aurelia-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-subtle border-b border-border">
                <th className="py-3 px-4 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Label</th>
                <th className="py-3 px-4 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold text-muted-foreground uppercase tracking-wider w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {monthCosts.map((c) => (
                <tr key={c.id} className="border-b border-border/30 hover:bg-hover transition-colors">
                  <td className="py-3 px-4 text-foreground font-medium">{c.label}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-secondary text-muted-foreground">{c.category}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-foreground font-bold tabular-nums">{fmtEuro(c.amount)}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleEdit(c)} className="p-1 text-muted-foreground hover:text-gold transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1 text-muted-foreground hover:text-profit-negative transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && monthCosts.length === 0 && !showForm && (
        <div className="aurelia-card p-12 text-center">
          <p className="text-sm text-muted-foreground">No costs for {MONTH_NAMES[viewMonth - 1]} {viewYear}.</p>
          <button onClick={handleAdd} className="aurelia-gold-btn mt-4 text-sm">
            + Add first cost
          </button>
        </div>
      )}
    </div>
  );
}
