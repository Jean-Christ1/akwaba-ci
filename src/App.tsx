import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppShell } from "@/shared/ui/AppShell";
import HomePage from "./pages/HomePage";
import ExplorerPage from "./pages/ExplorerPage";
import PlaceDetailPage from "./pages/PlaceDetailPage";
import MapPage from "./pages/MapPage";
import FavoritesPage from "./pages/FavoritesPage";
import { ItinerariesPage, ItineraryDetailPage } from "./pages/ItineraryPages";
import ProfilePage from "./pages/ProfilePage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/lieu/:slug" element={<PlaceDetailPage />} />
            <Route path="/carte" element={<MapPage />} />
            <Route path="/parcours" element={<ItinerariesPage />} />
            <Route path="/parcours/:slug" element={<ItineraryDetailPage />} />
            <Route path="/favoris" element={<FavoritesPage />} />
            <Route path="/profil" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
