import { useState, useEffect } from 'react';
import { Settings, ShieldAlert, Palette, Building2, Save, RefreshCw, Key, Database, Percent, Globe, Trash2, User, X, Eye, EyeOff } from 'lucide-react';
import { getTheme, applyTheme, THEMES, ThemeName } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchBokunProducts, syncBokunBookings } from '@/lib/bokunSync';

const STORAGE_KEY = 'gsheet_id';
const DEFAULT_SHEET_ID = '1EAI0SHtkJD5HHVj25rJcnzmoksTug249eIT4_JmiOR8';

export default function SettingsPage() {
  const { user, profile } = useAuth();
  
  // Account & Company
  const [companyName, setCompanyName] = useState('');
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(getTheme());
  const [companySaved, setCompanySaved] = useState(false);

  // Connections (Bokun)
  const [bokunAccess, setBokunAccess] = useState('');
  const [bokunSecret, setBokunSecret] = useState('');
  const [showBokunAccess, setShowBokunAccess] = useState(false);
  const [showBokunSecret, setShowBokunSecret] = useState(false);
  const [bokunSaved, setBokunSaved] = useState(false);
  const [bokunSyncing, setBokunSyncing] = useState(false);
  const [bokunSyncResult, setBokunSyncResult] = useState('');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Bokun Product Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [bokunProducts, setBokunProducts] = useState<any[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // Sync Preferences (GSheets)
  const [sheetId, setSheetId] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState('1800000');
  const [syncSources, setSyncSources] = useState<string[]>(['gsheet']);
  const [syncSaved, setSyncSaved] = useState(false);

  // Operational Defaults
  const [margin, setMargin] = useState('20');
  const [taxRate, setTaxRate] = useState('10');
  const [currency, setCurrency] = useState('EUR');
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Danger Zone
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    // Load from profile if available
    if (profile) {
      setCompanyName(profile.company_name || '');
      setSheetId(profile.gsheet_id || DEFAULT_SHEET_ID);
      setBokunAccess(profile.bokun_access_key || '');
      setBokunSecret(profile.bokun_secret_key || '');
      setAutoSync(profile.autosync_enabled || false);
      setSyncInterval(profile.autosync_interval || '1800000');
    }

    // Still load theme and operational defaults from localStorage for now as per plan, 
    // unless they should also be in profile. (User said ALL settings to Supabase)
    // Actually, user said: "Move ALL settings to Supabase profiles table per user."
    // But they only listed gsheet_id, autosync_enabled, autosync_interval, bokun_access_key, bokun_secret_key.
    // I'll stick to what was explicitly requested.

    setMargin(localStorage.getItem('aurelia_default_margin') || '20');
    setTaxRate(localStorage.getItem('aurelia_default_tax') || '10');
    setCurrency(localStorage.getItem('aurelia_default_currency') || 'EUR');
  }, [profile]);

  const handleSaveCompany = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({ company_name: companyName }).eq('id', user.id);
      setCompanySaved(true);
      setTimeout(() => setCompanySaved(false), 2000);
    } catch (e) { alert('Failed to update company name'); }
  };

  const handleSaveConnections = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({
        bokun_access_key: bokunAccess,
        bokun_secret_key: bokunSecret
      }).eq('id', user.id);
      
      setBokunSaved(true);
      setTimeout(() => setBokunSaved(false), 2000);
    } catch (e) {
      alert('Failed to save Bokun keys');
    }
  };

  const handleSyncBokun = async () => {
    if (!user || !bokunAccess || !bokunSecret) return alert("API keys required.");
    setBokunSyncing(true);
    setBokunSyncResult('');
    try {
      const res = await syncBokunBookings(bokunAccess, bokunSecret, user.id, supabase, syncStartDate, syncEndDate);
      setBokunSyncResult(`✅ Imported ${res.imported} · Updated ${res.updated} · Skipped ${res.skipped}`);
    } catch (e: any) {
      setBokunSyncResult(`❌ Error: ${e.message}`);
    } finally {
      setBokunSyncing(false);
    }
  };

  const handleFetchBokunProducts = async () => {
    if (!bokunAccess || !bokunSecret) return alert("API keys required.");
    setBokunSyncing(true);
    try {
      const prods = await fetchBokunProducts(bokunAccess, bokunSecret);
      setBokunProducts(prods);
      setSelectedProductIds(prods.map(p => p.bokun_product_id));
      setShowImportModal(true);
    } catch (e: any) {
      alert(`Bokun Error: ${e.message}`);
    } finally {
      setBokunSyncing(false);
    }
  };

  const handleImportSelected = async () => {
    if (!user) return;
    setImporting(true);
    try {
      const toImport = bokunProducts.filter(p => selectedProductIds.includes(p.bokun_product_id));
      for (const p of toImport) {
        const { data: existing } = await supabase.from('products').select('id').eq('user_id', user.id).eq('name', p.name).single();
        if (!existing) {
          const { data: newProd, error: pError } = await supabase.from('products').insert({
            user_id: user.id,
            name: p.name,
            code: p.code
          }).select().single();
          
          if (!pError && newProd) {
            for (const opt of p.options) {
              await supabase.from('product_options').insert({
                product_id: newProd.id,
                name: opt.name,
                user_id: user.id
              });
            }
          }
        }
      }
      setShowImportModal(false);
      alert(`${toImport.length} products processed.`);
    } catch (e) {
      alert("Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleSaveSync = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({
        gsheet_id: sheetId,
        autosync_enabled: autoSync,
        autosync_interval: syncInterval
      }).eq('id', user.id);

      setSyncSaved(true);
      setTimeout(() => setSyncSaved(false), 2000);
      window.dispatchEvent(new Event('autosync_changed'));
    } catch (e) {
      alert('Failed to update sync config');
    }
  };

  const handleSaveDefaults = () => {
    localStorage.setItem('aurelia_default_margin', margin);
    localStorage.setItem('aurelia_default_tax', taxRate);
    localStorage.setItem('aurelia_default_currency', currency);
    setDefaultsSaved(true);
    setTimeout(() => setDefaultsSaved(false), 2000);
  };

  const handleThemeChange = (theme: ThemeName) => {
    applyTheme(theme);
    setCurrentTheme(theme);
  };

  const handleResetData = async () => {
    if (!user) return;
    if (!window.confirm("CRITICAL: Delete all operational data?")) return;
    if (window.prompt("Type 'PURGE' to confirm deletion") !== 'PURGE') return;
    
    setIsResetting(true);
    try {
      await supabase.from('products').delete().eq('user_id', user.id);
      await supabase.from('bookings').delete().eq('user_id', user.id);
      await supabase.from('admin_costs').delete().eq('user_id', user.id);
      await supabase.from('guides').delete().eq('user_id', user.id);
      alert("All data cleared.");
      window.location.reload();
    } catch (e) { alert("Reset failed."); } finally { setIsResetting(false); }
  };

  return (
    <div className="p-8 pb-32 max-w-5xl mx-auto animate-fade-in text-white">
      <div className="mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-2">Manage your platform architecture, integrations, and global defaults.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 1. ACCOUNT & COMPANY */}
        <div className="aurelia-card p-8 border-t-[4px] border-t-gold space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold">Account & Company</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Branding and Appearance</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
              <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center text-xl">
                {user?.email?.[0].toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-sm">{user?.email}</div>
                <div className="text-[10px] text-gray-500 uppercase font-mono">{user?.id}</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Company Name</label>
              <div className="flex gap-2">
                <input 
                  className="aurelia-input flex-1" 
                  value={companyName} 
                  onChange={e => setCompanyName(e.target.value)} 
                />
                <button onClick={handleSaveCompany} className="aurelia-gold-btn px-4 flex items-center gap-2">
                  <Save size={16} /> {companySaved ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Palette size={12} /> Visual Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(THEMES) as ThemeName[]).map(t => (
                  <button 
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all ${
                      currentTheme === t ? 'bg-gold/10 border-gold text-gold' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {THEMES[t].name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. CONNECTIONS */}
        <div className="aurelia-card p-8 border-t-[4px] border-t-[#f5a623] space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400">
              <Key size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold">Connections</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest">API Integrations</p>
            </div>
          </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Bokun Access Key</label>
                  <div className="relative">
                    <input 
                      type={showBokunAccess ? "text" : "password"}
                      value={bokunAccess} 
                      onChange={e => setBokunAccess(e.target.value)} 
                      className="aurelia-input font-mono text-sm w-full pr-12" 
                      placeholder="X-Bokun-AccessKey" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowBokunAccess(!showBokunAccess)}
                      className="absolute right-3 top-2.5 text-gray-500 hover:text-white"
                    >
                      {showBokunAccess ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    {!showBokunAccess && bokunAccess && (
                      <div className="absolute left-4 top-3 text-xs text-gray-300 pointer-events-none bg-[#0a0a0f]">
                        {bokunAccess.substring(0, 8)}...
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Bokun Secret Key</label>
                  <div className="relative">
                    <input 
                      type={showBokunSecret ? "text" : "password"}
                      value={bokunSecret} 
                      onChange={e => setBokunSecret(e.target.value)} 
                      className="aurelia-input font-mono text-sm w-full pr-12" 
                      placeholder="HMAC Secret Key" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowBokunSecret(!showBokunSecret)}
                      className="absolute right-3 top-2.5 text-gray-500 hover:text-white"
                    >
                      {showBokunSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    {!showBokunSecret && bokunSecret && (
                      <div className="absolute left-4 top-3 text-xs text-gray-300 pointer-events-none bg-[#0a0a0f]">
                        ••••••••
                      </div>
                    )}
                  </div>
                </div>
              </div>

            <button onClick={handleSaveConnections} className="w-full aurelia-gold-btn py-3 font-extrabold shadow-xl shadow-orange-500/10">
              {bokunSaved ? '✅ Keys Secured' : 'Save Connection Keys'}
            </button>

            <div className="pt-6 border-t border-white/5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Inventory Management</h3>
                <div className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">Bokun Integration</div>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={handleFetchBokunProducts}
                  className="flex items-center justify-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm font-bold text-orange-400 hover:bg-orange-500/20 transition-all"
                >
                  <Database size={16} /> 📦 Import Products from Bokun
                </button>
                
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Bookings Sync Range</span>
                    <RefreshCw size={12} className={bokunSyncing ? 'animate-spin text-orange-400' : 'text-gray-600'} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} className="aurelia-input text-xs" />
                    <input type="date" value={syncEndDate} onChange={e => setSyncEndDate(e.target.value)} className="aurelia-input text-xs" />
                  </div>
                  <button 
                    onClick={handleSyncBokun} 
                    disabled={bokunSyncing}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/20 transition-all active:scale-[0.98]"
                  >
                    🔄 Sync Bookings from Bokun
                  </button>
                  {bokunSyncResult && <div className="text-center text-[10px] font-bold uppercase text-orange-400 animate-fade-in">{bokunSyncResult}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. SYNC PREFERENCES */}
        <div className="aurelia-card p-8 border-t-[4px] border-t-blue-500 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold">Sync Preferences</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Automation Controls</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Google Sheet ID</label>
              <input 
                className="aurelia-input font-mono text-sm" 
                value={sheetId} 
                onChange={e => setSheetId(e.target.value)} 
                placeholder="1EAI0SH...JmiOR8" 
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
              <div>
                <div className="text-sm font-bold">Auto-Sync Enabled</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Runs in background</div>
              </div>
              <button 
                onClick={() => setAutoSync(!autoSync)} 
                className={`w-12 h-7 rounded-full transition-all relative ${autoSync ? 'bg-blue-500 shadow-lg shadow-blue-500/20' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all ${autoSync ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            {autoSync && (
              <div className="space-y-4 animate-slide-up">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Frequency</label>
                  <select 
                    value={syncInterval} 
                    onChange={e => setSyncInterval(e.target.value)} 
                    className="aurelia-input text-xs font-bold"
                  >
                    <option value="900000">Every 15 Minutes</option>
                    <option value="1800000">Every 30 Minutes</option>
                    <option value="3600000">Every Hour</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      const next = syncSources.includes('gsheet') ? syncSources.filter(s => s !== 'gsheet') : [...syncSources, 'gsheet'];
                      setSyncSources(next);
                    }}
                    className={`p-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-white/10 ${syncSources.includes('gsheet') ? 'bg-blue-500/20 text-blue-400' : 'text-gray-600'}`}
                  >
                    GSheet
                  </button>
                  <button 
                    onClick={() => {
                      const next = syncSources.includes('bokun') ? syncSources.filter(s => s !== 'bokun') : [...syncSources, 'bokun'];
                      setSyncSources(next);
                    }}
                    className={`p-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-white/10 ${syncSources.includes('bokun') ? 'bg-orange-500/20 text-orange-400' : 'text-gray-600'}`}
                  >
                    Bokun API
                  </button>
                </div>
              </div>
            )}

            <button onClick={handleSaveSync} className="w-full aurelia-gold-btn py-3 font-extrabold flex items-center justify-center gap-2">
              <RefreshCw size={16} /> {syncSaved ? 'Sync Config Saved' : 'Update Sync Config'}
            </button>
          </div>
        </div>

        {/* 4. OPERATIONAL DEFAULTS */}
        <div className="aurelia-card p-8 border-t-[4px] border-t-purple-500 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Percent size={20} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold">Operational Defaults</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest">Business Rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Margin (%)</label>
                <div className="relative">
                  <input className="aurelia-input pl-10" value={margin} onChange={e => setMargin(e.target.value)} type="number" />
                  <Percent className="absolute left-3 top-3 text-gray-600" size={16} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Tax / VAT Rate (%)</label>
                <div className="relative">
                  <input className="aurelia-input pl-10" value={taxRate} onChange={e => setTaxRate(e.target.value)} type="number" />
                  <Percent className="absolute left-3 top-3 text-gray-600" size={16} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Base Currency</label>
              <div className="flex gap-2">
                {['EUR', 'USD', 'GBP'].map(c => (
                  <button 
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`flex-1 p-3 rounded-xl text-sm font-extrabold border transition-all ${
                      currency === c ? 'bg-purple-500 text-white border-purple-500' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSaveDefaults} className="w-full aurelia-gold-btn py-3 font-extrabold flex items-center justify-center gap-2 shadow-xl shadow-purple-500/10">
              <Globe size={16} /> {defaultsSaved ? 'Defaults Applied' : 'Save Global Defaults'}
            </button>
          </div>
        </div>

        {/* 5. DANGER ZONE */}
        <div className="lg:col-span-2 aurelia-card p-8 border-t-[4px] border-t-red-500 bg-red-500/[0.02] flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
              <ShieldAlert size={28} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-red-500">Danger Zone</h2>
              <p className="text-sm text-gray-500 max-w-md">Irreversible actions. Purging data will delete all products, bookings, and guide history permanently.</p>
            </div>
          </div>
          
          <button 
            onClick={handleResetData}
            disabled={isResetting}
            className="px-8 py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl font-extrabold hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
          >
            <Trash2 size={20} /> {isResetting ? 'Processing Purge...' : 'Purge All Operational Data'}
          </button>
        </div>

      </div>

      {/* IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="bg-[#0f0f12] border border-white/10 rounded-[32px] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-2xl font-black">Import Bokun Products</h2>
                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Select items to add to AURELIA</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-500 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-4">
              <div className="flex items-center justify-between px-2 mb-4">
                <button 
                  onClick={() => setSelectedProductIds(selectedProductIds.length === bokunProducts.length ? [] : bokunProducts.map(p => p.bokun_product_id))}
                  className="text-[10px] font-bold uppercase tracking-widest text-orange-400"
                >
                  {selectedProductIds.length === bokunProducts.length ? 'Deselect All' : 'Select All'}
                </button>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  {selectedProductIds.length} Products Selected
                </div>
              </div>

              {bokunProducts.map(p => (
                <div 
                  key={p.bokun_product_id}
                  onClick={() => setSelectedProductIds(prev => prev.includes(p.bokun_product_id) ? prev.filter(id => id !== p.bokun_product_id) : [...prev, p.bokun_product_id])}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedProductIds.includes(p.bokun_product_id) ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${selectedProductIds.includes(p.bokun_product_id) ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-600'}`}>
                      {selectedProductIds.includes(p.bokun_product_id) ? '✓' : '○'}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{p.name}</div>
                      <div className="text-[10px] font-mono text-gray-500 mt-0.5">{p.code} · {p.options?.length || 0} Options</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 border-t border-white/5 bg-white/[0.02] flex gap-4">
              <button 
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-4 rounded-2xl font-bold border border-white/10 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleImportSelected}
                disabled={importing || selectedProductIds.length === 0}
                className="flex-[2] py-4 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-orange-500/20 transition-all flex items-center justify-center gap-2"
              >
                {importing ? <RefreshCw className="animate-spin" size={18} /> : <Database size={18} />}
                {importing ? 'Importing...' : `Import ${selectedProductIds.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

