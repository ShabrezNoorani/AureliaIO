import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logChange } from '@/lib/changeLog';
import { Plus, X, PenSquare, Trash2, CheckCircle2, Euro, Info, Tag, ChevronRight, Search } from 'lucide-react';

interface GuideOptionRate {
  id?: string;
  product_code: string;
  option_name: string;
  rate: number;
}

interface Guide {
  id: string;
  guide_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  base_rate: number;
  status: string;
  notes: string | null;
  option_rates?: GuideOptionRate[];
}

export default function GuidesPage() {
  const { user } = useAuth();

  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingGuide, setEditingGuide] = useState<Guide | null>(null);
  const [existingOptions, setExistingOptions] = useState<string[]>([]);
  
  const [form, setForm] = useState({
    guideNumber: '',
    name: '',
    email: '',
    phone: '',
    baseRate: 0,
    status: 'active',
    notes: '',
    optionRates: [] as GuideOptionRate[]
  });

  const fetchGuides = async () => {
    if (!user) return;
    setLoading(true);
    
    // Fetch guides and their product rates
    const { data: guidesData, error: guidesError } = await supabase
      .from('guides')
      .select('*, option_rates:guide_option_rates(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    
    if (guidesError) console.error(guidesError);
    setGuides(guidesData || []);
    setLoading(false);
  };

  const loadExistingOptions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('bookings')
      .select('option_name')
      .eq('user_id', user.id);
    
    if (data) {
      const unique = Array.from(new Set(data.map(b => b.option_name).filter(Boolean)));
      setExistingOptions(unique as string[]);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchGuides();
    loadExistingOptions();
  }, [user]);

  const openPanel = (guide: Guide | null = null) => {
    if (guide) {
      setEditingGuide(guide);
      setForm({
        guideNumber: guide.guide_number || '',
        name: guide.name || '',
        email: guide.email || '',
        phone: guide.phone || '',
        baseRate: guide.base_rate || 0,
        status: guide.status || 'active',
        notes: guide.notes || '',
        optionRates: guide.option_rates || []
      });
    } else {
      setEditingGuide(null);
      const next = (guides.length + 1).toString().padStart(3, '0');
      setForm({
        guideNumber: 'G' + next,
        name: '',
        email: '',
        phone: '',
        baseRate: 0,
        status: 'active',
        notes: '',
        optionRates: []
      });
    }
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) return alert("Name is required");

    const payload = {
      user_id: user.id,
      guide_number: form.guideNumber,
      name: form.name,
      email: form.email,
      phone: form.phone,
      base_rate: Number(form.baseRate),
      status: form.status,
      notes: form.notes
    };

    let guideId = editingGuide?.id;

    if (editingGuide) {
      const { error } = await supabase
        .from('guides')
        .update(payload)
        .eq('id', editingGuide.id);
      if (error) console.error(error);
    } else {
      const { data, error } = await supabase
        .from('guides')
        .insert(payload)
        .select()
        .single();
      if (error) console.error(error);
      if (data) guideId = data.id;
    }

    if (guideId) {
      // Update option rates
      await supabase.from('guide_option_rates').delete().eq('guide_id', guideId);
      
      if (form.optionRates.length > 0) {
        const ratesPayload = form.optionRates
          .filter(r => r.product_code.trim())
          .map(r => ({
            guide_id: guideId,
            user_id: user.id,
            product_code: r.product_code.toUpperCase(),
            option_name: r.option_name,
            rate: Number(r.rate)
          }));
        
        if (ratesPayload.length > 0) {
          await supabase.from('guide_option_rates').insert(ratesPayload);
        }
      }

      // Log the change
      await logChange(supabase, user.id, {
        tableName: 'guide_option_rates',
        recordId: guideId,
        fieldName: 'rates',
        oldValue: editingGuide?.option_rates || [],
        newValue: form.optionRates,
        description: `Rates updated for guide ${form.name}`
      });
    }

    setPanelOpen(false);
    fetchGuides();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this guide?')) return;
    const { error } = await supabase
      .from('guides')
      .delete()
      .eq('id', id);
    if (error) console.error(error);
    fetchGuides();
  };

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
          
          <div className="flex items-center justify-between border-b border-white/5 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Guides</h1>
              <p className="text-gray-400 text-sm mt-1">Manage your team and payment rates</p>
            </div>
            <button 
              onClick={() => openPanel()}
              className="aurelia-gold-btn px-5 py-2.5 flex items-center gap-2 font-bold shadow-2xl shadow-gold/10"
            >
              <Plus size={18} /> Add Guide
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center p-20">
              <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
            </div>
          ) : guides.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
              <div className="text-7xl mb-6">👤</div>
              <h3 className="text-2xl font-extrabold mb-2">No guides yet</h3>
              <p className="text-gray-400 mb-8 max-w-sm">
                Add your first guide to track tours and earnings
              </p>
              <button 
                onClick={() => openPanel()}
                className="aurelia-gold-btn px-8 py-3 font-bold flex items-center gap-2"
              >
                <Plus size={20} /> Add First Guide
              </button>
            </div>
          ) : (
            <div className="aurelia-card border border-white/5 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-xs text-gray-400 uppercase tracking-widest font-bold">
                  <tr>
                    <th className="px-6 py-4">Guide #</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Base Rate</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {guides.map(g => (
                    <tr key={g.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4 font-mono font-bold text-gold">{g.guide_number}</td>
                      <td className="px-6 py-4">
                        <div className="font-bold">{g.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {g.option_rates && g.option_rates.length > 0 ? (
                            <>
                              {g.option_rates.slice(0, 3).map((r, idx) => (
                                <span key={idx}>
                                  {r.product_code}{r.option_name ? `/${r.option_name.slice(0, 10)}` : ''}:€{r.rate}
                                  {idx < Math.min(g.option_rates!.length, 3) - 1 ? ' · ' : ''}
                                </span>
                              ))}
                              {g.option_rates.length > 3 && ` · +${g.option_rates.length - 3} more`}
                            </>
                          ) : 'No special rates'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{g.phone || '—'}</td>
                      <td className="px-6 py-4 font-mono">€{g.base_rate}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          g.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'
                        }`}>
                          {g.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openPanel(g)} className="p-2 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors">
                            <PenSquare size={16} />
                          </button>
                          <button onClick={() => handleDelete(g.id)} className="p-2 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SLIDE-OUT PANEL */}
        {panelOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setPanelOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-[400px] bg-[#0f0f12] border-l border-white/10 z-[101] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xl font-extrabold">{editingGuide ? 'Edit Guide' : 'Add Guide'}</h2>
                <button onClick={() => setPanelOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Guide Number</label>
                    <input 
                      type="text" 
                      value={form.guideNumber}
                      onChange={e => setForm({...form, guideNumber: e.target.value})}
                      className="aurelia-input"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Name</label>
                    <input 
                      type="text" 
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="aurelia-input"
                      placeholder="e.g. Leonardo Vinci"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Email</label>
                    <input 
                      type="email" 
                      value={form.email}
                      onChange={e => setForm({...form, email: e.target.value})}
                      className="aurelia-input"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Phone</label>
                    <input 
                      type="tel" 
                      value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}
                      className="aurelia-input"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Base Rate €</label>
                    <input 
                      type="number" 
                      value={form.baseRate}
                      onChange={e => setForm({...form, baseRate: Number(e.target.value)})}
                      className="aurelia-input"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Status</label>
                    <select 
                      value={form.status}
                      onChange={e => setForm({...form, status: e.target.value})}
                      className="aurelia-input appearance-none bg-[#1a1a1f]"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Notes</label>
                    <textarea 
                      rows={2}
                      value={form.notes}
                      onChange={e => setForm({...form, notes: e.target.value})}
                      className="aurelia-input resize-none"
                    />
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="flex flex-col mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-gold uppercase tracking-widest">Rates Per Tour Option</label>
                        <button 
                          onClick={() => setForm({...form, optionRates: [...form.optionRates, { product_code: '', option_name: '', rate: 0 }]})}
                          className="text-[10px] bg-gold/10 text-gold px-2 py-1 rounded border border-gold/20 hover:bg-gold/20 transition-all font-bold flex items-center gap-1"
                        >
                          <Plus size={10} /> Add Rate
                        </button>
                      </div>
                      <p className="text-[9px] text-gray-600 leading-tight uppercase tracking-wider">
                        Set specific pay rates per tour option. Leave empty to use base rate.
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {form.optionRates.map((r, i) => (
                        <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-2">
                          <div className="flex gap-2">
                            <input 
                              className="aurelia-input text-xs w-20" 
                              placeholder="Code"
                              value={r.product_code}
                              onChange={e => {
                                const next = [...form.optionRates];
                                next[i].product_code = e.target.value.toUpperCase();
                                setForm({...form, optionRates: next});
                              }}
                            />
                            <input 
                              type="number"
                              className="aurelia-input text-xs w-24 text-gold font-bold" 
                              placeholder="Rate €"
                              value={r.rate}
                              onChange={e => {
                                const next = [...form.optionRates];
                                next[i].rate = Number(e.target.value);
                                setForm({...form, optionRates: next});
                              }}
                            />
                            <button 
                              onClick={() => setForm({...form, optionRates: form.optionRates.filter((_, idx) => idx !== i)})}
                              className="ml-auto text-gray-600 hover:text-red-400 p-1"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <input 
                            list="existing-options-datalist"
                            className="aurelia-input text-[11px] py-1.5" 
                            placeholder="Option Name (e.g. Interior only)"
                            value={r.option_name}
                            onChange={e => {
                              const next = [...form.optionRates];
                              next[i].option_name = e.target.value;
                              setForm({...form, optionRates: next});
                            }}
                          />
                        </div>
                      ))}
                      
                      <datalist id="existing-options-datalist">
                        {existingOptions.map(opt => <option key={opt} value={opt} />)}
                      </datalist>

                      {form.optionRates.length === 0 && (
                        <p className="text-[10px] text-gray-600 italic text-center py-2">No option-specific rates set.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/5 bg-white/[0.02] flex items-center gap-3">
                <button 
                  onClick={() => setPanelOpen(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-white/10 font-bold hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  className="flex-[2] aurelia-gold-btn px-4 py-3 font-bold flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} /> Save
                </button>
              </div>
            </div>
          </>
        )}
    </div>
  );
}
