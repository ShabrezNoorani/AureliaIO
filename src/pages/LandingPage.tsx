import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import Logo from '@/components/Logo';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-[#0a0a0f]/80 border-b border-white/5 transition-all">
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
      <section className="pt-40 pb-20 px-6 text-center relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-[#f5a623]/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
          <div className="mb-8 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#f5a623]/30 bg-[#f5a623]/10 text-xs font-bold text-[#f5a623] tracking-widest uppercase shadow-[0_0_15px_rgba(245,166,35,0.1)]">
            ✦ Now live · Used by tour operators in Paris
          </div>
          
          {/* Headline */}
          <h1 className="text-5xl md:text-[68px] leading-[1.05] font-extrabold tracking-tight mb-6">
            The Operating System<br />
            for Tour Companies<br />
            <span className="text-[#f5a623] italic text-[1.1em] font-black inline-block mt-2">Instantly.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-gray-400 text-lg max-w-[600px] mx-auto leading-relaxed mb-10">
            AURELIA connects your OTAs, bookings and costs into one intelligent platform — so you always know your real profit, in real time.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <Link
              to="/signup"
              className="aurelia-gold-btn text-lg px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 font-black shadow-lg shadow-[#f5a623]/20"
            >
              Start Free Trial <ArrowRight size={20} />
            </Link>
            <a
              href="#features"
              className="px-8 py-4 text-base font-semibold text-gray-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 hover:border-white/20 transition-all inline-flex items-center justify-center gap-2"
            >
              See a live demo <ChevronDown size={18} />
            </a>
          </div>
        </div>
      </section>

      {/* ─── STATS ROW ─── */}
      <section className="max-w-4xl mx-auto px-6 pb-24 relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-10 text-gray-500 font-medium text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f5a623]" />
            120+ bookings tracked
          </div>
          <div className="hidden md:block w-1 h-1 rounded-full bg-gray-800" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f5a623]" />
            €4,200+ profit calculated
          </div>
          <div className="hidden md:block w-1 h-1 rounded-full bg-gray-800" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f5a623]" />
            3 OTAs connected
          </div>
        </div>
      </section>

      {/* ─── SECTION 2: FEATURES GRID ─── */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-32">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* CARD 1 - LIVE */}
          <div className="relative rounded-2xl bg-[#0d0d14] border border-[#f5a623] p-8 transition-transform hover:-translate-y-1 shadow-[0_0_20px_rgba(245,166,35,0.05)]">
            <div className="text-4xl mb-6">💰</div>
            <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Pricing Simulator</h3>
            <p className="text-[15px] text-gray-400 leading-relaxed font-medium">
              Set your prices once per OTA. Simulate any group size — adults, youth, children — and see exact profit across every channel instantly.
            </p>
          </div>

          {/* CARD 2 - LIVE */}
          <div className="relative rounded-2xl bg-[#0d0d14] border border-[#f5a623] p-8 transition-transform hover:-translate-y-1 shadow-[0_0_20px_rgba(245,166,35,0.05)]">
            <div className="text-4xl mb-6">📒</div>
            <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Financial Ledger</h3>
            <p className="text-[15px] text-gray-400 leading-relaxed font-medium">
              Every booking tracked. Sync automatically from Google Sheets. Revenue, commission, ticket costs, guide fees — all in one view.
            </p>
          </div>

          {/* CARD 3 - LIVE */}
          <div className="relative rounded-2xl bg-[#0d0d14] border border-[#f5a623] p-8 transition-transform hover:-translate-y-1 shadow-[0_0_20px_rgba(245,166,35,0.05)]">
            <div className="text-4xl mb-6">📊</div>
            <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Admin Cost Tracking</h3>
            <p className="text-[15px] text-gray-400 leading-relaxed font-medium">
              Track salaries, rent, marketing and tools by month. See your true company net profit — not just what your tours make.
            </p>
          </div>

          {/* CARD 4 - LIVE */}
          <div className="relative rounded-2xl bg-[#0d0d14] border border-[#f5a623] p-8 transition-transform hover:-translate-y-1 shadow-[0_0_20px_rgba(245,166,35,0.05)]">
            <div className="text-4xl mb-6">📈</div>
            <h3 className="text-xl font-bold text-white mb-3 tracking-tight">Executive Dashboard</h3>
            <p className="text-[15px] text-gray-400 leading-relaxed font-medium">
              Board-ready analytics. Revenue trends, channel breakdowns, cancellation intelligence and smart alerts — filtered by travel date or booking date.
            </p>
          </div>

          {/* CARD 5 - COMING SOON */}
          <div className="relative rounded-2xl bg-[#0a0a0f] border border-white/10 p-8 opacity-70 hover:opacity-100 transition-all duration-300">
            <div className="absolute top-6 right-6 bg-white/5 text-gray-400 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-white/10">Coming Soon</div>
            <div className="text-4xl mb-6 grayscale">🗺️</div>
            <h3 className="text-xl font-bold text-gray-300 mb-3 tracking-tight">Marketplace Coverage</h3>
            <p className="text-[15px] text-gray-500 leading-relaxed font-medium">
              See which products are live on which OTAs. Find gaps. Never miss a revenue opportunity.
            </p>
          </div>

          {/* CARD 6 - COMING SOON */}
          <div className="relative rounded-2xl bg-[#0a0a0f] border border-white/10 p-8 opacity-70 hover:opacity-100 transition-all duration-300">
            <div className="absolute top-6 right-6 bg-white/5 text-gray-400 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-white/10">Coming Soon</div>
            <div className="text-4xl mb-6 grayscale">✅</div>
            <h3 className="text-xl font-bold text-gray-300 mb-3 tracking-tight">Check-in App</h3>
            <p className="text-[15px] text-gray-500 leading-relaxed font-medium">
              Mobile check-in for guides. Mark arrivals, count pax, note no-shows. Synced to ledger.
            </p>
          </div>

        </div>
      </section>

      {/* ─── SECTION 3: HOW IT WORKS ─── */}
      <section className="bg-[#13131a] border-y border-white/5 py-32 px-6 relative overflow-hidden">
        {/* Decorative Grid */}
        <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDAuNWg0ME0wLjUgMHY0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,transparent,black,transparent)] pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            {[
              { 
                step: '1', 
                title: 'Connect your data', 
                desc: 'Link your Google Sheet or upload a CSV. Your bookings import in seconds.' 
              },
              { 
                step: '2', 
                title: 'Set up your products', 
                desc: 'Add your tours, options and pricing per OTA channel. Takes 10 minutes.' 
              },
              { 
                step: '3', 
                title: 'Know your numbers', 
                desc: 'Open AURELIA every morning to see exactly where your business stands.' 
              },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center group">
                <div className="w-16 h-16 rounded-2xl bg-[#0a0a0f] text-[#f5a623] text-xl font-black flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(245,166,35,0.15)] border border-[#f5a623]/30 group-hover:scale-110 group-hover:bg-[#f5a623]/10 transition-all duration-300">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-gray-400 font-medium leading-relaxed max-w-[280px]">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SECTION 4: ROADMAP TIMELINE ─── */}
      <section className="bg-[#0a0a0f] py-32 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-extrabold mb-4">What's Coming to AURELIA</h2>
            <p className="text-gray-500 font-medium">Our commitment to building the ultimate tour operating system.</p>
          </div>
          
          <div className="relative pl-6 md:pl-0 border-l-2 md:border-l-0 border-white/10 md:grid md:grid-cols-[1fr_2px_1fr] md:gap-x-12">
            {/* Center line for desktop */}
            <div className="hidden md:block absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/10" />

            {[
              { time: 'Q1 2025', title: 'Pricing Simulator', desc: 'Multi-OTA pricing with age-based group simulation', status: 'done' },
              { time: 'Q2 2025', title: 'Financial Ledger + Google Sheets Sync', desc: 'Complete booking tracking with automatic import', status: 'done' },
              { time: 'Q3 2025', title: 'Executive Dashboard + Analytics', desc: 'Board-ready dashboards with travel date and booking date analysis', status: 'done' },
              { time: 'Q4 2025', title: 'Marketplace Coverage Matrix', desc: 'Cross-OTA product visibility tracker', status: 'progress' },
              { time: 'Q1 2026', title: 'Check-in Mobile App', desc: 'Guide-facing mobile check-in tool', status: 'upcoming' },
              { time: 'Q2 2026', title: 'AI Pricing Intelligence', desc: 'Automated pricing recommendations based on your historical data', status: 'upcoming' },
            ].map((item, i) => (
              <div key={i} className={`relative mb-12 ${i % 2 === 0 ? 'md:text-right md:pr-12' : 'md:text-left md:col-start-3 md:pl-12'} md:mb-16`}>
                
                {/* Dot */}
                <div className={`absolute top-1 -left-[32px] md:top-1 ${i % 2 === 0 ? 'md:-right-[55px] md:left-auto' : 'md:-left-[55px]'} w-4 h-4 rounded-full border-[3px] border-[#0a0a0f] z-10 ${
                  item.status === 'done' ? 'bg-[#f5a623]' : 
                  item.status === 'progress' ? 'bg-[#f5a623] animate-pulse shadow-[0_0_12px_rgba(245,166,35,0.6)]' : 
                  'bg-gray-700'
                }`} />
                
                <div className={`text-xs font-black tracking-widest uppercase mb-2 ${item.status === 'upcoming' ? 'text-gray-600' : 'text-[#f5a623]'}`}>
                  {item.time}
                </div>
                <h4 className={`text-lg font-bold mb-2 ${item.status === 'upcoming' ? 'text-gray-400' : 'text-white'}`}>
                  {item.title}
                </h4>
                <p className={`text-sm leading-relaxed ${item.status === 'upcoming' ? 'text-gray-600' : 'text-gray-400'}`}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SECTION 5: BLOG (Preserved Exactly As Requested) ─── */}
      <section className="bg-[#13131a] max-w-none px-6 py-28 border-y border-white/5">
        <div className="max-w-6xl mx-auto">
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
              <div key={i} className="bg-[#0a0a0f] border border-white/5 rounded-xl p-6 hover:border-[#f5a623]/30 transition-colors flex flex-col">
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
        </div>
      </section>

      {/* ─── SECTION 6: FINAL CTA (NEW) ─── */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-5xl mx-auto bg-[#13131a] rounded-3xl border border-[#f5a623]/40 p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 shadow-[0_0_50px_rgba(245,166,35,0.05)] overflow-hidden relative">
          
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#f5a623]/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />

          <div className="md:w-1/2 relative z-10 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight leading-tight">
              Ready to know your real profit?
            </h2>
            <p className="text-gray-400 text-lg font-medium pr-0 md:pr-10">
              Join tour operators who stopped guessing and started knowing.
            </p>
          </div>
          
          <div className="md:w-1/2 flex flex-col items-center md:items-end relative z-10">
            <Link
              to="/signup"
              className="aurelia-gold-btn text-lg px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 font-black shadow-lg shadow-[#f5a623]/25 w-full md:w-auto"
            >
              Start Free Trial <ArrowRight size={20} />
            </Link>
            <p className="text-sm font-semibold text-gray-500 mt-4 text-center md:text-right">
              14 days free · No credit card · Cancel anytime
            </p>
          </div>

        </div>
      </section>

      {/* ─── SECTION 7: FOOTER ─── */}
      <footer className="border-t border-white/5 bg-[#0a0a0f] py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Logo size="sm" showSubtitle={false} />
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">
              Pricing Intelligence for Tour Operators
            </p>
          </div>
          
          <div className="flex items-center gap-6 text-sm font-bold text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <Link to="/app" className="hover:text-white transition-colors">Dashboard</Link>
            <Link to="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <a href="mailto:hello@aureliaio.com" className="hover:text-white transition-colors">Contact</a>
          </div>

          <div className="flex flex-col items-center md:items-end text-xs text-gray-600 font-bold">
            <p className="mb-1">© 2025 AURELIA</p>
            <p>Built for tour operators who mean business.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
