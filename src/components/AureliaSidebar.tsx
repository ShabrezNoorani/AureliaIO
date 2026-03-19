import { LayoutDashboard, Package, Plus, Settings } from 'lucide-react';

type View = 'dashboard' | 'products' | 'editor';

interface AureliaSidebarProps {
  activeView: View;
  companyName: string;
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
    <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
    <span>{label}</span>
  </button>
);

export default function AureliaSidebar({ activeView, companyName, onNavigate, onNewProduct }: AureliaSidebarProps) {
  return (
    <aside className="w-[240px] bg-sidebar-bg flex flex-col fixed h-full z-50 border-r border-border/50">
      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <h1 className="text-xl font-black tracking-wider text-gold uppercase">
          Aurelia
        </h1>
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground mt-0.5">
          Pricing Intelligence
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
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

      {/* Bottom section */}
      <div className="p-3 border-t border-border/30 space-y-0.5">
        <SidebarItem
          icon={Settings}
          label="Settings"
          active={false}
          onClick={() => {}}
        />
        <div className="px-4 py-2">
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Company</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5 truncate">{companyName}</p>
        </div>
      </div>
    </aside>
  );
}
