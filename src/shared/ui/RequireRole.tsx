import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

type Role = "user" | "partner" | "moderator" | "admin";

interface RequireRoleProps {
  /** Rôle minimum exigé pour accéder aux routes enfants. */
  role?: Role;
}

/**
 * Garde de route unique pour les espaces protégés.
 *
 * Les politiques RLS de Supabase restent la seule barrière qui fait autorité :
 * ce composant évite simplement d'afficher un écran que l'utilisateur ne peut
 * pas exploiter, et centralise la redirection au lieu de la répéter, de façon
 * inégale, dans chaque page.
 */
export function RequireRole({ role = "user" }: RequireRoleProps) {
  const { user, loading, isPartner, isModerator, isAdmin } = useAuth();
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

  const granted =
    role === "user" ||
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
