import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Plus, X, AlertTriangle, CheckCircle2, XCircle, Info, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '@/components/Logo';
import AureliaSidebar from '@/components/AureliaSidebar'; // Imported so you can use it if you want, though wait - I am NOT using AppLayout directly, I can render the sidebar manually or just a back button if it's full screen. If the user expects it to be inside the internal app, I should wrap it in the same layout style as other pages, i.e., sidebar + `main className="flex-1 ml-[240px]"`!

interface ManualListing {
  id: string;
  productCode: string;
  productName: string;
  channel: string;
  status: string;
  url: string;
  dateListed: string;
  notes: string;
}

const CHANNELS = ['Viator', 'GYG', 'Airbnb', 'Website', 'Agent', 'Klook', 'Headout'];

function parseProduct(raw: string) {
  if (!raw) return { code: 'Unknown', name: '' };
  const m = raw.match(/^(P\d+)\s*[-:]?\s*(.*)$/i);
  if (m) return { code: m[1].toUpperCase(), name: m[2].trim() };
  return { code: raw, name: '' };
}

export default function MarketplacePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bookings, setBookings] = useState<any[]>([]);
  const [listings, setListings] = useState<ManualListing[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [fCode, setFCode] = useState('');
  const [fName, setFName] = useState('');
  const [fChannel, setFChannel] = useState('Viator');
  const [fStatus, setFStatus] = useState('Active');
  const [fUrl, setFUrl] = useState('');
  const [fDate, setFDate] = useState('');
  const [fNotes, setFNotes] = useState('');

  useEffect(() => {
    const local = localStorage.getItem('aurelia_listings');
    if (local) {
      try { setListings(JSON.parse(local)); } catch (e) {}
    }
    if (!user) return;
    supabase.from('bookings').select('product_name, channel, gross_revenue').eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setBookings(data);
        setLoading(false);
      });
  }, [user]);

  const saveListings = (nl: ManualListing[]) => {
    setListings(nl);
    localStorage.setItem('aurelia_listings', JSON.stringify(nl));
    setIsPanelOpen(false);
  };

  const handleSaveListing = () => {
    if (!fCode) return alert('Product Code is required');
    const newL: ManualListing = {
      id: Date.now().toString(),
      productCode: fCode,
      productName: fName,
      channel: fChannel,
      status: fStatus,
      url: fUrl,
      dateListed: fDate,
      notes: fNotes
    };
    saveListings([...listings, newL]);
  };

  const openPanel = (code = '', name = '', channel = 'Viator') => {
    setFCode(code);
    setFName(name);
    setFChannel(channel);
    setFStatus('Active');
    setFUrl('');
    setFDate('');
    setFNotes('');
    setIsPanelOpen(true);
  };

  // 1. Process Data
  const { products, stats, opportunities } = useMemo(() => {
    // A map of code -> { name, channels: { channel -> { count, revenue } } }
    const pMap = new Map<string, { name: string; channels: Record<string, { count: number; revenue: number }> }>();

    bookings.forEach(b => {
      const { code, name } = parseProduct(b.product_name || 'Unknown');
      const ch = b.channel || 'Other';
      const rev = Number(b.gross_revenue) || 0;

      if (!pMap.has(code)) pMap.set(code, { name, channels: {} });
      const p = pMap.get(code)!;
      if (!p.channels[ch]) p.channels[ch] = { count: 0, revenue: 0 };
      p.channels[ch].count++;
      p.channels[ch].revenue += rev;
      // Use the longest name found
      if (name.length > p.name.length) p.name = name;
    });

    // Add manual listings if product not in bookings
    listings.forEach(l => {
      if (!pMap.has(l.productCode)) {
        pMap.set(l.productCode, { name: l.productName, channels: {} });
      }
    });

    const outProducts = Array.from(pMap.entries()).map(([code, data]) => ({ code, ...data }));
    outProducts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

    // Calculate opportunities & globals
    const opps: any[] = [];
    let totActiveListings = 0;
    const activeOTAs = new Set<string>();

    outProducts.forEach(p => {
      const chCount = Object.keys(p.channels).filter(c => p.channels[c].count > 0).length;
      
      let vRev = 0;
      let hasV = false;
      let hasGYG = false;

      CHANNELS.forEach(c => {
        const count = p.channels[c]?.count || 0;
        const manual = listings.find(l => l.productCode === p.code && l.channel === c);
        
        if (count > 0 || manual) {
          totActiveListings++;
          activeOTAs.add(c);
        }

        if (c === 'Viator') {
          hasV = count > 0 || !!manual;
          vRev = p.channels[c]?.revenue || 0;
        }
        if (c === 'GYG') hasGYG = count > 0 || !!manual;
      });

      // Rules
      if (chCount === 0 && !listings.find(l => l.productCode === p.code)) {
        opps.push({
          type: 'none',
          product: p.code,
          name: p.name,
          text: `${p.code} has no OTA presence — consider listing on Viator or GYG`
        });
      } else if (hasV && !hasGYG) {
        opps.push({
          type: 'viator_not_gyg',
          product: p.code,
          name: p.name,
          text: `${p.code} is on Viator but not GYG — potential €${Math.round((vRev / 12) * 0.3)}/month opportunity`,
          channel: 'GYG'
        });
      } else if (chCount === 1) {
        const singleCh = Object.keys(p.channels).find(c => p.channels[c].count > 0);
        opps.push({
          type: 'single',
          product: p.code,
          name: p.name,
          text: `${p.code} is only on ${singleCh} — diversifying could increase revenue`
        });
      }
    });

    return {
      products: outProducts,
      stats: {
        totalProducts: outProducts.length,
        activeListings: totActiveListings,
        otasCovered: activeOTAs.size,
        oppsCount: opps.length
      },
      opportunities: opps
    };
  }, [bookings, listings]);

  // Sidebar Layout explicitly constructed so it matches the internal app style
  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <AureliaSidebar
        activeView="analytics" // We just set it to analytics since marketplace is standalone
        companyName="AURELIA"
        onNavigate={(v) => navigate('/app')}
        onNewProduct={() => {}}
      />
      <main className="flex-1 ml-[240px] relative">
        <div className="p-8 pb-32 max-w-[1200px] mx-auto text-white">
          {/* HEADER */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">Marketplace Coverage</h1>
              <p className="text-gray-400 text-sm mt-1">See where your products are listed and find revenue opportunities</p>
            </div>
            <button 
              onClick={() => openPanel()}
              className="aurelia-gold-btn px-5 py-2.5 flex items-center gap-2 font-bold"
            >
              <Plus size={18} /> Add Product Listing
            </button>
          </div>

          {/* STATS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Products</p>
              <p className="text-3xl font-extrabold">{stats.totalProducts}</p>
            </div>
            <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Active Listings</p>
              <p className="text-3xl font-extrabold">{stats.activeListings}</p>
            </div>
            <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">OTAs Covered</p>
              <p className="text-3xl font-extrabold">{stats.otasCovered} <span className="text-gray-600 text-lg">/ 7</span></p>
            </div>
            <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Opportunities Found</p>
              <p className="text-3xl font-extrabold text-[#f5a623]">{stats.oppsCount}</p>
            </div>
          </div>

          {/* COVERAGE MATRIX TABLE */}
          <div className="aurelia-card rounded-xl overflow-hidden mb-12 shadow-2xl">
            <div className="overflow-x-auto p-1">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] text-gray-400 uppercase bg-[#0f0f17] border-b border-white/5">
                  <tr>
                    <th className="px-5 py-4 font-bold tracking-wider">Product</th>
                    {CHANNELS.map(c => (
                      <th key={c} className="px-5 py-4 font-bold tracking-wider text-center">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-500">Loading your marketplace matrix...</td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-500">No bookings available to derive matrix.</td></tr>
                  ) : (
                    products.map(p => (
                      <tr key={p.code} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-4 w-64">
                          <p className="font-extrabold text-[#f5a623] text-base">{p.code}</p>
                          {p.name && <p className="text-xs text-gray-400 mt-0.5 truncate pr-2">{p.name}</p>}
                        </td>
                        {CHANNELS.map(c => {
                          const count = p.channels[c]?.count || 0;
                          const manual = listings.find(l => l.productCode === p.code && l.channel === c);
                          
                          let icon = <span className="text-gray-700 font-bold" title="Not Listed">❌</span>;
                          if (count > 0) {
                            icon = <div className="group relative inline-flex justify-center">
                              <span className="text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.4)] cursor-help">✅</span>
                              <div className="pointer-events-none absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-white/10 px-2 py-1 rounded text-xs whitespace-nowrap z-10">
                                {count} Bookings Found
                              </div>
                            </div>;
                          } else if (manual) {
                            icon = <div className="group relative inline-flex justify-center">
                              <span className="text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.4)] cursor-help">⚠️</span>
                              <div className="pointer-events-none absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-white/10 px-2 py-1 rounded text-xs whitespace-nowrap z-10">
                                Listed Manually ({manual.status})
                              </div>
                            </div>;
                          }

                          return (
                            <td key={c} className="px-5 py-4 text-center align-middle">
                              {icon}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* OPPORTUNITY ALERTS */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              Revenue Opportunities <span className="bg-[#f5a623]/20 text-[#f5a623] px-2 py-0.5 rounded textxs font-bold">{opportunities.length}</span>
            </h2>
            
            <div className="space-y-4">
              {opportunities.length === 0 && !loading && (
                <p className="text-gray-500 italic">No clear opportunities found. Your coverage is extensive!</p>
              )}
              {opportunities.map((opp, i) => (
                <div key={i} className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-[#f5a623]/10 rounded-lg text-[#f5a623]">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <p className="text-[15px] font-medium leading-relaxed">{opp.text}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => openPanel(opp.product, opp.name, opp.channel || 'Viator')} 
                    className="shrink-0 aurelia-ghost-btn border border-white/10 hover:border-[#f5a623]/40 px-4 py-2 text-sm font-bold flex items-center gap-2"
                  >
                    <Plus size={16} /> Add Listing
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MANUAL LISTING PANEL (slide-in) */}
        {isPanelOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={() => setIsPanelOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-[#0f0f17] border-l border-white/10 z-50 shadow-2xl flex flex-col transform transition-transform duration-300">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
                <h2 className="font-bold text-lg">Add/Edit Listing</h2>
                <button onClick={() => setIsPanelOpen(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-white">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Product Code</label>
                  <input type="text" value={fCode} onChange={e => setFCode(e.target.value)} className="aurelia-input text-base font-bold" placeholder="P3" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Product Name</label>
                  <input type="text" value={fName} onChange={e => setFName(e.target.value)} className="aurelia-input" placeholder="Outdoor Walking Tour" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">OTA / Channel</label>
                  <select value={fChannel} onChange={e => setFChannel(e.target.value)} className="aurelia-input appearance-none bg-[#13131a]">
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Listing URL (Optional)</label>
                  <input type="url" value={fUrl} onChange={e => setFUrl(e.target.value)} className="aurelia-input text-sm text-[#f5a623]" placeholder="https://viator.com/..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Listing Status</label>
                  <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="aurelia-input appearance-none bg-[#13131a]">
                    <option>Active</option>
                    <option>Paused</option>
                    <option>Pending Approval</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Date Listed</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className="aurelia-input text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                  <textarea rows={3} value={fNotes} onChange={e => setFNotes(e.target.value)} className="aurelia-input resize-none" placeholder="Add private notes about this listing..." />
                </div>
              </div>

              <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex items-center justify-between">
                <button onClick={() => setIsPanelOpen(false)} className="aurelia-ghost-btn px-6 py-2 border border-white/20 text-gray-300 hover:text-white">
                  Cancel
                </button>
                <button onClick={handleSaveListing} className="aurelia-gold-btn px-6 py-2 font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} /> Save
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
