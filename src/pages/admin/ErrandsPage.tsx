import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ErrandInspector } from "@/modules/admin/ErrandInspector";
import { formatFcfa, STATUS_LABEL, statusTone, type ErrandStatus } from "@/modules/errands/domain";

interface Course {
  id: string;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  status: ErrandStatus;
  payment_status: string;
  budget_estimate: number | null;
  service_fee: number | null;
  commission_amount: number | null;
  created_at: string;
  client_nom: string | null;
  client_telephone: string | null;
  shopper_nom: string | null;
  shopper_telephone: string | null;
  heures_depuis_creation: number | null;
  offres_en_attente: number;
  remplacements_en_attente: number;
  alerte: string | null;
}

/**
 * Suivi des courses pour l'exploitation.
 *
 * La console savait réagir : trancher un litige, valider un shopper, constater
 * un règlement. Elle ne savait pas surveiller. Or les courses qui font perdre un
 * client ne sont presque jamais en litige : c'est celle qui reste ouverte sans
 * offre, celle dont le shopper attend une réponse depuis deux heures, celle qui
 * est livrée mais que personne n'a confirmée. Aucune n'apparaissait nulle part.
 *
 * Cet écran les nomme et les remonte en premier.
 */
export default function ErrandsPage() {
  const { isAdmin, isModerator, loading } = useAuth();
  const staff = isAdmin || isModerator;

  const [courses, setCourses] = useState<Course[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"alertes" | "encours" | "toutes">("alertes");
  const [examinee, setExaminee] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    let requete = supabase
      .from("errand_operations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filtre === "alertes") requete = requete.not("alerte", "is", null);
    if (filtre === "encours") {
      requete = requete.in("status", ["open", "assigned", "shopping", "delivering", "delivered"]);
    }

    const { data, error } = await requete;
    setChargement(false);

    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setCourses((data ?? []) as Course[]);
  }, [filtre]);

  useEffect(() => {
    if (staff) void charger();
  }, [staff, charger]);

  // La recherche filtre ce qui est déjà chargé : sur deux cents lignes elle est
  // instantanée, là où un aller-retour serveur ferait clignoter la liste à
  // chaque frappe.
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) =>
      [c.title, c.city, c.zone, c.client_nom, c.shopper_nom, c.client_telephone, c.shopper_telephone, c.id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [courses, recherche]);

  const parAlerte = useMemo(() => {
    const compte = new Map<string, number>();
    for (const c of courses) {
      if (c.alerte) compte.set(c.alerte, (compte.get(c.alerte) ?? 0) + 1);
    }
    return [...compte.entries()].sort((a, b) => b[1] - a[1]);
  }, [courses]);

  if (loading) return null;

  if (!staff) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé au personnel de la plateforme.{" "}
        <Link className="text-primary" to="/profil">
          Mon profil
        </Link>
      </div>
    );
  }

  return (
    <div className="akw-container max-w-6xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Suivi des courses</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ce qui attend une intervention, avant ce qui se déroule normalement.
      </p>

      {parAlerte.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {parAlerte.map(([alerte, nombre]) => (
            <span
              key={alerte}
              className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {nombre} {alerte}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["alertes", "À traiter"],
            ["encours", "En cours"],
            ["toutes", "Toutes"],
          ] as const
        ).map(([valeur, libelle]) => (
          <Button
            key={valeur}
            size="sm"
            className="min-h-[44px]"
            variant={filtre === valeur ? "default" : "outline"}
            onClick={() => setFiltre(valeur)}
          >
            {libelle}
          </Button>
        ))}

        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="min-h-[44px] pl-9"
            placeholder="Titre, ville, client, shopper, identifiant"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher une course"
          />
        </div>
      </div>

      {chargement ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement des courses…</p>
      ) : erreur ? (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Les courses n'ont pas pu être chargées.</p>
          <p className="mt-1 text-muted-foreground">{erreur}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void charger()}>
            Réessayer
          </Button>
        </div>
      ) : visibles.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {filtre === "alertes"
            ? "Aucune course n'attend d'intervention. C'est le bon état."
            : recherche
              ? "Aucune course ne correspond à cette recherche."
              : "Aucune course dans cette catégorie."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visibles.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{c.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(c.status)}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                    {c.alerte && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        {c.alerte}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.zone ? `${c.zone}, ` : ""}
                    {c.city} · il y a {Math.round(c.heures_depuis_creation ?? 0)} h ·{" "}
                    {c.client_nom ?? "client sans nom"}
                    {c.shopper_nom ? ` · ${c.shopper_nom}` : " · sans shopper"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Budget {formatFcfa(c.budget_estimate ?? 0)} · Frais{" "}
                    {formatFcfa(c.service_fee ?? 0)} · Commission{" "}
                    {formatFcfa(c.commission_amount ?? 0)}
                    {c.offres_en_attente > 0 && ` · ${c.offres_en_attente} offre(s)`}
                    {c.remplacements_en_attente > 0 &&
                      ` · ${c.remplacements_en_attente} remplacement(s) en attente`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] shrink-0"
                  onClick={() => setExaminee(c.id)}
                >
                  Examiner
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ErrandInspector errandId={examinee} onClose={() => setExaminee(null)} />
    </div>
  );
}
