import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AureliaSidebar from '@/components/AureliaSidebar';
import { Settings, Plus, X, Box, CopyPlus, LineChart, ExternalLink, Activity, Info, AlertTriangle, Map as MapIcon, CheckCircle2 } from 'lucide-react';


const OTAS = [
  "Viator", "GetYourGuide", "Airbnb Experiences", "Headout", 
  "Klook", "KKday", "Civitatis", "Trip.com", 
  "TripAdvisor Experiences", "Musement"
];

const TOP_8 = OTAS.slice(0, 8);

interface OTA_Listing {
  id: string;
  platform: string;
  status: 'active' | 'paused' | 'pending';
  listing_url: string;
  date_listed: string;
  notes: string;
}

interface MarketplaceListing {
  id: string;
  product_code: string;
  product_name: string;
  option_name: string;
  linked_simulator_option_id: string | null;
  ota_listings: OTA_Listing[];
  notes: string;
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<MarketplaceListing[]>([]);
  const [simulatorProducts, setSimulatorProducts] = useState<any[]>([]);
  
  // Panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fCode, setFCode] = useState('');
  const [fName, setFName] = useState('');
  const [fOption, setFOption] = useState('');
  const [fSimId, setFSimId] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fListings, setFListings] = useState<OTA_Listing[]>([]);

  useEffect(() => {
    // Load Items directly from local storage 
    const cached = localStorage.getItem('aurelia_marketplace');
    if (cached) {
      try { setItems(JSON.parse(cached)); } catch(e){}
    }
    
    // Load Simulator data for dropdown
    const sim = localStorage.getItem('aurelia_products');
    if (sim) {
      try { setSimulatorProducts(JSON.parse(sim)); } catch(e){}
    }
  }, []);

  const saveItems = (newItems: MarketplaceListing[]) => {
    setItems(newItems);
    localStorage.setItem('aurelia_marketplace', JSON.stringify(newItems));
  };

  const openPanel = (existingItem?: MarketplaceListing, autoAddPlatform?: string) => {
    if (existingItem) {
      setEditingId(existingItem.id);
      setFCode(existingItem.product_code);
      setFName(existingItem.product_name);
      setFOption(existingItem.option_name);
      setFSimId(existingItem.linked_simulator_option_id || '');
      setFNotes(existingItem.notes);
      
      let lst = [...existingItem.ota_listings];
      if (autoAddPlatform) {
        if (!lst.find(x => x.platform === autoAddPlatform)) {
          lst.push({ id: crypto.randomUUID(), platform: autoAddPlatform, status: 'pending', listing_url: '', date_listed: new Date().toISOString().split('T')[0], notes: '' });
        }
      }
      setFListings(lst);
    } else {
      setEditingId(null);
      setFCode('');
      setFName('');
      setFOption('');
      setFSimId('');
      setFNotes('');
      setFListings(autoAddPlatform ? [{
        id: crypto.randomUUID(), platform: autoAddPlatform, status: 'pending', listing_url: '', date_listed: new Date().toISOString().split('T')[0], notes: ''
      }] : []);
    }
    setIsPanelOpen(true);
  };

  const handleSaveListing = () => {
    if (!fCode.trim() || !fName.trim()) return alert('Product Code and Name are required.');
    
    // Clean up empty listing structures if users just inserted blank
    const cleanListings = fListings.filter(x => x.platform.trim() !== '');

    if (editingId) {
      saveItems(items.map(x => x.id === editingId ? {
        ...x, product_code: fCode, product_name: fName, option_name: fOption, linked_simulator_option_id: fSimId, ota_listings: cleanListings, notes: fNotes
      } : x));
    } else {
      saveItems([{
        id: crypto.randomUUID(), product_code: fCode, product_name: fName, option_name: fOption, linked_simulator_option_id: fSimId, ota_listings: cleanListings, notes: fNotes
      }, ...items]);
    }
    setIsPanelOpen(false);
  };

  const handleCreatePlatform = () => {
    setFListings([...fListings, { id: crypto.randomUUID(), platform: OTAS[0], status: 'active', listing_url: '', date_listed: new Date().toISOString().split('T')[0], notes: '' }]);
  };

  const removePlatform = (id: string) => {
    setFListings(fListings.filter(x => x.id !== id));
  };

  // Stats calculate
  const totalProds = items.length;
  const activeListings = items.reduce((sum, item) => sum + item.ota_listings.filter(x => x.status === 'active').length, 0);
  const platformsUsed = new Set(items.flatMap(x => x.ota_listings.map(l => l.platform))).size;
  const totalGaps = items.length * 8 - items.reduce((sum, item) => sum + item.ota_listings.filter(x => TOP_8.includes(x.platform)).length, 0);

  // Opportunities
  const opps: string[] = [];
  items.forEach(item => {
    const plats = item.ota_listings.map(x => x.platform);
    if (plats.includes('Viator') && !plats.includes('GetYourGuide')) {
      opps.push(`"${item.product_name}" is strictly on Viator but completely missing on GetYourGuide.`);
    }
    if (plats.length === 1) {
      opps.push(`"${item.product_name}" is overly dependent on just 1 platform (${plats[0]}).`);
    }
    if (plats.includes('GetYourGuide') && !plats.includes('Viator')) {
      opps.push(`"${item.product_name}" is strictly on GetYourGuide but missing on Viator.`);
    }
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <AureliaSidebar activeView={"marketplace" as any} companyName="AURELIA" onNavigate={(v) => navigate('/app')} onNewProduct={() => {}} />
      <main className="flex-1 ml-[240px] relative">
        <div className="p-8 pb-32 max-w-7xl mx-auto space-y-8 animate-fade-in">
          
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/50">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Marketplace Coverage</h1>
              <p className="text-muted-foreground text-sm font-medium">Manage and optimize your manual OTA listing matrix directly</p>
            </div>
            <button 
              onClick={() => openPanel()}
              className="aurelia-gold-btn px-5 py-2.5 flex items-center gap-2 font-bold shadow-lg"
            >
              <Plus size={18} /> Add Product
            </button>
          </div>

          {/* STATS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="aurelia-card p-5 border-l-[3px] border-l-[#f5a623]">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <Box size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Products</span>
              </div>
              <p className="text-3xl font-extrabold text-white">{totalProds}</p>
            </div>
            <div className="aurelia-card p-5 border-l-[3px] border-l-green-500">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <Activity size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Active Listings</span>
              </div>
              <p className="text-3xl font-extrabold text-green-400">{activeListings}</p>
            </div>
            <div className="aurelia-card p-5 border-l-[3px] border-l-blue-500">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <LineChart size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Platforms Used</span>
              </div>
              <p className="text-3xl font-extrabold text-blue-400">{platformsUsed} / {OTAS.length}</p>
            </div>
            <div className="aurelia-card p-5 border-l-[3px] border-l-red-500">
              <div className="flex items-center gap-2 text-gray-400 mb-2">
                <AlertTriangle size={14} /> <span className="text-[10px] font-bold uppercase tracking-widest">Gaps Found</span>
              </div>
              <p className="text-3xl font-extrabold text-red-400">{totalGaps}</p>
            </div>
          </div>

          {/* OPPORTUNITIES */}
          {opps.length > 0 && (
            <div className="aurelia-card p-6 border border-[#f5a623]/20 bg-[#f5a623]/[0.02]">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-[#f5a623]"><LineChart size={18} /> Opportunity Intelligence</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {opps.slice(0, 4).map((opp, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-black/20 p-4 rounded-lg border border-white/5">
                    <Info size={16} className="text-green-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-300 leading-relaxed font-medium">{opp}</p>
                      <button className="text-xs font-bold text-[#f5a623] hover:text-white mt-2 transition-colors flex items-center gap-1">Fix Gap <ExternalLink size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MATRIX COMPONENT */}
          <div className="aurelia-card overflow-x-auto rounded-xl shadow-2xl border border-white/5 bg-[#0f0f17]">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-[#0a0a0f] border-b border-white/10 text-xs text-gray-400 uppercase tracking-widest sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-4 font-bold sticky left-0 bg-[#0a0a0f] z-20 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Product Mapping</th>
                  <th className="px-5 py-4 font-bold">Simulator</th>
                  {TOP_8.map(ota => (
                    <th key={ota} className="px-5 py-4 font-bold text-center border-l border-white/5">{ota}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-gray-400">
                      <Box size={48} className="mx-auto text-white/10 mb-4" />
                      <p className="text-lg font-bold text-white mb-2">No marketplace listings configured</p>
                      <p className="text-gray-500 text-sm">Create specific product matrices here explicitly verifying platform coverage maps.</p>
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4 sticky left-0 z-10" style={{ backgroundColor: 'hsl(var(--theme-card))' }}>
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-base truncate max-w-[200px]">{item.product_name}</span>
                          <span className="text-[#f5a623] font-mono text-xs">{item.product_code} &middot; {item.option_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono">
                        {item.linked_simulator_option_id ? (
                          <button onClick={() => navigate('/app')} className="text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded border border-blue-500/20 text-xs font-bold flex items-center gap-2 hover:bg-blue-500/20 transition-colors">
                            <ExternalLink size={12}/> Simulator
                          </button>
                        ) : <span className="text-gray-600">—</span>}
                      </td>

                      {TOP_8.map(ota => {
                        const rec = item.ota_listings.find(x => x.platform === ota);
                        return (
                          <td key={ota} className="px-4 py-4 text-center border-l border-white/5 align-middle">
                            {rec ? (
                              <button 
                                onClick={() => openPanel(item)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto transition-transform hover:scale-110 shadow-lg ${
                                  rec.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 
                                  rec.status === 'paused' ? 'bg-[#f5a623]/20 text-[#f5a623] border border-[#f5a623]/40' : 
                                  'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                                }`}
                                title={rec.status.toUpperCase()}
                              >
                                {rec.status === 'active' ? '✅' : rec.status === 'paused' ? '⏸️' : '🕐'}
                              </button>
                            ) : (
                              <button onClick={() => openPanel(item, ota)} className="w-8 h-8 rounded-full border border-dashed border-white/20 text-gray-600 mx-auto hover:text-white hover:border-white/50 hover:bg-white/5 transition-all text-xs flex items-center justify-center font-bold">
                                —
                              </button>
                            )}
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

        {/* --- ADD/EDIT PANEL --- */}
        {isPanelOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={() => setIsPanelOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-[#0f0f17] border-l border-white/10 z-50 shadow-2xl flex flex-col transform transition-transform duration-300">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
                <h2 className="font-bold text-lg">{editingId ? 'Edit Product Coverage' : 'Add Product'}</h2>
                <button onClick={() => setIsPanelOpen(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-8 text-white">
                
                {/* Core Details */}
                <div className="space-y-4">
                  <h3 className="font-bold text-[#f5a623] border-b border-white/10 pb-2 flex items-center gap-2 uppercase tracking-widest text-xs"><Box size={14}/> Base Information</h3>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Product Name *</label>
                    <input type="text" value={fName} onChange={e => setFName(e.target.value)} className="aurelia-input text-lg font-bold" placeholder="Colosseum Underground Tour" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Product Code *</label>
                      <input type="text" value={fCode} onChange={e => setFCode(e.target.value)} className="aurelia-input font-mono text-[#f5a623]" placeholder="COL-UND" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Option Name</label>
                      <input type="text" value={fOption} onChange={e => setFOption(e.target.value)} className="aurelia-input" placeholder="English 10AM" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Simulator Map (Optional Binding)</label>
                    <select value={fSimId} onChange={e => setFSimId(e.target.value)} className="aurelia-input bg-[#13131a]">
                      <option value="">-- No Simulator Link --</option>
                      {simulatorProducts.map((p: any) => (
                        <optgroup key={p.id} label={p.name}>
                          {p.options?.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Platform Listings */}
                <div className="space-y-4">
                  <h3 className="font-bold text-[#f5a623] border-b border-white/10 pb-2 flex items-center justify-between uppercase tracking-widest text-xs">
                    <span className="flex items-center gap-2"><MapIcon size={14} /> OTA Configurations</span>
                    <button onClick={handleCreatePlatform} className="text-white bg-white/5 hover:bg-white/10 px-3 py-1 rounded transition-colors flex items-center gap-1"><Plus size={12}/> Add</button>
                  </h3>
                  
                  {fListings.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-6 border border-dashed border-white/10 rounded-lg">No platform listings added securely.</p>
                  ) : (
                    <div className="space-y-4">
                      {fListings.map((lst, idx) => (
                        <div key={lst.id} className="bg-[#13131a] p-4 rounded-lg border border-white/10 space-y-4 relative group">
                          <button onClick={() => removePlatform(lst.id)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                            <X size={12} />
                          </button>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <select value={lst.platform} onChange={e => { const v = [...fListings]; v[idx].platform = e.target.value; setFListings(v); }} className="aurelia-input font-bold">
                                {OTAS.map(o => <option key={o} value={o}>{o}</option>)}
                                <option value="Custom">Custom Component</option>
                              </select>
                            </div>
                            <div>
                              <select value={lst.status} onChange={e => { const v = [...fListings]; v[idx].status = e.target.value as any; setFListings(v); }} className="aurelia-input bg-black/20">
                                <option value="active">✅ Active</option>
                                <option value="paused">⏸️ Paused</option>
                                <option value="pending">🕐 Pending</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <input type="text" value={lst.listing_url} onChange={e => { const v = [...fListings]; v[idx].listing_url = e.target.value; setFListings(v); }} className="aurelia-input text-sm text-blue-400 font-mono bg-black/20" placeholder="https://viator.com/tours/..." />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Internal Notes</label>
                  <textarea rows={3} value={fNotes} onChange={e => setFNotes(e.target.value)} className="aurelia-input resize-none bg-[#13131a]" placeholder="Contract details, margin specs..." />
                </div>
              </div>

              <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex items-center justify-between">
                <button onClick={() => setIsPanelOpen(false)} className="aurelia-ghost-btn px-6 py-2 border border-white/20 text-gray-300 hover:text-white">Cancel</button>
                <button onClick={handleSaveListing} className="aurelia-gold-btn px-6 py-2 font-bold flex items-center gap-2"><CheckCircle2 size={16} /> Save Settings</button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
