import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { fetchBlogBySlug, Blog } from '@/lib/blogService';
import Logo from '@/components/Logo';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export default function BlogPostPage() {
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
        console.error('Fetch blog err:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center font-sans">
        <h1 className="text-3xl font-bold mb-4">Article not found</h1>
        <Link to="/blog" className="text-[#f5a623] hover:underline flex items-center gap-2">
          ← Back to Blog
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans selection:bg-[#f5a623]/30">
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

      {/* ─── ARTICLE CONTAINER ─── */}
      <main className="pt-32 pb-24 px-6 max-w-3xl mx-auto w-full">
        <Link to="/blog" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-10">
          <ArrowLeft size={16} /> All Articles
        </Link>

        {/* Header */}
        <header className="mb-14">
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#f5a623] bg-[#f5a623]/10 px-2.5 py-1 rounded mb-6">
            {blog.category}
          </span>
          <h1 className="text-4xl md:text-[40px] font-extrabold leading-tight tracking-tight text-white mb-6">
            {blog.title}
          </h1>
          <div className="text-gray-500 text-sm font-medium mb-8">
            {blog.read_time} min read · Published {blog.published_at ? new Date(blog.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Recently'}
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#f5a623]/30 to-transparent" />
        </header>

        {/* Markdown Content */}
        <article className="prose prose-invert prose-lg max-w-none text-[#94a3b8] tracking-[0.015em] leading-[1.8]
          prose-headings:text-white prose-headings:font-bold
          prose-h2:text-24px prose-h2:mt-12 prose-h2:mb-6 prose-h2:border-l-4 prose-h2:border-[#f5a623] prose-h2:pl-4
          prose-h3:text-20px prose-h3:mt-8 prose-h3:mb-4
          prose-p:mb-6 prose-p:text-[16px]
          prose-strong:text-white prose-strong:font-bold
          prose-ul:list-disc prose-ul:pl-5
          prose-li:marker:text-[#f5a623] prose-li:mb-2
          prose-a:text-[#f5a623] prose-a:no-underline hover:prose-a:underline
          prose-blockquote:border-l-4 prose-blockquote:border-[#f5a623] prose-blockquote:bg-[#13131a] prose-blockquote:py-2 prose-blockquote:px-5 prose-blockquote:italic prose-blockquote:text-gray-300
          prose-table:w-full prose-table:border-collapse prose-table:bg-[#13131a] prose-table:rounded-lg prose-table:overflow-hidden prose-table:my-8
          prose-th:bg-[#f5a623]/10 prose-th:text-[#f5a623] prose-th:text-left prose-th:p-4 prose-th:font-bold
          prose-td:p-4 prose-td:border-t prose-td:border-white/5
        ">
          <ReactMarkdown>
            {blog.content}
          </ReactMarkdown>
        </article>

        {/* CTA */}
        <div className="mt-20 pt-1 border-t border-white/5">
          <div className="bg-[#13131a] border border-[#f5a623]/30 rounded-2xl p-8 md:p-12 text-center mt-12 relative overflow-hidden group">
            {/* Background glow interaction */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-[#f5a623]/5 rounded-full blur-[100px] group-hover:bg-[#f5a623]/10 transition-colors pointer-events-none" />
            
            <h3 className="text-2xl font-bold text-white mb-4 relative z-10">
              Ready to know your real profit?
            </h3>
            <p className="text-gray-400 mb-8 max-w-lg mx-auto relative z-10 leading-relaxed">
              AURELIA calculates exact profit across every OTA channel — in real time. Including commissions, fees, and internal costs.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
              <Link to="/signup" className="aurelia-gold-btn w-full sm:w-auto px-8 py-3.5 font-bold inline-flex items-center justify-center gap-2">
                Start Free Trial <ArrowRight size={16} />
              </Link>
              <Link to="/" className="w-full sm:w-auto px-8 py-3.5 font-bold text-gray-300 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all text-center">
                See Pricing Simulator →
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* ─── FOOTER ─── */}
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
