import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/"><Logo size="sm" showSubtitle={false} /></Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">Login</Link>
            <Link to="/signup" className="aurelia-gold-btn text-sm px-5 py-2.5 inline-flex items-center gap-2">Start Free Trial</Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">AURELIA Blog</h1>
        <p className="text-lg text-gray-400 mb-8">
          Coming soon — insights, strategies, and data for modern tour operators.
        </p>
        <Link to="/" className="text-[#f5a623] hover:underline font-medium text-sm">
          ← Back to Home
        </Link>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6">
        <p className="text-center text-xs text-gray-600">
          © 2025 AURELIA · Built for Tour Operators
        </p>
      </footer>
    </div>
  );
}
