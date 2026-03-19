import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-wider text-[#f5a623] uppercase">
              Aurelia
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500 mt-1">
              Pricing Intelligence
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              Login
            </Link>
            <Link
              to="/signup"
              className="aurelia-gold-btn text-sm px-5 py-2.5 inline-flex items-center gap-2"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="pt-40 pb-24 px-6 text-center relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#f5a623]/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#f5a623]/20 bg-[#f5a623]/5 mb-8">
            <span className="text-[#f5a623] text-sm">✦</span>
            <span className="text-xs font-semibold text-[#f5a623] tracking-wide">
              Built for Tour Operators
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-[60px] leading-[1.1] font-extrabold tracking-tight mb-6">
            Know Your Real Profit.
            <br />
            <span className="text-[#f5a623]">Instantly.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            Stop guessing. AURELIA calculates exact profit across every OTA,
            channel and group size — in real time.
          </p>

          {/* CTA */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/signup"
              className="aurelia-gold-btn text-base px-8 py-3.5 inline-flex items-center gap-2 font-bold"
            >
              Start Free Trial <ArrowRight size={18} />
            </Link>
            <a
              href="#how-it-works"
              className="px-6 py-3 text-sm font-semibold text-gray-400 hover:text-white border border-white/10 rounded-lg hover:border-white/20 transition-all inline-flex items-center gap-2"
            >
              See how it works <ChevronDown size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* ─── STATS ROW ─── */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-white/5 rounded-2xl overflow-hidden bg-[#0d0d14]">
          {[
            { value: '14 days', label: 'Free trial, no card needed' },
            { value: '€0 setup', label: 'Live in minutes' },
            { value: '100%', label: 'Your data, isolated & secure' },
          ].map((stat, i) => (
            <div
              key={i}
              className={`py-8 px-6 text-center ${
                i < 2 ? 'md:border-r border-b md:border-b-0 border-white/5' : ''
              }`}
            >
              <p className="text-2xl font-extrabold text-white mb-1">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: '👥',
              title: 'Simulate Any Group',
              desc: 'Set your group composition once. Every channel updates instantly.',
            },
            {
              icon: '📡',
              title: 'All Channels. One Dashboard.',
              desc: 'Viator, GYG, Airbnb, your website. See profit side by side.',
            },
            {
              icon: '📊',
              title: 'Real Numbers. Real Decisions.',
              desc: 'Profit, margin, break-even — calculated to the cent.',
            },
          ].map((card, i) => (
            <div
              key={i}
              className="rounded-xl bg-[#13131a] border border-[#1e1e2e] p-7 hover:border-[#f5a623]/20 transition-all duration-300 group"
            >
              <div className="text-3xl mb-4">{card.icon}</div>
              <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#f5a623] transition-colors">
                {card.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="max-w-4xl mx-auto px-6 pb-28">
        <h2 className="text-2xl font-bold text-center mb-14">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '01', title: 'Add your tours & options' },
            { step: '02', title: 'Set prices per channel' },
            { step: '03', title: 'Simulate any group size → see profit live' },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="w-12 h-12 rounded-full bg-[#f5a623]/10 text-[#f5a623] font-bold text-sm flex items-center justify-center mx-auto mb-4 border border-[#f5a623]/20">
                {item.step}
              </div>
              <p className="text-sm font-semibold text-gray-300">{item.title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">
            © 2025 AURELIA · Pricing Intelligence for Tour Operators
          </p>
          <div className="flex items-center gap-6 text-xs text-gray-500">
            <Link to="/login" className="hover:text-gray-300 transition-colors">
              Login
            </Link>
            <Link to="/signup" className="hover:text-gray-300 transition-colors">
              Sign Up
            </Link>
            <a href="mailto:hello@aureliaio.com" className="hover:text-gray-300 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
