import { useState } from 'react';
import AureliaSidebar from '@/components/AureliaSidebar';
import Dashboard from '@/components/Dashboard';
import ProductsPage from '@/components/ProductsPage';
import OptionEditor from '@/components/OptionEditor';
import { useAppData } from '@/lib/useAppData';

type View = 'dashboard' | 'products' | 'editor';

const AppLayout = () => {
  const {
    data,
    addProduct,
    deleteProduct,
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

  const [view, setView] = useState<View>('dashboard');
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);

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
        {view === 'dashboard' && (
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
          />
        )}
        {view === 'editor' && activeOptionId && (
          <OptionEditor
            data={data}
            optionId={activeOptionId}
            initialChannelIdx={activeChannelIdx}
            onBack={() => setView('dashboard')}
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
      </main>
    </div>
  );
};

export default AppLayout;
