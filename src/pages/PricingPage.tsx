import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import Logo from '@/components/Logo';

// Same fixed, self-contained palette as LandingPage.tsx/HowItWorksPage.tsx.
const INK = '#1C1917';
const INK_SOFT = '#44403C';
const INK_MUTED = '#78716C';
const PAPER = '#F7F6F3';
const HAIRLINE = '#E5E1D8';
const GOLD = '#B45309';
const GOLD_SOFT = '#92400E';

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState(false);

  const features = [
    'Live guest check-in, from any phone',
    'Smart guide allocation & balancing',
    'Automatic booking ingestion from every OTA',
    'Guide payments, earnings & invoices',
    'Guide performance scoring (reviews + punctuality)',
    'Owner analytics & live operations board',
  ];

  // A logged-in visitor only ever lands here because ProtectedRoute redirected them after their
  // trial ended — a first-time, signed-out visitor sees the plain pricing pitch instead.
  const isTrialGate = !!user;

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
    <div className="min-h-screen font-sans" style={{ background: PAPER, color: INK }}>
      <nav className="w-full border-b" style={{ borderColor: HAIRLINE }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo size="md" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          </Link>
          {!isTrialGate && (
            <Link to="/" className="text-sm font-semibold inline-flex items-center gap-1.5 transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
              <ArrowLeft size={14} /> Back home
            </Link>
          )}
        </div>
      </nav>

      <div className="flex items-center justify-center px-6 py-16 md:py-24">
        <div className="max-w-md w-full">
          <div className="text-center mb-10">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight mb-3" style={{ color: INK }}>
              {isTrialGate ? 'Your free trial has ended' : 'Simple, honest pricing'}
            </h1>
            <p className="text-base" style={{ color: INK_SOFT }}>
              {isTrialGate
                ? 'Subscribe to keep using AURELIA.'
                : 'One plan. Everything included. Start with a free trial.'}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-8 relative overflow-hidden" style={{ border: `1px solid ${HAIRLINE}`, boxShadow: '0 20px 60px -20px rgba(28,25,23,0.12)' }}>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(to right, ${GOLD}00, ${GOLD}, ${GOLD}00)` }} />

            <div className="mb-6 text-center">
              <h2 className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: GOLD_SOFT }}>AURELIA</h2>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-5xl font-black tracking-tight" style={{ color: INK }}>€20</span>
                <span className="text-sm font-medium" style={{ color: INK_MUTED }}>/ month</span>
              </div>
              <p className="text-xs font-semibold mt-2" style={{ color: INK_MUTED }}>Free trial included — no card required to start.</p>
            </div>

            <div className="space-y-3 mb-8 text-left">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <Check size={16} style={{ color: '#15803d' }} className="flex-shrink-0" />
                  <span className="text-sm" style={{ color: INK_SOFT }}>{feature}</span>
                </div>
              ))}
            </div>

            {isTrialGate ? (
              <>
                <button
                  disabled
                  className="w-full py-3 rounded-xl font-bold text-sm cursor-not-allowed mb-2"
                  style={{ background: `${GOLD}26`, color: `${GOLD_SOFT}99` }}
                >
                  Subscribe Now
                </button>
                <p className="text-xs text-center mb-8" style={{ color: INK_MUTED }}>Card payments coming soon</p>

                <div className="pt-6" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <p className="text-sm mb-3" style={{ color: INK_SOFT }}>Have a promo code?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="Enter code"
                      className="aurelia-input flex-1"
                    />
                    <button
                      onClick={handleApplyPromo}
                      disabled={promoLoading || !promoCode.trim()}
                      className="aurelia-gold-btn px-6 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {promoLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Apply'
                      )}
                    </button>
                  </div>
                  {promoError && <p className="text-xs text-red-600 mt-2">{promoError}</p>}
                  {promoSuccess && <p className="text-xs mt-2" style={{ color: '#15803d' }}>✓ Code applied! Redirecting to your dashboard…</p>}
                </div>
              </>
            ) : (
              <Link
                to="/signup"
                className="w-full py-3 rounded-xl font-bold text-sm text-white text-center block"
                style={{ background: GOLD }}
              >
                Start free trial
              </Link>
            )}
          </div>

          <p className="text-sm text-center mt-8" style={{ color: INK_SOFT }}>
            Need more for a larger team?{' '}
            <a href="mailto:shabirshabrez1998@gmail.com" className="font-bold hover:underline" style={{ color: GOLD }}>
              Contact us
            </a>
          </p>

          <p className="text-xs text-center mt-6" style={{ color: INK_MUTED }}>
            Questions? Reach us at{' '}
            <a href="mailto:shabirshabrez1998@gmail.com" className="hover:underline" style={{ color: GOLD_SOFT }}>
              shabirshabrez1998@gmail.com
            </a>{' '}
            or{' '}
            <a href="tel:+33755091524" className="hover:underline" style={{ color: GOLD_SOFT }}>
              +33 7 55 09 15 24
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
