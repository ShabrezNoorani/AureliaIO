import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState(false);

  const features = [
    'Unlimited products',
    'All OTA channels',
    'Live profit simulator',
    'Age-based pax calculator',
    'Multi-option management',
    'Priority support',
  ];

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoSuccess(false);

    try {
      if (promoCode.trim().toUpperCase() !== 'SCENICZEST1') {
        throw new Error('Invalid promo code');
      }

      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          subscription_status: 'active',
          promo_code_used: promoCode.trim(),
        })
        .eq('id', user.id);

      if (error) throw error;

      setPromoSuccess(true);
      await refreshProfile();

      // Brief delay to show success, then redirect
      setTimeout(() => navigate('/app'), 800);
    } catch (err: any) {
      setPromoError(err.message || 'Invalid code');
    } finally {
      setPromoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-6 py-16 font-sans">
      <div className="max-w-lg w-full text-center">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-xl font-black tracking-wider text-[#f5a623] uppercase mb-6">
            Aurelia
          </h1>
          <h2 className="text-3xl font-bold text-white mb-3">
            Your free trial has ended
          </h2>
          <p className="text-gray-500 text-base">
            Subscribe to continue using AURELIA
          </p>
        </div>

        {/* Pricing Card */}
        <div className="rounded-2xl bg-[#13131a] border border-[#f5a623]/20 p-8 relative overflow-hidden">
          {/* Gold accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#f5a623]/0 via-[#f5a623] to-[#f5a623]/0" />

          <div className="mb-6">
            <h3 className="text-lg font-bold text-white mb-1">AURELIA PRO</h3>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-extrabold text-white">€49</span>
              <span className="text-gray-500 text-sm font-medium">/ month</span>
            </div>
          </div>

          <div className="space-y-3 mb-8 text-left">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <Check size={16} className="text-[#22c55e] flex-shrink-0" />
                <span className="text-sm text-gray-300">{feature}</span>
              </div>
            ))}
          </div>

          {/* Subscribe button (disabled) */}
          <button
            disabled
            className="w-full py-3 rounded-lg font-bold text-sm bg-[#f5a623]/30 text-[#f5a623]/60 cursor-not-allowed mb-2"
          >
            Subscribe Now
          </button>
          <p className="text-xs text-gray-600 mb-8">Stripe integration coming soon</p>

          {/* Promo Code */}
          <div className="border-t border-white/5 pt-6">
            <p className="text-sm text-gray-400 mb-3">Have a promo code?</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Enter code"
                className="auth-input flex-1"
              />
              <button
                onClick={handleApplyPromo}
                disabled={promoLoading || !promoCode.trim()}
                className="aurelia-gold-btn px-6 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {promoLoading ? (
                  <div className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Apply'
                )}
              </button>
            </div>
            {promoError && (
              <p className="text-xs text-red-400 mt-2">{promoError}</p>
            )}
            {promoSuccess && (
              <p className="text-xs text-[#22c55e] mt-2">
                ✓ Code applied! Redirecting to your dashboard…
              </p>
            )}
          </div>
        </div>

        {/* Contact */}
        <p className="text-xs text-gray-600 mt-8">
          Questions? Contact us at{' '}
          <a href="mailto:hello@aureliaio.com" className="text-[#f5a623] hover:underline">
            hello@aureliaio.com
          </a>
        </p>
      </div>
    </div>
  );
}
