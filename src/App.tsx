import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import FinancialCanvas from "@/components/ParticleCanvas";
import LandingPage from "./pages/LandingPage";
import SignupPage from "./pages/SignupPage";
import LoginPage from "./pages/LoginPage";
import PricingPage from "./pages/PricingPage";
import AppLayout from "./pages/AppLayout";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import BlogAdminPage from "./pages/BlogAdminPage";
import MarketplacePage from "./pages/MarketplacePage";
import GuidesPage from "./pages/GuidesPage";
import GuideDashboard from "./pages/GuideDashboard";
import GuideLayout from "./pages/GuideLayout";
import AnalyticsPage from "./pages/AnalyticsPage";
import TodayToursPage from "./pages/TodayToursPage";
import DispatchPage from "./pages/DispatchPage";
import ChangeLogPage from "./pages/ChangeLogPage";
import CheckinApp from "./pages/CheckinApp";
import GuideClaimPage from "./pages/GuideClaimPage";
import GuideCheckin from "./pages/GuideCheckin";
import GuideProfile from "./pages/GuideProfile";
import GuideReviews from "./pages/GuideReviews";
import NotFound from "./pages/NotFound";
import { setupGuideTables } from "./lib/setupTables";
import { useEffect } from "react";

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

          {/* Protected owner app */}
          <Route
            path="/app"
            element={
              <ProtectedRoute requiredRole="owner">
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="blog-admin" element={<BlogAdminPage />} />
            <Route path="marketplace" element={<MarketplacePage />} />
            <Route path="guides" element={<GuidesPage />} />
            <Route path="guide-dashboard" element={<GuideDashboard />} />
            <Route path="today" element={<TodayToursPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="changelog" element={<ChangeLogPage />} />
          </Route>

          {/* Protected guide app */}
          <Route
            path="/guide"
            element={
              <ProtectedRoute requiredRole="guide">
                <GuideLayout />
              </ProtectedRoute>
            }
          >
            <Route path="checkin" element={<GuideCheckin />} />
            <Route path="profile" element={<GuideProfile />} />
            <Route path="reviews" element={<GuideReviews />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
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
