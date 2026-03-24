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
import { useAppData } from '@/lib/useAppData';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export type View = 'dashboard' | 'simulator' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'blog' | 'settings' | 'today' | 'executive' | 'analytics';

const AppLayout = () => {
  const { user } = useAuth();
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

  const [view, setView] = useState<View>('executive'); // Default is now Executive Dashboard
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
      </main>
    </div>
  );
};

export default AppLayout;
