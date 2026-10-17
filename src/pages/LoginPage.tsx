import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

// Same fixed, self-contained palette as LandingPage.tsx/PricingPage.tsx/HowItWorksPage.tsx —
// deliberately independent of the authenticated app's light/dark theme tokens, so a signed-out
// visitor's stale dark-mode preference (persisted in localStorage) never leaks onto this page.
const INK = '#1C1917';
const INK_SOFT = '#44403C';
const INK_MUTED = '#78716C';
const PAPER = '#F7F6F3';
const HAIRLINE = '#E5E1D8';
const GOLD = '#B45309';
const GOLD_SOFT = '#92400E';

const sharedInputStyle = { background: PAPER, border: `1px solid ${HAIRLINE}`, color: INK };

export default function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading, role, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Toggles the card's content between the login form and the "forgot password" request-email
  // form — no separate route needed for this half of the flow (only the recovery-link landing
  // page, ResetPasswordPage.tsx, needs its own route — see App.tsx's /reset-password).
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Redirect once session + role exist — reactive, works for all cases. Owners land on
  // /app, guides land on /guide; waiting for role avoids a flash of the wrong shell.
  useEffect(() => {
    if (session && !authLoading && role) {
      navigate(role === 'guide' ? '/guide' : '/app', { replace: true });
    }
  }, [session, authLoading, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // signIn sets session in context immediately — useEffect will redirect
    const { error: loginError } = await signIn(email, password);
    if (loginError) {
      setError(loginError);
      setLoading(false);
    }
    // No navigate here — useEffect handles redirect after session is set
  };

  const openForgotPassword = () => {
    setResetEmail(email); // carries over whatever the user already typed into the login form
    setResetError('');
    setResetSent(false);
    setMode('forgot');
  };

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError('');

    // The link in this email lands the user on /reset-password with Supabase's own recovery
    // tokens in the URL — that page (ResetPasswordPage.tsx) is what actually sets the new
    // password. This redirect URL must be allow-listed in Supabase (Auth → URL Configuration).
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setResetLoading(false);
    if (resetErr) {
      setResetError(resetErr.message);
      return;
    }
    setResetSent(true);
  };

  return (
    <div className="min-h-screen font-sans flex flex-col" style={{ background: PAPER, color: INK }}>
      <nav className="w-full border-b" style={{ borderColor: HAIRLINE }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo size="md" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          </Link>
          <Link to="/" className="text-sm font-semibold inline-flex items-center gap-1.5 transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
            <ArrowLeft size={14} /> Back home
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* Gentle glow, matching the landing page's hero — the only decorative flourish here. */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full blur-[120px] pointer-events-none"
          style={{ background: `${GOLD}14` }}
        />

        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-3xl bg-white p-8 sm:p-10" style={{ border: `1px solid ${HAIRLINE}`, boxShadow: '0 20px 60px -20px rgba(28,25,23,0.14), 0 4px 16px -4px rgba(28,25,23,0.06)' }}>
            {mode === 'login' ? (
              <>
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-6">
                    <Logo size="lg" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
                  </div>
                  <h1 className="font-serif text-2xl font-semibold tracking-tight mb-1.5" style={{ color: INK }}>
                    Welcome back
                  </h1>
                  <p className="text-sm" style={{ color: INK_MUTED }}>
                    Log in to your AURELIA dashboard.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 p-3 rounded-xl text-sm" style={{ background: '#DC262614', border: '1px solid #DC262633', color: '#B91C1C' }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: INK_MUTED }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full px-4 py-3 text-sm rounded-xl outline-none transition-all"
                      style={sharedInputStyle}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: INK_MUTED }}>
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={openForgotPassword}
                        className="text-xs font-bold hover:underline"
                        style={{ color: GOLD }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 text-sm rounded-xl outline-none transition-all"
                      style={sharedInputStyle}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 mt-2"
                    style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>Log in <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>

                <p className="text-sm text-center mt-7" style={{ color: INK_MUTED }}>
                  No account?{' '}
                  <Link to="/signup" className="font-bold hover:underline" style={{ color: GOLD }}>
                    Start free trial →
                  </Link>
                </p>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="flex justify-center mb-6">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}14` }}>
                      <Mail size={24} style={{ color: GOLD }} />
                    </div>
                  </div>
                  <h1 className="font-serif text-2xl font-semibold tracking-tight mb-1.5" style={{ color: INK }}>
                    Reset your password
                  </h1>
                  <p className="text-sm" style={{ color: INK_MUTED }}>
                    Enter your email and we'll send you a reset link.
                  </p>
                </div>

                {resetSent ? (
                  <div className="text-center space-y-5">
                    <div className="flex justify-center">
                      <CheckCircle2 size={40} style={{ color: '#15803d' }} />
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>
                      Check your email for a reset link. It can take a minute or two to arrive —
                      don't forget to check spam.
                    </p>
                    <button
                      onClick={() => setMode('login')}
                      className="text-sm font-bold hover:underline"
                      style={{ color: GOLD }}
                    >
                      ← Back to login
                    </button>
                  </div>
                ) : (
                  <>
                    {resetError && (
                      <div className="mb-5 p-3 rounded-xl text-sm" style={{ background: '#DC262614', border: '1px solid #DC262633', color: '#B91C1C' }}>
                        {resetError}
                      </div>
                    )}
                    <form onSubmit={handleSendReset} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: INK_MUTED }}>
                          Email
                        </label>
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                          autoFocus
                          placeholder="you@company.com"
                          className="w-full px-4 py-3 text-sm rounded-xl outline-none transition-all"
                          style={sharedInputStyle}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={resetLoading}
                        className="w-full py-3.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 mt-2"
                        style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
                      >
                        {resetLoading ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          'Send reset link'
                        )}
                      </button>
                    </form>
                    <p className="text-sm text-center mt-6">
                      <button
                        onClick={() => setMode('login')}
                        className="font-bold hover:underline"
                        style={{ color: GOLD_SOFT }}
                      >
                        ← Back to login
                      </button>
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          {mode === 'login' && (
            <p className="text-xs text-center mt-6" style={{ color: INK_MUTED }}>
              For guides —{' '}
              <span className="font-semibold" style={{ color: INK_SOFT }}>use the invite link your coordinator sent you</span>.
            </p>
          )}
        </div>
      </div>

      <footer className="py-6 px-6 text-center text-xs font-medium" style={{ color: INK_MUTED, borderTop: `1px solid ${HAIRLINE}` }}>
        © 2026 AURELIA
      </footer>
    </div>
  );
}
