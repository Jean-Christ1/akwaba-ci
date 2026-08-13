import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerServiceWorker } from "@/shared/pwa/registerServiceWorker";

createRoot(document.getElementById("root")!).render(<App />);

// Enregistré après le rendu : le premier affichage ne doit rien attendre.
registerServiceWorker();
