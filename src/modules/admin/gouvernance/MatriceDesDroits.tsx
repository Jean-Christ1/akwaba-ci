import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Crown,
  Eye,
  KeyRound,
  Pencil,
  Shield,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Droit, Role } from "./types";

interface Proprietes {
  droits: Droit[];
  roles: Role[];
  /** Ouvre le tiroir de documentation d'un droit. */
  onOuvrir: (droit: Droit) => void;
  /** Filtre de recherche déjà appliqué en amont, pour l'état vide. */
  recherche: string;
}

/**
 * L'icône d'un rôle dit son étendue avant qu'on lise son nom.
 *
 * Le rang commande : plus il est haut, plus l'icône est marquée. Un rôle ajouté
 * demain, sans entrée ici, prend l'icône neutre plutôt que de faire échouer
 * l'affichage.
 */
const ICONES: Record<string, LucideIcon> = {
  moderateur: Eye,
  admin_support: UserCog,
  admin_contenu: Pencil,
  admin_operations: Shield,
  admin_finance: KeyRound,
  admin_conformite: ShieldCheck,
  admin_plateforme: Shield,
  super_admin: Crown,
};

const TONS: Record<string, string> = {
  moderateur: "text-muted-foreground",
  admin_support: "text-muted-foreground",
  admin_contenu: "text-primary",
  admin_operations: "text-primary",
  admin_finance: "text-accent-foreground",
  admin_conformite: "text-accent-foreground",
  admin_plateforme: "text-primary",
  super_admin: "text-primary",
};

/**
 * La matrice des permissions par rôle.
 *
 * Elle répond à une question qu'aucun écran ne posait : qui peut quoi, vu d'un
 * seul coup d'oeil. La liste des rôles et celle des droits existaient déjà,
 * mais côte à côte, et le croisement se faisait de tête.
 *
 * Les colonnes vont du rôle le moins étendu au plus étendu, par rang. Lire de
 * gauche à droite montre alors ce que chaque échelon ajoute, et une ligne
 * pleine dès la première colonne signale un droit que tout le personnel porte.
 *
 * Cet écran ne décide de rien. Il montre ce que le serveur applique ; une case
 * n'ouvre aucun accès par elle-même.
 */
export function MatriceDesDroits({ droits, roles, onOuvrir, recherche }: Proprietes) {
  const [replies, setReplies] = useState<string[]>([]);

  const parCategorie = useMemo(() => {
    const groupes = new Map<string, Droit[]>();
    for (const d of droits) {
      const liste = groupes.get(d.categorie) ?? [];
      liste.push(d);
      groupes.set(d.categorie, liste);
    }
    return [...groupes.entries()];
  }, [droits]);

  const basculer = (categorie: string) =>
    setReplies((c) =>
      c.includes(categorie) ? c.filter((x) => x !== categorie) : [...c, categorie]
    );

  if (droits.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {recherche
          ? `Aucun droit ne correspond à « ${recherche} ».`
          : "Aucun catalogue de droits n'est publié."}
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Matrice des permissions par rôle, du rôle le moins étendu au plus étendu. Ouvrez un
        droit pour lire ce qu'il permet et, surtout, ce qu'il ne permet pas.
      </p>

      {/* La matrice défile horizontalement plutôt que de comprimer ses colonnes :
          sur un téléphone, huit rôles rendus sur 390 pixels donneraient des
          colonnes de trente pixels, illisibles. */}
      <div className="mt-4 overflow-x-auto">
        <div
          className="grid min-w-[720px] gap-0"
          style={{ gridTemplateColumns: `minmax(200px, 1.4fr) repeat(${roles.length}, 1fr)` }}
        >
          <div className="sticky left-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
            Permission
          </div>
          {roles.map((r) => {
            const Icone = ICONES[r.code] ?? Shield;
            return (
              <div
                key={r.code}
                className="border-b border-border px-2 py-2 text-center"
                title={r.description ?? undefined}
              >
                <Icone
                  className={`mx-auto mb-0.5 h-3.5 w-3.5 ${TONS[r.code] ?? "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span className="block text-[10px] leading-tight text-foreground">
                  {r.libelle}
                </span>
                <span className="block text-[9px] text-muted-foreground">
                  {r.droits} droits
                </span>
              </div>
            );
          })}

          {parCategorie.map(([categorie, liste]) => {
            const ouvert = !replies.includes(categorie);
            return (
              <div key={categorie} className="contents">
                <button
                  type="button"
                  onClick={() => basculer(categorie)}
                  aria-expanded={ouvert}
                  className="col-span-full flex items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/30"
                >
                  {ouvert ? (
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  )}
                  {categorie}
                  <span className="text-muted-foreground">({liste.length})</span>
                </button>

                {ouvert &&
                  liste.map((d) => (
                    <div key={d.code} className="contents">
                      <button
                        type="button"
                        onClick={() => onOuvrir(d)}
                        className="sticky left-0 z-10 flex items-center gap-1.5 border-b border-border/50 bg-card px-3 py-1.5 pl-7 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {d.libelle}
                        {d.sensible && (
                          <span
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                            title="Droit sensible"
                            aria-label="Droit sensible"
                          />
                        )}
                        {d.portee === "ville" && (
                          <span className="text-[9px] text-muted-foreground/70">par ville</span>
                        )}
                      </button>
                      {roles.map((r) => {
                        const porte = d.roles.includes(r.code);
                        return (
                          <div
                            key={r.code}
                            className="flex items-center justify-center border-b border-border/50 py-1.5"
                            title={`${r.libelle} : ${porte ? "oui" : "non"}`}
                          >
                            {porte ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20">
                                <span className="h-2 w-2 rounded-full bg-primary" />
                              </span>
                            ) : (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/20" />
                              </span>
                            )}
                            <span className="sr-only">
                              {r.libelle} : {porte ? "accordé" : "non accordé"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Le point rouge marque un droit sensible. « Par ville » signale un droit qu'une
        attribution peut restreindre à une ou plusieurs villes.
      </p>
    </div>
  );
}

export default MatriceDesDroits;
