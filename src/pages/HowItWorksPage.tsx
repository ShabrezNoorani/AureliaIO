import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import { fetchPublishedBlogs, Blog } from '@/lib/blogService';
import {
  ArrowRight, Inbox, CalendarRange, Smartphone, Scale, MapPin, Star, Wallet,
} from 'lucide-react';

// Same fixed, self-contained palette as LandingPage.tsx — deliberately independent of the
// authenticated app's light/dark theme tokens, for the same reason (a signed-out visitor's stale
// dark-mode preference must never leak onto a public marketing page).
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

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.unobserve(el); } },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
    >
      {children}
    </div>
  );
}

const STEPS = [
  {
    icon: Inbox,
    title: 'Bookings come in automatically',
    copy: 'Reservations from Viator, GetYourGuide, your website or a spreadsheet all land in AURELIA on their own — nobody re-types a booking by hand.',
  },
  {
    icon: CalendarRange,
    title: "You build the day's tours",
    copy: "Group today's bookings into tour sessions and assign a guide to each one, in a couple of taps.",
  },
  {
    icon: Smartphone,
    title: 'Guides check guests in on their phones',
    copy: 'On the day, your guide taps through arrivals from their own phone — no paper list, no separate app to install.',
  },
  {
    icon: Scale,
    title: 'Allocation balances the groups',
    copy: 'As guests check in, AURELIA spreads them evenly across the guides working that tour, so nobody ends up overloaded or standing around idle.',
  },
  {
    icon: MapPin,
    title: 'Guides mark arrival at the meeting point',
    copy: "A guide's \"I've arrived\" is checked against the meeting point's actual location — so it reflects where they really are, not just a tap from anywhere.",
  },
  {
    icon: Star,
    title: "Reviews and punctuality build each guide's score",
    copy: 'Guest reviews and verified on-time arrivals combine into one fair, consistent score for every guide — visible to you and to them.',
  },
  {
    icon: Wallet,
    title: 'You see earnings, payments and profit',
    copy: 'Every tour rolls up into guide pay, invoices and real profit — one live picture instead of several spreadsheets.',
  },
];

export default function HowItWorksPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogsLoading, setBlogsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchPublishedBlogs()
      .then((data) => { if (mounted) setBlogs(data || []); })
      .catch((err) => console.error('Failed to load articles:', err))
      .finally(() => { if (mounted) setBlogsLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="min-h-screen font-sans overflow-x-hidden" style={{ background: PAPER, color: INK }}>
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md border-b" style={{ background: `${PAPER}CC`, borderColor: HAIRLINE }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo size="md" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm font-semibold transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-colors shadow-sm"
              style={{ background: GOLD }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-40 pb-16 md:pt-48 md:pb-20 px-6 max-w-4xl mx-auto text-center">
        <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight mb-5" style={{ color: INK }}>
          How AURELIA works
        </h1>
        <p className="text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: INK_SOFT }}>
          No jargon — just the seven steps a booking goes through, from the moment it arrives to the moment you see the profit.
        </p>
      </section>

      {/* ─── STEP-BY-STEP EXPLAINER ─── */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="space-y-8">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 40}>
              <div className="flex gap-5 md:gap-6 items-start rounded-2xl bg-white p-6 md:p-7" style={{ border: `1px solid ${HAIRLINE}` }}>
                <div
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-bold"
                  style={{ background: `${GOLD}14`, color: GOLD_SOFT }}
                >
                  <step.icon size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>Step {i + 1}</span>
                  </div>
                  <h3 className="text-lg md:text-xl font-bold mb-2" style={{ color: INK }}>{step.title}</h3>
                  <p className="text-sm md:text-base leading-relaxed" style={{ color: INK_SOFT }}>{step.copy}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14 text-center">
          <Link
            to="/signup"
            className="text-base font-bold px-8 py-4 rounded-xl text-white inline-flex items-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ background: GOLD, boxShadow: `0 12px 30px -8px ${GOLD}55` }}
          >
            Start free trial <ArrowRight size={18} />
          </Link>
        </Reveal>
      </section>

      {/* ─── ARTICLES — preserved from the previous Blog section; the explainer above is the main
          content of this page, so this only appears at all once there's something to show. ─── */}
      {!blogsLoading && blogs.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-28">
          <Reveal>
            <h2 className="font-serif text-2xl md:text-3xl font-semibold tracking-tight mb-8 text-center" style={{ color: INK }}>
              More from AURELIA
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {blogs.map((blog) => (
              <Link
                key={blog.id}
                to={`/how-it-works/${blog.slug}`}
                className="block rounded-2xl bg-white p-7 transition-all hover:-translate-y-0.5"
                style={{ border: `1px solid ${HAIRLINE}` }}
              >
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded mb-4 w-fit"
                  style={{ color: GOLD_SOFT, background: `${GOLD}14` }}
                >
                  {blog.category}
                </span>
                <h3 className="text-lg font-bold mb-2.5 leading-snug" style={{ color: INK }}>{blog.title}</h3>
                <p className="text-sm leading-relaxed mb-6 line-clamp-2" style={{ color: INK_MUTED }}>{blog.excerpt}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: INK_MUTED }}>
                    {blog.read_time} min read
                  </span>
                  <span className="text-sm font-bold inline-flex items-center gap-1" style={{ color: GOLD }}>
                    Read <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── FOOTER ─── */}
      <footer className="py-12 px-6" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="sm" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold" style={{ color: INK_SOFT }}>
            <Link to="/how-it-works" className="transition-colors hover:opacity-70">How it works</Link>
            <Link to="/pricing" className="transition-colors hover:opacity-70">Pricing</Link>
            <a href="mailto:shabirshabrez1998@gmail.com" className="transition-colors hover:opacity-70">Contact</a>
          </div>
          <p className="text-xs font-medium" style={{ color: INK_MUTED }}>© 2026 AURELIA</p>
        </div>
      </footer>
    </div>
  );
}
