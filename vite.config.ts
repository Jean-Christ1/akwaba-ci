import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Le frontend est publié par Cloudflare et ne doit porter aucune marque
  // tierce. Le marqueur de composants ne servait qu'à l'éditeur d'origine et
  // ne tournait déjà que hors production : il est retiré entièrement.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // Le produit vise le mobile sur des réseaux contraints : les bibliothèques
    // lourdes sont isolées pour n'être téléchargées que sur les écrans qui les
    // utilisent réellement.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Cartographie : uniquement sur /carte et /itineraire.
          "vendor-maplibre": ["maplibre-gl"],
          // Graphiques : uniquement dans le back-office.
          "vendor-charts": ["recharts"],
          "vendor-supabase": ["@supabase/supabase-js"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
