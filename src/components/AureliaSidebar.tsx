import { LayoutDashboard, Package, Plus, BookOpen, Wallet, Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, Profile } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

type View = 'dashboard' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'settings';

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

function TrialStatusPill({ profile }: { profile: Profile | null }) {
  const navigate = useNavigate();

  if (!profile || profile.subscription_status !== 'trial') return null;

  const trialStart = new Date(profile.trial_start);
  const now = new Date();
  const daysSinceStart = Math.floor(
    (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysLeft = 14 - daysSinceStart;

  if (daysLeft <= 0) {
    navigate('/pricing');
    return null;
  }

  if (daysLeft <= 3) {
    return (
      <button
        onClick={() => navigate('/pricing')}
        className="w-full text-left px-4 py-2.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors"
      >
        ⚠ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left — Subscribe
      </button>
    );
  }

  return (
    <div className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#f5a623]/8 border border-[#f5a623]/15 text-[#f5a623]">
      ✦ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
    </div>
  );
}

export default function AureliaSidebar({ activeView, companyName, onNavigate, onNewProduct }: AureliaSidebarProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

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
          icon={BookOpen}
          label="Ledger"
          active={activeView === 'ledger'}
          onClick={() => onNavigate('ledger')}
        />
        <SidebarItem
          icon={Wallet}
          label="Admin Costs"
          active={activeView === 'admin-costs'}
          onClick={() => onNavigate('admin-costs')}
        />
        <SidebarItem
          icon={Plus}
          label="New Product"
          active={false}
          onClick={onNewProduct}
        />

        <div className="my-3 mx-4 border-t border-border/30" />

        <SidebarItem
          icon={Settings}
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-border/30 space-y-2">
        {/* Trial status */}
        <TrialStatusPill profile={profile} />

        {/* User info */}
        <div className="px-4 py-2">
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Company</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
            {profile?.company_name || companyName}
          </p>
          {user?.email && (
            <p className="text-[10px] text-muted-foreground/40 mt-0.5 truncate">
              {user.email}
            </p>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-all duration-200"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
