import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

// Same fixed, self-contained palette as LoginPage.tsx/LandingPage.tsx/PricingPage.tsx.
const INK = '#1C1917';
const INK_SOFT = '#44403C';
const INK_MUTED = '#78716C';
const PAPER = '#F7F6F3';
const HAIRLINE = '#E5E1D8';
const GOLD = '#B45309';

const sharedInputStyle = { background: PAPER, border: `1px solid ${HAIRLINE}`, color: INK };

type Status = 'checking' | 'ready' | 'invalid' | 'success';

/**
 * Where the "Reset password" email's link lands (see resetPasswordForEmail's `redirectTo` in
 * LoginPage.tsx). Supabase's client parses its own recovery tokens out of the URL on load
 * (detectSessionInUrl, on by default) and fires a PASSWORD_RECOVERY auth event once that session
 * is established — this page just waits for that event (with a getSession() fallback, in case it
 * fired before this listener attached) before letting the user actually set a new password.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('checking');
  const [invalidReason, setInvalidReason] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // Mirrors `status` synchronously for the fallback timeout below — React state itself can't be
  // read synchronously from inside a callback scheduled earlier.
  const readyRef = useRef(false);

  useEffect(() => {
    // An expired/already-used recovery link doesn't establish a session at all — Supabase
    // redirects back with the failure IN THE URL instead (e.g.
    // "#error=access_denied&error_code=otp_expired&error_description=..."). Checking this first
    // means an expired link shows its real reason immediately, not after a generic timeout.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const errorDescription = hashParams.get('error_description');
    if (errorDescription) {
      setInvalidReason(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
      setStatus('invalid');
      return;
    }

    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        readyRef.current = true;
        setStatus('ready');
      }
    });

    // Fallback: the PASSWORD_RECOVERY event may have already fired (and been missed) before this
    // listener attached — detectSessionInUrl can resolve very early on page load.
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session && !readyRef.current) {
        readyRef.current = true;
        setStatus('ready');
      }
    });

    // Neither the event nor an existing session showed up — treat the link as invalid/expired
    // rather than leaving the user on an indefinite "checking" state.
    const timeout = setTimeout(() => {
      if (mounted && !readyRef.current) setStatus('invalid');
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setStatus('success');
  };

  return (
    <div className="min-h-screen font-sans flex flex-col" style={{ background: PAPER, color: INK }}>
      <nav className="w-full border-b" style={{ borderColor: HAIRLINE }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
          <Link to="/">
            <Logo size="md" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full blur-[120px] pointer-events-none"
          style={{ background: `${GOLD}14` }}
        />

        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-3xl bg-white p-8 sm:p-10" style={{ border: `1px solid ${HAIRLINE}`, boxShadow: '0 20px 60px -20px rgba(28,25,23,0.14), 0 4px 16px -4px rgba(28,25,23,0.06)' }}>
            {status === 'checking' && (
              <div className="text-center py-6">
                <div className="w-8 h-8 mx-auto rounded-full border-2 border-t-transparent animate-spin mb-5" style={{ borderColor: GOLD, borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: INK_MUTED }}>Checking your reset link…</p>
              </div>
            )}

            {status === 'invalid' && (
              <div className="text-center space-y-5">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#DC262614' }}>
                    <AlertTriangle size={24} style={{ color: '#B91C1C' }} />
                  </div>
                </div>
                <h1 className="font-serif text-2xl font-semibold tracking-tight" style={{ color: INK }}>
                  This link is invalid or expired
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>
                  {invalidReason || 'Reset links only work once and expire after a short time.'} Request a
                  new one from the login page.
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-transform hover:-translate-y-0.5"
                  style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
                >
                  Back to login
                </Link>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center space-y-5">
                <div className="flex justify-center">
                  <CheckCircle2 size={44} style={{ color: '#15803d' }} />
                </div>
                <h1 className="font-serif text-2xl font-semibold tracking-tight" style={{ color: INK }}>
                  Password updated
                </h1>
                <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>
                  Your password has been changed. Log in with your new password to continue.
                </p>
                <button
                  onClick={() => navigate('/login', { replace: true })}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-transform hover:-translate-y-0.5"
                  style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
                >
                  Go to login
                </button>
              </div>
            )}

            {status === 'ready' && (
              <>
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-6">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}14` }}>
                      <KeyRound size={24} style={{ color: GOLD }} />
                    </div>
                  </div>
                  <h1 className="font-serif text-2xl font-semibold tracking-tight mb-1.5" style={{ color: INK }}>
                    Set a new password
                  </h1>
                  <p className="text-sm" style={{ color: INK_MUTED }}>
                    Choose a new password for your account.
                  </p>
                </div>

                {formError && (
                  <div className="mb-5 p-3 rounded-xl text-sm" style={{ background: '#DC262614', border: '1px solid #DC262633', color: '#B91C1C' }}>
                    {formError}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: INK_MUTED }}>
                      New password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-3 text-sm rounded-xl outline-none transition-all"
                      style={sharedInputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: INK_MUTED }}>
                      Confirm password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="Type it again"
                      className="w-full px-4 py-3 text-sm rounded-xl outline-none transition-all"
                      style={sharedInputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 mt-2"
                    style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
                  >
                    {submitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Reset password'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="py-6 px-6 text-center text-xs font-medium" style={{ color: INK_MUTED, borderTop: `1px solid ${HAIRLINE}` }}>
        © 2026 AURELIA
      </footer>
    </div>
  );
}
