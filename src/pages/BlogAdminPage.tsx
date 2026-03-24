import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchAllBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
  publishBlog,
  Blog,
  BlogInput
} from '@/lib/blogService';
import { PenSquare, Trash2, EyeOff, Check, X, Sparkles } from 'lucide-react';

const CATEGORIES = ['Pricing', 'Finance', 'OTAs', 'Strategy', 'News'];

// ─── SAMPLE POSTS DATA ───
const SAMPLE_POSTS: BlogInput[] = [
  {
    title: "How to Calculate Real Profit on Viator (Most Tour Operators Get This Wrong)",
    slug: "how-to-calculate-real-profit-on-viator",
    category: "Pricing",
    read_time: 6,
    excerpt: "Most tour operators miscalculate their Viator profit. Learn the exact formula — including promotions, commissions and ticket costs — to know your real earnings.",
    published: true,
    published_at: new Date('2025-03-01').toISOString(),
    content: "## The Hidden Costs of Viator\nMost operators only calculate the 20-25% baseline commission, ignoring standard fees. To properly account for..."
  },
  {
    title: "The True Cost of Running a Tour: A Complete Guide for Tour Operators",
    slug: "true-cost-of-running-a-tour-complete-guide",
    category: "Finance",
    read_time: 8,
    excerpt: "What does it really cost to run a tour? This complete guide covers every cost category — from guide fees and tickets to admin overhead.",
    published: true,
    published_at: new Date('2025-03-08').toISOString(),
    content: "## Beyond the Guide Fee\nWhen building a pricing simulation, you must account for all amortized administrative overheads. Consider marketing, rent, and..."
  },
  {
    title: "Viator vs GetYourGuide vs Airbnb: Commission Comparison 2025",
    slug: "viator-vs-getyourguide-vs-airbnb-commission-comparison-2025",
    category: "OTAs",
    read_time: 7,
    excerpt: "A detailed comparison of commission structures across the top OTA platforms — including hidden costs and which gives the best margins.",
    published: true,
    published_at: new Date('2025-03-15').toISOString(),
    content: "## Understanding Net Payouts\nEach OTA structures their merchant of record fees differently. Viator operates on a standard 20-30% range, while GYG relies heavily on volume..."
  }
];

