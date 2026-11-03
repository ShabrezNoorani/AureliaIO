import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Search, X } from 'lucide-react';
import Logo from '@/components/Logo';
import {
  FAQ_SECTIONS, filterFaqSections, highlightParts, searchTerms, type FaqItem,
} from '@/lib/faqContent';

// Same fixed, self-contained palette as LandingPage.tsx/PricingPage.tsx — never the app's
// --theme-* tokens, so this public page's look can't follow the signed-in light/dark toggle.
const INK = '#1C1917';
const INK_SOFT = '#44403C';
const INK_MUTED = '#78716C';
const PAPER = '#F7F6F3';
const HAIRLINE = '#E5E1D8';
const GOLD = '#B45309';
const GOLD_SOFT = '#92400E';

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightParts(text, terms).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded px-0.5" style={{ background: `${GOLD}2E`, color: INK }}>{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

function FaqAccordionItem({ item, terms, open, onToggle }: {
  item: FaqItem; terms: string[]; open: boolean; onToggle: () => void;
}) {
  const panelId = `faq-panel-${item.id}`;
  const buttonId = `faq-button-${item.id}`;
  return (
    <div
      className="rounded-2xl bg-white transition-shadow duration-300"
      style={{
        border: `1px solid ${open ? `${GOLD}40` : HAIRLINE}`,
        boxShadow: open ? '0 12px 32px -16px rgba(28,25,23,0.18)' : 'none',
      }}
    >
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="w-full flex items-start justify-between gap-4 text-left px-5 py-4 md:px-6 md:py-5 min-h-[56px]"
        >
          <span className="text-[15px] md:text-base font-bold leading-snug" style={{ color: INK }}>
            <Highlighted text={item.question} terms={terms} />
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 mt-0.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            style={{ color: open ? GOLD : INK_MUTED }}
          />
        </button>
      </h3>
      {/* grid-rows 0fr -> 1fr animates to the content's natural height, no measuring needed. */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 md:px-6 md:pb-6 space-y-3 text-sm md:text-[15px] leading-relaxed" style={{ color: INK_SOFT }}>
            {item.answer.split('\n\n').map((para, i) => (
              <p key={i}><Highlighted text={para} terms={terms} /></p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FaqPage() {
  const [query, setQuery] = useState('');
  // Browsing: items open only when tapped. Searching: every match opens (so highlights are
  // visible), and a tap closes one — tracked separately and reset whenever the query changes.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [closedWhileSearching, setClosedWhileSearching] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const sections = useMemo(() => filterFaqSections(FAQ_SECTIONS, query), [query]);
  const resultCount = sections.reduce((n, s) => n + s.items.length, 0);

  useEffect(() => { setClosedWhileSearching(new Set()); }, [query]);

  // "/" focuses search from anywhere on the page (unless already typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isOpen = (id: string) => (searching ? !closedWhileSearching.has(id) : openIds.has(id));
  const toggle = (id: string) => {
    const flip = (prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    };
    if (searching) setClosedWhileSearching(flip); else setOpenIds(flip);
  };

  const jumpTo = (sectionId: string) => {
    document.getElementById(`faq-section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen font-sans" style={{ background: PAPER, color: INK }}>
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md border-b" style={{ background: `${PAPER}CC`, borderColor: HAIRLINE }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo size="md" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          </Link>
          <div className="flex items-center gap-5">
            <Link to="/" className="hidden sm:inline-flex text-sm font-semibold items-center gap-1.5 transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
              <ArrowLeft size={14} /> Home
            </Link>
            <Link to="/pricing" className="text-sm font-semibold transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>
              Pricing
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

      {/* ─── HEADER + SEARCH ─── */}
      <header className="relative pt-32 pb-10 md:pt-40 md:pb-14 px-6 overflow-hidden">
        <div aria-hidden className="absolute -top-24 -left-24 w-[380px] h-[380px] rounded-full blur-[110px] pointer-events-none" style={{ background: `${GOLD}1F` }} />
        <div aria-hidden className="absolute top-10 -right-24 w-[340px] h-[340px] rounded-full blur-[110px] pointer-events-none" style={{ background: '#D6C9A82E' }} />
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <span className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: GOLD }}>Help centre</span>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight mt-3 mb-4" style={{ color: INK }}>
            Frequently asked questions
          </h1>
          <p className="text-base md:text-lg mb-9" style={{ color: INK_SOFT }}>
            Everything about AURELIA, Market Intelligence (AQUILA), plans and getting started.
          </p>

          <div className="relative max-w-xl mx-auto">
            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: INK_MUTED }} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
              placeholder="Search questions — try “tour”, “pay” or “AQUILA”"
              aria-label="Search frequently asked questions"
              autoComplete="off"
              className="w-full h-14 rounded-2xl bg-white pl-12 pr-12 text-base outline-none transition-shadow [&::-webkit-search-cancel-button]:hidden"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK, boxShadow: '0 16px 40px -20px rgba(28,25,23,0.2)' }}
              onFocus={(e) => (e.currentTarget.style.boxShadow = `0 0 0 3px ${GOLD}33, 0 16px 40px -20px rgba(28,25,23,0.2)`)}
              onBlur={(e) => (e.currentTarget.style.boxShadow = '0 16px 40px -20px rgba(28,25,23,0.2)')}
            />
            {query ? (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-stone-100"
                style={{ color: INK_MUTED }}
              >
                <X size={16} />
              </button>
            ) : (
              <kbd className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold px-2 py-1 rounded-md" style={{ border: `1px solid ${HAIRLINE}`, color: INK_MUTED }}>/</kbd>
            )}
          </div>

          <p className="text-xs font-semibold mt-4 h-4" style={{ color: INK_MUTED }} aria-live="polite">
            {searching && (resultCount === 1 ? '1 matching question' : `${resultCount} matching questions`)}
          </p>
        </div>
      </header>

      <main className="px-6 pb-24 md:pb-32">
        <div className="max-w-3xl mx-auto">
          {/* Section chips — jump links while browsing; hidden during a search. */}
          {!searching && (
            <div className="flex flex-wrap justify-center gap-2 mb-12">
              {FAQ_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpTo(s.id)}
                  className="text-xs font-bold px-3.5 py-2 rounded-full transition-colors hover:bg-white"
                  style={{ border: `1px solid ${HAIRLINE}`, color: INK_SOFT }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}

          {sections.length === 0 ? (
            <div className="text-center rounded-3xl bg-white px-6 py-14" style={{ border: `1px solid ${HAIRLINE}` }}>
              <p className="font-serif text-2xl font-semibold mb-2" style={{ color: INK }}>No questions match “{query.trim()}”</p>
              <p className="text-sm mb-6" style={{ color: INK_SOFT }}>Try a shorter or different word — or just ask us directly.</p>
              <a href="mailto:shabirshabrez1998@gmail.com" className="inline-block text-sm font-bold px-6 py-3 rounded-xl text-white" style={{ background: GOLD }}>
                Contact us
              </a>
            </div>
          ) : (
            <div className="space-y-12">
              {sections.map((section) => (
                <section key={section.id} id={`faq-section-${section.id}`} className="scroll-mt-24">
                  <h2 className="text-xs font-bold tracking-[0.2em] uppercase mb-4 px-1" style={{ color: GOLD_SOFT }}>
                    {section.title}
                  </h2>
                  <div className="space-y-3">
                    {section.items.map((item) => (
                      <FaqAccordionItem
                        key={item.id}
                        item={item}
                        terms={terms}
                        open={isOpen(item.id)}
                        onToggle={() => toggle(item.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="mt-16 rounded-3xl p-8 md:p-10 text-center" style={{ background: INK }}>
            <p className="font-serif text-2xl md:text-3xl font-semibold text-white mb-2">Still have a question?</p>
            <p className="text-sm md:text-base mb-6" style={{ color: '#D6D3D1' }}>We're happy to help, or to walk you through the platform.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a href="mailto:shabirshabrez1998@gmail.com" className="text-sm font-bold px-6 py-3 rounded-xl text-white" style={{ background: GOLD }}>
                Email us
              </a>
              <a href="tel:+33755091524" className="text-sm font-semibold px-6 py-3 rounded-xl" style={{ border: '1px solid #FFFFFF33', color: '#F5F5F4' }}>
                +33 7 55 09 15 24
              </a>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-12 px-6" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="sm" showSubtitle={false} wordmarkClassName="text-[#B45309]" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold" style={{ color: INK_SOFT }}>
            <Link to="/how-it-works" className="transition-colors hover:opacity-70">How it works</Link>
            <Link to="/pricing" className="transition-colors hover:opacity-70">Pricing</Link>
            <Link to="/faq" className="transition-colors hover:opacity-70">FAQ</Link>
            <a href="mailto:shabirshabrez1998@gmail.com" className="transition-colors hover:opacity-70">Contact</a>
            <a href="tel:+33755091524" className="transition-colors hover:opacity-70">+33 7 55 09 15 24</a>
          </div>
          <p className="text-xs font-medium" style={{ color: INK_MUTED }}>© 2026 AURELIA</p>
        </div>
      </footer>
    </div>
  );
}
