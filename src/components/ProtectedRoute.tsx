import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  // When set, only a session whose resolved role matches is let through — a mismatched
  // role is redirected to their own home instead of the requested route.
  requiredRole?: 'owner' | 'guide';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { session, profile, role, loading } = useAuth();

  // No local failsafe timer here anymore — there used to be one that force-cleared `loading`
  // after 3s regardless of whether AuthContext had actually finished resolving role. That timer
  // raced AuthContext's OWN internal timeouts uncoordinated, and could win: `loading` would flip
  // to false while `role` was still null (unresolved), and the check below used to read
  // `requiredRole && role && role !== requiredRole` — with `role` null, `role &&` short-circuits
  // the whole condition to false, so NO redirect fired and `children` rendered unconditionally.
  // That is precisely how a guide could render the full owner shell: a slow role lookup racing
  // this timer and losing. AuthContext itself now guarantees `loading` only ever becomes false
  // once role has been fail-closed-resolved to something definite (every async step inside it is
  // raced against its own rejecting timeout), so no independent backstop is needed here — adding
  // one back would only reintroduce this exact race.
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // No `role &&` guard here (see above) — a null/unresolved role must redirect AWAY from the
  // protected route, never silently fall through to rendering `children`. In practice `role`
  // should never be null once `loading` is false (AuthContext fails closed to 'guide' rather than
  // ever leaving it unset), but this is the last line of defense: fail closed here too.
  if (requiredRole && role !== requiredRole) {
    if (role === 'owner') return <Navigate to="/app" replace />;
    if (role === 'guide') return <Navigate to="/guide" replace />;
    // role somehow still isn't resolved even though loading is false — never guess between
    // /app and /guide (either guess risks a redirect loop or leaking the wrong shell); bounce to
    // a neutral, safe page instead.
    return <Navigate to="/login" replace />;
  }

  if (role === 'owner' && profile && profile.subscription_status === 'trial') {
    const trialStart = new Date(profile.trial_start);
    const now = new Date();
    const daysSinceStart = Math.floor(
      (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (14 - daysSinceStart <= 0) {
      return <Navigate to="/pricing" replace />;
    }
  }

  return <>{children}</>;
}
