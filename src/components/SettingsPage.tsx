import { useState, useEffect } from 'react';
import { Settings, ShieldAlert, Palette, Building2, Save, RefreshCw } from 'lucide-react';
import { getTheme, applyTheme, THEMES, ThemeName } from '@/lib/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { syncFromBokun } from '@/lib/bokunSync';

const STORAGE_KEY = 'gsheet_id';
const DEFAULT_SHEET_ID = '1EAI0SHtkJD5HHVj25rJcnzmoksTug249eIT4_JmiOR8';

export default function SettingsPage() {
  const { user, profile } = useAuth();
  
  const [sheetId, setSheetId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(getTheme());
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState('1800000');
  
  const [sheetSaved, setSheetSaved] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Bokun Integration
  const [bokunAccess, setBokunAccess] = useState('');
  const [bokunSecret, setBokunSecret] = useState('');
  const [bokunSaved, setBokunSaved] = useState(false);
  const [bokunSyncing, setBokunSyncing] = useState(false);
  const [bokunSyncResult, setBokunSyncResult] = useState('');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [syncSources, setSyncSources] = useState<string[]>(['gsheet']);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setSheetId(stored || DEFAULT_SHEET_ID);
    setBokunAccess(localStorage.getItem('aurelia_bokun_access') || '');
    setBokunSecret(localStorage.getItem('aurelia_bokun_secret') || '');
    setAutoSync(localStorage.getItem('aurelia_autosync_enabled') === 'true');
    setSyncInterval(localStorage.getItem('aurelia_autosync_interval') || '1800000');
    
    const storedSources = localStorage.getItem('aurelia_autosync_sources');
    if (storedSources) setSyncSources(JSON.parse(storedSources));

    if (profile) setCompanyName(profile.company_name || '');
  }, [profile]);

  const handleToggleAutoSync = (checked: boolean) => {
    setAutoSync(checked);
    localStorage.setItem('aurelia_autosync_enabled', String(checked));
    if (checked && !localStorage.getItem('aurelia_autosync_interval')) {
      localStorage.setItem('aurelia_autosync_interval', '1800000');
    }
    window.dispatchEvent(new Event('autosync_changed'));
  };

  const handleIntervalChange = (val: string) => {
    setSyncInterval(val);
    localStorage.setItem('aurelia_autosync_interval', val);
    window.dispatchEvent(new Event('autosync_changed'));
  };

  const toggleSyncSource = (source: string) => {
    const next = syncSources.includes(source) 
      ? syncSources.filter(s => s !== source)
      : [...syncSources, source];
    setSyncSources(next);
    localStorage.setItem('aurelia_autosync_sources', JSON.stringify(next));
    window.dispatchEvent(new Event('autosync_changed'));
  };

  const handleSaveSheet = () => {
    localStorage.setItem(STORAGE_KEY, sheetId);
    setSheetSaved(true);
    setTimeout(() => setSheetSaved(false), 2000);
  };

  const handleSaveCompany = async () => {
    if (!user) return;
    try {
      await supabase
        .from('profiles')
        .update({ company_name: companyName })
        .eq('id', user.id);
        
      setCompanySaved(true);
      setTimeout(() => setCompanySaved(false), 2000);
      // Wait for auth context to re-poll and update sidebar live
    } catch (e) {
      alert('Failed to update company name');
    }
  };

  const handleSaveBokun = () => {
    localStorage.setItem('aurelia_bokun_access', bokunAccess);
    localStorage.setItem('aurelia_bokun_secret', bokunSecret);
    setBokunSaved(true);
    setTimeout(() => setBokunSaved(false), 2000);
  };

  const handleSyncBokun = async () => {
    if (!user || !bokunAccess || !bokunSecret) return alert("Keys required.");
    setBokunSyncing(true);
    setBokunSyncResult('');
    try {
      const res = await syncFromBokun(bokunAccess, bokunSecret, user.id, supabase, syncStartDate, syncEndDate);
      setBokunSyncResult(`✅ Imported ${res.imported} · Updated ${res.updated} (Skipped ${res.skipped})`);
    } catch (e: any) {
      setBokunSyncResult(`❌ Sync failed: ${e.message}`);
    } finally {
      setBokunSyncing(false);
    }
  };

  const handleThemeChange = (theme: ThemeName) => {
    applyTheme(theme);
    setCurrentTheme(theme);
  };

  const handleResetData = async () => {
    if (!user) return;
    const confirm1 = window.confirm("WARNING: This will delete ALL products, options, ledger bookings, and costs. Are you absolutely sure?");
    if (!confirm1) return;
    const confirm2 = window.prompt("Type 'DELETE' to confirm wiping all data.");
    if (confirm2 !== 'DELETE') return;
    
    setIsResetting(true);
    try {
      // Products cascade deletes options, tickets, guides etc.
      await supabase.from('products').delete().eq('user_id', user.id);
      await supabase.from('bookings').delete().eq('user_id', user.id);
      await supabase.from('admin_costs').delete().eq('user_id', user.id);
      
      alert("All data has been reset.");
      window.location.reload();
    } catch (e) {
      alert("Error resetting data.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="p-8 pb-32 max-w-3xl mx-auto animate-fade-in text-foreground">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Configure integrations, appearance, and company preferences.</p>

      <div className="space-y-6">
        {/* SECTION 1 — Company Settings */}
        <div className="aurelia-card p-6 border-l-[3px] border-l-gold">
          <div className="flex items-center gap-3 mb-5">
            <Building2 size={18} className="text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Company Settings</h2>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Company Name
              </label>
              <input
                className="aurelia-input text-sm"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter Company Name"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <button onClick={handleSaveCompany} className="aurelia-gold-btn text-xs flex items-center gap-2">
                <Save size={14} /> Save Company Details
              </button>
              {companySaved && (
                <span className="text-xs text-profit-positive font-bold animate-fade-in">✓ Saved</span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2 — Google Sheets Integration */}
        <div className="aurelia-card p-6 border-l-[3px] border-l-gold">
          <div className="flex items-center gap-3 mb-5">
            <Settings size={18} className="text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Google Sheets Integration</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Spreadsheet ID
              </label>
              <input
                className="aurelia-input font-mono text-xs"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="Enter your Google Sheets spreadsheet ID"
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveSheet} className="aurelia-gold-btn text-xs">
                Save Spreadsheet ID
              </button>
              {sheetSaved && (
                <span className="text-xs text-profit-positive font-bold animate-fade-in">✓ Saved</span>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2a — Bokun Integration */}
        <div className="aurelia-card p-6 border-l-[3px] border-l-[#f5a623]">
          <div className="flex items-center gap-3 mb-5">
            <RefreshCw size={18} className="text-[#f5a623]" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Bokun Integration</h2>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Access Key</label>
                <input type="password" value={bokunAccess} onChange={e => setBokunAccess(e.target.value)} className="aurelia-input font-mono text-xs" placeholder="API Access Key" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Secret Key</label>
                <input type="password" value={bokunSecret} onChange={e => setBokunSecret(e.target.value)} className="aurelia-input font-mono text-xs" placeholder="API Secret Key" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSaveBokun} className="aurelia-gold-btn text-xs">Save Keys</button>
              {bokunSaved && <span className="text-xs text-profit-positive font-bold animate-fade-in">✓ Saved</span>}
            </div>
            
            <div className="mt-6 pt-6 border-t border-border/50 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">From Date</label>
                  <input type="date" value={syncStartDate} onChange={e => setSyncStartDate(e.target.value)} className="aurelia-input" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">To Date</label>
                  <input type="date" value={syncEndDate} onChange={e => setSyncEndDate(e.target.value)} className="aurelia-input" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleSyncBokun} disabled={bokunSyncing} className="aurelia-ghost-btn text-xs flex items-center gap-2 border border-white/10">
                  <RefreshCw size={14} className={bokunSyncing ? 'animate-spin' : ''} />
                  {bokunSyncing ? 'Syncing from Bokun...' : '🔄 Sync from Bokun'}
                </button>
                {bokunSyncResult && <span className="text-xs font-bold animate-fade-in text-white">{bokunSyncResult}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2b — Auto Sync */}
        <div className="aurelia-card p-6 border-l-[3px] border-l-blue-500">
          <div className="flex items-center gap-3 mb-5">
            <RefreshCw size={18} className="text-blue-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Auto Sync</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold">Enable Auto Sync</label>
              <button 
                onClick={() => handleToggleAutoSync(!autoSync)} 
                className={`w-10 h-6 rounded-full transition-colors relative ${autoSync ? 'bg-blue-500' : 'bg-[#2a2a3e]'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${autoSync ? 'left-5' : 'left-1'}`} />
              </button>
            </div>
            
            {autoSync && (
              <div className="space-y-4 mt-4 animate-fade-in p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Active Sync Sources
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm font-bold cursor-pointer hover:text-white text-gray-400">
                      <input type="checkbox" checked={syncSources.includes('gsheet')} onChange={() => toggleSyncSource('gsheet')} className="w-4 h-4 rounded border-white/10 bg-black/50 text-[#f5a623] focus:ring-[#f5a623]" />
                      Google Sheets
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold cursor-pointer hover:text-white text-gray-400">
                      <input type="checkbox" checked={syncSources.includes('bokun')} onChange={() => toggleSyncSource('bokun')} className="w-4 h-4 rounded border-white/10 bg-black/50 text-[#f5a623] focus:ring-[#f5a623]" />
                      Bokun API
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Sync every
                  </label>
                  <select 
                    className="aurelia-input w-full text-sm font-bold" 
                    value={syncInterval}
                    onChange={(e) => handleIntervalChange(e.target.value)}
                  >
                    <option value="300000">5 minutes</option>
                    <option value="900000">15 minutes</option>
                    <option value="1800000">30 minutes</option>
                    <option value="3600000">1 hour</option>
                    <option value="7200000">2 hours</option>
                    <option value="21600000">6 hours</option>
                    <option value="43200000">12 hours</option>
                  </select>
                </div>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Auto sync pulls latest data from your Google Sheet automatically. Your sheet data is read-only — AURELIA never writes to your Google Sheet.
            </p>
          </div>
        </div>

        {/* SECTION 3 — Appearance */}
        <div className="aurelia-card p-6 border-l-[3px] border-l-gold">
          <div className="flex items-center gap-3 mb-5">
            <Palette size={18} className="text-gold" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Appearance</h2>
          </div>
          
          <div className="space-y-4">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Color Theme
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.entries(THEMES) as [ThemeName, typeof THEMES[ThemeName]][]).map(([key, theme]) => (
                <button
                  key={key}
                  onClick={() => handleThemeChange(key)}
                  className={`relative flex flex-col p-4 rounded-xl border text-left transition-all hover:-translate-y-1
                    ${currentTheme === key ? 'ring-2 ring-offset-2 ring-offset-background' : 'opacity-80 hover:opacity-100'}
                  `}
                  style={{
                    backgroundColor: theme.colors.bg,
                    borderColor: currentTheme === key ? theme.colors.accent : theme.colors.border,
                    boxShadow: theme.shadows.cardHover
                  }}
                >
                  {/* Mini Preview Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.colors.accent }} />
                    <span className="text-sm font-bold" style={{ color: theme.colors.text }}>{theme.name}</span>
                  </div>
                  {/* Miniature Elements */}
                  <div className="space-y-2 w-full">
                    <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: theme.colors.sidebar }} />
                    <div className="h-8 w-full rounded-md border" style={{ backgroundColor: theme.colors.card, borderColor: theme.colors.border }} />
                    <div className="h-6 w-1/2 rounded-md mt-1" style={{ backgroundColor: theme.colors.btnBg }} />
                  </div>
                  
                  {/* Checked indicator */}
                  {currentTheme === key && (
                    <div className="absolute top-4 right-4 text-xs font-extrabold" style={{ color: theme.colors.accent }}>
                      ✓
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 4 — Danger Zone */}
        <div className="aurelia-card p-6 border-l-[3px] border-l-red-500 bg-red-500/5">
          <div className="flex items-center gap-3 mb-5">
            <ShieldAlert size={18} className="text-red-500" />
            <h2 className="text-sm font-bold text-red-500 uppercase tracking-wider">Danger Zone</h2>
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Once you delete your data, there is no going back. Please be certain.
          </p>
          
          <button 
            onClick={handleResetData} 
            disabled={isResetting}
            className="px-4 py-2 font-bold rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors"
          >
            {isResetting ? 'Resetting...' : 'Reset all data'}
          </button>
        </div>
      </div>
    </div>
  );
}
