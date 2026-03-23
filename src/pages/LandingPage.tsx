import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import Logo from '@/components/Logo';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo size="md" />
          </Link>
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

      {/* ─── SECTION 1: HERO ─── */}
      <section className="pt-40 pb-24 px-6 text-center relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#f5a623]/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Headline */}
          <h1 className="text-5xl md:text-[60px] leading-[1.1] font-extrabold tracking-tight mb-6">
            The Operating System<br />
            for Tour Companies<br />
            <span className="text-[#f5a623]">Instantly.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            Pricing intelligence, financial tracking, marketplace coverage — everything a modern tour operator needs in one platform.
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

      {/* ─── SECTION 2: STATS ROW ─── */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-white/5 rounded-2xl overflow-hidden bg-[#0d0d14]">
          {[
            { value: '120+', label: 'Bookings tracked' },
            { value: '€0', label: 'Setup cost' },
            { value: '100%', label: 'Data isolated per company' },
          ].map((stat, i) => (
            <div
              key={i}
              className={`py-8 px-6 text-center ${
                i < 2 ? 'md:border-r border-b md:border-b-0 border-white/5' : ''
              }`}
            >
              <p className="text-2xl font-extrabold text-[#f5a623] mb-1">{stat.value}</p>
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SECTION 3: FEATURES GRID ─── */}
      <section className="max-w-6xl mx-auto px-6 pb-28">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1 - Live */}
          <div className="relative rounded-xl bg-[#13131a] border border-[#f5a623]/30 p-7 hover:border-[#f5a623]/60 transition-all duration-300 group">
            <div className="absolute top-4 right-4 bg-[#f5a623]/20 text-[#f5a623] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Live</div>
            <div className="text-3xl mb-4">💰</div>
            <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#f5a623] transition-colors">Pricing Simulator</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Simulate any group across every OTA. See profit, margin and break-even instantly.</p>
          </div>

          {/* Card 2 - Live */}
          <div className="relative rounded-xl bg-[#13131a] border border-[#f5a623]/30 p-7 hover:border-[#f5a623]/60 transition-all duration-300 group">
            <div className="absolute top-4 right-4 bg-[#f5a623]/20 text-[#f5a623] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Live</div>
            <div className="text-3xl mb-4">📒</div>
            <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#f5a623] transition-colors">Financial Ledger</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Track every booking. Import from Google Sheets or Bokun emails automatically.</p>
          </div>

          {/* Card 3 - Live */}
          <div className="relative rounded-xl bg-[#13131a] border border-[#f5a623]/30 p-7 hover:border-[#f5a623]/60 transition-all duration-300 group">
            <div className="absolute top-4 right-4 bg-[#f5a623]/20 text-[#f5a623] px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Live</div>
            <div className="text-3xl mb-4">📊</div>
            <h3 className="text-base font-bold text-white mb-2 group-hover:text-[#f5a623] transition-colors">Admin Cost Tracking</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Track salaries, rent, marketing. See true company net profit, not just tour profit.</p>
          </div>

          {/* Card 4 - Coming Soon */}
          <div className="relative rounded-xl bg-[#0a0a0f] border border-white/5 p-7 opacity-60 hover:opacity-100 transition-all duration-300">
            <div className="absolute top-4 right-4 bg-white/5 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/10">Coming Soon</div>
            <div className="text-3xl mb-4 grayscale">🗺️</div>
            <h3 className="text-base font-bold text-gray-300 mb-2">Marketplace Coverage</h3>
            <p className="text-sm text-gray-500 leading-relaxed">See which products are live on which OTAs. Find gaps. Never miss a revenue opportunity.</p>
          </div>

          {/* Card 5 - Coming Soon */}
          <div className="relative rounded-xl bg-[#0a0a0f] border border-white/5 p-7 opacity-60 hover:opacity-100 transition-all duration-300">
            <div className="absolute top-4 right-4 bg-white/5 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/10">Coming Soon</div>
            <div className="text-3xl mb-4 grayscale">📈</div>
            <h3 className="text-base font-bold text-gray-300 mb-2">Executive Dashboard</h3>
            <p className="text-sm text-gray-500 leading-relaxed">Revenue by channel, product, guide. Filter by travel date or booking date.</p>
          </div>

          {/* Card 6 - Coming Soon */}
          <div className="relative rounded-xl bg-[#0a0a0f] border border-white/5 p-7 opacity-60 hover:opacity-100 transition-all duration-300">
            <div className="absolute top-4 right-4 bg-white/5 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/10">Coming Soon</div>
            <div className="text-3xl mb-4 grayscale">✅</div>
            <h3 className="text-base font-bold text-gray-300 mb-2">Check-in App</h3>
            <p className="text-sm text-gray-500 leading-relaxed">Mobile check-in for guides. Mark arrivals, note no-shows. Synced to ledger.</p>
          </div>
        </div>
      </section>

      {/* ─── SECTION 4: HOW IT WORKS ─── */}
      <section id="how-it-works" className="max-w-4xl mx-auto px-6 pb-28">
        <h2 className="text-2xl font-bold text-center mb-14">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting line on desktop */}
          <div className="hidden md:block absolute top-[24px] left-[16%] right-[16%] h-[1px] bg-gradient-to-r from-[#f5a623]/0 via-[#f5a623]/20 to-[#f5a623]/0 z-0"></div>
          
          {[
            { step: '01', title: 'Add your tours & options' },
            { step: '02', title: 'Set prices per channel' },
            { step: '03', title: 'Simulate any group size → see profit live' },
          ].map((item, i) => (
            <div key={i} className="text-center relative z-10">
              <div className="w-12 h-12 rounded-full bg-[#0a0a0f] text-[#f5a623] font-bold text-sm flex items-center justify-center mx-auto mb-4 border-2 border-[#f5a623]/30 shadow-[0_0_15px_rgba(245,166,35,0.1)]">
                {item.step}
              </div>
              <p className="text-sm font-semibold text-gray-300">{item.title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── SECTION 5: ROADMAP TIMELINE ─── */}
      <section className="bg-[#0f0f17] border-y border-white/5 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-16">What's Coming to AURELIA</h2>
          
          <div className="relative">
            {/* Horizontal Line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-white/10" />
            
            <div className="grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-4 lg:gap-8">
              {[
                { time: 'Q1 2025', title: 'Pricing Simulator', status: 'done' },
                { time: 'Q2 2025', title: 'Financial Ledger', status: 'done' },
                { time: 'Q3 2025', title: 'Marketplace Coverage', status: 'progress' },
                { time: 'Q4 2025', title: 'Executive Dashboard', status: 'upcoming' },
                { time: 'Q1 2026', title: 'Check-in App', status: 'upcoming' },
                { time: 'Q2 2026', title: 'AI Pricing Intelligence', status: 'upcoming' },
              ].map((item, i) => (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="mb-4 text-xs font-bold tracking-wider text-gray-500">{item.time}</div>
                  
                  {/* Timeline Dot */}
                  <div className={`w-4 h-4 rounded-full border-4 border-[#0f0f17] z-10 mb-4 ${
                    item.status === 'done' ? 'bg-[#f5a623]' : 
                    item.status === 'progress' ? 'bg-[#f5a623] animate-pulse shadow-[0_0_10px_#f5a623]' : 
                    'bg-gray-600'
                  }`} />
                  
                  <div className={`text-sm font-semibold leading-tight ${
                    item.status === 'done' ? 'text-[#f5a623]' : 
                    item.status === 'progress' ? 'text-white' : 
                    'text-gray-500'
                  }`}>
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 6: BLOG PREVIEW ─── */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <div className="text-center mb-14">
          <h2 className="text-2xl font-bold mb-4">Tour Operator Insights</h2>
          <p className="text-gray-500">Strategies to increase your margin and dominate the market.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            {
              cat: 'Pricing', read: '5 min read',
              title: 'How to Calculate Real Profit on Viator (Most Operators Get This Wrong)'
            },
            {
              cat: 'Finance', read: '8 min read',
              title: 'The True Cost of Running a Tour: A Complete Guide'
            },
            {
              cat: 'OTAs', read: '6 min read',
              title: 'Viator vs GYG vs Airbnb: Commission Comparison 2025'
            }
          ].map((blog, i) => (
            <div key={i} className="bg-[#13131a] border border-white/5 rounded-xl p-6 hover:border-[#f5a623]/30 transition-colors flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#f5a623] bg-[#f5a623]/10 px-2 py-1 rounded">{blog.cat}</span>
                <span className="text-xs text-gray-500 font-medium">{blog.read}</span>
              </div>
              <h3 className="text-lg font-bold text-white mb-6 leading-snug flex-1">
                {blog.title}
              </h3>
              <Link to="/blog" className="text-[#f5a623] text-sm font-bold flex items-center gap-1 hover:gap-2 transition-all">
                Read Article <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link to="/blog" className="aurelia-ghost-btn border border-white/10 hover:border-white/30 inline-flex items-center gap-2">
            View All Articles <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ─── SECTION 7: FOOTER ─── */}
      <footer className="border-t border-white/5 bg-[#0a0a0f] py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Logo size="sm" showSubtitle={false} />
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-1">
              Pricing Intelligence for Tour Operators
            </p>
          </div>
          
          <div className="flex items-center gap-6 text-sm font-medium text-gray-400">
            <Link to="/app" className="hover:text-white transition-colors">Dashboard</Link>
            <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link to="/blog" className="hover:text-white transition-colors">Blog</Link>
            <a href="mailto:hello@aureliaio.com" className="hover:text-white transition-colors">Contact</a>
          </div>

          <p className="text-xs text-gray-600 font-medium">
            © 2025 AURELIA
          </p>
        </div>
      </footer>
    </div>
  );
}
