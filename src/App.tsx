import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import { AppShell } from "@/shared/ui/AppShell";
import { ErrorBoundary } from "@/shared/ui/ErrorBoundary";
import { RequireRole } from "@/shared/ui/RequireRole";

// L'accueil est chargé avec l'application : c'est la première impression et il
// ne doit jamais afficher d'écran d'attente.
import HomePage from "./pages/HomePage";

// Le reste des écrans est chargé à la demande. Sur les réseaux mobiles
// ivoiriens, un visiteur qui ouvre l'accueil ne doit pas télécharger la carte,
// le back-office et le module Courses en même temps.
const ExplorerPage = lazy(() => import("./pages/ExplorerPage"));
const PlaceDetailPage = lazy(() => import("./pages/PlaceDetailPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const ItinerariesPage = lazy(() =>
  import("./pages/ItineraryPages").then((m) => ({ default: m.ItinerariesPage }))
);
const ItineraryDetailPage = lazy(() =>
  import("./pages/ItineraryPages").then((m) => ({ default: m.ItineraryDetailPage }))
);
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const OrganisationsPage = lazy(() => import("./pages/OrganisationsPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const PartnerSignupPage = lazy(() => import("./pages/PartnerSignupPage"));
const ServicesHubPage = lazy(() => import("./pages/services/ServicesHubPage"));

const MyErrandsPage = lazy(() => import("./pages/courses/MyErrandsPage"));
const NewErrandPage = lazy(() => import("./pages/courses/NewErrandPage"));
const ErrandDetailPage = lazy(() => import("./pages/courses/ErrandDetailPage"));
const RunnerSignupPage = lazy(() => import("./pages/courses/RunnerSignupPage"));
const RunnerDashboardPage = lazy(() => import("./pages/courses/RunnerDashboardPage"));
const HowItWorksPage = lazy(() => import("./pages/courses/HowItWorksPage"));
const WalletPage = lazy(() => import("./pages/courses/WalletPage"));
const SchedulesPage = lazy(() => import("./pages/courses/SchedulesPage"));

const AdminPage = lazy(() => import("./pages/admin/AdminPage"));
const PlaceEditorPage = lazy(() => import("./pages/admin/PlaceEditorPage"));
const BootstrapAdminPage = lazy(() => import("./pages/admin/BootstrapAdminPage"));
const ErrandsPage = lazy(() => import("./pages/admin/ErrandsPage"));
const ShoppersPage = lazy(() => import("./pages/admin/ShoppersPage"));
const PayoutsPage = lazy(() => import("./pages/admin/PayoutsPage"));
const DisputesPage = lazy(() => import("./pages/admin/DisputesPage"));
const SettingsPage = lazy(() => import("./pages/admin/SettingsPage"));
const OperationsPage = lazy(() => import("./pages/admin/OperationsPage"));
const TermsPage = lazy(() =>
  import("./pages/legal/LegalPages").then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/legal/LegalPages").then((m) => ({ default: m.PrivacyPage }))
);
const NotFound = lazy(() => import("./pages/NotFound"));

import { initTabAnalytics } from "@/shared/analytics/tabAnalytics";

const queryClient = new QueryClient();
initTabAnalytics();

/** Attente discrète pendant le chargement d'un écran. */
function RouteFallback() {
  return (
    <div className="akw-container py-16 text-center text-sm text-muted-foreground">
      Chargement...
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
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
                <Route path="/organisation" element={<OrganisationsPage />} />
                <Route path="/services" element={<ServicesHubPage />} />
                <Route path="/courses" element={<MyErrandsPage />} />
                <Route path="/courses/nouvelle" element={<NewErrandPage />} />
                <Route path="/courses/comment-ca-marche" element={<HowItWorksPage />} />
                <Route path="/courses/programmees" element={<SchedulesPage />} />
                <Route path="/courses/portefeuille" element={<WalletPage />} />
                <Route path="/courses/devenir-shopper" element={<RunnerSignupPage />} />
                <Route path="/courses/shopper" element={<RunnerDashboardPage />} />
                <Route path="/courses/:id" element={<ErrandDetailPage />} />
                {/* L'amorçage du premier administrateur doit rester atteignable
                    avant qu'un rôle n'existe : il est protégé par son propre
                    secret côté fonction edge. */}
                <Route path="/admin/bootstrap" element={<BootstrapAdminPage />} />
                <Route path="/partner/signup" element={<PartnerSignupPage />} />
                <Route path="/conditions" element={<TermsPage />} />
                <Route path="/confidentialite" element={<PrivacyPage />} />

                <Route element={<RequireRole role="partner" />}>
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/admin/places/:id" element={<PlaceEditorPage />} />
                </Route>

                <Route element={<RequireRole role="moderator" />}>
                  {/* Le back-office menait vers ce suivi alors qu'aucune route
                      ne le déclarait : le clic tombait sur la page introuvable,
                      et les alertes d'exploitation, seul écran qui dise s'il y a
                      quelque chose à faire maintenant, restaient
                      inatteignables. */}
                  <Route path="/admin/courses" element={<ErrandsPage />} />
                  <Route path="/admin/shoppers" element={<ShoppersPage />} />
                  <Route path="/admin/litiges" element={<DisputesPage />} />
                  <Route path="/admin/pilotage" element={<OperationsPage />} />
                </Route>

                <Route element={<RequireRole role="admin" />}>
                  <Route path="/admin/payouts" element={<PayoutsPage />} />
                  <Route path="/admin/parametres" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
