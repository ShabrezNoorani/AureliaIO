import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Camera, Users, BarChart3, Wallet, Star, MapPin, Quote,
} from 'lucide-react';
import Logo from '@/components/Logo';

// Fixed, self-contained palette — deliberately NOT the shared --theme-* tokens. Those follow the
// authenticated app's light/dark toggle (persisted in localStorage), so a signed-out visitor who
// previously used the app in dark mode could otherwise land on a dark marketing page. This page's
// look must never depend on that.
const INK = '#1C1917';
const INK_SOFT = '#44403C';
const INK_MUTED = '#78716C';
const PAPER = '#F7F6F3';
const HAIRLINE = '#E5E1D8';
const GOLD = '#B45309';
const GOLD_SOFT = '#92400E';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Fades + slides a section in the moment it enters the viewport. The only scroll animation in
    the app — scoped to this file on purpose, since the authenticated app stays calm and static. */
function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
    >
      {children}
    </div>
  );
}

interface FeatureSectionProps {
  index: string;
  title: string;
  copy: string;
  reverse?: boolean;
  visual: ReactNode;
}

function FeatureSection({ index, title, copy, reverse, visual }: FeatureSectionProps) {
  return (
    <Reveal>
      <div className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
        <div className={reverse ? 'md:text-right md:items-end md:flex md:flex-col' : ''}>
          <span className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: GOLD }}>{index}</span>
          <h3 className="font-serif text-3xl md:text-[2.25rem] font-semibold tracking-tight mt-3 mb-4" style={{ color: INK }}>
            {title}
          </h3>
          <p className="text-base md:text-lg leading-relaxed max-w-md" style={{ color: INK_SOFT }}>
            {copy}
          </p>
        </div>
        <div>{visual}</div>
      </div>
    </Reveal>
  );
}

/** Small "mac window" chrome dots — used sparingly to frame the abstract product mockups below. */
function WindowChrome() {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#F5C6A5' }} />
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#E8DFC8' }} />
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#D8E8D0' }} />
    </div>
  );
}

function MockCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl bg-white p-6 md:p-7 ${className}`}
      style={{ border: `1px solid ${HAIRLINE}`, boxShadow: '0 20px 60px -20px rgba(28,25,23,0.18), 0 4px 16px -4px rgba(28,25,23,0.06)' }}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen font-sans overflow-x-hidden" style={{ background: PAPER, color: INK }}>
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md border-b" style={{ background: `${PAPER}CC`, borderColor: HAIRLINE }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo size="md" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/how-it-works" className="hidden sm:inline text-sm font-semibold transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
              How it works
            </Link>
            <Link to="/login" className="text-sm font-semibold transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-colors shadow-sm"
              style={{ background: GOLD }}
              onMouseEnter={(e) => (e.currentTarget.style.background = GOLD_SOFT)}
              onMouseLeave={(e) => (e.currentTarget.style.background = GOLD)}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-40 pb-24 md:pt-48 md:pb-32 px-6 overflow-hidden">
        {/* Gentle drifting glow — the only continuous animation in the app, and only ever here. */}
        <div
          aria-hidden
          className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full blur-[110px] pointer-events-none motion-reduce:animate-none animate-blob-drift-a"
          style={{ background: `${GOLD}26` }}
        />
        <div
          aria-hidden
          className="absolute top-24 -right-24 w-[380px] h-[380px] rounded-full blur-[110px] pointer-events-none motion-reduce:animate-none animate-blob-drift-b"
          style={{ background: '#D6C9A833' }}
        />

        <div className="relative z-10 max-w-6xl mx-auto grid md:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
          <div>
            <div
              className="mb-7 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase"
              style={{ border: `1px solid ${GOLD}40`, background: `${GOLD}14`, color: GOLD_SOFT }}
            >
              The operations platform for tour operators
            </div>

            <h1 className="font-serif text-[2.75rem] leading-[1.08] md:text-6xl md:leading-[1.06] font-semibold tracking-tight mb-6" style={{ color: INK }}>
              Run your whole<br />
              tour operation<span style={{ color: GOLD }}>,</span> calmly.
            </h1>

            <p className="text-lg leading-relaxed max-w-lg mb-10" style={{ color: INK_SOFT }}>
              AURELIA is the all-in-one platform for tour operators — bookings, check-in, guides,
              payments and insights, in one live view.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Link
                to="/signup"
                className="text-base font-bold px-7 py-3.5 rounded-xl text-white inline-flex items-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
              >
                Start free trial <ArrowRight size={18} />
              </Link>
              <a
                href="mailto:shabirshabrez1998@gmail.com"
                className="text-base font-semibold px-7 py-3.5 rounded-xl inline-flex items-center gap-2 transition-colors"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK_SOFT }}
              >
                Get in touch
              </a>
            </div>
          </div>

          {/* Hero visual — an abstract glimpse of the ledger, tilted for depth */}
          <div className="relative hidden md:block">
            <div className="rotate-2 hover:rotate-1 transition-transform duration-500">
              <MockCard>
                <WindowChrome />
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>Today's Operations</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#15803d' }}>Live</span>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    { name: 'Viator · City Tour', pax: '4 pax', amt: '€212' },
                    { name: 'GetYourGuide · Sunset', pax: '2 pax', amt: '€96' },
                    { name: 'Direct · Food Walk', pax: '6 pax', amt: '€284' },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: HAIRLINE }}>
                      <div>
                        <p className="text-sm font-bold" style={{ color: INK }}>{row.name}</p>
                        <p className="text-xs" style={{ color: INK_MUTED }}>{row.pax}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: INK_SOFT }}>{row.amt}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl px-4 py-3.5 flex items-center justify-between" style={{ background: `${GOLD}12` }}>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD_SOFT }}>Net Profit Today</span>
                  <span className="text-2xl font-black tabular-nums" style={{ color: GOLD_SOFT }}>€1,284</span>
                </div>
              </MockCard>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURE SECTIONS — the 6 strongest capabilities, not an exhaustive list ─── */}
      <div className="max-w-6xl mx-auto px-6 py-4 md:py-8 space-y-28 md:space-y-40">

        <FeatureSection
          index="01 — CHECK-IN"
          title="Live guest check-in, from any phone."
          copy="Guides tap through arrivals the moment guests show up — fast, works on any phone, with a ticket photo on file when you need proof. Every check-in lands straight in your records, live."
          visual={
            <MockCard className="max-w-xs mx-auto md:mx-0">
              <WindowChrome />
              {[
                { name: 'Marta Lindqvist', pax: '2A 1C', done: true },
                { name: 'Diego Fernández', pax: '4A', done: true },
                { name: 'Yuki Tanaka', pax: '2A', done: false },
              ].map((g) => (
                <div key={g.name} className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: HAIRLINE }}>
                  <Camera size={16} style={{ color: g.done ? '#15803d' : HAIRLINE }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${g.done ? 'line-through' : ''}`} style={{ color: g.done ? INK_MUTED : INK }}>{g.name}</p>
                    <p className="text-xs" style={{ color: INK_MUTED }}>{g.pax}</p>
                  </div>
                </div>
              ))}
            </MockCard>
          }
        />

        <FeatureSection
          index="02 — ALLOCATION"
          title="Smart guide balancing, on the day."
          reverse
          copy="As check-ins come in, guests are spread evenly across the guides working that tour — nobody overloaded, nobody idle. Built for the moment things change on the ground, not just at the plan."
          visual={
            <MockCard>
              <div className="flex items-center gap-2 mb-5">
                <Users size={16} style={{ color: GOLD }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>Guide Balancing</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { guide: 'Elena', pax: 8 },
                  { guide: 'Marco', pax: 7 },
                  { guide: 'Aoife', pax: 8 },
                ].map((c) => (
                  <div key={c.guide} className="rounded-xl p-3 text-center" style={{ background: PAPER, border: `1px solid ${HAIRLINE}` }}>
                    <p className="text-xs font-bold" style={{ color: INK }}>{c.guide}</p>
                    <p className="text-lg font-black mt-1" style={{ color: GOLD_SOFT }}>{c.pax}</p>
                    <p className="text-[9px] uppercase tracking-widest" style={{ color: INK_MUTED }}>pax</p>
                  </div>
                ))}
              </div>
            </MockCard>
          }
        />

        <FeatureSection
          index="03 — BOOKINGS"
          title="Every OTA, one inbox."
          copy="Bookings from Viator, GetYourGuide and your other channels flow in automatically and land in one place — no re-entry, no exports, always up to date."
          visual={
            <MockCard>
              <div className="flex items-center justify-center gap-5 py-6">
                {['Viator', 'GetYourGuide', 'Direct'].map((ch) => (
                  <div key={ch} className="flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${GOLD}14` }}>
                      <ArrowRight size={18} style={{ color: GOLD }} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>{ch}</span>
                  </div>
                ))}
              </div>
              <p className="text-center text-sm font-semibold mt-2" style={{ color: INK_SOFT }}>Synced 4 minutes ago · 214 bookings</p>
            </MockCard>
          }
        />

        <FeatureSection
          index="04 — PAYMENTS"
          title="Guide pay, earnings and invoices — automatic."
          reverse
          copy="Every tour a guide works rolls straight into their earnings. Pay, bonuses and monthly invoices are tracked for you, so payday is never a manual spreadsheet exercise again."
          visual={
            <MockCard>
              <div className="flex items-center gap-2 mb-5">
                <Wallet size={16} style={{ color: GOLD }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>Guide Earnings</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Base pay (14 tours)', val: '€840', tone: INK },
                  { label: 'Bonuses', val: '€60', tone: INK },
                  { label: 'Paid out', val: '−€600', tone: INK_MUTED },
                ].map((r) => (
                  <div key={r.label} className="flex items-center justify-between text-sm">
                    <span style={{ color: INK_SOFT }}>{r.label}</span>
                    <span className="font-bold tabular-nums" style={{ color: r.tone }}>{r.val}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                <span className="text-sm font-bold" style={{ color: INK }}>Pending this month</span>
                <span className="text-xl font-black tabular-nums" style={{ color: GOLD_SOFT }}>€300</span>
              </div>
            </MockCard>
          }
        />

        <FeatureSection
          index="05 — PERFORMANCE"
          title="Fair guide scoring, built on real signal."
          copy="Guest reviews and verified on-time arrivals — checked against the actual meeting point, not just a tap — combine into one consistent score per guide. Transparent for you, and for them."
          visual={
            <MockCard>
              <div className="flex items-center gap-2 mb-5">
                <Star size={16} style={{ color: GOLD }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>Guide Score</span>
              </div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-black" style={{ color: '#15803d' }}>+0.84</span>
                <span className="text-xs font-bold" style={{ color: INK_MUTED }}>12 reviews / 47 bookings</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: INK_SOFT }}>
                <MapPin size={13} style={{ color: GOLD }} />
                On-time 44/47 · verified at the meeting point
              </div>
            </MockCard>
          }
        />

        <FeatureSection
          index="06 — ANALYTICS"
          title="A live operations board, for the whole business."
          reverse
          copy="Revenue, true profit and today's tours, all in one board — board-ready and broken down by day, channel and product, so you spot trends before they become a problem."
          visual={
            <MockCard>
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 size={16} style={{ color: GOLD }} />
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>Revenue &amp; Profit</span>
              </div>
              <div className="flex items-end gap-2.5 h-28">
                {[38, 52, 44, 61, 49, 72, 58].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: i === 5 ? GOLD : `${GOLD}30` }} />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: INK_MUTED }}>
                <span>Mon</span><span>Sun</span>
              </div>
            </MockCard>
          }
        />

      </div>

      {/* ─── CASE STUDY — anonymized, outcomes only, no real figures ─── */}
      <Reveal className="px-6 pb-28 md:pb-40">
        <div className="max-w-4xl mx-auto rounded-3xl p-8 md:p-14" style={{ background: 'white', border: `1px solid ${HAIRLINE}` }}>
          <Quote size={32} style={{ color: `${GOLD}66` }} />
          <p className="font-serif text-xl md:text-2xl leading-relaxed mt-5 mb-8" style={{ color: INK }}>
            "Check-in used to be chaos on paper, guide pay was a monthly spreadsheet headache, and
            nobody had a clear view of who was actually performing well. Moving onto one system
            fixed all three — everyone now works from the same source of truth, on the day and at
            month-end."
          </p>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold" style={{ background: `${GOLD}18`, color: GOLD_SOFT }}>
              TO
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: INK }}>A Paris-based tour operator</p>
              <p className="text-xs font-semibold" style={{ color: INK_MUTED }}>Running around 30 guides across daily city tours</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10 pt-8" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            {[
              'Check-in chaos replaced with one live board, every guide on the same phone flow',
              'Guide payments no longer a manual month-end spreadsheet exercise',
              'Guide performance finally visible — fair, consistent, and the same number everyone sees',
            ].map((outcome) => (
              <p key={outcome} className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>{outcome}</p>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ─── CLOSING CTA ─── */}
      <Reveal className="px-6 py-28 md:py-36">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-serif text-3xl md:text-5xl font-semibold tracking-tight mb-5" style={{ color: INK }}>
            Run your tours with clarity.
          </h2>
          <p className="text-lg mb-10" style={{ color: INK_SOFT }}>
            Start a free trial, or get in touch and we'll walk you through it.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="text-base font-bold px-8 py-4 rounded-xl text-white inline-flex items-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
            >
              Start free trial <ArrowRight size={18} />
            </Link>
            <a
              href="mailto:shabirshabrez1998@gmail.com"
              className="text-base font-semibold px-8 py-4 rounded-xl transition-colors"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK_SOFT }}
            >
              Get in touch
            </a>
          </div>
        </div>
      </Reveal>

      {/* ─── FOOTER ─── */}
      <footer className="py-12 px-6" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="sm" showSubtitle={false} wordmarkClassName="text-[#B45309]" />

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold" style={{ color: INK_SOFT }}>
            <Link to="/how-it-works" className="transition-colors hover:opacity-70">How it works</Link>
            <Link to="/pricing" className="transition-colors hover:opacity-70">Pricing</Link>
            <a href="mailto:shabirshabrez1998@gmail.com" className="transition-colors hover:opacity-70">Contact</a>
            <a href="tel:+33755091524" className="transition-colors hover:opacity-70">+33 7 55 09 15 24</a>
          </div>

          <p className="text-xs font-medium" style={{ color: INK_MUTED }}>© 2026 AURELIA</p>
        </div>
      </footer>
    </div>
  );
}
