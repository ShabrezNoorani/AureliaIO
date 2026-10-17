import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { fetchBlogBySlug, Blog } from '@/lib/blogService';
import Logo from '@/components/Logo';
import { ArrowLeft, ArrowRight } from 'lucide-react';

// Same fixed, self-contained palette as LandingPage.tsx/HowItWorksPage.tsx.
const INK = '#1C1917';
const INK_SOFT = '#44403C';
const INK_MUTED = '#78716C';
const PAPER = '#F7F6F3';
const HAIRLINE = '#E5E1D8';
const GOLD = '#B45309';

export default function HowItWorksPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      try {
        const data = await fetchBlogBySlug(slug);
        setBlog(data);
      } catch (err) {
        console.error('Fetch article err:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: GOLD, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center font-sans gap-4" style={{ background: PAPER, color: INK }}>
        <h1 className="text-3xl font-bold">Article not found</h1>
        <Link to="/how-it-works" className="font-semibold hover:underline flex items-center gap-2" style={{ color: GOLD }}>
          ← Back to How it works
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: PAPER, color: INK }}>
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

      {/* ─── ARTICLE CONTAINER ─── */}
      <main className="pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <Link to="/how-it-works" className="inline-flex items-center gap-2 text-sm font-semibold mb-10 transition-colors hover:opacity-70" style={{ color: INK_MUTED }}>
          <ArrowLeft size={16} /> All articles
        </Link>

        <header className="mb-14">
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded mb-6" style={{ color: GOLD, background: `${GOLD}14` }}>
            {blog.category}
          </span>
          <h1 className="font-serif text-4xl md:text-[2.5rem] font-semibold leading-tight tracking-tight mb-6" style={{ color: INK }}>
            {blog.title}
          </h1>
          <div className="text-sm font-medium mb-8" style={{ color: INK_MUTED }}>
            {blog.read_time} min read · Published {blog.published_at ? new Date(blog.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Recently'}
          </div>
          <div className="h-[1px] w-full" style={{ background: HAIRLINE }} />
        </header>

        <article
          className="prose prose-lg max-w-none leading-[1.8]"
          style={{ color: INK_SOFT }}
        >
          <ReactMarkdown>{blog.content}</ReactMarkdown>
        </article>

        <div className="mt-20 pt-1" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <div className="rounded-2xl p-8 md:p-12 text-center mt-12" style={{ background: 'white', border: `1px solid ${HAIRLINE}` }}>
            <h3 className="font-serif text-2xl font-semibold mb-4" style={{ color: INK }}>
              See it for yourself.
            </h3>
            <p className="mb-8 max-w-lg mx-auto leading-relaxed" style={{ color: INK_SOFT }}>
              Start a free trial, or read the step-by-step walkthrough of how AURELIA runs a tour day.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-white inline-flex items-center justify-center gap-2 shadow-sm"
                style={{ background: GOLD }}
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                to="/how-it-works"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold text-center transition-colors"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK_SOFT }}
              >
                How it works →
              </Link>
            </div>
          </div>
        </div>
      </main>

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
