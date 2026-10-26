import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, CalendarCheck, User, Star, History, LogOut, Menu, X, Wallet, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Logo from '@/components/Logo';
import PullToRefreshChrome from '@/components/PullToRefreshChrome';
import GuideHome from './GuideHome';
import GuideCheckin from './GuideCheckin';
import GuideProfile from './GuideProfile';
import GuideReviews from './GuideReviews';
import GuideHistory from './GuideHistory';
import GuideEarningsOnly from './GuideEarningsOnly';
import { useGuideAccess } from '@/hooks/use-guide-access';

type GuideView = 'dashboard' | 'checkin' | 'profile' | 'reviews' | 'history';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm"
      style={{
        backgroundColor: active ? 'hsl(var(--theme-accent) / 0.15)' : 'transparent',
        borderLeft: active ? '3px solid hsl(var(--theme-accent))' : '3px solid transparent',
        color: active ? 'hsl(var(--theme-accent))' : 'hsl(var(--theme-text-sec))',
      }}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

export default function GuideLayout() {
  const { guideId, guideName, signOut } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<GuideView>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Inactive-guide gating (lib/guideAccountStatus.ts). Only applies once a guideId is resolved —
  // the fail-closed "no guideId" path keeps its existing handling inside GuideHome.
  const access = useGuideAccess(guideId);
  const limited = !!guideId && access?.kind === 'limited';

  // Past the 60-day window: sign out and land on /login with an "account closed" message.
  useEffect(() => {
    if (!guideId || access?.kind !== 'closed') return;
    (async () => {
      await signOut();
      navigate('/login', { replace: true, state: { accountClosed: true } });
    })();
  }, [guideId, access, signOut, navigate]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/guide/checkin')) setView('checkin');
    else if (path.includes('/guide/profile')) setView('profile');
    else if (path.includes('/guide/reviews')) setView('reviews');
    else if (path.includes('/guide/history')) setView('history');
    else setView('dashboard');
  }, []);

  const handleNavigate = (next: GuideView, path: string) => {
    setView(next);
    navigate(path);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (guideId && (access === null || access.kind === 'closed')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{access?.kind === 'closed' ? 'This account has been closed.' : 'Checking your account…'}</p>
        </div>
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

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`w-[240px] flex flex-col fixed h-full z-50 border-r transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ backgroundColor: 'hsl(var(--theme-sidebar))', borderColor: 'hsl(var(--theme-border))' }}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="md:hidden absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        <div className="px-6 pt-8 pb-6">
          <Logo size="md" light />
        </div>

        <div className="flex-1 overflow-y-auto px-3 space-y-1">
          {limited ? (
            <NavItem icon={Wallet} label="My Earnings" active onClick={() => handleNavigate('dashboard', '/guide')} />
          ) : (
            <>
              <NavItem icon={Home} label="Dashboard" active={view === 'dashboard'} onClick={() => handleNavigate('dashboard', '/guide')} />
              <NavItem icon={CalendarCheck} label="Today's Check-in" active={view === 'checkin'} onClick={() => handleNavigate('checkin', '/guide/checkin')} />
              <NavItem icon={User} label="My Profile" active={view === 'profile'} onClick={() => handleNavigate('profile', '/guide/profile')} />
              <NavItem icon={Star} label="My Reviews" active={view === 'reviews'} onClick={() => handleNavigate('reviews', '/guide/reviews')} />
              <NavItem icon={History} label="History" active={view === 'history'} onClick={() => handleNavigate('history', '/guide/history')} />
            </>
          )}
        </div>

        <div className="p-3 border-t border-border/30">
          <div className="px-4 py-2">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Guide</p>
            <p className="text-xs font-medium text-foreground mt-0.5 truncate">{guideName || 'Guide'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 mt-2 rounded-lg text-sm font-medium text-red-700/70 hover:text-red-700 hover:bg-red-600/8 transition-all duration-200"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 ml-0 md:ml-[240px]">
        {limited && access?.kind === 'limited' ? (
          <>
            {/* pt-16 on mobile clears the fixed menu button */}
            <div className="px-4 md:px-8 pt-16 md:pt-8 max-w-3xl mx-auto">
              <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-600/30 bg-amber-600/10 p-4 text-amber-700">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold">
                    Your account will be fully closed in {access.daysLeft} {access.daysLeft === 1 ? 'day' : 'days'}.
                  </p>
                  <p className="mt-0.5 opacity-80">
                    Your account is inactive. Until then you can still view your earnings and pay history. Contact your tour company to reactivate it.
                  </p>
                </div>
              </div>
            </div>
            <GuideEarningsOnly />
          </>
        ) : (
          <>
            {view === 'dashboard' && <GuideHome />}
            {view === 'checkin' && <GuideCheckin />}
            {view === 'profile' && <GuideProfile />}
            {view === 'reviews' && <GuideReviews />}
            {view === 'history' && <GuideHistory />}
          </>
        )}
      </main>
      <PullToRefreshChrome />
    </div>
  );
}
