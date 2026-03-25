import { useState, useEffect } from 'react';
import AureliaSidebar from '@/components/AureliaSidebar';
import Dashboard from '@/components/Dashboard';
import ProductsPage from '@/components/ProductsPage';
import OptionEditor from '@/components/OptionEditor';
import LedgerPage from '@/components/LedgerPage';
import AdminCostsPage from '@/components/AdminCostsPage';
import SettingsPage from '@/components/SettingsPage';
import TodayToursPage from '@/pages/TodayToursPage';
import ExecutiveDashboard from '@/pages/ExecutiveDashboard';
import AnalyticsPage from '@/pages/AnalyticsPage';
import GuidesPage from '@/pages/GuidesPage';
import GuideDashboard from '@/pages/GuideDashboard';
import MarketplacePage from '@/pages/MarketplacePage';
import { useAppData } from '@/lib/useAppData';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { syncMasterData } from '@/lib/gsheetSync';
import { syncFromBokun } from '@/lib/bokunSync';

export type View = 'dashboard' | 'simulator' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'blog' | 'settings' | 'today' | 'executive' | 'analytics' | 'guides' | 'guide-dashboard' | 'marketplace';

const AppLayout = () => {
  const { user, profile } = useAuth();
  const {
    data,
    addProduct,
    deleteProduct,
    updateProduct,
    addOption,
    deleteOption,
    updateOption,
    addChannel,
    deleteChannel,
    addTicket,
    deleteTicket,
    addGuide,
    deleteGuide,
    addExtraCost,
    deleteExtraCost,
    addTier,
    deleteTier,
    updateBucketCount,
    updateAgeBuckets,
  } = useAppData();

  const [view, setView] = useState<View>('executive'); 

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/guides')) setView('guides');
    else if (path.includes('/guide-dashboard')) setView('guide-dashboard');
    else if (path.includes('/marketplace')) setView('marketplace');
    else if (path.includes('/today')) setView('today');
    else if (path.includes('/ledger')) setView('ledger');
    else if (path.includes('/admin-costs')) setView('admin-costs');
    else if (path.includes('/analytics')) setView('analytics');
    else if (path.includes('/settings')) setView('settings');
    else if (path.includes('/products')) setView('products');
  }, []);

  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);

  // FIX 1: Lift state
  const [bookings, setBookings] = useState<any[]>([]);
  const [adminCosts, setAdminCosts] = useState<any[]>([]);
  const [bookingsLoaded, setBookingsLoaded] = useState(false);
  const [adminCostsLoaded, setAdminCostsLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;

    if (!bookingsLoaded) {
      supabase.from('bookings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
        if (data) setBookings(data);
        setBookingsLoaded(true);
      });
    }

    if (!adminCostsLoaded) {
      supabase.from('admin_costs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
        if (data) setAdminCosts(data);
        setAdminCostsLoaded(true);
      });
    }
  }, [user, bookingsLoaded, adminCostsLoaded]);

  // AUTO SYNC LOGIC
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const int = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(int);
  }, []);

  useEffect(() => {
    let intervalId: any;

    const checkSync = () => {
      if (intervalId) clearInterval(intervalId);
      
      // Use profile data if available, otherwise fallback to false
      const enabled = profile?.autosync_enabled ?? false;
      if (!enabled) return;
      
      const intervalMs = parseInt(profile?.autosync_interval || '1800000', 10);
      intervalId = setInterval(async () => {
        if (!user || !profile) return;
        
        // Sources could still be in localStorage or we can just default to gsheet
        // Plan didn't explicitly mention moving 'sources' to profile, but let's be safe.
        // I'll keep sources in localStorage for now since it's less sensitive, 
        // OR I can just assume gsheet if missing.
        const sources = JSON.parse(localStorage.getItem('aurelia_autosync_sources') || '["gsheet"]');
        let syncedAtLeastOne = false;

        try {
          // Google Sheets
          if (sources.includes('gsheet')) {
            const sheetId = profile.gsheet_id;
            if (sheetId) {
              await syncMasterData(sheetId, user.id, supabase);
              syncedAtLeastOne = true;
            }
          }

          // Bokun API
          if (sources.includes('bokun')) {
            const access = profile.bokun_access_key;
            const secret = profile.bokun_secret_key;
            if (access && secret) {
              const d = new Date(); d.setDate(d.getDate() - 90);
              const startStr = d.toISOString().split('T')[0];
              const endStr = new Date().toISOString().split('T')[0];
              await syncFromBokun(access, secret, user.id, supabase, startStr, endStr);
              syncedAtLeastOne = true;
            }
          }

          if (syncedAtLeastOne) {
            setLastSynced(Date.now());
            setBookingsLoaded(false); 
          }
        } catch (e) {
          console.error('Auto sync failed:', e);
        }
      }, intervalMs);
    };

    checkSync();
    window.addEventListener('autosync_changed', checkSync);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('autosync_changed', checkSync);
    };
  }, [user]);

  const handleEditOption = (optionId: string, channelIdx?: number) => {
    setActiveOptionId(optionId);
    setActiveChannelIdx(channelIdx ?? 0);
    setView('editor');
  };

  const handleNewProduct = () => {
    const name = prompt('Product name:');
    if (name?.trim()) {
      addProduct(name.trim());
      setView('products');
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <AureliaSidebar
        activeView={view}
        companyName={data.companyName}
        onNavigate={setView}
        onNewProduct={handleNewProduct}
      />

      <main className="flex-1 ml-[240px]">
        {view === 'simulator' && (
          <Dashboard
            data={data}
            onEditOption={handleEditOption}
            updateBucketCount={updateBucketCount}
            updateAgeBuckets={updateAgeBuckets}
          />
        )}
        {view === 'products' && (
          <ProductsPage
            data={data}
            onAddProduct={addProduct}
            onDeleteProduct={deleteProduct}
            onAddOption={addOption}
            onDeleteOption={deleteOption}
            onAddChannel={addChannel}
            onEditOption={handleEditOption}
            updateProduct={updateProduct}
          />
        )}
        {view === 'editor' && activeOptionId && (
          <OptionEditor
            data={data}
            optionId={activeOptionId}
            initialChannelIdx={activeChannelIdx}
            onBack={() => setView('simulator')}
            updateOption={updateOption}
            addTicket={addTicket}
            deleteTicket={deleteTicket}
            addGuide={addGuide}
            deleteGuide={deleteGuide}
            addExtraCost={addExtraCost}
            deleteExtraCost={deleteExtraCost}
            addTier={addTier}
            deleteTier={deleteTier}
            addChannel={addChannel}
            deleteChannel={deleteChannel}
          />
        )}
        {view === 'ledger' && (
          <LedgerPage 
            bookings={bookings} 
            setBookings={setBookings} 
            onSync={() => setBookingsLoaded(false)} 
            bookingsLoaded={bookingsLoaded}
          />
        )}
        {view === 'admin-costs' && (
          <AdminCostsPage 
            costs={adminCosts} 
            setCosts={setAdminCosts} 
            onSync={() => setAdminCostsLoaded(false)} 
            costsLoaded={adminCostsLoaded}
          />
        )}
        {view === 'today' && <TodayToursPage />}
        {view === 'executive' && <ExecutiveDashboard />}
        {view === 'analytics' && <AnalyticsPage />}
        {view === 'settings' && <SettingsPage />}
        {view === 'guides' && <GuidesPage />}
        {view === 'guide-dashboard' && <GuideDashboard />}
        {view === 'marketplace' && <MarketplacePage />}
      </main>

      {lastSynced && (
        <div className="fixed bottom-[72px] left-6 text-[10px] text-muted-foreground z-50 pointer-events-none font-medium opacity-80 animate-fade-in">
          Last synced: {Math.floor((now - lastSynced) / 60000)} mins ago
        </div>
      )}
    </div>
  );
};

export default AppLayout;
