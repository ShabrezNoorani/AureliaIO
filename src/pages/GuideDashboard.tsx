import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, Euro, BarChart2, Calendar, FileText, X } from 'lucide-react';
import { generateGuideInvoice } from '@/lib/generateInvoice';

export default function GuideDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [guides, setGuides] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [optionRates, setOptionRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'month' | 'mtd' | 'ytd'>('month');
  
  // Invoice Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<any | null>(null);
  const [invoiceDates, setInvoiceDates] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [gRes, aRes, rRes] = await Promise.all([
      supabase.from('guides').select('*').eq('user_id', user.id).order('name'),
      supabase.from('guide_assignments').select('*').eq('user_id', user.id),
      supabase.from('guide_product_rates').select('*').eq('user_id', user.id)
    ]);

    if (gRes.data) setGuides(gRes.data);
    if (aRes.data) setAssignments(aRes.data);
    if (rRes.data) setOptionRates(rRes.data);
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user]);

  const filteredAssignments = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    let start = '';
    let end = todayStr;

    if (dateRange === 'today') {
      start = end = todayStr;
    } else if (dateRange === 'yesterday') {
      const y = new Date(); y.setDate(y.getDate() - 1);
      start = end = y.toISOString().split('T')[0];
    } else if (dateRange === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      start = first.toISOString().split('T')[0];
      end = last.toISOString().split('T')[0];
    } else if (dateRange === 'mtd') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      start = first.toISOString().split('T')[0];
    } else if (dateRange === 'ytd') {
      const first = new Date(now.getFullYear(), 0, 1);
      start = first.toISOString().split('T')[0];
    }

    return assignments.filter(a => {
      if (!a.travel_date) return false;
      return a.travel_date >= start && a.travel_date <= end;
    });
  }, [assignments, dateRange]);

  const guideStats = useMemo(() => {
    return guides.map(g => {
      const myAsns = filteredAssignments.filter(a => a.guide_id === g.id);
      const tours = myAsns.length;
      const earnings = myAsns.reduce((sum, a) => sum + (Number(a.calculated_pay) || 0), 0);
      return { ...g, tours, earnings };
    });
  }, [guides, filteredAssignments]);

  const totalEarnings = guideStats.reduce((sum, g) => sum + g.earnings, 0);
  const totalTours = filteredAssignments.length;

  const handleDownloadInvoice = () => {
    if (!selectedGuide) return;
    const guideAsns = assignments.filter(a => 
      a.guide_id === selectedGuide.id && 
      a.travel_date >= invoiceDates.from && 
      a.travel_date <= invoiceDates.to
    );
    
    if (guideAsns.length === 0) {
      alert("No assignments found for this guide in the selected period.");
      return;
    }

    generateGuideInvoice(
      selectedGuide, 
      guideAsns, 
      profile?.company_name || 'AURELIA Suite',
      invoiceDates
    );
    setShowInvoiceModal(false);
  };

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
      <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Guide Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">Performance tracking and earnings overview</p>
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            {(['today', 'yesterday', 'month', 'mtd', 'ytd'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setDateRange(mode)}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  dateRange === mode ? 'bg-white/10 text-white shadow-xl' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {mode === 'month' ? 'This Month' : mode}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : guides.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
            <div className="text-7xl mb-6">📊</div>
            <h3 className="text-2xl font-extrabold mb-2">No guide data yet</h3>
            <p className="text-gray-400 mb-8 max-w-sm">Add guides first to see performance</p>
            <button 
              onClick={() => navigate('/app/guides')}
              className="aurelia-gold-btn px-8 py-3 font-bold flex items-center gap-2"
            >
              Go to Guides <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="aurelia-card p-6 border-l-[4px] border-l-blue-500">
                <div className="flex items-center gap-3 text-gray-500 mb-2">
                  <Activity size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Total Tours</span>
                </div>
                <div className="text-4xl font-extrabold">{totalTours}</div>
              </div>
              <div className="aurelia-card p-6 border-l-[4px] border-l-gold">
                <div className="flex items-center gap-3 text-gray-500 mb-2">
                  <Euro size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Total Earnings</span>
                </div>
                <div className="text-4xl font-extrabold text-gold">€{totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="aurelia-card p-6 border-l-[4px] border-l-purple-500">
                <div className="flex items-center gap-3 text-gray-500 mb-2">
                  <BarChart2 size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Avg / Tour</span>
                </div>
                <div className="text-4xl font-extrabold text-purple-400">€{totalTours > 0 ? (totalEarnings / totalTours).toFixed(2) : '0.00'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {guideStats.map(g => (
                <div key={g.id} className="aurelia-card p-6 border border-white/5 hover:border-gold/30 transition-all group">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-xl border border-white/10 group-hover:border-gold/50 transition-colors">
                      👤
                    </div>
                    <div>
                      <div className="font-extrabold text-lg text-white group-hover:text-gold transition-colors">{g.name}</div>
                      <div className="text-xs font-mono text-gray-500 uppercase tracking-widest">{g.guide_number}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Tours</div>
                      <div className="text-xl font-bold">{g.tours}</div>
                    </div>
                    <div className="bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Earnings</div>
                      <div className="text-xl font-bold text-gold">€{g.earnings.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <button 
                      onClick={() => { setSelectedGuide(g); setShowDetailsModal(true); }}
                      className="py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 hover:border-gold/30 transition-all flex items-center justify-center gap-2 group/btn"
                    >
                      <Activity size={14} className="text-gray-500 group-hover/btn:text-gold" />
                      Details
                    </button>
                    <button 
                      onClick={() => { setSelectedGuide(g); setShowInvoiceModal(true); }}
                      className="py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 hover:border-gold/30 transition-all flex items-center justify-center gap-2 group/btn"
                    >
                      <FileText size={14} className="text-gray-500 group-hover/btn:text-gold" />
                      Invoice
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DETAILS MODAL */}
        {showDetailsModal && selectedGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-[#0f0f12] border border-white/10 rounded-[32px] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <h2 className="text-2xl font-black">Assignment Details</h2>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">{selectedGuide.name} · {dateRange}</p>
                </div>
                <button onClick={() => setShowDetailsModal(false)} className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-center">Pax</th>
                      <th className="px-4 py-3">Rate Used</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredAssignments.filter(a => a.guide_id === selectedGuide.id).map(a => {
                      const exactMatch = optionRates.find(r => 
                        r.guide_id === a.guide_id && 
                        r.product_code === (a.product_code || a.product_name) && 
                        r.option_name?.toLowerCase() === a.option_name?.toLowerCase()
                      );
                      const productMatch = exactMatch ? null : optionRates.find(r => 
                        r.guide_id === a.guide_id && 
                        r.product_code === (a.product_code || a.product_name) && 
                        (!r.option_name || r.option_name === '')
                      );

                      const source = a.rate_override ? '(manual)' : (exactMatch ? '(option)' : (productMatch ? '(product)' : '(base)'));
                      const sourceColor = a.rate_override ? 'text-gold' : (exactMatch || productMatch ? 'text-blue-400' : 'text-gray-500');

                      return (
                        <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-4 font-mono text-gray-400">{a.travel_date}</td>
                          <td className="px-4 py-4 font-bold">{a.product_code || a.product_name}</td>
                          <td className="px-4 py-4 text-center">{a.pax_count}</td>
                          <td className="px-4 py-4">
                            <span className="font-bold">€{a.calculated_pay}</span>
                            <span className={`ml-1.5 text-[8px] uppercase font-black ${sourceColor}`}>{source}</span>
                          </td>
                          <td className="px-4 py-4 text-right font-black text-green-400">€{a.calculated_pay}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* INVOICE MODAL */}
        {showInvoiceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
            <div className="bg-[#0f0f12] border border-white/10 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <h2 className="text-2xl font-black">Generate Invoice</h2>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">{selectedGuide?.name}</p>
                </div>
                <button 
                  onClick={() => setShowInvoiceModal(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-500 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Start Date</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        value={invoiceDates.from} 
                        onChange={e => setInvoiceDates(prev => ({ ...prev, from: e.target.value }))}
                        className="aurelia-input w-full pl-10"
                      />
                      <Calendar className="absolute left-3 top-3 text-gray-600" size={16} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">End Date</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        value={invoiceDates.to} 
                        onChange={e => setInvoiceDates(prev => ({ ...prev, to: e.target.value }))}
                        className="aurelia-input w-full pl-10"
                      />
                      <Calendar className="absolute left-3 top-3 text-gray-600" size={16} />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowInvoiceModal(false)}
                    className="flex-1 py-4 rounded-2xl font-bold border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDownloadInvoice}
                    className="flex-[2] py-4 bg-gold text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-gold/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <FileText size={18} />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ArrowRight = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
);
