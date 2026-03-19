import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { company_name: companyName },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed — no user returned');

      // 2. Insert profile
      const subscriptionStatus =
        promoCode.trim().toUpperCase() === 'SCENICZEST1' ? 'active' : 'trial';

      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        company_name: companyName,
        trial_start: new Date().toISOString(),
        subscription_status: subscriptionStatus,
        promo_code_used: promoCode.trim() || null,
      });

      if (profileError) throw profileError;

      // 3. Redirect to app
      navigate('/app');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans">
      {/* ─── LEFT PANEL ─── */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0a0a0f] flex-col justify-center px-16 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[400px] bg-[#f5a623]/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-xl font-black tracking-wider text-[#f5a623] uppercase mb-12">
            Aurelia
          </h2>

          <blockquote className="text-3xl font-bold text-white leading-snug mb-10">
            "Finally know if your tours are actually profitable."
          </blockquote>

          <div className="space-y-4">
            {[
              'Set up in under 10 minutes',
              'No spreadsheets needed',
              'Works with Viator, GYG, Airbnb',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-gray-400 text-sm">
                <span className="text-[#22c55e] font-bold">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
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

          <h1 className="text-2xl font-bold text-white mb-2">Start your free trial</h1>
          <p className="text-sm text-gray-500 mb-8">14 days free. No credit card required.</p>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="auth-input"
                placeholder="Your company"
              />
            </div>

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
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="auth-input pr-11"
                  placeholder="Min. 6 characters"
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

            {/* Promo Code */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Promo Code <span className="normal-case tracking-normal font-normal text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                className="auth-input"
                placeholder="Enter code"
              />
              <p className="text-xs text-gray-600 mt-1.5">Have a founder code?</p>
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
                <>Create Account →</>
              )}
            </button>
          </form>

          <p className="text-sm text-gray-500 mt-6 text-center">
            Already have an account?{' '}
            <Link to="/login" className="text-[#f5a623] hover:underline font-medium">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
