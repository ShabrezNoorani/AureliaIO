import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Plus, X, Globe, ExternalLink, AlertTriangle, Map as MapIcon, CheckCircle2 } from 'lucide-react';

const OTAS = [
  "Viator", "GetYourGuide", "Airbnb", "Headout", 
  "Klook", "KKday", "Civitatis", "Trip.com", 
  "Expedia", "Musement"
];

interface OTA_Listing {
  platform: string;
  status: 'active' | 'paused' | 'missing';
  url: string;
}

interface Product {
  id: string;
  name: string;
  code: string;
  option: string;
  listings: Record<string, OTA_Listing>;
}

export default function MarketplacePage() {
  const { user } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [form, setForm] = useState({
    name: '',
    code: '',
    option: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('aurelia_marketplace');
    if (saved) {
      try {
        setProducts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse marketplace data", e);
        setProducts([]);
      }
    }
    setLoading(false);
  }, []);

  const saveToLocal = (data: Product[]) => {
    setProducts(data);
    localStorage.setItem('aurelia_marketplace', JSON.stringify(data));
  };

  const openPanel = (prod: Product | null = null) => {
    if (prod) {
      setEditingProduct(prod);
      setForm({ name: prod.name, code: prod.code, option: prod.option });
    } else {
      setEditingProduct(null);
      setForm({ name: '', code: '', option: '' });
    }
    setPanelOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return alert("Name is required");

    if (editingProduct) {
      const updated = products.map(p => p.id === editingProduct.id ? { ...p, ...form } : p);
      saveToLocal(updated);
    } else {
      const newProd: Product = {
        id: crypto.randomUUID(),
        ...form,
        listings: {}
      };
      saveToLocal([newProd, ...products]);
    }
    setPanelOpen(false);
  };

  const toggleListing = (productId: string, platform: string) => {
    const updated = products.map(p => {
      if (p.id !== productId) return p;
      const current = p.listings[platform];
      const nextStatus: OTA_Listing['status'] = !current || current.status === 'missing' ? 'active' : current.status === 'active' ? 'paused' : 'missing';
      
      return {
        ...p,
        listings: {
          ...p.listings,
          [platform]: { platform, status: nextStatus, url: current?.url || '' }
        }
      };
    });
    saveToLocal(updated);
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete product?")) return;
    saveToLocal(products.filter(p => p.id !== id));
  };

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
          
          <div className="flex items-center justify-between border-b border-border pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Marketplace Coverage</h1>
              <p className="text-muted-foreground text-sm mt-1">Cross-platform distribution matrix</p>
            </div>
            <button 
              onClick={() => openPanel()}
              className="aurelia-gold-btn px-5 py-2.5 flex items-center gap-2 font-bold shadow-2xl shadow-gold/10"
            >
              <Plus size={18} /> Add Product
            </button>
          </div>

          {!loading && products.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-border rounded-2xl bg-muted">
              <div className="text-7xl mb-6">🗺️</div>
              <h3 className="text-2xl font-extrabold mb-2">No products listed yet</h3>
              <p className="text-muted-foreground mb-8 max-w-sm">
                Track which of your products are listed on which OTAs
              </p>
              <button 
                onClick={() => openPanel()}
                className="aurelia-gold-btn px-8 py-3 font-bold flex items-center gap-2"
              >
                <Plus size={20} /> Add First Product
              </button>
            </div>
          ) : (
            <div className="aurelia-card border border-border overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted text-[10px] text-muted-foreground uppercase tracking-widest font-extrabold">
                  <tr>
                    <th className="px-6 py-5 sticky left-0 bg-card z-10 border-r border-border">Product Mapping</th>
                    {OTAS.map(ota => (
                      <th key={ota} className="px-4 py-5 text-center min-w-[100px] border-r border-border">{ota}</th>
                    ))}
                    <th className="px-6 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors group">
                      <td className="px-6 py-4 sticky left-0 bg-card z-10 border-r border-border">
                        <div className="font-bold text-foreground text-base">{p.name}</div>
                        <div className="text-[10px] font-mono text-gold flex items-center gap-2 mt-0.5">
                          {p.code} <span className="text-muted-foreground">|</span> {p.option}
                        </div>
                      </td>
                      {OTAS.map(ota => {
                        const status = p.listings[ota]?.status || 'missing';
                        return (
                          <td key={ota} className="px-4 py-4 text-center border-r border-border">
                            <button 
                              onClick={() => toggleListing(p.id, ota)}
                              className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-xs transition-all ${
                                status === 'active' ? 'bg-green-600/20 text-green-700 border border-green-600/30' :
                                status === 'paused' ? 'bg-gold/20 text-gold border border-gold/30' :
                                'bg-muted text-muted-foreground border border-border'
                              }`}
                            >
                              {status === 'active' ? '✓' : status === 'paused' ? '||' : '—'}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openPanel(p)} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                            <Globe size={16} />
                          </button>
                          <button onClick={() => handleDelete(p.id)} className="p-2 text-muted-foreground hover:text-red-700 transition-colors">
                            <X size={16} />
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

        {/* ADD PANEL */}
        {panelOpen && (
          <>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]" onClick={() => setPanelOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-[450px] bg-card border-l border-border z-[101] shadow-2xl flex flex-col">
              <div className="p-8 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Marketplace Distribution</p>
                </div>
                <button onClick={() => setPanelOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={28} />
                </button>
              </div>

              <div className="p-8 flex-1 overflow-y-auto space-y-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Product Name</label>
                    <input 
                      type="text" 
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="aurelia-input text-lg font-bold"
                      placeholder="e.g. Rome in a Day"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Internal Code</label>
                      <input 
                        type="text" 
                        value={form.code}
                        onChange={e => setForm({...form, code: e.target.value})}
                        className="aurelia-input font-mono text-gold"
                        placeholder="ROM-01"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Primary Option</label>
                      <input 
                        type="text" 
                        value={form.option}
                        onChange={e => setForm({...form, option: e.target.value})}
                        className="aurelia-input"
                        placeholder="Morning Tour"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-gold/5 border border-gold/10 rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-gold/10 rounded-lg text-gold">
                    <Globe size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gold">Distribution Matrix</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Once added, you can toggle presence across all 10+ major OTAs directly in the main matrix.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-border bg-muted flex items-center gap-4">
                <button 
                  onClick={() => setPanelOpen(false)}
                  className="flex-1 px-4 py-4 rounded-xl border border-border font-bold hover:bg-muted transition-colors text-sm"
                >
                  Discard
                </button>
                <button 
                  onClick={handleSave}
                  className="flex-[2] aurelia-gold-btn px-4 py-4 font-bold flex items-center justify-center gap-2 shadow-2xl shadow-gold/20"
                >
                  <CheckCircle2 size={20} /> {editingProduct ? 'Update Mapping' : 'Initialize Product'}
                </button>
              </div>
            </div>
          </>
        )}
    </div>
  );
}

