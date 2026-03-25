import { useState, useEffect } from 'react';
import { Settings, ShieldAlert, Palette, Building2, Save, RefreshCw, Key, Database, Percent, Globe, Trash2, User, X, Eye, EyeOff, Share2, Copy, AlertTriangle, Check, Radio } from 'lucide-react';
import { getTheme, applyTheme, THEMES, ThemeName } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchBokunProducts, syncBokunBookings, testBokunConnection } from '@/lib/bokunSync';
import { syncMasterData } from '@/lib/gsheetSync';

const DEFAULT_SHEET_ID = '1EAI0SHtkJD5HHVj25rJcnzmoksTug249eIT4_JmiOR8';

type PrimarySource = 'gsheet' | 'bokun' | 'manual';

export default function SettingsPage() {
  const { user, profile: _profile } = useAuth();
  const profile = _profile as any;
  
  // Account & Company
  const [companyName, setCompanyName] = useState('');
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(getTheme());
  const [companySaved, setCompanySaved] = useState(false);

  // DATA SOURCE & SYNC
  const [primarySource, setPrimarySource] = useState<PrimarySource>('gsheet');
  
  // GSheets
  const [sheetId, setSheetId] = useState('');
  const [gsheetAutoSync, setGsheetAutoSync] = useState(false);
  const [gsheetInterval, setGsheetInterval] = useState('1800000');
  const [gsheetSyncing, setGsheetSyncing] = useState(false);
  const [gsheetSyncMsg, setGsheetSyncMsg] = useState('');

  // Bokun
  const [bokunAccess, setBokunAccess] = useState('');
  const [bokunSecret, setBokunSecret] = useState('');
  const [showBokunSecret, setShowBokunSecret] = useState(false);
  const [bokunSaved, setBokunSaved] = useState(false);
  const [bokunSyncing, setBokunSyncing] = useState(false);
  const [bokunSyncResult, setBokunSyncResult] = useState('');
  const [bokunAutoSync, setBokunAutoSync] = useState(false);
  const [bokunInterval, setBokunInterval] = useState('1800000');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  // Bokun Product Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [bokunProducts, setBokunProducts] = useState<any[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // Operational Defaults
  const [margin, setMargin] = useState('20');
  const [taxRate, setTaxRate] = useState('10');
  const [currency, setCurrency] = useState('EUR');
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // Guide Check-in
  const [checkinToken, setCheckinToken] = useState('');
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copiedLink, setCopiedLink] = useState<'base' | 'today' | null>(null);

  // Danger Zone
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (profile) {
      setCompanyName(profile.company_name || '');
      setPrimarySource((profile.primary_data_source as PrimarySource) || 'gsheet');
      setSheetId(profile.gsheet_id || DEFAULT_SHEET_ID);
      setGsheetAutoSync(profile.primary_data_source === 'gsheet' ? (profile.autosync_enabled || false) : false);
      setBokunAutoSync(profile.primary_data_source === 'bokun' ? (profile.autosync_enabled || false) : false);
      setGsheetInterval(profile.autosync_interval || '1800000');
      setBokunInterval(profile.autosync_interval || '1800000');
      setBokunAccess(profile.bokun_access_key || '');
      setBokunSecret(profile.bokun_secret_key || '');
      setCheckinToken(profile.checkin_token || '');
    }
    setMargin(localStorage.getItem('aurelia_default_margin') || '20');
    setTaxRate(localStorage.getItem('aurelia_default_tax') || '10');
    setCurrency(localStorage.getItem('aurelia_default_currency') || 'EUR');
  }, [profile]);

  const handleSavePrimarySource = async (source: PrimarySource) => {
    if (!user) return;
    setPrimarySource(source);
    try {
      // When switching, we might want to disable autosync if the new source isn't configured
      await supabase.from('profiles').update({ 
        primary_data_source: source,
        autosync_enabled: source === 'gsheet' ? gsheetAutoSync : (source === 'bokun' ? bokunAutoSync : false)
      }).eq('id', user.id);
    } catch (e) { console.error(e); }
  };

  const handleTestBokun = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      await testBokunConnection(supabase);
      setTestStatus('success');
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e.message || 'Unknown error');
    }
  };

  const handleSaveBokunKeys = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({
        bokun_access_key: bokunAccess,
        bokun_secret_key: bokunSecret
      }).eq('id', user.id);
      setBokunSaved(true);
      setTimeout(() => setBokunSaved(false), 2000);
      handleTestBokun();
    } catch (e) { alert('Failed to save Bokun keys'); }
  };

  const handleSyncBokun = async () => {
    if (!user) return;
    setBokunSyncing(true);
    setBokunSyncResult('');
    try {
      const res = await syncBokunBookings(supabase, user.id, syncStartDate, syncEndDate);
      setBokunSyncResult(`✅ Imported ${res.imported} · Updated ${res.updated} · Skipped ${res.skipped}`);
    } catch (e: any) {
      setBokunSyncResult(`❌ Error: ${e.message}`);
    } finally {
      setBokunSyncing(false);
    }
  };

  const handleFetchBokunProducts = async () => {
    setBokunSyncing(true);
    try {
      const prods = await fetchBokunProducts(supabase);
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
    } catch (e) { alert("Import failed."); } finally { setImporting(false); }
  };

  const handleGsheetSync = async (force: boolean = false) => {
    if (!user) return;
    if (force && !confirm("Delete ALL bookings and re-import?")) return;

    setGsheetSyncing(true);
    setGsheetSyncMsg(force ? 'Purging and re-syncing...' : 'Syncing from Sheets...');
    try {
      if (force) await supabase.from('bookings').delete().eq('user_id', user.id);
      const res = await syncMasterData(sheetId, user.id, supabase);
      if (res.error) setGsheetSyncMsg(`❌ ${res.error}`);
      else setGsheetSyncMsg(`✅ Imported ${res.imported} · Updated ${res.updated} · Skipped ${res.skipped}`);
    } catch (e) {
      setGsheetSyncMsg('❌ Sync failed');
    } finally {
      setGsheetSyncing(false);
    }
  };

  const handleSaveSyncSettings = async (type: 'gsheet' | 'bokun') => {
    if (!user) return;
    try {
      const isAuto = type === 'gsheet' ? gsheetAutoSync : bokunAutoSync;
      const interval = type === 'gsheet' ? gsheetInterval : bokunInterval;
      
      await supabase.from('profiles').update({
        gsheet_id: sheetId,
        autosync_enabled: isAuto,
        autosync_interval: interval
      }).eq('id', user.id);
      
      alert('Sync settings saved');
      window.dispatchEvent(new Event('autosync_changed'));
    } catch (e) { alert('Save failed'); }
  };

  const handleSaveCompany = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({ company_name: companyName }).eq('id', user.id);
      setCompanySaved(true);
      setTimeout(() => setCompanySaved(false), 2000);
    } catch (e) { alert('Failed to update company name'); }
  };

  const handleSaveDefaults = () => {
    localStorage.setItem('aurelia_default_margin', margin);
    localStorage.setItem('aurelia_default_tax', taxRate);
    localStorage.setItem('aurelia_default_currency', currency);
    setDefaultsSaved(true);
    setTimeout(() => setDefaultsSaved(false), 2000);
  };

  const handleRegenerateToken = async () => {
    if (!user) return;
    setIsRegenerating(true);
    try {
      const newToken = Math.random().toString(36).substring(2, 14);
      const { error } = await supabase.from('profiles').update({ checkin_token: newToken }).eq('id', user.id);
      if (!error) {
        setCheckinToken(newToken);
        setShowRegenConfirm(false);
      }
    } catch (e) { alert('Failed to regenerate token'); } finally { setIsRegenerating(false); }
  };

  const copyToClipboard = (text: string, type: 'base' | 'today') => {
    navigator.clipboard.writeText(text);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const baseUrl = `${window.location.origin}/checkin/${checkinToken}`;
  const todayUrl = `${baseUrl}?date=${new Date().toISOString().split('T')[0]}`;

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
    <div className="p-8 pb-48 max-w-6xl mx-auto animate-fade-in text-white space-y-12">
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div>
          <h1 className="text-5xl font-black tracking-tighter">Settings</h1>
          <p className="text-gray-400 mt-2 text-lg">Platform architecture and operational controls.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            {Object.keys(THEMES).map((t) => (
              <button 
                key={t}
                onClick={() => handleThemeChange(t as ThemeName)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentTheme === t ? 'bg-gold text-black shadow-lg shadow-gold/20' : 'text-gray-500 hover:text-white'}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-12">
        
        {/* DATA SOURCE & SYNC SECTION */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
              <Database size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">📡 Data Source & Sync</h2>
              <p className="text-sm text-gray-500">Configure how booking data enters your system.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* SUB-SECTION 1: PRIMARY SOURCE */}
            <div className="aurelia-card p-8 border-t-[4px] border-t-gold space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-gold">1. Primary Source</h3>
              <div className="space-y-3">
                {[
                  { id: 'gsheet', label: 'Google Sheets', desc: 'Sync from Master Data tab' },
                  { id: 'bokun', label: 'Bokun API', desc: 'Live direct integration' },
                  { id: 'manual', label: 'Manual Only', desc: 'Add bookings one by one' }
                ].map(s => (
                  <label key={s.id} className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${primarySource === s.id ? 'bg-gold/5 border-gold/40 shadow-lg shadow-gold/5' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
                    <input 
                      type="radio" 
                      name="primarySource" 
                      className="mt-1 accent-gold w-4 h-4 cursor-pointer"
                      checked={primarySource === s.id}
                      onChange={() => handleSavePrimarySource(s.id as PrimarySource)}
                    />
                    <div>
                      <div className="font-bold text-sm">{s.label}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-0.5">{s.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              {primarySource === 'bokun' && (
                <div className="p-4 bg-orange-500/10 rounded-2xl border border-orange-500/20 flex gap-3">
                  <AlertTriangle className="text-orange-400 shrink-0" size={18} />
                  <p className="text-[11px] text-orange-200/80 leading-relaxed font-medium">
                    <span className="font-black text-orange-400">WARNING:</span> Bokun is now primary. 
                    Google Sheets auto-sync is disabled. Manual imports still available.
                  </p>
                </div>
              )}
            </div>

            {/* SUB-SECTION 2: GOOGLE SHEETS */}
            <div className="aurelia-card p-8 border-t-[4px] border-t-blue-500 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-blue-400">2. Google Sheets</h3>
                {primarySource === 'gsheet' && <span className="text-[9px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Active Source</span>}
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Master Spreadsheet ID</label>
                  <div className="flex gap-2">
                    <input className="aurelia-input flex-1 font-mono text-xs" value={sheetId} onChange={e => setSheetId(e.target.value)} placeholder="1EAI0S...JmiOR8" />
                    <button onClick={() => { handleSaveSyncSettings('gsheet'); }} className="p-2 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl text-blue-400 transition-all border border-blue-500/20"><Save size={18} /></button>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <button onClick={() => handleGsheetSync(false)} disabled={gsheetSyncing} className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all">
                    <RefreshCw size={14} className={gsheetSyncing ? 'animate-spin' : ''} /> 🔄 Sync from Google Sheets
                  </button>
                  <button onClick={() => handleGsheetSync(true)} disabled={gsheetSyncing} className="w-full flex items-center justify-center gap-2 p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-xs font-bold text-red-400/70 hover:bg-red-500/10 transition-all">
                    <AlertTriangle size={14} /> 💪 Force Full Re-sync
                  </button>
                  {gsheetSyncMsg && <div className="text-center text-[10px] font-bold uppercase text-blue-400">{gsheetSyncMsg}</div>}
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-bold">Auto-Sync</div>
                      <div className="text-[10px] text-gray-500 uppercase">GSheets background sync</div>
                    </div>
                    {primarySource === 'gsheet' ? (
                      <button onClick={() => setGsheetAutoSync(!gsheetAutoSync)} className={`w-10 h-6 rounded-full transition-all relative ${gsheetAutoSync ? 'bg-blue-500' : 'bg-white/10'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${gsheetAutoSync ? 'left-5' : 'left-1'}`} />
                      </button>
                    ) : (
                      <span className="text-[9px] text-gray-600 font-bold uppercase">Disabled</span>
                    )}
                  </div>
                  {primarySource === 'gsheet' && gsheetAutoSync && (
                    <select value={gsheetInterval} onChange={e => setGsheetInterval(e.target.value)} className="aurelia-input w-full text-xs">
                      <option value="300000">Every 5 minutes</option>
                      <option value="900000">Every 15 minutes</option>
                      <option value="1800000">Every 30 minutes</option>
                      <option value="3600000">Every 1 hour</option>
                    </select>
                  )}
                  {primarySource !== 'gsheet' && (
                    <div className="text-[10px] text-gray-600 italic leading-snug">
                      Auto-sync disabled. {primarySource === 'bokun' ? 'Bokun is primary.' : 'Manual mode active.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SUB-SECTION 3: BOKUN API */}
            <div className="aurelia-card p-8 border-t-[4px] border-t-orange-500 space-y-6">
               <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-orange-400">3. Bokun API</h3>
                {primarySource === 'bokun' && <span className="text-[9px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Active Source</span>}
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Access Key</label>
                    <input type="password" value={bokunAccess} onChange={e => setBokunAccess(e.target.value)} className="aurelia-input font-mono text-xs" placeholder="X-Bokun-AccessKey" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Secret Key</label>
                    <div className="flex gap-2">
                      <input type={showBokunSecret ? "text" : "password"} value={bokunSecret} onChange={e => setBokunSecret(e.target.value)} className="aurelia-input flex-1 font-mono text-xs" />
                      <button onClick={() => setShowBokunSecret(!showBokunSecret)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 transition-all border border-white/5">
                        {showBokunSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleSaveBokunKeys} className="flex-1 aurelia-gold-btn py-2.5 text-xs font-black uppercase tracking-widest shdow-lg shadow-orange-500/5">{bokunSaved ? 'Keys Saved' : 'Save Keys'}</button>
                  <button onClick={handleTestBokun} disabled={testStatus === 'testing'} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all flex items-center gap-2">
                    {testStatus === 'testing' ? <RefreshCw size={14} className="animate-spin" /> : <ShieldAlert size={14} />} 
                    Test
                  </button>
                </div>

                {testStatus === 'success' && <div className="text-center text-[10px] font-black text-green-400 uppercase tracking-widest">✅ Connection established</div>}
                {testStatus === 'error' && <div className="text-center text-[10px] font-bold text-red-500 uppercase tracking-tight">❌ {testError}</div>}

                <div className="pt-4 border-t border-white/5 space-y-3">
                  <button onClick={() => { handleFetchBokunProducts(); }} className="w-full flex items-center justify-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-xs font-bold text-orange-400 hover:bg-orange-500/20 transition-all">📦 Import Products</button>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="date" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} className="aurelia-input text-[10px] h-8" />
                      <input type="date" value={syncEndDate} onChange={e => setSyncEndDate(e.target.value)} className="aurelia-input text-[10px] h-8" />
                    </div>
                    <button onClick={handleSyncBokun} disabled={bokunSyncing} className="w-full flex items-center justify-center gap-2 p-2.5 bg-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5">🔄 Sync {new Date(syncStartDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} – {new Date(syncEndDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</button>
                    {bokunSyncResult && <div className="text-center text-[9px] font-bold uppercase text-orange-400 mt-1">{bokunSyncResult}</div>}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-xs font-bold">Auto-Sync</div>
                      <div className="text-[10px] text-gray-500 uppercase">Live Bokun synchronization</div>
                    </div>
                    {primarySource === 'bokun' ? (
                      <button onClick={() => setBokunAutoSync(!bokunAutoSync)} className={`w-10 h-6 rounded-full transition-all relative ${bokunAutoSync ? 'bg-orange-500' : 'bg-white/10'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${bokunAutoSync ? 'left-5' : 'left-1'}`} />
                      </button>
                    ) : (
                      <span className="text-[9px] text-gray-600 font-bold uppercase">Disabled</span>
                    )}
                  </div>
                  {primarySource === 'bokun' && bokunAutoSync && (
                    <select value={bokunInterval} onChange={e => setBokunInterval(e.target.value)} className="aurelia-input w-full text-xs">
                      <option value="300000">Every 5 minutes</option>
                      <option value="900000">Every 15 minutes</option>
                      <option value="1800000">Every 30 minutes</option>
                      <option value="3600000">Every 1 hour</option>
                    </select>
                  )}
                  {primarySource !== 'bokun' && (
                    <div className="text-[10px] text-gray-600 italic leading-snug">
                       Auto-sync disabled. {primarySource === 'gsheet' ? 'GSheets is primary.' : 'Manual mode active.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SUB-SECTION 4: MANUAL ENTRY INFO */}
            <div className="xl:col-span-3 p-6 bg-white/[0.02] border border-white/5 rounded-[32px] flex items-center justify-between overflow-hidden relative">
               <div className="flex items-center gap-5 relative z-10">
                 <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                    <Percent size={24} />
                 </div>
                 <div>
                   <h3 className="text-lg font-black uppercase tracking-tight">Manual Bookings</h3>
                   <p className="text-xs text-gray-500 max-w-xl">Manual bookings are always available regardless of your primary source. You can manually override rates, add guide assignments, and manage operational details for any booking.</p>
                 </div>
               </div>
               <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-white/[0.03] to-transparent" />
            </div>

          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* GUIDE CHECK-IN */}
          <div className="aurelia-card p-8 border-t-[4px] border-t-green-500 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-400">
                  <Share2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold uppercase tracking-tight">Guide Check-in</h2>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Secure External Access</p>
                </div>
              </div>
              <button onClick={() => setShowRegenConfirm(true)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition-all flex items-center gap-2">
                <RefreshCw size={12} className={isRegenerating ? 'animate-spin' : ''} />
                Regenerate
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Permanent Master Link</label>
                <div className="flex gap-2 p-3 bg-black/20 rounded-2xl border border-white/5 items-center group">
                  <code className="text-[10px] text-gray-400 flex-1 truncate font-mono">{baseUrl}</code>
                  <button onClick={() => copyToClipboard(baseUrl, 'base')} className="p-2 bg-white/5 hover:bg-green-500/20 rounded-lg text-gray-400 hover:text-green-400 transition-all">
                    {copiedLink === 'base' ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-start gap-3">
                <div className="mt-0.5 text-green-400/50"><Globe size={16} /></div>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  Share this link with your guides. No login required.
                  <span className="text-gray-400 font-bold ml-1">Regenerate current token to revoke access.</span>
                </p>
              </div>
            </div>
          </div>

          {/* BRANDING & COMPANY */}
          <div className="aurelia-card p-8 border-t-[4px] border-t-gold space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold uppercase tracking-tight">Company Details</h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Identity & Branding</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-white/10 rounded-2xl border border-white/10 border-dashed">
                <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center text-xl font-black text-gold border border-gold/20">
                  {companyName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-sm tracking-tight">{user?.email}</div>
                  <div className="text-[10px] text-gray-500 uppercase font-mono mt-0.5 opacity-50">{user?.id}</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Company Display Name</label>
                <div className="flex gap-2">
                  <input className="aurelia-input flex-1" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="AURELIA Operations" />
                  <button onClick={handleSaveCompany} className="aurelia-gold-btn px-4 flex items-center gap-2"><Save size={16} /> {companySaved ? 'Saved' : 'Save'}</button>
                </div>
              </div>
            </div>
          </div>

          {/* OPERATIONAL DEFAULTS */}
          <div className="aurelia-card p-8 border-t-[4px] border-t-fuchsia-500 space-y-6">
             <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-400">
                <Palette size={20} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold uppercase tracking-tight">Operational Defaults</h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Global Calculations</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Safety Margin %</label>
                 <input type="number" className="aurelia-input" value={margin} onChange={e => setMargin(e.target.value)} />
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Global Tax %</label>
                 <input type="number" className="aurelia-input" value={taxRate} onChange={e => setTaxRate(e.target.value)} />
               </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Base Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="aurelia-input w-full appearance-none">
                <option value="EUR">EUR (€) Euro</option>
                <option value="USD">USD ($) US Dollar</option>
                <option value="GBP">GBP (£) British Pound</option>
              </select>
            </div>

            <button onClick={handleSaveDefaults} className="w-full h-12 rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-black uppercase tracking-widest text-[11px] transition-all shadow-lg shadow-fuchsia-500/10 active:scale-[0.98]">
              {defaultsSaved ? 'Defaults Applied ✅' : 'Save Operational Defaults'}
            </button>
          </div>

          {/* DANGER ZONE */}
          <div className="aurelia-card p-8 border-t-[4px] border-t-red-600 space-y-6 bg-red-600/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center text-red-500">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold uppercase tracking-tight text-red-100">Danger Zone</h2>
                <p className="text-[10px] text-red-500/60 uppercase tracking-widest font-black italic">Irreversible Actions</p>
              </div>
            </div>
            
            <div className="p-4 border border-red-500/20 bg-red-500/5 rounded-2xl">
               <p className="text-[11px] text-red-200/60 leading-relaxed font-medium">
                  Deleting operational data will remove all bookings, products, and cost history. 
                  This cannot be undone.
               </p>
            </div>

            <button onClick={handleResetData} disabled={isResetting} className="w-full h-12 border border-red-500/30 hover:bg-red-500/10 text-red-500 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2">
               <Trash2 size={16} /> {isResetting ? 'Purging Platform...' : 'Reset All Operational Data'}
            </button>
          </div>

        </div>

      </div>

      {/* REGENERATE TOKEN CONFIRMATION */}
      {showRegenConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
          <div className="bg-[#0f0f12] border border-red-500/20 rounded-[32px] w-full max-w-sm p-8 space-y-6 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto"><AlertTriangle size={32} /></div>
            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">Regenerate Token?</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">This will <span className="text-red-500 font-bold italic">immediately invalidate</span> all existing check-in links shared with your guides.</p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={handleRegenerateToken} disabled={isRegenerating} className="w-full py-4 bg-red-500 hover:bg-red-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-red-500/20">{isRegenerating ? 'Working...' : 'Yes, Regenerate'}</button>
              <button onClick={() => setShowRegenConfirm(false)} className="w-full py-4 bg-white/5 text-gray-500 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all">Go Back</button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
          <div className="bg-[#0f0f12] border border-white/10 rounded-[32px] w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Import Products</h2>
                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1 font-bold">Select items to sync to AURELIA</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-red-500/10 rounded-xl text-gray-500 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-3">
              {bokunProducts.map(p => (
                <div key={p.bokun_product_id} onClick={() => setSelectedProductIds(prev => prev.includes(p.bokun_product_id) ? prev.filter(id => id !== p.bokun_product_id) : [...prev, p.bokun_product_id])} className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${selectedProductIds.includes(p.bokun_product_id) ? 'bg-orange-500/10 border-orange-500/40' : 'bg-white/[0.02] border-white/5 hover:border-white/10'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs transition-all ${selectedProductIds.includes(p.bokun_product_id) ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-600 group-hover:bg-white/10'}`}>{selectedProductIds.includes(p.bokun_product_id) ? '✓' : ''}</div>
                    <div>
                      <div className="font-bold text-sm tracking-tight">{p.name}</div>
                      <div className="text-[10px] font-mono text-gray-500 mt-0.5 opacity-60">{p.code}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-8 border-t border-white/5 bg-white/[0.02] flex gap-4">
              <button onClick={() => setShowImportModal(false)} className="flex-1 py-4 rounded-2xl font-bold border border-white/10 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleImportSelected} disabled={importing || selectedProductIds.length === 0} className="flex-[2] py-4 bg-orange-500 hover:bg-orange-400 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-xl shadow-orange-500/20">{importing ? 'Syncing...' : `Import ${selectedProductIds.length} Selections`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
