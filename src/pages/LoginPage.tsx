import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect to /app once session is confirmed
  useEffect(() => {
    if (!authLoading && session) {
      navigate('/app', { replace: true });
    }
  }, [session, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      // Don't navigate here — the useEffect above will handle it
      // once onAuthStateChange propagates the new session
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans">
      {/* ─── LEFT PANEL ─── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a0a0f] flex-col justify-center px-16 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-[#f5a623]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-xl font-black tracking-wider text-[#f5a623] uppercase mb-12">
            Aurelia
          </h2>
          <h3 className="text-4xl font-bold text-white leading-snug mb-4">
            Welcome back.
          </h3>
          <p className="text-lg text-gray-500">
            Your profit dashboard is waiting.
          </p>
        </div>
      </div>

      {/* ─── RIGHT PANEL ─── */}
      <div className="flex-1 bg-[#0f0f17] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10">
            <h2 className="text-xl font-black tracking-wider text-[#f5a623] uppercase">
              Aurelia
            </h2>
          </div>

          <h1 className="text-2xl font-bold text-white mb-8">Login to AURELIA</h1>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-input"
                placeholder="you@company.com"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-[#f5a623] hover:underline"
                  onClick={() => {
                    // Future: password reset flow
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="auth-input"
                placeholder="Enter your password"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="aurelia-gold-btn w-full py-3 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>Login →</>
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 mt-6 text-center">
            No account?{' '}
            <Link to="/signup" className="text-[#f5a623] hover:underline font-medium">
              Start free trial →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
