import { useState, useEffect, useMemo } from 'react';
import { Menu } from 'lucide-react';
import AureliaSidebar from '@/components/AureliaSidebar';
import Dashboard from '@/components/Dashboard';
import ProductsPage from '@/components/ProductsPage';
import OptionEditor from '@/components/OptionEditor';
import LedgerPage from '@/components/LedgerPage';
import AdminCostsPage from '@/components/AdminCostsPage';
import SettingsPage from '@/components/SettingsPage';
import TodayToursPage from '@/pages/TodayToursPage';
import DispatchPage from '@/pages/DispatchPage';
import ExecutiveDashboard from '@/pages/ExecutiveDashboard';
import AnalyticsPage from '@/pages/AnalyticsPage';
import GuidesPage from '@/pages/GuidesPage';
import GuideDashboard from '@/pages/GuideDashboard';
import MarketplacePage from '@/pages/MarketplacePage';
import ChangeLogPage from '@/pages/ChangeLogPage';
import { useAppData } from '@/lib/useAppData';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { syncMasterData } from '@/lib/gsheetSync';
import { syncFromBokun } from '@/lib/bokunSync';
import { localDateStr } from '@/lib/utils';

export type View = 'dashboard' | 'simulator' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'blog' | 'settings' | 'today' | 'dispatch' | 'executive' | 'analytics' | 'guides' | 'guide-dashboard' | 'marketplace' | 'changelog';

const AppLayout = () => {
  const { user, profile } = useAuth();
  const {
    data,
    loading: appDataLoading,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/guides')) setView('guides');
    else if (path.includes('/guide-dashboard')) setView('guide-dashboard');
    else if (path.includes('/marketplace')) setView('marketplace');
    else if (path.includes('/today')) setView('today');
    else if (path.includes('/dispatch')) setView('dispatch');
    else if (path.includes('/ledger')) setView('ledger');
    else if (path.includes('/admin-costs')) setView('admin-costs');
    else if (path.includes('/analytics')) setView('analytics');
    else if (path.includes('/settings')) setView('settings');
    else if (path.includes('/products')) setView('products');
    else if (path.includes('/changelog')) setView('changelog');
  }, []);

  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);

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

  // NEW-BOOKING BADGE
  // bookings.created_at is the per-row timestamp that already exists on the table — a sync
  // upsert never touches it on existing rows, so it only advances when a booking is genuinely
  // new. "Last seen" itself has no natural database home (it's per-owner UI state, not sheet
  // data), so it's tracked in localStorage instead of adding a column.
  const [lastSeenBookingsAt, setLastSeenBookingsAt] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    const key = `aurelia_bookings_last_seen_${user.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      setLastSeenBookingsAt(parseInt(stored, 10) || 0);
    } else {
      // First time this ships for this owner: treat everything that already exists as seen,
      // rather than surfacing their entire existing booking history as "new".
      const now = Date.now();
      localStorage.setItem(key, String(now));
      setLastSeenBookingsAt(now);
    }
  }, [user]);

  useEffect(() => {
    if (view !== 'ledger' || !user) return;
    const now = Date.now();
    localStorage.setItem(`aurelia_bookings_last_seen_${user.id}`, String(now));
    setLastSeenBookingsAt(now);
  }, [view, user]);

  const newBookingsCount = useMemo(() => {
    if (!lastSeenBookingsAt) return 0;
    return bookings.filter(b => b.created_at && new Date(b.created_at).getTime() > lastSeenBookingsAt).length;
  }, [bookings, lastSeenBookingsAt]);

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
      
      const enabled = profile?.autosync_enabled ?? false;
      if (!enabled) return;
      
      const intervalMs = profile?.autosync_interval || 1800000;
      intervalId = setInterval(async () => {
        if (!user || !profile) return;
        
        const sources = JSON.parse(localStorage.getItem('aurelia_autosync_sources') || '["gsheet"]');
        let syncedAtLeastOne = false;

        try {
          if (sources.includes('gsheet')) {
            const sheetId = profile.gsheet_id;
            if (sheetId) {
              await syncMasterData(sheetId, user.id, supabase);
              syncedAtLeastOne = true;
            }
          }

          if (sources.includes('bokun')) {
            if (profile.bokun_access_key && profile.bokun_secret_key) {
              const d = new Date(); d.setDate(d.getDate() - 90);
              const startStr = localDateStr(d);
              const endStr = localDateStr();
              await syncFromBokun(supabase, user.id, startStr, endStr);
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
  }, [user, profile]);

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

  if (appDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 p-2.5 rounded-lg border shadow-lg"
        style={{ backgroundColor: 'hsl(var(--theme-sidebar))', borderColor: 'hsl(var(--theme-border))', color: 'hsl(var(--theme-text))' }}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <AureliaSidebar
        activeView={view}
        companyName={data.companyName}
        onNavigate={setView}
        onNewProduct={handleNewProduct}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        newBookingsCount={newBookingsCount}
      />

      <main className="flex-1 min-w-0 ml-0 md:ml-[240px]">
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
        {view === 'dispatch' && <DispatchPage />}
        {view === 'executive' && <ExecutiveDashboard />}
        {view === 'analytics' && <AnalyticsPage />}
        {view === 'settings' && <SettingsPage />}
        {view === 'guides' && <GuidesPage />}
        {view === 'guide-dashboard' && <GuideDashboard />}
        {view === 'marketplace' && <MarketplacePage />}
        {view === 'changelog' && <ChangeLogPage />}
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
