import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  company_name: string;
  trial_start: string;
  subscription_status: 'trial' | 'active' | 'expired';
  promo_code_used?: string;
  gsheet_id?: string;
  autosync_enabled?: boolean;
  autosync_interval?: number;
  bokun_access_key?: string;
  bokun_secret_key?: string;
  checkin_token?: string;
}

export type UserRole = 'owner' | 'guide' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole;
  guideId: string | null;
  guideName: string | null;
  // The owner's user_id that this guide belongs to — required to scope every
  // guide-facing query (bookings/guide_assignments/checkins are keyed by owner user_id).
  guideUserId: string | null;
  loading: boolean;
  setLoading: (l: boolean) => void;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  role: null,
  guideId: null,
  guideName: null,
  guideUserId: null,
  loading: true,
  setLoading: () => {},
  refreshProfile: async () => {},
  signIn: async () => ({}),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [guideName, setGuideName] = useState<string | null>(null);
  const [guideUserId, setGuideUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Guards every setState below against firing after the provider has unmounted.
  const mountedRef = useRef(true);
  // Tracks which user id profile/role have already been hydrated for, so a repeat auth event
  // for the SAME user (token refresh, tab-refocus re-announcement) never re-triggers a fetch.
  const hydratedUserIdRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const timeoutPromise = new Promise<{data: null, error: null}>(
        (resolve) => setTimeout(
          () => resolve({ data: null, error: null }),
          3000
        )
      );

      const { data, error } = await Promise.race([
        profilePromise,
        timeoutPromise
      ]);

      if (!mountedRef.current) return;

      if (data) {
        setProfile(data as Profile);
      } else {
        setProfile({
          id: userId,
          company_name: 'My Company',
          subscription_status: 'active',
          trial_start: new Date().toISOString()
        });
      }
    } catch(e) {
      console.error('Profile fetch failed:', e);
      if (!mountedRef.current) return;
      setProfile({
        id: userId,
        company_name: 'My Company',
        subscription_status: 'active',
        trial_start: new Date().toISOString()
      });
    }
  }, []);

  // A guide row belongs to a real guide only when auth_user_id = this user AND user_id
  // (the owning company) is someone else. A guide row's user_id is always the owner's id,
  // so if an owner ever claims their own guide row, auth_user_id = user_id = themselves —
  // excluding that case here is what keeps an owner from being misclassified as a guide.
  const fetchRole = useCallback(async (userId: string) => {
    try {
      const lookupGuideRow = () => supabase
        .from('guides')
        .select('id, name, user_id')
        .eq('auth_user_id', userId)
        .neq('user_id', userId)
        .maybeSingle();

      // Same 3s-timeout-race pattern as fetchProfile — a stalled request (e.g. right after a
      // backgrounded tab resumes) must never be able to hang this forever.
      const timeoutPromise = () => new Promise<{ data: null; error: null }>(
        (resolve) => setTimeout(
          () => resolve({ data: null, error: null }),
          3000
        )
      );

      let { data, error } = await Promise.race([lookupGuideRow(), timeoutPromise()]);

      if (error) throw error;
      if (!mountedRef.current) return;

      // Safety net: a guide whose claim was interrupted (e.g. email confirmation was required,
      // so no session existed yet when claim_guide_account() needed to run) can log in fine —
      // their auth.users row exists — but their guides row is still unlinked. On first login
      // with no direct match, try the email-based repair RPC once before concluding "owner".
      if (!data) {
        const { data: repaired, error: repairError } = await supabase.rpc('repair_guide_claim');
        // Never let a failed repair attempt (e.g. the RPC missing because the migration hasn't
        // been applied yet) silently fall through to "owner" without a trace — that's exactly how
        // this went unnoticed before.
        if (repairError) console.error('repair_guide_claim failed:', repairError);
        if (repaired) {
          const retry = await Promise.race([lookupGuideRow(), timeoutPromise()]);
          if (!mountedRef.current) return;
          data = retry.data;
        }
      }

      if (data) {
        setRole('guide');
        setGuideId(data.id);
        setGuideName(data.name);
        setGuideUserId(data.user_id);
      } else {
        setRole('owner');
        setGuideId(null);
        setGuideName(null);
        setGuideUserId(null);
      }
    } catch (e) {
      console.error('Role lookup failed, defaulting to owner:', e);
      if (!mountedRef.current) return;
      setRole('owner');
      setGuideId(null);
      setGuideName(null);
      setGuideUserId(null);
    }
  }, []);

  // Resolves profile + role together so routing never has to guess (and flash the wrong shell)
  // before both are known. This is the ONLY place loading is ever set back to false, and the
  // finally guarantees that happens no matter what — fetchProfile/fetchRole already can't hang
  // (each races a 3s timeout) or throw (each catches internally), but this is the backstop.
  const hydrateUser = useCallback(async (userId: string) => {
    try {
      await Promise.all([fetchProfile(userId), fetchRole(userId)]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetchProfile, fetchRole]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        return { error: authError.message };
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        // Mark hydrated up front — supabase fires its own SIGNED_IN event right after this
        // resolves, and it must see this and skip re-hydrating instead of doing it twice.
        hydratedUserIdRef.current = data.session.user.id;
        await hydrateUser(data.session.user.id);
      }

      return {};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { error: message };
    }
  }, [hydrateUser]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();

    // Clear ALL app-related localStorage
    const keysToRemove = [
      'aurelia_v3',
      'aurelia_buckets_v3',
      'aurelia_marketplace',
      'aurelia_autosync_enabled',
      'aurelia_autosync_interval',
      'aurelia_autosync_sources',
      'aurelia_bokun_access',
      'aurelia_bokun_secret',
      'checkin_guide_id',
      'checkin_guide_name',
      'checkin_user_id',
      'aurelia_default_margin',
      'aurelia_default_tax',
      'aurelia_default_currency'
    ];

    keysToRemove.forEach(key => localStorage.removeItem(key));

    hydratedUserIdRef.current = null;
    setProfile(null);
    setUser(null);
    setSession(null);
    setRole(null);
    setGuideId(null);
    setGuideName(null);
    setGuideUserId(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mountedRef.current) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      const initialUserId = initialSession?.user?.id ?? null;
      if (initialUserId) {
        // The ONLY hydrate that's allowed to gate the app's full-screen loading state.
        hydratedUserIdRef.current = initialUserId;
        await hydrateUser(initialUserId);
      } else if (mountedRef.current) {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mountedRef.current) return;

        const nextUser = newSession?.user ?? null;

        setSession(newSession);
        // Keep the `user` object reference stable when nothing about the account actually
        // changed (same id, same updated_at). Supabase hands back a brand-new object on every
        // event — including a plain TOKEN_REFRESHED on tab refocus — even when nothing changed,
        // and several pages key their own data-loading effects off `user` by reference; without
        // this, every refocus would spuriously re-trigger those loads (and if one of them ever
        // hangs mid-fetch, the page it gates is stuck behind its own spinner forever).
        setUser(prev => (
          prev && nextUser && prev.id === nextUser.id && prev.updated_at === nextUser.updated_at
        ) ? prev : nextUser);

        const newUserId = nextUser?.id ?? null;

        if (!newUserId) {
          // Signed out.
          hydratedUserIdRef.current = null;
          setProfile(null);
          setRole(null);
          setGuideId(null);
          setGuideName(null);
          setGuideUserId(null);
          setLoading(false);
          return;
        }

        // Repeat event for a user we've already hydrated (TOKEN_REFRESHED, a SIGNED_IN
        // re-announced on refocus, USER_UPDATED) — session/user are already fresh above, role
        // never changed, and loading must NOT be touched: it only ever gates the initial load.
        if (hydratedUserIdRef.current === newUserId) return;

        hydratedUserIdRef.current = newUserId;
        await hydrateUser(newUserId);
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [hydrateUser]);

  return (
    <AuthContext.Provider value={{ user, session, profile, role, guideId, guideName, guideUserId, loading, setLoading, refreshProfile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
