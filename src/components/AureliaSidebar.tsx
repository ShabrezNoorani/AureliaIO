import { LayoutDashboard, Package, Plus, Settings } from 'lucide-react';

type View = 'dashboard' | 'products' | 'editor';

interface AureliaSidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  onNewProduct: () => void;
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={`aurelia-sidebar-item ${active ? 'aurelia-sidebar-item-active' : 'aurelia-sidebar-item-inactive'}`}
  >
    <Icon size={18} strokeWidth={active ? 2.5 : 2} />
    <span>{label}</span>
  </button>
);

export default function AureliaSidebar({ activeView, onNavigate, onNewProduct }: AureliaSidebarProps) {
  return (
    <aside className="w-64 bg-sidebar-bg flex flex-col fixed h-full z-50">
      <div className="p-8">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center font-black text-primary-foreground italic text-sm">
            A
          </div>
          <span className="font-bold tracking-tighter text-xl uppercase text-gold">
            Aurelia
          </span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        <SidebarItem
          icon={LayoutDashboard}
          label="Dashboard"
          active={activeView === 'dashboard'}
          onClick={() => onNavigate('dashboard')}
        />
        <SidebarItem
          icon={Package}
          label="Products"
          active={activeView === 'products'}
          onClick={() => onNavigate('products')}
        />
        <SidebarItem
          icon={Plus}
          label="New Product"
          active={false}
          onClick={onNewProduct}
        />
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <SidebarItem icon={Settings} label="Settings" active={false} onClick={() => {}} />
      </div>
    </aside>
  );
}
