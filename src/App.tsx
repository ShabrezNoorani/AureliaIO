import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import FinancialCanvas from "@/components/ParticleCanvas";
import { setupGuideTables } from "./lib/setupTables";
import { useEffect, lazy, Suspense } from "react";

// Route-level code splitting: each top-level route is its own chunk, fetched only when that route
// is actually visited. AppLayout and GuideLayout in particular each statically import their own
// entire internal page set (they switch between "views" via local state rather than nested
// react-router routes/<Outlet/> — see below), so lazy-loading just these two is what actually
// separates the owner bundle from the guide bundle; a guide's initial download never touches
// Analytics/Dispatch/Ledger/BlogAdmin/etc.
const LandingPage = lazy(() => import("./pages/LandingPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage"));
const CheckinApp = lazy(() => import("./pages/CheckinApp"));
const GuideClaimPage = lazy(() => import("./pages/GuideClaimPage"));
const AppLayout = lazy(() => import("./pages/AppLayout"));
const GuideLayout = lazy(() => import("./pages/GuideLayout"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Small, dependency-free — safe to keep in the main chunk so it never itself waits on a lazy
// chunk to display.
const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
  </div>
);

const queryClient = new QueryClient();

// Logged-out visitors see the marketing landing page at "/"; logged-in users are redirected
// to their role's home — owners to /app, guides to /guide.
const RootRoute = () => {
  const { session, loading, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session && !loading && role) {
      navigate(role === 'guide' ? '/guide' : '/app', { replace: true });
    }
  }, [session, loading, role, navigate]);

  return <LandingPage />;
};

const AppContent = () => {
  const location = useLocation();

  useEffect(() => {
    setupGuideTables();
  }, []);

  // The old floating-numbers canvas was built for the previous dark marketing look. The
  // authenticated app (owner /app/*, guide /guide/* excluding the pre-login claim link, and the
  // public guest check-in page) stays calm and static. The landing page ("/") now has its own
  // bespoke, tasteful animation (a slow gradient drift + on-scroll reveals) that's meant to be the
  // only motion a visitor sees there, so the old canvas is retired from it too rather than the two
  // clashing.
  const hideAnimatedBackground =
    location.pathname === '/' ||
    location.pathname.startsWith('/app') ||
    (location.pathname.startsWith('/guide') && !location.pathname.startsWith('/guide/claim')) ||
    location.pathname.startsWith('/checkin/');

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {!hideAnimatedBackground && <FinancialCanvas />}
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/checkin/:token" element={<CheckinApp />} />
            <Route path="/guide/claim/:token" element={<GuideClaimPage />} />

            {/* Protected owner app — AppLayout handles all /app/* sub-navigation internally
                (its own "view" state, switched via the sidebar) rather than nested routes/
                <Outlet/>, so a single wildcard route is all react-router needs here; this is
                also what keeps every owner page's code inside AppLayout's own lazy chunk,
                separate from the guide chunk below. */}
            <Route
              path="/app/*"
              element={
                <ProtectedRoute requiredRole="owner">
                  <AppLayout />
                </ProtectedRoute>
              }
            />

            {/* Protected guide app — same internal-view pattern as AppLayout above. */}
            <Route
              path="/guide/*"
              element={
                <ProtectedRoute requiredRole="guide">
                  <GuideLayout />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
