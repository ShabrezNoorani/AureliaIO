import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Minus, ArrowLeft } from 'lucide-react';
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

interface Plan {
  name: string;
  price: number;
  tagline: string;
  /** Short "Everything in X, plus:" lead-in for the higher tiers. */
  includesPrevious?: string;
  features: string[];
  notIncluded?: string[];
  /** Small print under the feature list (e.g. the AI-key add-on). */
  addOnNote?: string;
  usersIncluded: number;
  extraUserPrice: number;
  popular?: boolean;
}

// Presentational only — no payment wiring. Plans/prices as published.
const PLANS: Plan[] = [
  {
    name: 'Guide',
    price: 10,
    tagline: 'Guide-side tools for running tours on the day.',
    features: ['Guide check-in', 'Automatic booking data from Gmail', 'Guide dashboard'],
    notIncluded: ['Financial ledger', 'Analytics & P&L', 'Simulator'],
    usersIncluded: 1,
    extraUserPrice: 2,
  },
  {
    name: 'Operations',
    price: 20,
    tagline: 'Run the whole operation — and the numbers behind it.',
    includesPrevious: 'Everything in Guide, plus:',
    features: ['Financial analytics', 'P&L', 'Products & pricing', 'AI insights'],
    addOnNote: 'AI insights: bring your own AI key, or add the AI-key add-on for +€5 / month.',
    usersIncluded: 2,
    extraUserPrice: 5,
    popular: true,
  },
  {
    name: 'Intelligence',
    price: 25,
    tagline: 'Your operation, plus a clear view of the market around it.',
    includesPrevious: 'Everything in Operations, plus:',
    features: ['Market Research — AQUILA market intelligence'],
    usersIncluded: 3,
    extraUserPrice: 5,
  },
];

const usersLabel = (n: number) => (n === 1 ? '1 user included' : `${n} users included`);

export default function PricingPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState(false);

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

      <div className="px-6 py-16 md:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 md:mb-14 max-w-2xl mx-auto">
            <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight mb-3" style={{ color: INK }}>
              {isTrialGate ? 'Your free trial has ended' : 'Simple, honest pricing'}
            </h1>
            <p className="text-base" style={{ color: INK_SOFT }}>
              {isTrialGate
                ? 'Subscribe to keep using AURELIA.'
                : 'Three plans, priced monthly. Start with a free trial — no card required.'}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6 items-stretch">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-3xl bg-white p-7 md:p-8 relative flex flex-col ${plan.popular ? 'md:-translate-y-2' : ''}`}
                style={{
                  border: `1px solid ${plan.popular ? `${GOLD}66` : HAIRLINE}`,
                  boxShadow: plan.popular
                    ? `0 24px 60px -20px ${GOLD}40, 0 4px 16px -4px rgba(28,25,23,0.06)`
                    : '0 20px 60px -20px rgba(28,25,23,0.12)',
                }}
              >
                {plan.popular && (
                  <>
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl" style={{ background: `linear-gradient(to right, ${GOLD}00, ${GOLD}, ${GOLD}00)` }} />
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full text-white whitespace-nowrap"
                      style={{ background: GOLD }}
                    >
                      Most popular
                    </span>
                  </>
                )}

                <h2 className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: GOLD_SOFT }}>{plan.name}</h2>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-black tracking-tight" style={{ color: INK }}>€{plan.price}</span>
                  <span className="text-sm font-medium" style={{ color: INK_MUTED }}>/ month</span>
                </div>
                <p className="text-sm mt-3 mb-6 min-h-[2.5rem]" style={{ color: INK_SOFT }}>{plan.tagline}</p>

                <div className="rounded-xl px-4 py-3 mb-6 text-xs" style={{ background: PAPER, border: `1px solid ${HAIRLINE}` }}>
                  <p className="font-bold" style={{ color: INK }}>{usersLabel(plan.usersIncluded)}</p>
                  <p className="mt-0.5" style={{ color: INK_MUTED }}>Additional users: +€{plan.extraUserPrice} / user / month</p>
                </div>

                <div className="space-y-3 text-left flex-1">
                  {plan.includesPrevious && (
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>{plan.includesPrevious}</p>
                  )}
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check size={16} style={{ color: '#15803d' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm" style={{ color: INK_SOFT }}>{feature}</span>
                    </div>
                  ))}
                  {plan.notIncluded?.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Minus size={16} style={{ color: INK_MUTED }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm line-through decoration-1" style={{ color: INK_MUTED }}>{feature}</span>
                    </div>
                  ))}
                  {plan.addOnNote && (
                    <p className="text-xs leading-relaxed pt-2" style={{ color: INK_MUTED }}>{plan.addOnNote}</p>
                  )}
                </div>

                <div className="mt-8">
                  {isTrialGate ? (
                    <>
                      <button
                        disabled
                        className="w-full py-3 rounded-xl font-bold text-sm cursor-not-allowed mb-2"
                        style={{ background: `${GOLD}26`, color: `${GOLD_SOFT}99` }}
                      >
                        Subscribe Now
                      </button>
                      <p className="text-xs text-center" style={{ color: INK_MUTED }}>Card payments coming soon</p>
                    </>
                  ) : (
                    <Link
                      to="/signup"
                      className="w-full py-3 rounded-xl font-bold text-sm text-center block transition-colors"
                      style={plan.popular ? { background: GOLD, color: 'white' } : { border: `1px solid ${GOLD}66`, color: GOLD_SOFT }}
                    >
                      Start free trial
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isTrialGate && (
            <div className="max-w-md mx-auto mt-10 rounded-3xl bg-white p-6 md:p-8" style={{ border: `1px solid ${HAIRLINE}` }}>
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
          )}

          <div className="max-w-md mx-auto">
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
    </div>
  );
}
