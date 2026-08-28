import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, UtensilsCrossed } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export type StatutDemande = "new" | "in_review" | "contacted" | "closed";

interface Demande {
  id: string;
  kind: string;
  status: StatutDemande;
  party_size: string | null;
  date_from: string | null;
  date_to: string | null;
  message: string | null;
  created_at: string;
  place_id: string | null;
  partner_reply: string | null;
  replied_at: string | null;
  places: { name: string; slug: string; type: string } | null;
}

/**
 * Ce que chaque statut veut dire pour celui qui attend une réponse.
 *
 * Les libellés de la console ne conviennent pas ici : « new » ou « in_review »
 * décrivent le travail de l'établissement, pas l'attente du client. Ce qu'il
 * veut savoir tient en une phrase : sa demande est-elle partie, l'a-t-on lue,
 * l'a-t-on rappelé.
 */
export const LIBELLES: Record<StatutDemande, { titre: string; texte: string; ton: string }> = {
  new: {
    titre: "Envoyée",
    texte: "L'établissement a été prévenu. Il vous répond directement.",
    ton: "bg-muted text-foreground",
  },
  in_review: {
    titre: "Lue",
    texte: "L'établissement a ouvert votre demande.",
    ton: "bg-accent-soft text-foreground",
  },
  contacted: {
    titre: "Recontacté",
    texte: "L'établissement dit vous avoir répondu.",
    ton: "bg-primary-soft text-primary",
  },
  closed: {
    titre: "Clôturée",
    texte: "Cette demande est close.",
    ton: "bg-muted text-muted-foreground",
  },
};

/** Décrit le séjour ou la table demandés, sans jargon. */
export function resumeDemande(d: {
  kind: string;
  party_size: string | null;
  date_from: string | null;
  date_to: string | null;
}): string {
  const morceaux: string[] = [];

  if (d.party_size) {
    morceaux.push(`${d.party_size} personne${Number(d.party_size) > 1 ? "s" : ""}`);
  }

  const jour = (v: string) => new Date(v).toLocaleDateString("fr-FR");
  if (d.date_from && d.date_to && d.date_from !== d.date_to) {
    morceaux.push(`du ${jour(d.date_from)} au ${jour(d.date_to)}`);
  } else if (d.date_from) {
    morceaux.push(`le ${jour(d.date_from)}`);
  }

  return morceaux.length > 0 ? morceaux.join(", ") : "sans date précisée";
}

/**
 * Les demandes de réservation du client.
 *
 * Elles n'apparaissaient nulle part. Une demande d'hôtel ou de table était
 * enregistrée, l'établissement en était averti, et pour celui qui l'avait faite
 * elle disparaissait : aucun écran ne la lui montrait, aucun statut ne lui
 * disait où elle en était. Il ne pouvait même pas vérifier qu'elle était bien
 * partie.
 *
 * La politique de lecture l'autorisait depuis toujours à voir les siennes.
 * C'est l'écran qui manquait.
 */
export function MyRequestsList() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) {
      setChargement(false);
      return;
    }

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,kind,status,party_size,date_from,date_to,message,created_at,place_id," +
          "partner_reply,replied_at,places(name,slug,type)"
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    setChargement(false);
    if (error) return setErreur(error.message);
    setDemandes((data ?? []) as unknown as Demande[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) return null;

  if (erreur) {
    return (
      <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Vos demandes n'ont pas pu être chargées.</p>
        <p className="mt-1 text-muted-foreground">{erreur}</p>
      </section>
    );
  }

  // Rien à montrer plutôt qu'un cadre vide : quelqu'un qui n'a jamais demandé
  // de réservation n'a pas besoin qu'on lui dise qu'il n'en a pas.
  if (demandes.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">Mes demandes de réservation</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Akwaba transmet votre demande à l'établissement. Sa réponse s'affiche ici dès
        qu'il l'écrit. La plateforme ne confirme pas la réservation à sa place.
      </p>

      <ul className="mt-3 space-y-2">
        {demandes.map((d) => {
          const libelle = LIBELLES[d.status] ?? LIBELLES.new;
          const Icone = d.kind === "restaurant" ? UtensilsCrossed : CalendarCheck;
          return (
            <li key={d.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Icone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {d.places?.name ?? "Établissement retiré du catalogue"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {resumeDemande(d)} · demandé le{" "}
                    {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{libelle.texte}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] ${libelle.ton}`}>
                  {libelle.titre}
                </span>
              </div>
              {/* La réponse de l'établissement, telle qu'il l'a écrite. Elle
                  arrivait auparavant par un canal extérieur au service, quand
                  elle arrivait : le visiteur voyait sa demande passer à
                  « recontacté » sans jamais lire un mot. */}
              {d.partner_reply && (
                <div className="mt-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2">
                  <p className="text-[11px] font-medium text-primary">
                    Réponse de {d.places?.name ?? "l'établissement"}
                    {d.replied_at &&
                      ` · ${new Date(d.replied_at).toLocaleDateString("fr-FR")}`}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{d.partner_reply}</p>
                </div>
              )}
              {d.places?.slug && (
                <Link
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                  to={`/lieu/${d.places.slug}`}
                >
                  Revoir la fiche
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default MyRequestsList;
