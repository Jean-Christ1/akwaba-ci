import { Link } from "react-router-dom";

import { Logo } from "./Logo";

/**
 * Pied de page.
 *
 * Il porte les accès obligatoires, conditions et confidentialité, qui n'étaient
 * atteignables depuis aucun écran. Il est masqué sur mobile en dessous de la
 * barre d'onglets pour ne pas concurrencer la navigation principale, mais reste
 * accessible en fin de page.
 */
export function SiteFooter() {
  const annee = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-border bg-card">
      <div className="akw-container py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-2 text-xs text-muted-foreground">
              La sélection d'adresses de Côte d'Ivoire, et le service de courses confiées à des
              shoppers vérifiés.
            </p>
          </div>

          <nav aria-label="Liens de bas de page" className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Link className="text-muted-foreground hover:text-foreground" to="/explorer">
              Explorer
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/services">
              Services
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/courses/comment-ca-marche">
              Comment ça marche
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/courses/devenir-shopper">
              Devenir shopper
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/partner/signup">
              Inscrire mon établissement
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/conditions">
              Conditions générales
            </Link>
            <Link className="text-muted-foreground hover:text-foreground" to="/confidentialite">
              Confidentialité
            </Link>
          </nav>
        </div>

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          {annee} Akwaba. Abidjan, Côte d'Ivoire.
        </p>
      </div>
    </footer>
  );
}

export default SiteFooter;
