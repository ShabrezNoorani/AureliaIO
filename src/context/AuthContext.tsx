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
  autosync_interval?: string;
  bokun_access_key?: string;
  bokun_secret_key?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
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
    } finally {
      setLoading(false);
    }
  }, []);

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
        setLoading(false);
        await fetchProfile(data.session.user.id);
      }

      return {};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { error: message };
    }
  }, [fetchProfile]);

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
      'gsheet_id',
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
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        await fetchProfile(initialSession.user.id);
      }
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        if (mounted) setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, setLoading, refreshProfile, signIn, signOut }}>
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
