import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import { AppShell } from "@/shared/ui/AppShell";
import HomePage from "./pages/HomePage";
import ExplorerPage from "./pages/ExplorerPage";
import PlaceDetailPage from "./pages/PlaceDetailPage";
import MapPage from "./pages/MapPage";
import FavoritesPage from "./pages/FavoritesPage";
import { ItinerariesPage, ItineraryDetailPage } from "./pages/ItineraryPages";
import ProfilePage from "./pages/ProfilePage";
import OnboardingPage from "./pages/OnboardingPage";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AdminPage from "./pages/admin/AdminPage";
import PlaceEditorPage from "./pages/admin/PlaceEditorPage";
import BootstrapAdminPage from "./pages/admin/BootstrapAdminPage";
import PartnerSignupPage from "./pages/PartnerSignupPage";
import ServicesHubPage from "./pages/services/ServicesHubPage";
import MyErrandsPage from "./pages/courses/MyErrandsPage";
import NewErrandPage from "./pages/courses/NewErrandPage";
import ErrandDetailPage from "./pages/courses/ErrandDetailPage";
import RunnerSignupPage from "./pages/courses/RunnerSignupPage";
import RunnerDashboardPage from "./pages/courses/RunnerDashboardPage";
import ShoppersPage from "./pages/admin/ShoppersPage";
import NotFound from "./pages/NotFound";

import { initTabAnalytics } from "@/shared/analytics/tabAnalytics";

const queryClient = new QueryClient();
initTabAnalytics();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/explorer" element={<ExplorerPage />} />
              <Route path="/lieu/:slug" element={<PlaceDetailPage />} />
              <Route path="/carte" element={<MapPage />} />
              <Route path="/parcours" element={<ItinerariesPage />} />
              <Route path="/parcours/:slug" element={<ItineraryDetailPage />} />
              <Route path="/favoris" element={<FavoritesPage />} />
              <Route path="/profil" element={<ProfilePage />} />
              <Route path="/services" element={<ServicesHubPage />} />
              <Route path="/courses" element={<MyErrandsPage />} />
              <Route path="/courses/nouvelle" element={<NewErrandPage />} />
              <Route path="/courses/devenir-shopper" element={<RunnerSignupPage />} />
              <Route path="/courses/shopper" element={<RunnerDashboardPage />} />
              <Route path="/courses/:id" element={<ErrandDetailPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/bootstrap" element={<BootstrapAdminPage />} />
              <Route path="/admin/shoppers" element={<ShoppersPage />} />
              <Route path="/admin/places/:id" element={<PlaceEditorPage />} />
              <Route path="/partner/signup" element={<PartnerSignupPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
