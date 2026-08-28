import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

type Role = "user" | "partner" | "moderator" | "admin";

interface RequireRoleProps {
  /** Rôle minimum exigé pour accéder aux routes enfants. */
  role?: Role;
  /**
   * Les droits de la matrice dont un seul suffit à entrer.
   *
   * C'est le chemin normal pour la console. Le rôle hérité reste accepté par
   * `has_permission` côté serveur, il n'a donc pas à être répété ici.
   */
  droit?: string[];
  /**
   * Ouvre à quiconque détient au moins un droit, quel qu'il soit.
   *
   * Pour les écrans qui n'exigent rien de précis mais n'ont de sens que pour le
   * personnel : le sommaire de la console, la matrice des droits qui se lit
   * seule. Chaque écran reste responsable de ce qu'il montre, et le serveur
   * refuse ce qu'il doit refuser.
   */
  personnel?: boolean;
}

/**
 * Garde de route unique pour les espaces protégés.
 *
 * Les politiques de sécurité du serveur restent la seule barrière qui fasse
 * autorité : ce composant évite d'afficher un écran que la personne ne pourrait
 * pas exploiter, et centralise la redirection.
 *
 * Il ne regardait que les rôles hérités, et c'est là que tout le travail de
 * gouvernance s'arrêtait. Le serveur avait beau accorder « Approuver un
 * retrait » à un responsable financier, la porte d'entrée de la console lui
 * demandait le rôle `admin`, qu'il n'a pas. Les droits de la matrice
 * ouvraient tout côté base et rien côté écran.
 */
export function RequireRole({ role = "user", droit, personnel }: RequireRoleProps) {
  const { user, loading, droits, isPartner, isModerator, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Vérification de vos accès...
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  const parLaMatrice =
    (droit?.some((code) => droits.includes(code)) ?? false) ||
    (personnel === true && droits.length > 0);

  const granted =
    role === "user" ||
    parLaMatrice ||
    // Le back-office accueille aussi la modération : un modérateur y entre sans
    // être partenaire, sans quoi tout son parcours serait injoignable.
    (role === "partner" && (isPartner || isModerator)) ||
    (role === "moderator" && isModerator) ||
    (role === "admin" && isAdmin);

  if (!granted) {
    return (
      <div className="akw-container py-10 text-center">
        <h1 className="font-display text-xl font-semibold">Accès non autorisé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page est réservée à un autre niveau d'habilitation. Si vous pensez qu'il s'agit
          d'une erreur, contactez un administrateur.
        </p>
      </div>
    );
  }

  return <Outlet />;
}

export default RequireRole;