export default function BlogAdminPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [currentBlogId, setCurrentBlogId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<BlogInput>>({
    title: '', slug: '', excerpt: '', content: '', category: 'Pricing', read_time: 5, published: false
  });
  const [saving, setSaving] = useState(false);
  const [checkComplete, setCheckComplete] = useState(false);

  // AI Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCategory, setAiCategory] = useState('Pricing');
  const [aiLength, setAiLength] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-Save Timer
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const loadBlogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAllBlogs();
      setBlogs(data || []);
      setCheckComplete(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load blogs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlogs();
  }, [loadBlogs]);

  // Seed sample posts if empty
  const handleSeedPosts = async () => {
    setLoading(true);
    try {
      for (const post of SAMPLE_POSTS) {
        await createBlog(post);
      }
      await loadBlogs();
    } catch (err: any) {
      setError('Failed to seed posts: ' + err.message);
      setLoading(false);
    }
  };

  // ─── EDITOR LOGIC ───
  const openNewPost = () => {
    setCurrentBlogId(null);
    setFormData({ title: '', slug: '', excerpt: '', content: '', category: 'Pricing', read_time: 5, published: false });
    setIsEditorOpen(true);
    setLastSaved(null);
  };

  const openEditPost = (blog: Blog) => {
    setCurrentBlogId(blog.id);
    setFormData({
      title: blog.title, slug: blog.slug, excerpt: blog.excerpt, content: blog.content,
      category: blog.category, read_time: blog.read_time, published: blog.published
    });
    setIsEditorOpen(true);
    setLastSaved(null);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setFormData({});
    setCurrentBlogId(null);
  };

  const handleTitleChange = (val: string) => {
    setFormData(prev => ({
      ...prev, title: val,
      slug: prev.slug === '' || prev.slug === generateSlug(prev.title || '') ? generateSlug(val) : prev.slug
    }));
  };

  const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  // Manual save generic
  const handleSave = async (publishNow = false) => {
    if (!formData.title) return alert('Title required');
    setSaving(true);
    try {
      const payload: Partial<BlogInput> = {
        title: formData.title || 'Untitled',
        slug: formData.slug || generateSlug(formData.title || 'untitled'),
        excerpt: formData.excerpt || '',
        content: formData.content || '',
        category: formData.category || 'Pricing',
        read_time: Number(formData.read_time) || 5,
        published: publishNow || formData.published || false
      };
      
      if (publishNow) {
         payload.published_at = new Date().toISOString();
      }

      if (currentBlogId) {
        await updateBlog(currentBlogId, payload);
      } else {
        const newBlog = await createBlog(payload as BlogInput);
        setCurrentBlogId(newBlog.id);
      }
      setLastSaved(new Date());
      await loadBlogs();
      if (publishNow) closeEditor();
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Auto-save logic
  useEffect(() => {
    if (!isEditorOpen || !formData.title || !formData.content) return;
    const timer = setInterval(() => {
      // Only auto-save if we change something (simplistic check is to just save)
      handleSave(false);
    }, 30000);
    return () => clearInterval(timer);
  }, [isEditorOpen, formData, currentBlogId]);

  // Actions
  const handleTogglePublish = async (blog: Blog) => {
    try {
       await updateBlog(blog.id, { published: !blog.published, published_at: !blog.published ? new Date().toISOString() : null });
       loadBlogs();
    } catch (e) {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this blog post?')) return;
    try {
      await deleteBlog(id);
      loadBlogs();
    } catch (e: any) { alert(e.message); }
  };

  // ─── AI GENERATION ───
  const handleGenerateAI = async () => {
    if (!aiTopic) return alert('Please enter a topic');
    setIsGenerating(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20240620', // modern stable model
          max_tokens: 3000,
          messages: [{
            role: 'user',
            content: `Write a detailed SEO blog post for AURELIA, a pricing intelligence platform for tour operators.

Topic: ${aiTopic}
Category: ${aiCategory}
Target read time: ${aiLength} minutes

Requirements:
- Write in markdown format
- Use ## for section headers
- Include practical examples with real numbers
- Mention tour operators, OTAs (Viator, GYG, Airbnb)
- End with a call-to-action mentioning AURELIA
- SEO optimized — include the main topic keyword naturally throughout
- Professional but accessible tone
- Include a comparison table if relevant

Start directly with the article content.
Do not include a title — just the body.`
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.content[0].text;
      
      const newTitle = aiTopic;
      setFormData({
        title: newTitle,
        slug: generateSlug(newTitle),
        category: aiCategory,
        read_time: aiLength,
        content: content,
        excerpt: content.substring(0, 150).replace(/[#*`]/g, '') + '...',
        published: false
      });
      
      setCurrentBlogId(null);
      setIsAiModalOpen(false);
      setIsEditorOpen(true);
      setAiTopic('');
    } catch (err: any) {
      alert('AI Generation Failed: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 pb-32 max-w-[1200px] mx-auto text-white">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Blog Manager</h1>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="aurelia-ghost-btn px-4 py-2 flex items-center gap-2 border border-[#f5a623]/30 text-[#f5a623] hover:bg-[#f5a623]/10"
          >
            <Sparkles size={16} /> Generate with AI
          </button>
          <button 
            onClick={openNewPost}
            className="aurelia-gold-btn px-5 py-2 flex items-center gap-2"
          >
            + New Post
          </button>
        </div>
      </div>

      {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded">{error}</div>}

      {/* EMPTY SEED BANNER */}
      {!loading && checkComplete && blogs.length === 0 && (
        <div className="mb-8 p-6 bg-[#f5a623]/10 border border-[#f5a623] rounded-xl flex items-center justify-between shadow-lg shadow-[#f5a623]/10">
          <div>
            <h3 className="text-lg font-bold text-[#f5a623] mb-1">No articles yet. Add 3 sample articles to get started?</h3>
          </div>
          <button onClick={handleSeedPosts} className="aurelia-ghost-btn border border-[#f5a623]/50 text-[#f5a623] hover:bg-[#f5a623]/20 px-6 py-2">
            Add Sample Posts
          </button>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-panel-bg border border-border/50 rounded-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/20 border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-semibold">Title</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Published Date</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading blogs...</td></tr>
              ) : blogs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No blogs found.</td></tr>
              ) : (
                blogs.map(blog => (
                  <tr key={blog.id} className="border-b border-border/30 hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-medium max-w-[300px] truncate">{blog.title}</td>
                    <td className="px-6 py-4">
                      <span className="bg-white/5 px-2 py-1 flex w-fit rounded text-xs text-gray-300 font-medium">
                        {blog.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {blog.published ? (
                        <span className="bg-green-500/10 text-green-500 border border-green-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Published</span>
                      ) : (
                        <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">Draft</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {blog.published && blog.published_at ? new Date(blog.published_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => handleTogglePublish(blog)} className="text-gray-400 hover:text-white transition-colors" title={blog.published ? 'Unpublish' : 'Publish'}>
                          {blog.published ? <EyeOff size={16} /> : <Check size={16} />}
                        </button>
                        <button onClick={() => openEditPost(blog)} className="text-gray-400 hover:text-[#f5a623] transition-colors">
                          <PenSquare size={16} />
                        </button>
                        <button onClick={() => handleDelete(blog.id)} className="text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDITOR SLIDE-IN */}
      {isEditorOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={closeEditor} />
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-[#0f0f17] border-l border-white/10 z-50 shadow-2xl flex flex-col transform transition-transform duration-300">
            {/* Editor Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
              <div className="flex items-center gap-4">
                <h2 className="font-bold text-lg">{currentBlogId ? 'Edit Post' : 'New Post'}</h2>
                {lastSaved && <span className="text-xs text-green-500">Saved {lastSaved.toLocaleTimeString()}</span>}
              </div>
              <button onClick={closeEditor} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
            
            {/* Editor Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Title</label>
                <input 
                  type="text" value={formData.title || ''} onChange={e => handleTitleChange(e.target.value)}
                  className="w-full bg-[#13131a] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#f5a623] focus:ring-1 focus:ring-[#f5a623] transition-all text-xl font-bold"
                  placeholder="The True Cost of Running a Tour"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Slug</label>
                  <input type="text" value={formData.slug || ''} onChange={e => setFormData({...formData, slug: e.target.value})} className="aurelia-input" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                  <select value={formData.category || 'Pricing'} onChange={e => setFormData({...formData, category: e.target.value})} className="aurelia-input appearance-none bg-[#13131a]">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Read Time (minutes)</label>
                <input type="number" min="1" value={formData.read_time || 5} onChange={e => setFormData({...formData, read_time: Number(e.target.value)})} className="aurelia-input w-32" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Excerpt (2-3 sentences)</label>
                <textarea rows={3} value={formData.excerpt || ''} onChange={e => setFormData({...formData, excerpt: e.target.value})} className="aurelia-input resize-none" placeholder="Brief summary for the blog card grid..." />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Content (Markdown)</label>
                  <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noreferrer" className="text-xs text-[#f5a623] hover:underline">Markdown Cheatsheet</a>
                </div>
                <textarea 
                  rows={20} value={formData.content || ''} onChange={e => setFormData({...formData, content: e.target.value})} 
                  className="aurelia-input font-mono text-sm leading-relaxed" 
                  placeholder="## Introduction..."
                />
              </div>
            </div>

            {/* Editor Footer */}
            <div className="p-6 border-t border-white/5 bg-[#0a0a0f] flex items-center justify-between">
              <button 
                onClick={() => handleSave(false)} disabled={saving}
                className="aurelia-ghost-btn px-6 py-2 border border-white/20 text-gray-300 hover:text-white"
              >
                {saving ? 'Saving...' : 'Save as Draft'}
              </button>
              <button 
                onClick={() => handleSave(true)} disabled={saving}
                className="aurelia-gold-btn px-6 py-2 font-bold"
              >
                Save & Publish
              </button>
            </div>
          </div>
        </>
      )}

      {/* AI MODAL */}
      {isAiModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0f0f17] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0f]">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-[#f5a623]" /> Generate Blog Post with AI
                </h2>
                <button onClick={() => !isGenerating && setIsAiModalOpen(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Topic</label>
                  <input 
                    type="text" value={aiTopic} onChange={e => setAiTopic(e.target.value)} disabled={isGenerating}
                    className="aurelia-input" placeholder="e.g. How to price Louvre tours"
                  />
                  <p className="text-xs text-gray-500 mt-2">What should this article be about?</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                    <select value={aiCategory} onChange={e => setAiCategory(e.target.value)} disabled={isGenerating} className="aurelia-input bg-[#13131a]">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Target Length</label>
                    <select value={aiLength} onChange={e => setAiLength(Number(e.target.value))} disabled={isGenerating} className="aurelia-input bg-[#13131a]">
                      <option value={5}>Short (5 min)</option>
                      <option value={8}>Medium (8 min)</option>
                      <option value={12}>Long (12 min)</option>
                    </select>
                  </div>
                </div>

                <button 
                  onClick={handleGenerateAI} disabled={isGenerating}
                  className="w-full aurelia-gold-btn py-3 font-bold flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <><div className="w-5 h-5 border-2 border-[#0a0a0f] border-t-transparent flex items-center justify-center rounded-full animate-spin" /> Writing your article...</>
                  ) : 'Generate Article'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
