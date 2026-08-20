import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/Logo';

type PageState = 'loading' | 'invalid' | 'form' | 'success' | 'used' | 'already-registered' | 'pending-confirmation';

export default function GuideClaimPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>('loading');
  const [guideName, setGuideName] = useState('');
  const [guideEmail, setGuideEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClaimInfo = async () => {
      if (!token) {
        setState('invalid');
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('get_claim_info', { p_token: token });

      if (rpcError) {
        console.error(rpcError);
        setState('invalid');
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.guide_email) {
        setState('invalid');
        return;
      }

      setGuideName(row.guide_name || '');
      setGuideEmail(row.guide_email);
      setState('form');
    };

    loadClaimInfo();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: guideEmail,
        password,
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setState('already-registered');
          return;
        }
        throw signUpError;
      }

      // claim_guide_account needs a live session — it reads auth.uid() server-side. If email
      // confirmation is required, signUp() returns no session yet, so we can't call it now.
      // Rather than dead-end here, leave the guide row unclaimed-but-linkable: their claim_token
      // is still set, and once they confirm their email and log in for the first time,
      // AuthContext's repair_guide_claim() safety net finishes the link automatically.
      if (!signUpData.session) {
        setState('pending-confirmation');
        return;
      }

      const { data: claimed, error: claimError } = await supabase.rpc('claim_guide_account', {
        p_token: token,
      });

      if (claimError) throw claimError;

      if (!claimed) {
        setState('used');
        return;
      }

      // Never report success without confirming auth_user_id actually landed — re-read the row
      // rather than trusting the RPC's boolean alone.
      const { data: guideRow, error: verifyError } = await supabase
        .from('guides')
        .select('id')
        .eq('auth_user_id', signUpData.session.user.id)
        .maybeSingle();

      if (verifyError || !guideRow) {
        setError('Your account was created, but we could not confirm the link to your guide profile. Try logging in — it may finish linking automatically — or contact your coordinator.');
        return;
      }

      setState('success');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f17]">
        <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f17] px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" showSubtitle={false} />
          </div>
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            This link is invalid or has already been used. Please contact your coordinator.
          </div>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f17] px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" showSubtitle={false} />
          </div>
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400 mb-6">
            Your account is set up. You can now log in.
          </div>
          <Link to="/login" className="aurelia-gold-btn inline-flex w-full py-3 text-base font-bold items-center justify-center gap-2">
            Go to login →
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'used') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f17] px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" showSubtitle={false} />
          </div>
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-6">
            This link was already used. If you already have an account, log in instead.
          </div>
          <Link to="/login" className="text-[#f5a623] hover:underline font-medium text-sm">
            Go to login →
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'pending-confirmation') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f17] px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" showSubtitle={false} />
          </div>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 mb-6">
            Almost there — check your email and click the confirmation link to activate your
            account. Once confirmed, just log in and your guide profile links automatically.
          </div>
          <Link to="/login" className="text-[#f5a623] hover:underline font-medium text-sm">
            Go to login →
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'already-registered') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f17] px-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-center mb-8">
            <Logo size="lg" showSubtitle={false} />
          </div>
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-6">
            An account with this email already exists. Log in instead — if it's yours, your guide
            profile will finish linking automatically.
          </div>
          <Link to="/login" className="aurelia-gold-btn inline-flex w-full py-3 text-base font-bold items-center justify-center gap-2">
            Go to login →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* ─── LEFT PANEL ─── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a0a0f] flex-col justify-center px-16 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-[#f5a623]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-12">
            <Logo size="lg" />
          </div>
          <h3 className="text-4xl font-bold text-white leading-snug mb-4">
            Welcome, {guideName || 'Guide'}.
          </h3>
          <p className="text-lg text-gray-500">
            Set a password to activate your account.
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL ─── */}
      <div className="flex-1 bg-[#0f0f17] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-10">
            <Logo size="lg" showSubtitle={false} />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            Hi {guideName || 'there'}, activate your account
          </h1>
          <p className="text-sm text-gray-500 mb-8">Choose a password to finish setting up your account.</p>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                value={guideEmail}
                readOnly
                disabled
                className="auth-input opacity-60 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="auth-input pr-11"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="auth-input"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="aurelia-gold-btn w-full py-3 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Activate account →</>
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 mt-6 text-center">
            Already activated?{' '}
            <Link to="/login" className="text-[#f5a623] hover:underline font-medium">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
