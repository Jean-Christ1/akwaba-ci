import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const CLE_REFUS = "akwaba.install.refuse";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Invitation à installer l'application sur l'écran d'accueil.
 *
 * Installée, l'application démarre depuis le cache et coûte beaucoup moins de
 * données à chaque ouverture, ce qui compte sur un forfait mobile ivoirien.
 *
 * L'invitation reste discrète : elle n'apparaît qu'après une navigation réelle,
 * jamais au premier écran, et un refus est mémorisé pendant trente jours.
 */
export function InstallPrompt() {
  const [evenement, setEvenement] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const refuseLe = Number(localStorage.getItem(CLE_REFUS) ?? 0);
    const trenteJours = 30 * 24 * 60 * 60 * 1000;
    if (refuseLe && Date.now() - refuseLe < trenteJours) return;

    const surInvite = (e: Event) => {
      // On empêche l'invite native pour la présenter au bon moment, dans le
      // langage du produit plutôt que dans celui du navigateur.
      e.preventDefault();
      setEvenement(e as BeforeInstallPromptEvent);
      window.setTimeout(() => setVisible(true), 20_000);
    };

    window.addEventListener("beforeinstallprompt", surInvite);
    return () => window.removeEventListener("beforeinstallprompt", surInvite);
  }, []);

  const refuser = () => {
    localStorage.setItem(CLE_REFUS, String(Date.now()));
    setVisible(false);
  };

  const installer = async () => {
    if (!evenement) return;
    setVisible(false);
    await evenement.prompt();
    const choix = await evenement.userChoice;
    if (choix.outcome === "dismissed") {
      localStorage.setItem(CLE_REFUS, String(Date.now()));
    }
    setEvenement(null);
  };

  if (!visible || !evenement) return null;

  return (
    <div
      role="dialog"
      aria-label="Installer Akwaba"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 rounded-2xl border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">Installer Akwaba</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Accès direct depuis votre écran d'accueil, ouverture plus rapide et moins de données
            consommées.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={installer}>
              Installer
            </Button>
            <Button size="sm" variant="ghost" onClick={refuser}>
              Plus tard
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={refuser}
          aria-label="Fermer"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default InstallPrompt;
