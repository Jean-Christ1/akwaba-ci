import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa, STATUS_LABEL, type ErrandStatus } from "@/modules/errands/domain";
import { PrivateDocumentButton } from "./PrivateDocumentButton";

interface CourseComplete {
  id: string;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  delivery_address: string;
  status: ErrandStatus;
  created_at: string;
  customer_id: string;
  runner_id: string | null;
  items: unknown;
  notes: string | null;
  budget_estimate: number;
  items_total: number;
  service_fee: number;
  delivery_fee: number;
  commission_amount: number;
  runner_payout: number;
  total_amount: number;
  balance_due: number;
  tip_amount: number;
  payment_method: string;
  payment_status: string;
  fund_mode: string;
  advance_amount: number;
  advance_proof_url: string | null;
  receipt_url: string | null;
  distance_km: number;
  estimated_minutes: number;
  actual_distance_km: number | null;
  overtime_minutes: number;
  overrun_fee: number;
}

interface Evenement {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

/**
 * Colonnes explicites : la lecture de `errands` est accordée colonne par
 * colonne et une étoile demanderait aussi le code de remise, refusé à tous.
 */
const COLONNES =
  "id,title,category,city,zone,delivery_address,status,created_at,customer_id,runner_id," +
  "items,notes,budget_estimate,items_total,service_fee,delivery_fee,commission_amount," +
  "runner_payout,total_amount,balance_due,tip_amount,payment_method,payment_status," +
  "fund_mode,advance_amount,advance_proof_url,receipt_url,distance_km,estimated_minutes," +
  "actual_distance_km,overtime_minutes,overrun_fee";

interface ErrandInspectorProps {
  errandId: string | null;
  onClose: () => void;
}

/**
 * Dossier de course vu par la modération.
 *
 * L'écran client d'une course est bâti pour ses deux parties : un modérateur
 * qui l'ouvre n'y trouve ni les montants qu'il doit arbitrer, ni les pièces
 * déposées. Ce dossier réunit ce sur quoi porte la décision, la chronologie et
 * les preuves, à l'endroit même où la décision se prend.
 */
export function ErrandInspector({ errandId, onClose }: ErrandInspectorProps) {
  const [course, setCourse] = useState<CourseComplete | null>(null);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async (id: string) => {
    setChargement(true);
    setErreur(null);
    setCourse(null);
    setEvenements([]);

    const { data, error } = await supabase
      .from("errands")
      .select(COLONNES)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      setErreur(error.message);
      setChargement(false);
      return;
    }
    if (!data) {
      setErreur("Course introuvable.");
      setChargement(false);
      return;
    }

    const ligne = data as unknown as CourseComplete;
    setCourse(ligne);

    const [evs, profils] = await Promise.all([
      supabase
        .from("errand_events")
        .select("id,status,note,created_at")
        .eq("errand_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", [ligne.customer_id, ligne.runner_id].filter(Boolean) as string[]),
    ]);

    setEvenements((evs.data ?? []) as Evenement[]);
    setNoms(
      Object.fromEntries(
        (profils.data ?? []).map((p) => [p.id, p.display_name ?? "Nom non renseigné"])
      )
    );
    setChargement(false);
  }, []);

  useEffect(() => {
    if (errandId) charger(errandId);
  }, [errandId, charger]);

  const articles = Array.isArray(course?.items) ? (course?.items as { label?: string; qty?: string }[]) : [];

  return (
    <Sheet open={!!errandId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{course ? course.title : "Dossier de course"}</SheetTitle>
        </SheetHeader>

        {chargement && <p className="mt-4 text-sm text-muted-foreground">Chargement du dossier...</p>}
        {erreur && <p className="mt-4 text-sm text-destructive">{erreur}</p>}

        {course && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{STATUS_LABEL[course.status] ?? course.status}</Badge>
              <span className="text-xs text-muted-foreground">
                Ouverte le {new Date(course.created_at).toLocaleString("fr-FR")}
              </span>
            </div>

            <Card className="space-y-1 p-3">
              <Ligne k="Ville" v={`${course.zone ? `${course.zone}, ` : ""}${course.city}`} />
              <Ligne k="Adresse de livraison" v={course.delivery_address} />
              <Ligne k="Catégorie" v={course.category} />
              <Ligne k="Client" v={noms[course.customer_id] ?? course.customer_id.slice(0, 8)} />
              <Ligne
                k="Shopper"
                v={
                  course.runner_id
                    ? noms[course.runner_id] ?? course.runner_id.slice(0, 8)
                    : "Aucun shopper assigné"
                }
              />
              <Ligne k="Financement" v={course.fund_mode} />
              <Ligne k="Paiement" v={`${course.payment_method} · ${course.payment_status}`} />
            </Card>

            <Card className="space-y-1 p-3">
              <p className="text-xs font-medium text-muted-foreground">Montants</p>
              <Ligne k="Budget annoncé" v={formatFcfa(course.budget_estimate)} />
              <Ligne k="Achats déclarés" v={formatFcfa(course.items_total)} />
              <Ligne k="Frais de service" v={formatFcfa(course.service_fee)} />
              <Ligne k="Livraison" v={formatFcfa(course.delivery_fee)} />
              <Ligne k="Supplément de dépassement" v={formatFcfa(course.overrun_fee)} />
              <Ligne k="Pourboire" v={formatFcfa(course.tip_amount)} />
              <Ligne k="Commission" v={formatFcfa(course.commission_amount)} />
              <Ligne k="Gain shopper" v={formatFcfa(course.runner_payout)} />
              <Ligne k="Avance reçue" v={formatFcfa(course.advance_amount)} />
              <Ligne k="Reste à régler" v={formatFcfa(course.balance_due)} />
              <Ligne k="Total" v={formatFcfa(course.total_amount)} />
            </Card>

            <Card className="space-y-2 p-3">
              <p className="text-xs font-medium text-muted-foreground">Pièces déposées</p>
              <PrivateDocumentButton
                bucket="errand-proofs"
                path={course.receipt_url}
                label="Ouvrir le reçu des achats"
                emptyLabel="Aucun reçu d'achats déposé"
              />
              <PrivateDocumentButton
                bucket="errand-proofs"
                path={course.advance_proof_url}
                label="Ouvrir la preuve d'avance"
                emptyLabel="Aucune preuve d'avance déposée"
              />
            </Card>

            <Card className="space-y-1 p-3">
              <p className="text-xs font-medium text-muted-foreground">Estimé et réalisé</p>
              <Ligne k="Distance" v={`${(course.actual_distance_km ?? 0).toFixed(1)} / ${course.distance_km.toFixed(1)} km`} />
              <Ligne k="Durée estimée" v={`${course.estimated_minutes} min`} />
              <Ligne k="Dépassement de temps" v={`${course.overtime_minutes} min`} />
            </Card>

            {articles.length > 0 && (
              <Card className="p-3">
                <p className="text-xs font-medium text-muted-foreground">Liste demandée</p>
                <ul className="mt-1 space-y-0.5">
                  {articles.map((article, index) => (
                    <li key={`${article.label ?? "article"}-${index}`} className="text-xs">
                      {article.label ?? "Article"}
                      {article.qty ? ` · ${article.qty}` : ""}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {course.notes && (
              <Card className="p-3">
                <p className="text-xs font-medium text-muted-foreground">Consignes du client</p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{course.notes}</p>
              </Card>
            )}

            <Card className="p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Chronologie ({evenements.length})
              </p>
              {evenements.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Aucun événement enregistré.</p>
              ) : (
                <ol className="mt-2 space-y-1 border-l border-border pl-3">
                  {evenements.map((e) => (
                    <li key={e.id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {STATUS_LABEL[e.status as ErrandStatus] ?? e.status}
                      </span>
                      {e.note ? ` · ${e.note}` : ""}
                      <span className="ml-1 opacity-70">
                        {new Date(e.created_at).toLocaleString("fr-FR")}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Ligne({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export default ErrandInspector;
