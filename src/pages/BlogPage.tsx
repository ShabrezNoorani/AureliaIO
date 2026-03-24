import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import { fetchPublishedBlogs, Blog } from '@/lib/blogService';
import { ArrowRight } from 'lucide-react';

export default function BlogPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchPublishedBlogs();
        setBlogs(data || []);
      } catch (err) {
        console.error('Failed to load blogs:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

      {/* ─── HERO ─── */}
      <section className="pt-40 pb-20 px-6 text-center max-w-4xl mx-auto relative">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-6 relative inline-block">
          Tour Operator Insights
          {/* Gold underline accent */}
          <div className="absolute -bottom-2 left-1/4 right-1/4 h-[3px] bg-[#f5a623] rounded-full" />
        </h1>
        <p className="text-lg md:text-xl text-gray-400 mt-8 max-w-2xl mx-auto leading-relaxed">
          Pricing strategies, financial guides and OTA comparisons — written for tour operators.
        </p>
      </section>

      {/* ─── BLOG GRID ─── */}
      <section className="max-w-5xl mx-auto px-6 pb-32 min-h-[40vh]">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#f5a623] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : blogs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {blogs.map(blog => (
              <Link 
                key={blog.id} 
                to={`/blog/${blog.slug}`}
                className="block bg-[#13131a] rounded-xl p-8 border border-white/5 hover:border-[#f5a623]/40 hover:shadow-[0_0_20px_rgba(245,166,35,0.05)] transition-all duration-300 group flex flex-col h-full"
              >
                {/* Category Badge */}
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#f5a623] bg-[#f5a623]/10 px-2.5 py-1 rounded mb-5 w-fit">
                  {blog.category}
                </span>

                {/* Title */}
                <h2 className="text-[18px] font-bold text-white mb-3 group-hover:text-[#f5a623] transition-colors leading-snug">
                  {blog.title}
                </h2>

                {/* Excerpt */}
                <p className="text-sm text-gray-400 leading-relaxed mb-8 line-clamp-2 flex-grow">
                  {blog.excerpt}
                </p>

                {/* Meta & CTA */}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-xs text-gray-500 font-medium">
                    {blog.read_time} min read · {blog.published_at ? new Date(blog.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}
                  </span>
                  <span className="text-[#f5a623] text-sm font-bold flex items-center gap-1 group-hover:gap-2 transition-all">
                    Read Article <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 border border-white/5 rounded-2xl bg-[#0a0a0f]">
            <p className="text-gray-400 text-lg">Articles coming soon.</p>
            <p className="text-gray-500 text-sm mt-2">Check back next week.</p>
          </div>
        )}
      </section>

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
            <Link to="/blog" className="hover:text-white transition-colors break-words">Blog</Link>
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
