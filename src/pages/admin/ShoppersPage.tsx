import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PrivateDocumentButton } from "@/modules/admin/PrivateDocumentButton";
import type { RunnerStatus } from "@/modules/errands/domain";

interface Runner {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  whatsapp: string | null;
  city: string;
  zones: unknown;
  vehicle: string;
  bio: string | null;
  /** Clé d'objet dans le bucket privé, jamais une URL publique. */
  id_doc_url: string | null;
  /** Selfie, dans le meme bucket prive que la piece. */
  selfie_url: string | null;
  date_of_birth: string | null;
  id_document_type: string | null;
  id_document_expires_on: string | null;
  identity_reviewed_at: string | null;
  status: RunnerStatus;
  jobs_completed: number;
  created_at: string;
}

const TYPE_PIECE: Record<string, string> = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  permis: "Permis de conduire",
  attestation_identite: "Attestation d'identité",
  carte_consulaire: "Carte consulaire",
};

/**
 * L'age revolu, calcule comme le serveur le calcule.
 *
 * Un dossier depose la veille des dix-huit ans resterait valide indefiniment
 * si l'age etait fige a la soumission : la question se repose a chaque examen.
 */
function ageRevolu(naissance: string | null): number | null {
  if (!naissance) return null;
  const d = new Date(naissance);
  if (Number.isNaN(d.getTime())) return null;
  const maintenant = new Date();
  let age = maintenant.getFullYear() - d.getFullYear();
  const mois = maintenant.getMonth() - d.getMonth();
  if (mois < 0 || (mois === 0 && maintenant.getDate() < d.getDate())) age -= 1;
  return age;
}

/**
 * Ce qui manque a un dossier pour pouvoir etre valide.
 *
 * Le serveur refuse de toute facon, et c'est lui qui fait autorite. Afficher
 * la liste ici evite au moderateur de decouvrir le refus apres avoir clique,
 * et lui donne ce qu'il doit redemander au candidat.
 */
function manques(r: Runner): string[] {
  const age = ageRevolu(r.date_of_birth);
  const perimee =
    r.id_document_expires_on !== null && new Date(r.id_document_expires_on) < new Date();
  return [
    r.date_of_birth ? null : "date de naissance",
    age !== null && age < 18 ? "majorité non atteinte" : null,
    r.id_doc_url ? null : "pièce d'identité",
    r.id_document_type ? null : "type de pièce",
    perimee ? "pièce périmée" : null,
    r.selfie_url ? null : "selfie",
  ].filter((v): v is string => v !== null);
}

const STATUS_LABEL: Record<RunnerStatus, string> = {
  pending: "En attente",
  approved: "Validé",
  suspended: "Suspendu",
  rejected: "Refusé",
};

export default function ShoppersPage() {
  const { peut, loading } = useAuth();
  const isModerator = peut("shoppers.lire");
  const [rows, setRows] = useState<Runner[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("runner_profiles").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as Runner[]);
  }, []);

  useEffect(() => { if (isModerator) load(); }, [isModerator, load]);

  /**
   * Le statut passe par la fonction serveur, qui inscrit la décision au
   * journal d'audit. L'écriture directe ne laissait aucune trace : ouvrir ou
   * fermer l'accès au travail, donc au revenu, doit dire qui l'a décidé.
   *
   * Suspendre ou refuser exige un motif, que le serveur réclame aussi : le
   * demander ici évite un aller-retour pour une erreur prévisible.
   */
  const setStatus = async (r: Runner, status: RunnerStatus) => {
    let motif: string | null = null;
    if (status === "suspended" || status === "rejected") {
      motif = window.prompt(
        `Motif de ${status === "suspended" ? "la suspension" : "le refus"} de ${r.full_name} ?`
      );
      if (motif === null) return;
      if (motif.trim().length < 5) {
        return toast.error("Indiquez un motif d'au moins cinq caractères.");
      }
    }

    const { error } = await supabase.rpc("runner_set_status", {
      p_runner_id: r.id,
      p_status: status,
      p_reason: motif?.trim() || undefined,
    });
    if (error) return toast.error(error.message);
    toast.success(`${r.full_name} → ${STATUS_LABEL[status]}`);
    load();
  };

  if (loading) return null;
  if (!isModerator)
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé aux modérateurs. <Link className="text-primary" to="/profil">Mon profil</Link>
      </div>
    );

  return (
    <div className="akw-container max-w-5xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Validation des shoppers</h1>

      <ul className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune candidature.</p>}
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.phone} · {r.vehicle} · {r.city}
                  {Array.isArray(r.zones) && r.zones.length ? ` · ${(r.zones as string[]).join(", ")}` : ""}
                </p>
                {r.bio && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{r.bio}</p>}
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            {/* Approuver une candidature revient à certifier une identité au
                client. Sans accès à la pièce déposée, la validation ne repose
                sur rien. */}
            <div className="mt-3 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-medium">Identité</p>
              <dl className="mt-1 grid gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                <div className="flex gap-1">
                  <dt>Âge :</dt>
                  <dd className={ageRevolu(r.date_of_birth) !== null && ageRevolu(r.date_of_birth)! < 18 ? "font-medium text-destructive" : ""}>
                    {ageRevolu(r.date_of_birth) === null
                      ? "non renseigné"
                      : `${ageRevolu(r.date_of_birth)} ans`}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Pièce :</dt>
                  <dd>{r.id_document_type ? TYPE_PIECE[r.id_document_type] ?? r.id_document_type : "non renseignée"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Échéance :</dt>
                  <dd>
                    {r.id_document_expires_on
                      ? new Date(r.id_document_expires_on).toLocaleDateString("fr-FR")
                      : "non renseignée"}
                  </dd>
                </div>
              </dl>

              {manques(r).length > 0 && (
                /* Le serveur refuse la validation tant que ces éléments manquent.
                   Le dire avant le clic évite un refus incompréhensible et
                   indique ce qu'il faut redemander au candidat. */
                <p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  Validation impossible, il manque : {manques(r).join(", ")}.
                </p>
              )}

              <div className="mt-2">
                <PrivateDocumentButton
                  bucket="identity-docs"
                  path={r.selfie_url}
                  label="Ouvrir le selfie"
                  emptyLabel="Aucun selfie déposé"
                  notice="À rapprocher de la pièce. Refermez l'onglet après consultation."
                />
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-medium">Pièce d'identité</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Document personnel : à ouvrir pour instruire la candidature, jamais à diffuser ni à
                conserver hors de l'application.
              </p>
              <div className="mt-2">
                <PrivateDocumentButton
                  bucket="identity-docs"
                  path={r.id_doc_url}
                  label="Ouvrir la pièce d'identité"
                  emptyLabel="Aucune pièce déposée par ce candidat"
                  notice="Refermez l'onglet après consultation."
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setStatus(r, "approved")} disabled={r.status === "approved"}>
                Valider
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(r, "suspended")}>Suspendre</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus(r, "rejected")}>Refuser</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
