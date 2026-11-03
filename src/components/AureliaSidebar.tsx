import { useState, useEffect } from 'react';
import { LayoutDashboard, Package, Plus, BookOpen, Wallet, Settings, LogOut, ChevronDown, ChevronRight, Home, TrendingUp, BarChart3, Palette, Calendar, Map, Users, List, Activity, Euro, BarChart2, FileText, Menu, X, Database, ShoppingCart, Send, LineChart, PanelLeftClose, PanelLeftOpen, Trophy, MapPin, Sparkles, Radar, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth, Profile } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';
import BetaBadge from '@/components/BetaBadge';
import { getTheme, applyTheme, THEMES, ThemeName } from '@/lib/theme';

/** AQUILA (market intelligence) — a separate app, opened in a new tab. This sidebar is owner-only
    (rendered solely by AppLayout, behind ProtectedRoute requiredRole="owner"). */
const AQUILA_URL = 'https://aquila.aureliaio.com';
const openAquila = () => window.open(AQUILA_URL, '_blank', 'noopener,noreferrer');
/** FABULA (guide-training scripts) — a separate companion app, opened in a new tab. */
const FABULA_URL = 'https://fabula.aureliaio.com';
const openFabula = () => window.open(FABULA_URL, '_blank', 'noopener,noreferrer');

export type View = 'dashboard' | 'simulator' | 'products' | 'editor' | 'ledger' | 'admin-costs' | 'blog' | 'settings' | 'today' | 'live' | 'dispatch' | 'executive' | 'analytics' | 'breakdown-pnl' | 'guides' | 'guide-dashboard' | 'leaderboard' | 'marketplace' | 'changelog' | 'meeting-points' | 'ai-insights';

interface AureliaSidebarProps {
  activeView: View;
  companyName: string;
  onNavigate: (view: View) => void;
  onNewProduct: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  newBookingsCount?: number;
  /** Desktop-only icon-rail mode — mobile always shows the full sidebar regardless of this, since
      mobile already has its own show/hide via `mobileOpen`. Both the collapsed state and its
      localStorage persistence live in AppLayout (it also needs the value, to size <main>'s
      margin), so this component is purely controlled. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
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
  /** Icon-only: hides the label and shows it as a title tooltip instead, centers the icon, and
      swaps the numbered badge pill for a small dot (a count wouldn't fit next to nothing). */
  collapsed?: boolean;
  /** Marks a companion app still in beta — a muted "Beta" pill (a tiny "β" in the icon rail). */
  beta?: boolean;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  badge?: number;
  beta?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  /** Header icon only (the items keep their own icons). */
  icon: React.ElementType;
  items: NavItem[];
}

