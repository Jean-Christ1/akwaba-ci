import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatFcfa, STATUS_LABEL } from "@/modules/errands/domain";
import { ErrandInspector } from "./ErrandInspector";
import { LONGUEUR_MINIMALE, searchConsole, type SearchResult, type UserHit } from "./search";

interface AdminSearchProps {
  /** Action proposée sur un compte trouvé, par exemple lui attribuer un rôle. */
  onPickUser?: (utilisateur: UserHit) => void;
  pickLabel?: string;
  /** Aide affichée sous le champ, adaptée à l'usage de l'écran appelant. */
  hint?: string;
}

const AIDE_PAR_DEFAUT =
  "Identifiant de course, titre, ville, adresse de courriel, nom ou téléphone.";

/**
 * Recherche de la console.
 *
 * L'exploitant qui reçoit un appel n'a qu'un titre approximatif, une ville ou
 * une adresse de courriel. Chaque frappe validée part en requête vers la base :
 * filtrer une liste déjà chargée ne retrouverait que ce qui tient dans la page
 * en cours, c'est-à-dire presque rien.
 */
export function AdminSearch({ onPickUser, pickLabel = "Sélectionner", hint }: AdminSearchProps) {
  const [requete, setRequete] = useState("");
  const [resultat, setResultat] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [courseOuverte, setCourseOuverte] = useState<string | null>(null);

  const lancer = async () => {
    const q = requete.trim();
    if (q.length < LONGUEUR_MINIMALE) {
      return toast.warning(`Saisissez au moins ${LONGUEUR_MINIMALE} caractères.`);
    }
    setBusy(true);
    const reponse = await searchConsole(q);
    setBusy(false);
    setResultat(reponse);
    if (reponse.error) toast.error(reponse.error);
  };

  const total = resultat ? resultat.errands.length + resultat.users.length : 0;

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lancer();
          }}
        >
          <Input
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
            placeholder="Rechercher une course ou un compte"
            className="min-w-[220px] flex-1"
            aria-label="Recherche dans la console"
          />
          <Button type="submit" disabled={busy}>
            {busy ? "Recherche..." : "Rechercher"}
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground">{hint ?? AIDE_PAR_DEFAUT}</p>
      </Card>

      {resultat && total === 0 && !busy && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucun résultat pour cette recherche.
        </p>
      )}

      {resultat && resultat.errands.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Courses ({resultat.errands.length})
          </p>
          {resultat.errands.map((course) => (
            <Card key={course.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{course.title}</p>
                  <Badge variant="secondary">{STATUS_LABEL[course.status] ?? course.status}</Badge>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {course.zone ? `${course.zone}, ` : ""}
                  {course.city} · {formatFcfa(course.total_amount)} ·{" "}
                  {new Date(course.created_at).toLocaleDateString("fr-FR")}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">{course.id}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCourseOuverte(course.id)}>
                Ouvrir le dossier
              </Button>
            </Card>
          ))}
        </div>
      )}

      {resultat && resultat.users.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Comptes ({resultat.users.length})
          </p>
          {resultat.users.map((utilisateur, index) => (
            <Card
              key={utilisateur.userId ?? `${utilisateur.email ?? "inconnu"}-${index}`}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {utilisateur.displayName ?? "Nom non renseigné"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[utilisateur.email, utilisateur.phone].filter(Boolean).join(" · ") ||
                    "Aucune coordonnée enregistrée"}
                </p>
                {utilisateur.userId ? (
                  <p className="font-mono text-[10px] text-muted-foreground">{utilisateur.userId}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Adresse connue par une demande, aucun compte ne lui est rattaché.
                  </p>
                )}
              </div>
              {onPickUser && utilisateur.userId && (
                <Button size="sm" variant="outline" onClick={() => onPickUser(utilisateur)}>
                  {pickLabel}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <ErrandInspector errandId={courseOuverte} onClose={() => setCourseOuverte(null)} />
    </div>
  );
}

export default AdminSearch;
