import { useState } from 'react';
import { LayoutDashboard, Package, Plus, BookOpen, Wallet, Settings, LogOut, ChevronDown, ChevronRight, Home, TrendingUp, BarChart3, Palette, Calendar, Map, Users, List, Activity, Euro, BarChart2, FileText, Menu, X, Database, ShoppingCart, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, Profile } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';
import { getTheme, applyTheme, THEMES, ThemeName } from '@/lib/theme';

export type View = 'dashboard' | 'simulator' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'blog' | 'settings' | 'today' | 'dispatch' | 'executive' | 'analytics' | 'guides' | 'guide-dashboard' | 'marketplace' | 'changelog';

interface AureliaSidebarProps {
  activeView: View;
  companyName: string;
  onNavigate: (view: View) => void;
  onNewProduct: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  newBookingsCount?: number;
}

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  indent?: boolean;
  title?: string;
  badge?: number;
}

const SidebarItem = ({ icon: Icon, label, active, onClick, disabled, indent, title, badge }: SidebarItemProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const baseClasses = `w-full flex items-center space-x-3 py-2.5 rounded-lg transition-all duration-200 font-medium ${indent ? 'pl-[28px] pr-4 text-[12px]' : 'px-4 text-sm'}`;

  const activeBg = 'hsl(var(--theme-accent) / 0.15)';
  const activeColor = 'hsl(var(--theme-accent))';
  const inactiveColor = 'hsl(var(--theme-text-sec))';
  const hoverColor = 'hsl(var(--theme-text))';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled && title ? title : undefined}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => !disabled && setIsHovered(false)}
      className={`${baseClasses} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      style={{
        backgroundColor: active ? activeBg : (isHovered && !disabled ? 'rgba(255,255,255,0.05)' : 'transparent'),
        borderLeft: active ? `3px solid ${activeColor}` : '3px solid transparent',
        color: active ? activeColor : (isHovered && !disabled ? hoverColor : inactiveColor)
      }}
    >
      <Icon size={indent ? 16 : 18} strokeWidth={active ? 2.5 : 1.8} />
      <span className="flex-1 min-w-0 text-left truncate">{label}</span>
      {!!badge && badge > 0 && (
        <span
          className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-sidebar))' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
};

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
        className="w-full text-left px-4 py-2.5 rounded-lg text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors mb-2"
      >
        ⚠ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left — Subscribe
      </button>
    );
  }

  return (
    <div className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-white mb-2">
      ✦ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
    </div>
  );
}

export default function AureliaSidebar({ activeView, companyName, onNavigate, onNewProduct, mobileOpen = false, onCloseMobile = () => {}, newBookingsCount = 0 }: AureliaSidebarProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [operationsExpanded, setOperationsExpanded] = useState(true);

  const handleNavigate = (view: View, path?: string) => {
    onNavigate(view);
    if (path) navigate(path);
    onCloseMobile();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const cycleTheme = () => {
    const keys = Object.keys(THEMES) as ThemeName[];
    const current = getTheme();
    const idx = keys.indexOf(current);
    const nextIdx = (idx + 1) % keys.length;
    applyTheme(keys[nextIdx]);
  };

  const currentThemeObj = THEMES[getTheme()];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`w-[240px] flex flex-col fixed h-full z-50 border-r transition-transform duration-300 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ backgroundColor: 'hsl(var(--theme-sidebar))', borderColor: 'hsl(var(--theme-border))' }}
      >
      {/* Mobile close button */}
      <button
        onClick={onCloseMobile}
        className="md:hidden absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        aria-label="Close menu"
      >
        <X size={18} />
      </button>

      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <Logo size="md" />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4 aurelia-scrollbar">
        
        {/* GROUP 1: OVERVIEW */}
        <div>
          <button
            onClick={() => setOverviewExpanded(!overviewExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-100 opacity-80"
            style={{ color: 'hsl(var(--theme-text-sec))' }}
          >
            <div className="flex items-center gap-2">
              <LayoutDashboard size={14} />
              <span>Overview</span>
            </div>
            {overviewExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          
          {overviewExpanded && (
            <div className="mt-1 flex flex-col space-y-0.5">
              <SidebarItem icon={Home} label="Home" active={activeView === 'executive'} onClick={() => handleNavigate('executive')} indent />
              <SidebarItem icon={TrendingUp} label="Simulator" active={activeView === 'simulator'} onClick={() => handleNavigate('simulator')} indent />
              <SidebarItem icon={BarChart3} label="Analytics" active={activeView === 'analytics'} onClick={() => handleNavigate('analytics')} indent />
            </div>
          )}
        </div>

        <div className="my-2 mx-4 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />

        {/* SINGLE: PRODUCTS & PRICING */}
        <SidebarItem
          icon={Package}
          label="Products & Pricing"
          active={activeView === 'products' || activeView === 'editor'}
          onClick={() => handleNavigate('products')}
        />

        <div className="my-2 mx-4 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />

        {/* GROUP 2: OPERATIONS */}
        <div>
          <button
            onClick={() => setOperationsExpanded(!operationsExpanded)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-100 opacity-80"
            style={{ color: 'hsl(var(--theme-text-sec))' }}
          >
            <div className="flex items-center gap-2">
              <Wallet size={14} />
              <span>Operations</span>
            </div>
            {operationsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {operationsExpanded && (
            <div className="mt-1 flex flex-col space-y-0.5">
              <SidebarItem icon={BookOpen} label="Financial Ledger" active={activeView === 'ledger'} onClick={() => handleNavigate('ledger')} indent badge={newBookingsCount} />
              <SidebarItem icon={Wallet} label="Admin Costs" active={activeView === 'admin-costs'} onClick={() => handleNavigate('admin-costs')} indent />
              <SidebarItem icon={Calendar} label="Today's Tours" active={activeView === 'today'} onClick={() => handleNavigate('today')} indent />
              <SidebarItem icon={Send} label="Dispatch" active={activeView === 'dispatch'} onClick={() => handleNavigate('dispatch', '/app/dispatch')} indent />
              <SidebarItem icon={Users} label="Guides" active={activeView === 'guides'} onClick={() => handleNavigate('guides', '/app/guides')} indent />
               <SidebarItem icon={BarChart3} label="Guide Dashboard" active={activeView === 'guide-dashboard'} onClick={() => handleNavigate('guide-dashboard', '/app/guide-dashboard')} indent />
              <SidebarItem icon={Map} label="Marketplace" active={activeView === 'marketplace'} onClick={() => handleNavigate('marketplace', '/app/marketplace')} indent />
              <SidebarItem icon={List} label="Change Log" active={activeView === 'changelog'} onClick={() => handleNavigate('changelog', '/app/changelog')} indent />
            </div>
          )}
        </div>

        <div className="my-2 mx-4 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />

        {/* SINGLE: NEW PRODUCT */}
        <SidebarItem icon={Plus} label="New Product" active={false} onClick={() => { onNewProduct(); onCloseMobile(); }} />
      </div>

      {/* Settings above bottom info */}
      <div className="px-3 pb-2 pt-2 border-t border-border/30">
        <SidebarItem
          icon={Settings}
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => handleNavigate('settings')}
        />
      </div>

      {/* Bottom section */}
      <div className="p-3 border-t border-border/30">
        <TrialStatusPill profile={profile} />

        <div className="px-4 py-2 flex items-start justify-between">
          <div className="flex-1 truncate pr-2">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Company</p>
            <p className="text-xs font-medium text-foreground mt-0.5 truncate">
              {profile?.company_name || companyName}
            </p>
            {user?.email && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {user.email}
              </p>
            )}
          </div>
          
          {/* Theme Palette Toggle */}
          <button 
            onClick={cycleTheme}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-white/5 transition-colors"
            title={`Current Theme: ${currentThemeObj?.name}`}
          >
            <Palette size={16} />
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 mt-2 rounded-lg text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-all duration-200"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
      </aside>
    </>
  );
}
