import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const LOADING_TIMEOUT_MS = 5000;

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: if loading for >5s, stop waiting
  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const effectiveLoading = loading && !timedOut;

  // While loading → show spinner (never redirect)
  if (effectiveLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // Only redirect if loading is definitely done AND no session
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Check trial expiration
  if (profile && profile.subscription_status === 'trial') {
    const trialStart = new Date(profile.trial_start);
    const now = new Date();
    const daysSinceStart = Math.floor(
      (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysLeft = 14 - daysSinceStart;

    if (daysLeft <= 0) {
      return <Navigate to="/pricing" replace />;
    }
  }

  return <>{children}</>;
}
