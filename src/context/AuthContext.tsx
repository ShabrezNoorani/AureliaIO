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
  // Gates every authenticated route (see ProtectedRoute) until role has been definitively
  // resolved. Deliberately NOT exposed as a setter — the only way this becomes false is via
  // AuthProvider's own internal resolution flow, which is fail-closed and timeout-guarded at
  // every step. An externally-callable setter here previously let ProtectedRoute force this to
  // false on its own 3s timer, independent of whether role had actually resolved — that race was
  // the root cause of a guide occasionally rendering the owner shell.
  loading: boolean;
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

  // ── ROLE PRECEDENCE RULE (documented, deliberate) ──────────────────────────────────────────
  // A person can be BOTH a guide (linked to someone else's company via a guides row) AND an
  // owner (running their own company). This app has exactly one active role per session, so when
  // both are true, GUIDE WINS. This is not arbitrary:
  //   - "guide" is a POSITIVE fact: a guides row with auth_user_id = this user and
  //     user_id (the owner) <> this user only exists because some OTHER owner deliberately
  //     linked this account to their company.
  //   - "owner" has no equivalent positive signal anywhere in this schema — every authenticated
  //     user gets a profiles row (fetchProfile synthesizes a default one if none exists), so
  //     "owner" is really just "not proven to be a guide," the fallback when the guide check
  //     comes back empty.
  //   - A positive, externally-granted fact must always outrank an absence-of-evidence default,
  //     and the more restrictive shell (guide) is the safer one to land a dual-role account in.
  // The guide check therefore always runs FIRST and unconditionally decides the outcome; "owner"
  // is only ever reached once the guide check has positively, successfully concluded "no match".
  //
  // ── FAIL-CLOSED POLICY ──────────────────────────────────────────────────────────────────────
  // role becomes 'owner' ONLY on a successful, positive "no guide row" result. Anything short of
  // that — a thrown error, an RPC failure, or simply not completing within the timeout — resolves
  // to 'guide' with no guideId (a locked-down, minimal shell), never 'owner'. Every async step
  // below is raced against a REJECTING timeout (not a resolving one) specifically so a timeout is
  // indistinguishable from any other failure and always flows into the same catch block: there is
  // exactly one way out to 'owner', and every other path — including ones that used to silently
  // default to 'owner' — now fails closed instead. This is what fixes a brand-new guide's first,
  // possibly slow/cold lookup from ever being misread as "no guide row found."
  const fetchRole = useCallback(async (userId: string) => {
    // Rejects (never resolves) after 3s. A rejecting timeout — instead of the previous pattern of
    // resolving to {data: null, error: null} — is the key fix: that old sentinel was
    // indistinguishable from a genuine "queried successfully, found nothing," so a slow-but-real
    // guide lookup that merely hadn't finished yet was read as proof of "not a guide" and
    // confidently (wrongly) concluded 'owner'.
    const timeout = () => new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('role lookup timed out')), 3000)
    );

    try {
      const lookupGuideRow = () => supabase
        .from('guides')
        .select('id, name, user_id')
        .eq('auth_user_id', userId)
        .neq('user_id', userId)
        .maybeSingle();

      let { data, error } = await Promise.race([lookupGuideRow(), timeout()]);

      if (error) throw error;
      if (!mountedRef.current) return;

      // Safety net: a guide whose claim was interrupted (e.g. email confirmation was required,
      // so no session existed yet when claim_guide_account() needed to run) can log in fine —
      // their auth.users row exists — but their guides row is still unlinked. On first login
      // with no direct match, try the email-based repair RPC once before concluding "owner".
      // This call previously had NO timeout guard at all — on nearly every login (any account
      // without an immediate guide-row match, i.e. every owner, every time) an unresponsive RPC
      // here would hang this promise forever, which — since hydrateUser's `finally` can only run
      // once this await settles — hung the app's loading spinner forever too.
      if (!data) {
        const { data: repaired, error: repairError } = await Promise.race([
          supabase.rpc('repair_guide_claim'),
          timeout(),
        ]);
        if (repairError) console.error('repair_guide_claim failed:', repairError);
        if (repaired) {
          const retry = await Promise.race([lookupGuideRow(), timeout()]);
          if (!mountedRef.current) return;
          data = retry.data;
        }
      }

      if (!mountedRef.current) return;

      if (data) {
        setRole('guide');
        setGuideId(data.id);
        setGuideName(data.name);
        setGuideUserId(data.user_id);
      } else {
        // Positively confirmed: no guide row links this account anywhere. See precedence-rule
        // comment above — absence of that positive fact is what "owner" means here.
        setRole('owner');
        setGuideId(null);
        setGuideName(null);
        setGuideUserId(null);
      }
    } catch (e) {
      console.error('Role lookup failed or timed out — failing closed to guide, never owner:', e);
      if (!mountedRef.current) return;
      setRole('guide');
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

    const bootstrapSession = async () => {
      let initialSession: Session | null = null;
      try {
        // getSession() can — rarely, but really — hang indefinitely (e.g. a stuck cross-tab
        // refresh-token lock, or a stalled network request while refreshing an expired token).
        // If it never settles, nothing downstream ever runs: `loading` stays true forever, which
        // is exactly the "spinner never clears until cookies are cleared" symptom this fixes —
        // clearing cookies/storage removes the stuck persisted session that was triggering the
        // hang. Racing it against a timeout guarantees this step always settles one way or another.
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 4000)
          ),
        ]);
        initialSession = result.data.session;
      } catch (e) {
        console.error('getSession failed:', e);
      }

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
      // Note: if getSession() above timed out on a session that genuinely exists, this branch
      // runs with initialSession = null and clears loading with no user signed in — but the
      // onAuthStateChange listener below is already subscribed by this point (registered
      // synchronously, right after this async function is kicked off) and will independently
      // receive Supabase's own INITIAL_SESSION/SIGNED_IN event with the real session moments
      // later, at which point hydratedUserIdRef is still unset and it hydrates correctly. Self-
      // healing, never a permanent false "logged out" — the alternative to a brief settle delay
      // is the infinite hang this whole block exists to prevent.
    };

    bootstrapSession();

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
    <AuthContext.Provider value={{ user, session, profile, role, guideId, guideName, guideUserId, loading, refreshProfile, signIn, signOut }}>
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
