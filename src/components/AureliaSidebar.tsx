import { useState } from 'react';
import { LayoutDashboard, Package, Plus, BookOpen, Wallet, Settings, LogOut, ChevronDown, ChevronRight, Home, TrendingUp, BarChart3, Palette, Calendar, Map, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, Profile } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';
import { getTheme, applyTheme, THEMES, ThemeName } from '@/lib/theme';

export type View = 'dashboard' | 'simulator' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'blog' | 'settings' | 'today' | 'executive' | 'analytics' | 'guides' | 'guide-dashboard' | 'marketplace';

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
  onClick?: () => void;
  disabled?: boolean;
  indent?: boolean;
  title?: string;
}

const SidebarItem = ({ icon: Icon, label, active, onClick, disabled, indent, title }: SidebarItemProps) => {
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
      <span>{label}</span>
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
    <div className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-[#f5a623]/8 border border-[#f5a623]/15 text-[#f5a623] mb-2">
      ✦ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
    </div>
  );
}

export default function AureliaSidebar({ activeView, companyName, onNavigate, onNewProduct }: AureliaSidebarProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [operationsExpanded, setOperationsExpanded] = useState(true);

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
    <aside className="w-[240px] flex flex-col fixed h-full z-50 border-r" style={{ backgroundColor: 'hsl(var(--theme-sidebar))', borderColor: 'hsl(var(--theme-border))' }}>
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
              <SidebarItem icon={Home} label="Home" active={activeView === 'executive'} onClick={() => onNavigate('executive')} indent />
              <SidebarItem icon={TrendingUp} label="Simulator" active={activeView === 'simulator'} onClick={() => onNavigate('simulator')} indent />
              <SidebarItem icon={BarChart3} label="Analytics" active={activeView === 'analytics'} onClick={() => onNavigate('analytics')} indent />
            </div>
          )}
        </div>

        <div className="my-2 mx-4 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />

        {/* SINGLE: PRODUCTS & PRICING */}
        <SidebarItem
          icon={Package}
          label="Products & Pricing"
          active={activeView === 'products' || activeView === 'editor'}
          onClick={() => onNavigate('products')}
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
              <SidebarItem icon={BookOpen} label="Financial Ledger" active={activeView === 'ledger'} onClick={() => onNavigate('ledger')} indent />
              <SidebarItem icon={Wallet} label="Admin Costs" active={activeView === 'admin-costs'} onClick={() => onNavigate('admin-costs')} indent />
              <SidebarItem icon={Calendar} label="Today's Tours" active={activeView === 'today'} onClick={() => onNavigate('today')} indent />
              <SidebarItem icon={Users} label="Guides" active={activeView === 'guides'} onClick={() => { onNavigate('guides'); navigate('/app/guides'); }} indent />
              <SidebarItem icon={BarChart3} label="Guide Dashboard" active={activeView === 'guide-dashboard'} onClick={() => { onNavigate('guide-dashboard'); navigate('/app/guide-dashboard'); }} indent />
              <SidebarItem icon={Map} label="Marketplace" active={activeView === 'marketplace'} onClick={() => { onNavigate('marketplace'); navigate('/app/marketplace'); }} indent />
            </div>
          )}
        </div>

        <div className="my-2 mx-4 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />

        {/* SINGLE: NEW PRODUCT */}
        <SidebarItem icon={Plus} label="New Product" active={false} onClick={onNewProduct} />
      </div>

      {/* Settings above bottom info */}
      <div className="px-3 pb-2 pt-2 border-t border-border/30">
        <SidebarItem
          icon={Settings}
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onNavigate('settings')}
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
  );
}
