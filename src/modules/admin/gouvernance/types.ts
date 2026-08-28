/**
 * Ce que la console lit de la gouvernance des accès.
 *
 * Ces formes viennent de fonctions du serveur, pas de tables : le catalogue dit
 * qui peut quoi, et cela ne regarde pas un visiteur. Les fonctions vérifient
 * que celui qui demande appartient au personnel.
 */

export interface Droit {
  code: string;
  categorie: string;
  libelle: string;
  description: string | null;
  /** Ce que le droit n'ouvre pas, dit explicitement. */
  ne_permet_pas: string | null;
  sensible: boolean;
  /** « global » ou « ville » : un droit restreignable à une ville. */
  portee: string;
  rang: number;
  /** Les rôles qui portent ce droit, du moins étendu au plus étendu. */
  roles: string[];
}

export interface Role {
  code: string;
  libelle: string;
  description: string | null;
  /** Rang de confinement : on n'attribue pas un rôle plus étendu que le sien. */
  niveau: number;
  systeme: boolean;
  droits: number;
  membres: number;
}

export interface DroitEffectif {
  code: string;
  libelle: string;
  categorie: string;
  sensible: boolean;
  accordee: boolean;
  /** role, nominatif, retrait, secours, aucune. */
  source: string;
  detail: string | null;
  perimetre: string;
  expire_le: string | null;
}

export interface LigneReconciliation {
  user_id: string;
  courriel: string;
  role_herite: string;
  roles_matrice: string;
  ecart: string;
  gravite: string;
}

export interface Attribution {
  user_id: string;
  role_code: string;
  scope_type: string;
  scope_value: string | null;
  expire_le: string | null;
  motif: string | null;
  granted_at: string;
}

/** Ce que chaque source de droit veut dire, en une ligne. */
export const SOURCES: Record<string, { libelle: string; ton: string; explication: string }> = {
  role: {
    libelle: "Par un rôle",
    ton: "bg-primary-soft text-primary",
    explication: "Le droit vient de la matrice. C'est par elle qu'on le retire.",
  },
  nominatif: {
    libelle: "Exception",
    ton: "bg-accent text-accent-foreground",
    explication: "Accordé à cette personne seule, avec un motif écrit.",
  },
  retrait: {
    libelle: "Retiré",
    ton: "bg-destructive/10 text-destructive",
    explication: "Retiré nominativement. Le retrait prime sur le rôle.",
  },
  secours: {
    libelle: "Accès de secours",
    ton: "bg-destructive/10 text-destructive",
    explication:
      "Le rôle hérité admin ouvre tout sans figurer dans la matrice. À vérifier : rien d'autre ne l'explique.",
  },
  aucune: {
    libelle: "Aucun",
    ton: "bg-muted text-muted-foreground",
    explication: "Cette personne n'a pas ce droit.",
  },
};