const SidebarItem = ({ icon: Icon, label, active, onClick, disabled, indent, title, badge, collapsed, beta }: SidebarItemProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const baseClasses = collapsed
    ? 'w-full relative flex items-center justify-center py-3 rounded-lg transition-all duration-200 font-medium'
    : `w-full flex items-center space-x-3 py-2.5 rounded-lg transition-all duration-200 font-medium ${indent ? 'pl-[28px] pr-4 text-[12px]' : 'px-4 text-sm'}`;

  const activeBg = 'hsl(var(--theme-accent) / 0.15)';
  const activeColor = 'hsl(var(--theme-accent))';
  const inactiveColor = 'hsl(var(--theme-text-sec))';
  const hoverColor = 'hsl(var(--theme-text))';

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={collapsed ? (beta ? `${label} (Beta)` : label) : (disabled && title ? title : undefined)}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => !disabled && setIsHovered(false)}
      className={`${baseClasses} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      style={{
        backgroundColor: active ? activeBg : (isHovered && !disabled ? 'rgba(255,255,255,0.05)' : 'transparent'),
        borderLeft: collapsed ? 'none' : (active ? `3px solid ${activeColor}` : '3px solid transparent'),
        color: active ? activeColor : (isHovered && !disabled ? hoverColor : inactiveColor)
      }}
    >
      <Icon size={collapsed ? 20 : (indent ? 16 : 18)} strokeWidth={active ? 2.5 : 1.8} />
      {!collapsed && <span className="flex-1 min-w-0 text-left truncate">{label}</span>}
      {beta && (
        collapsed ? (
          <span
            aria-hidden
            className="absolute top-1 right-2 text-[9px] font-semibold leading-none"
            style={{ color: 'hsl(var(--theme-text-sec))', opacity: 0.7 }}
          >
            β
          </span>
        ) : (
          <BetaBadge />
        )
      )}
      {!!badge && badge > 0 && (
        collapsed ? (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ backgroundColor: 'hsl(var(--theme-accent))' }}
          />
        ) : (
          <span
            className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-sidebar))' }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )
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
        className="w-full text-left px-4 py-2.5 rounded-lg text-xs font-semibold bg-red-600/10 border border-red-600/20 text-red-700 hover:bg-red-600/15 transition-colors mb-2"
      >
        ⚠ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left — Subscribe
      </button>
    );
  }

  return (
    <div className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-muted border border-border text-foreground mb-2">
      ✦ Trial: {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
    </div>
  );
}

export default function AureliaSidebar({
  activeView, companyName, onNavigate, onNewProduct,
  mobileOpen = false, onCloseMobile = () => {}, newBookingsCount = 0,
  collapsed = false, onToggleCollapsed = () => {},
}: AureliaSidebarProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Every group starts expanded; a header tap toggles just that group.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) => setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // `collapsed` is a desktop-only concept — mobile always shows the full sidebar (it already has
  // its own show/hide via mobileOpen). Tracks the md breakpoint live so resizing/rotating a window
  // past it immediately falls back to the full mobile layout, never a half-collapsed one.
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  ));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const iconOnly = collapsed && isDesktop;

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

  // The single definition of the owner nav — both the grouped view and the collapsed icon rail
  // render from this, so they always show the same items, in the same order, with the same handlers.
  const navGroups: NavGroup[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, items: [
      { label: 'Home', icon: Home, active: activeView === 'executive', onClick: () => handleNavigate('executive') },
    ] },
    { id: 'operations', label: 'Operations', icon: Calendar, items: [
      { label: "Today's Tours", icon: Calendar, active: activeView === 'today', onClick: () => handleNavigate('today') },
      { label: 'Live Board', icon: Activity, active: activeView === 'live', onClick: () => handleNavigate('live', '/app/live') },
      { label: 'Dispatch', icon: Send, active: activeView === 'dispatch', onClick: () => handleNavigate('dispatch', '/app/dispatch') },
      { label: 'Meeting Points', icon: MapPin, active: activeView === 'meeting-points', onClick: () => handleNavigate('meeting-points', '/app/meeting-points') },
    ] },
    { id: 'guides', label: 'Guides', icon: Users, items: [
      { label: 'Guides', icon: Users, active: activeView === 'guides', onClick: () => handleNavigate('guides', '/app/guides') },
      { label: 'Guide Dashboard', icon: BarChart3, active: activeView === 'guide-dashboard', onClick: () => handleNavigate('guide-dashboard', '/app/guide-dashboard') },
      { label: 'Leaderboard', icon: Trophy, active: activeView === 'leaderboard', onClick: () => handleNavigate('leaderboard', '/app/leaderboard') },
      { label: 'FABULA', icon: ScrollText, active: false, onClick: openFabula, beta: true },
    ] },
    { id: 'finance', label: 'Finance', icon: Wallet, items: [
      { label: 'Financial Ledger', icon: BookOpen, active: activeView === 'ledger', onClick: () => handleNavigate('ledger'), badge: newBookingsCount },
      { label: 'Admin Costs', icon: Wallet, active: activeView === 'admin-costs', onClick: () => handleNavigate('admin-costs') },
      { label: 'Breakdown P&L', icon: LineChart, active: activeView === 'breakdown-pnl', onClick: () => handleNavigate('breakdown-pnl', '/app/breakdown-pnl') },
    ] },
    { id: 'insights', label: 'Insights', icon: Sparkles, items: [
      { label: 'Analytics', icon: BarChart3, active: activeView === 'analytics', onClick: () => handleNavigate('analytics') },
      { label: 'Simulator', icon: TrendingUp, active: activeView === 'simulator', onClick: () => handleNavigate('simulator') },
      { label: 'AI Insights', icon: Sparkles, active: activeView === 'ai-insights', onClick: () => handleNavigate('ai-insights', '/app/ai-insights') },
      { label: 'AQUILA', icon: Radar, active: false, onClick: openAquila, beta: true },
    ] },
    { id: 'catalog', label: 'Catalog', icon: Package, items: [
      { label: 'Products & Pricing', icon: Package, active: activeView === 'products' || activeView === 'editor', onClick: () => handleNavigate('products') },
      { label: 'Marketplace', icon: Map, active: activeView === 'marketplace', onClick: () => handleNavigate('marketplace', '/app/marketplace') },
      { label: 'New Product', icon: Plus, active: false, onClick: () => { onNewProduct(); onCloseMobile(); } },
    ] },
  ];

  // SYSTEM — pinned to the bottom of the sidebar, below the scrolling groups.
  const systemItems: NavItem[] = [
    { label: 'Change Log', icon: List, active: activeView === 'changelog', onClick: () => handleNavigate('changelog', '/app/changelog') },
    { label: 'Settings', icon: Settings, active: activeView === 'settings', onClick: () => handleNavigate('settings') },
  ];

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
        className={`w-[240px] ${collapsed ? 'md:w-[80px]' : 'md:w-[240px]'} flex flex-col fixed h-full z-50 border-r transition-all duration-300 ease-in-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ backgroundColor: 'hsl(var(--theme-sidebar))', borderColor: 'hsl(var(--theme-border))' }}
      >
      {/* Mobile close button */}
      <button
        onClick={onCloseMobile}
        className="md:hidden absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Close menu"
      >
        <X size={18} />
      </button>

      {/* Logo + desktop collapse toggle */}
      <div className={`pt-8 pb-6 flex items-center ${iconOnly ? 'flex-col gap-3 px-3' : 'justify-between px-6'}`}>
        <Logo size="md" light iconOnly={iconOnly} />
        <button
          onClick={onToggleCollapsed}
          className="hidden md:flex p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-muted transition-colors shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4 aurelia-scrollbar">
        {iconOnly ? (
          /* Flat icon rail — every item, no group headers (no room for a label anyway), with a
             thin divider between groups. Same items, order and handlers as the grouped view. */
          <div className="flex flex-col space-y-0.5">
            {navGroups.map((group, gi) => (
              <div key={group.id} className="flex flex-col space-y-0.5">
                {gi > 0 && <div className="my-1.5 mx-3 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />}
                {group.items.map(item => (
                  <SidebarItem key={item.label} icon={item.icon} label={item.label} active={item.active} onClick={item.onClick} badge={item.badge} beta={item.beta} collapsed />
                ))}
              </div>
            ))}
          </div>
        ) : (
          navGroups.map((group, gi) => {
            const expanded = !collapsedGroups.has(group.id);
            return (
              <div key={group.id}>
                {gi > 0 && <div className="my-2 mx-4 border-t opacity-30" style={{ borderColor: 'hsl(var(--theme-border))' }} />}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-100 opacity-80"
                  style={{ color: 'hsl(var(--theme-text-sec))' }}
                >
                  <div className="flex items-center gap-2">
                    <group.icon size={14} />
                    <span>{group.label}</span>
                  </div>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {expanded && (
                  <div className="mt-1 flex flex-col space-y-0.5">
                    {group.items.map(item => (
                      <SidebarItem key={item.label} icon={item.icon} label={item.label} active={item.active} onClick={item.onClick} badge={item.badge} beta={item.beta} indent />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SYSTEM — Change Log + Settings, above the bottom info */}
      <div className="px-3 pb-2 pt-2 border-t border-border/30 flex flex-col space-y-0.5">
        {!iconOnly && (
          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider opacity-80" style={{ color: 'hsl(var(--theme-text-sec))' }}>
            System
          </div>
        )}
        {systemItems.map(item => (
          <SidebarItem key={item.label} icon={item.icon} label={item.label} active={item.active} onClick={item.onClick} collapsed={iconOnly} />
        ))}
      </div>

      {/* Bottom section */}
      <div className="p-3 border-t border-border/30">
        {!iconOnly && <TrialStatusPill profile={profile} />}

        {iconOnly ? (
          <div className="flex justify-center pb-2">
            <button
              onClick={cycleTheme}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-muted transition-colors"
              title={`Current Theme: ${currentThemeObj?.name}`}
            >
              <Palette size={16} />
            </button>
          </div>
        ) : (
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
              className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-muted transition-colors"
              title={`Current Theme: ${currentThemeObj?.name}`}
            >
              <Palette size={16} />
            </button>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`w-full flex items-center py-2.5 mt-2 rounded-lg text-sm font-medium text-red-700/70 hover:text-red-700 hover:bg-red-600/10 transition-all duration-200 ${iconOnly ? 'justify-center' : 'gap-3 px-4'}`}
          title={iconOnly ? 'Logout' : undefined}
        >
          <LogOut size={16} />
          {!iconOnly && <span>Logout</span>}
        </button>
      </div>
      </aside>
    </>
  );
}
