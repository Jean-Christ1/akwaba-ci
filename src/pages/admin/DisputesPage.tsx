import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ErrandInspector } from "@/modules/admin/ErrandInspector";
import { PrivateDocumentButton } from "@/modules/admin/PrivateDocumentButton";
import { formatFcfa } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Litige {
  id: string;
  title: string;
  city: string;
  zone: string | null;
  customer_id: string;
  runner_id: string | null;
  items_total: number;
  service_fee: number;
  runner_payout: number;
  total_amount: number;
  receipt_url: string | null;
  created_at: string;
}

interface Evenement {
  id: string;
  errand_id: string;
  status: string;
  note: string | null;
  created_at: string;
}

/**
 * Traitement des litiges.
 *
 * Sans cet écran, un litige ouvert gelait les gains du shopper indéfiniment :
 * la course ne pouvait plus avancer et personne ne pouvait trancher. Le
 * modérateur dispose ici du contexte nécessaire, à savoir le motif déclaré, la
 * chronologie de la course et les montants en jeu.
 */
export default function DisputesPage() {
  usePageTitle("Litiges", "Arbitrage des courses en litige.");

  const { isModerator, loading } = useAuth();
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [evenements, setEvenements] = useState<Record<string, Evenement[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [geles, setGeles] = useState<Map<string, number>>(new Map());
  const [courseExaminee, setCourseExaminee] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFetching(true);
    const { data: gels } = await supabase.rpc("dispute_frozen_amounts");
    const { data, error } = await supabase
      .from("errands")
      .select(
        "id,title,city,zone,customer_id,runner_id,items_total,service_fee,runner_payout,total_amount,receipt_url,created_at"
      )
      .eq("status", "disputed")
      .order("created_at", { ascending: false });

    // Le gain théorique et ce qui est réellement retenu sont deux choses :
    // l'écran additionnait le premier en l'appelant « gelé », alors qu'une
    // course contestée avant tout règlement ne retient rien du tout.
    const parCourse = new Map<string, number>(
      (gels ?? []).map((g) => [g.errand_id, Number(g.gele) || 0])
    );
    setGeles(parCourse);

    if (error) {
      toast.error("Impossible de charger les litiges.");
      setFetching(false);
      return;
    }

    const lignes = (data ?? []) as Litige[];
    setLitiges(lignes);

    if (lignes.length) {
      const { data: evs } = await supabase
        .from("errand_events")
        .select("id,errand_id,status,note,created_at")
        .in(
          "errand_id",
          lignes.map((l) => l.id)
        )
        .order("created_at", { ascending: true });

      const parCourse: Record<string, Evenement[]> = {};
      ((evs ?? []) as Evenement[]).forEach((e) => {
        (parCourse[e.errand_id] ??= []).push(e);
      });
      setEvenements(parCourse);
    }
    setFetching(false);
  }, []);

  useEffect(() => {
    if (isModerator) load();
  }, [isModerator, load]);

  const trancher = async (litige: Litige, issue: "shopper" | "client" | "annulation") => {
    const libelle = {
      shopper: "en faveur du shopper, ses gains lui seront versés",
      client: "en faveur du client, la course sera remboursée",
      annulation: "par une annulation sans versement",
    }[issue];

    if (!window.confirm(`Trancher ce litige ${libelle} ?`)) return;

    setBusy(litige.id);
    const { error } = await supabase.rpc("errand_resolve_dispute", {
      p_errand_id: litige.id,
      p_issue: issue,
      p_note: notes[litige.id]?.trim() || undefined,
    });
    setBusy(null);

    if (error) return toast.error(error.message);
    toast.success("Litige tranché.");
    load();
  };

  const montantGele = useMemo(
    () => [...geles.values()].reduce((somme, v) => somme + v, 0),
    [geles]
  );

  if (loading) return null;

  if (!isModerator) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé aux modérateurs.{" "}
        <Link className="text-primary" to="/profil">
          Mon profil
        </Link>
      </div>
    );
  }

  return (
    <div className="akw-container max-w-4xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Litiges</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Un litige ouvert après règlement retient les gains du shopper ; ouvert avant, il n'y a
        rien à retenir et la colonne le dit. Examinez la
        chronologie avant de décider.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Litiges ouverts</p>
          <p className="mt-1 font-display text-xl font-semibold">{litiges.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Gains réellement gelés</p>
          <p className="mt-1 font-display text-xl font-semibold">{formatFcfa(montantGele)}</p>
        </div>
      </div>

      {fetching ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement des litiges...</p>
      ) : litiges.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun litige en cours.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {litiges.map((litige) => (
            <section key={litige.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold">{litige.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {litige.zone ? `${litige.zone}, ` : ""}
                    {litige.city} · ouverte le{" "}
                    {new Date(litige.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                {/* L'écran client d'une course est bâti pour ses deux parties :
                    il n'apprend rien à qui doit arbitrer. Le dossier de
                    modération réunit les montants, la chronologie et les
                    pièces. */}
                <Button variant="outline" size="sm" onClick={() => setCourseExaminee(litige.id)}>
                  Examiner la course
                </Button>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Achats</dt>
                  <dd>{formatFcfa(litige.items_total)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Service</dt>
                  <dd>{formatFcfa(litige.service_fee)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Retenu sur le shopper</dt>
                  <dd>
                    {(geles.get(litige.id) ?? 0) > 0
                      ? formatFcfa(geles.get(litige.id) ?? 0)
                      : "rien de retenu"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reçu</dt>
                  <dd>
                    <PrivateDocumentButton
                      bucket="errand-proofs"
                      path={litige.receipt_url}
                      label="Ouvrir le reçu"
                      emptyLabel="Aucun reçu déposé"
                    />
                  </dd>
                </div>
              </dl>

              {(evenements[litige.id]?.length ?? 0) > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Chronologie ({evenements[litige.id].length} événements)
                  </summary>
                  <ol className="mt-2 space-y-1 border-l border-border pl-3">
                    {evenements[litige.id].map((e) => (
                      <li key={e.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{e.status}</span>
                        {e.note ? ` · ${e.note}` : ""}
                        <span className="ml-1 opacity-70">
                          {new Date(e.created_at).toLocaleString("fr-FR")}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="mt-3">
                <Textarea
                  rows={2}
                  placeholder="Motivation de la décision (conservée dans la chronologie)"
                  value={notes[litige.id] ?? ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [litige.id]: e.target.value }))
                  }
                />
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Button
                  size="sm"
                  disabled={busy === litige.id}
                  onClick={() => trancher(litige, "shopper")}
                >
                  Donner raison au shopper
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === litige.id}
                  onClick={() => trancher(litige, "client")}
                >
                  Donner raison au client
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === litige.id}
                  onClick={() => trancher(litige, "annulation")}
                >
                  Annuler sans versement
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}

      <ErrandInspector errandId={courseExaminee} onClose={() => setCourseExaminee(null)} />
    </div>
  );
}
