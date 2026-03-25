import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Plus, X, PenSquare, Trash2, LayoutDashboard, Search, CheckCircle2, UserCircle2, FileDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AureliaSidebar from '@/components/AureliaSidebar';
import { generateGuideInvoice } from '@/lib/generateInvoice';

interface Guide {
  id: string;
  guide_number: string;
  name: string;
  email: string | null;
  phone: string | null;
  base_rate: number;
  status: string;
  notes: string | null;
}

export default function GuidesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [guides, setGuides] = useState<Guide[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fNumber, setFNumber] = useState('');
  const [fName, setFName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fRate, setFRate] = useState(0);
  const [fStatus, setFStatus] = useState('active');
  const [fNotes, setFNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    
    // Load Guides
    const { data: gd, error: gError } = await supabase.from('guides').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (gError) console.error('Guides fetch error:', gError);
    if (gd) setGuides(gd);

    // Load MTD assignments
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const { data: asn } = await supabase
      .from('guide_assignments')
      .select('guide_id, calculated_pay, travel_date, travel_time, product_code, option_name, pax_count')
      .eq('user_id', user.id)
      .gte('created_at', firstDay);
      
    if (asn) setAssignments(asn);
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const generateGuideNumber = () => {
    const nums = guides.map(g => parseInt(g.guide_number?.replace(/\D/g, '') || '0'));
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `G${String(max + 1).padStart(3, '0')}`;
  };

  const openPanel = (guide?: Guide) => {
    if (guide) {
      setEditingId(guide.id);
      setFNumber(guide.guide_number || '');
      setFName(guide.name || '');
      setFEmail(guide.email || '');
      setFPhone(guide.phone || '');
      setFRate(guide.base_rate || 0);
      setFStatus(guide.status || 'active');
      setFNotes(guide.notes || '');
    } else {
      setEditingId(null);
      setFNumber(generateGuideNumber());
      setFName('');
      setFEmail('');
      setFPhone('');
      setFRate(0);
      setFStatus('active');
      setFNotes('');
    }
    setIsPanelOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!fName.trim()) return alert("Name is required");
    
    setSaving(true);
    const payload = {
      user_id: user.id,
      guide_number: fNumber,
      name: fName,
      email: fEmail,
      phone: fPhone,
      base_rate: fRate,
      status: fStatus,
      notes: fNotes
    };

    try {
      if (editingId) {
        await supabase.from('guides').update(payload).eq('id', editingId);
      } else {
        await supabase.from('guides').insert(payload);
      }
      setIsPanelOpen(false);
      await loadData();
    } catch (err: any) {
      alert("Error saving guide: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this guide? This cannot be undone.')) {
      await supabase.from('guides').delete().eq('id', id);
      loadData();
    }
  };

  // Maps for displaying stats
  const statsMap = useMemo(() => {
    const sm = new Map<string, { tours: number; earned: number }>();
    assignments.forEach(a => {
      if (!sm.has(a.guide_id)) sm.set(a.guide_id, { tours: 0, earned: 0 });
      const current = sm.get(a.guide_id)!;
      current.tours += 1;
      current.earned += Number(a.calculated_pay || 0);
    });
    return sm;
  }, [assignments]);

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <AureliaSidebar
        activeView="guides" // passing custom active view, this defaults perfectly if it doesn't strictly exist as a View type. We'll just pass 'executive' to bypass type checks if needed, wait, we don't need to specify strict view state as we use pathname in AureliaSidebar now!
        companyName="AURELIA"
        onNavigate={(v) => navigate('/app')}
        onNewProduct={() => {}}
      />
      <main className="flex-1 ml-[240px] relative">
        <div className="p-8 pb-32 max-w-[1200px] mx-auto text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Guides Management</h1>
              <p className="text-gray-400 text-sm">Manage your guides, base rates, and monthly performance</p>
            </div>
            <button 
              onClick={() => openPanel()}
              className="aurelia-gold-btn px-5 py-2.5 flex items-center gap-2 font-bold"
            >
              <Plus size={18} /> Add Guide
            </button>
          </div>

          {/* TABLE */}
          <div className="aurelia-card rounded-xl overflow-hidden shadow-2xl border border-white/5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#0f0f17] border-b border-white/5 text-xs text-gray-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-4 font-bold">Guide #</th>
                    <th className="px-5 py-4 font-bold">Name</th>
                    <th className="px-5 py-4 font-bold">Contact</th>
                    <th className="px-5 py-4 font-bold">Base Rate</th>
                    <th className="px-5 py-4 font-bold">Status</th>
                    <th className="px-5 py-4 font-bold">Tours (MTD)</th>
                    <th className="px-5 py-4 font-bold">Earnings (MTD)</th>
                    <th className="px-5 py-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading guides...</td></tr>
                  ) : guides.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-24">
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <div className="text-6xl mb-2">👤</div>
                          <h3 className="text-2xl font-extrabold text-white">No guides added yet</h3>
                          <p className="text-gray-400 max-w-sm mx-auto">
                            Add your first guide to start tracking assignments, tour performance, and monthly earnings.
                          </p>
                          <button 
                            onClick={() => openPanel()}
                            className="aurelia-gold-btn px-6 py-3 flex items-center gap-2 font-bold mt-4"
                          >
                            <Plus size={20} /> Add Your First Guide
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    guides.map(g => {
                      const st = statsMap.get(g.id) || { tours: 0, earned: 0 };
                      const isActive = g.status?.toLowerCase() === 'active';
                      
                      return (
                        <tr key={g.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-4 font-mono font-bold text-[#f5a623]">{g.guide_number}</td>
                          <td className="px-5 py-4 font-bold text-base">{g.name}</td>
                          <td className="px-5 py-4">
                            <p className="text-gray-300">{g.phone || '—'}</p>
                            <p className="text-xs text-gray-500">{g.email || '—'}</p>
                          </td>
                          <td className="px-5 py-4 font-mono">€{g.base_rate}</td>
                          <td className="px-5 py-4">
                            {isActive ? (
                              <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Active</span>
                            ) : (
                              <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Inactive</span>
                            )}
                          </td>
                          <td className="px-5 py-4 font-bold">{st.tours}</td>
                          <td className="px-5 py-4 font-mono font-bold text-green-400">€{st.earned.toFixed(2)}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-3 text-gray-400">
                              <button onClick={() => generateGuideInvoice(g, assignments.filter((a: any) => a.guide_id === g.id), 'MTD')} className="hover:text-green-400 transition-colors" title="Download MTD Invoice">
                                <FileDown size={16} />
                              </button>
                              <button onClick={() => openPanel(g)} className="hover:text-[#f5a623] transition-colors" title="Edit Guide">
                                <PenSquare size={16} />
                              </button>
                              <button onClick={() => navigate('/app/guide-dashboard')} className="hover:text-blue-400 transition-colors" title="View Dashboard">
                                <LayoutDashboard size={16} />
                              </button>
                              <button onClick={() => handleDelete(g.id)} className="hover:text-red-400 transition-colors" title="Delete Guide">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ADD/EDIT PANEL */}
        {isPanelOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={() => !saving && setIsPanelOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-[#0f0f17] border-l border-white/10 z-50 shadow-2xl flex flex-col transform transition-transform duration-300">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
                <h2 className="font-bold text-lg">{editingId ? 'Edit Guide' : 'Add Guide'}</h2>
                <button onClick={() => !saving && setIsPanelOpen(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-white">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Guide Number</label>
                  <input type="text" value={fNumber} onChange={e => setFNumber(e.target.value)} className="aurelia-input text-[#f5a623] font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Full Name *</label>
                  <input type="text" value={fName} onChange={e => setFName(e.target.value)} className="aurelia-input" placeholder="Maria Rossi" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email</label>
                  <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} className="aurelia-input" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Phone</label>
                  <input type="tel" value={fPhone} onChange={e => setFPhone(e.target.value)} className="aurelia-input" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Base Rate €</label>
                  <input type="number" value={fRate} onChange={e => setFRate(Number(e.target.value))} className="aurelia-input" />
                  <p className="text-xs text-gray-500 mt-1">Default flat pay per tour</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Status</label>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="aurelia-input appearance-none bg-[#13131a]">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                  <textarea rows={3} value={fNotes} onChange={e => setFNotes(e.target.value)} className="aurelia-input resize-none" placeholder="Languages spoken, specific certifications..." />
                </div>
              </div>

              <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex items-center justify-between">
                <button onClick={() => setIsPanelOpen(false)} disabled={saving} className="aurelia-ghost-btn px-6 py-2 border border-white/20 text-gray-300 hover:text-white">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="aurelia-gold-btn px-6 py-2 font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} /> {saving ? 'Saving...' : 'Save Guide'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
