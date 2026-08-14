import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
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
      const { data, error } = await supabase
        .from('guides')
        .select('id, name, user_id')
        .eq('auth_user_id', userId)
        .neq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

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
      setRole('owner');
      setGuideId(null);
      setGuideName(null);
      setGuideUserId(null);
    }
  }, []);

  // Resolves profile + role together so routing never has to guess (and flash the wrong shell)
  // before both are known — loading only clears once this settles.
  const hydrateUser = useCallback(async (userId: string) => {
    await Promise.all([fetchProfile(userId), fetchRole(userId)]);
    setLoading(false);
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

    setProfile(null);
    setUser(null);
    setSession(null);
    setRole(null);
    setGuideId(null);
    setGuideName(null);
    setGuideUserId(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        await hydrateUser(initialSession.user.id);
      } else if (mounted) {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await hydrateUser(newSession.user.id);
        } else {
          setProfile(null);
          setRole(null);
          setGuideId(null);
          setGuideName(null);
          setGuideUserId(null);
          if (mounted) setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
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
