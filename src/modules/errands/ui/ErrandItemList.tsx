import { useCallback, useEffect, useState } from "react";
import { Check, PackageX, Repeat, ShoppingBasket, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";
import { vibrer } from "@/shared/media/retourHaptique";

type EtatArticle =
  | "requested"
  | "found"
  | "substitute"
  | "accepted"
  | "refused"
  | "unavailable";

interface Article {
  id: string;
  position: number;
  label: string;
  qty: string | null;
  state: EtatArticle;
  substitute_label: string | null;
  substitute_price: number | null;
  substitute_note: string | null;
}

const LIBELLE: Record<EtatArticle, string> = {
  requested: "À trouver",
  found: "Trouvé",
  substitute: "Remplacement proposé",
  accepted: "Remplacement accepté",
  refused: "Remplacement refusé",
  unavailable: "Introuvable",
};

const TON: Record<EtatArticle, string> = {
  requested: "bg-muted text-muted-foreground",
  found: "bg-primary-soft text-primary",
  substitute: "bg-accent-soft text-accent-foreground",
  accepted: "bg-primary-soft text-primary",
  refused: "bg-destructive/10 text-destructive",
  unavailable: "bg-destructive/10 text-destructive",
};

interface ErrandItemListProps {
  errandId: string;
  isRunner: boolean;
  isCustomer: boolean;
  /** La liste se fige une fois la course réglée. */
  figee: boolean;
}

/**
 * Liste des articles, et ce qu'il advient de chacun.
 *
 * Un article manque en rayon, ou son prix a doublé : jusqu'ici cet échange se
 * réglait dans la conversation et ne laissait aucune trace, si bien que le
 * client découvrait le remplacement sur la facture. C'est exactement le
 * désaccord qui finit en litige, et un litige sans trace se tranche mal.
 *
 * Chaque décision est ici tracée du côté de celui qui la prend : le shopper
 * signale, le client accepte ou refuse.
 */
export function ErrandItemList({ errandId, isRunner, isCustomer, figee }: ErrandItemListProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [remplacement, setRemplacement] = useState<Record<string, { label: string; prix: string }>>({});

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from("errand_items")
      .select("id,position,label,qty,state,substitute_label,substitute_price,substitute_note")
      .eq("errand_id", errandId)
      .order("position");

    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setArticles((data ?? []) as Article[]);
  }, [errandId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const signaler = async (
    article: Article,
    etat: "found" | "substitute" | "unavailable"
  ) => {
    const saisie = remplacement[article.id];
    if (etat === "substitute" && !saisie?.label?.trim()) {
      return toast.error("Indiquez ce que vous proposez à la place.");
    }

    setEnCours(article.id);
    const { error } = await supabase.rpc("errand_item_report", {
      p_item_id: article.id,
      p_state: etat,
      p_label: etat === "substitute" ? saisie.label.trim() : undefined,
      p_price: etat === "substitute" ? Number(saisie.prix) || 0 : undefined,
      p_note: undefined,
    });
    setEnCours(null);

    if (error) return toast.error(error.message);
    vibrer("succes");
    toast.success(
      etat === "substitute" ? "Remplacement proposé au client." : "Article mis à jour."
    );
    void charger();
  };

  const decider = async (article: Article, accepte: boolean) => {
    setEnCours(article.id);
    const { error } = await supabase.rpc("errand_item_decide", {
      p_item_id: article.id,
      p_accept: accepte,
    });
    setEnCours(null);

    if (error) return toast.error(error.message);
    vibrer(accepte ? "succes" : "attention");
    toast.success(accepte ? "Remplacement accepté." : "Remplacement refusé.");
    void charger();
  };

  if (chargement) {
    return <p className="text-sm text-muted-foreground">Chargement de la liste…</p>;
  }

  if (erreur) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">La liste n'a pas pu être chargée.</p>
        <p className="mt-1 text-muted-foreground">{erreur}</p>
      </div>
    );
  }

  if (articles.length === 0) return null;

  const enAttente = articles.filter((a) => a.state === "substitute").length;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ShoppingBasket className="h-4 w-4" aria-hidden="true" />
          Liste des articles
        </h2>
        {enAttente > 0 && isCustomer && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-foreground">
            {enAttente} remplacement{enAttente > 1 ? "s" : ""} à valider
          </span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {articles.map((a) => (
          <li key={a.id} className="rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {a.label}
                  {a.qty && <span className="ml-2 text-xs text-muted-foreground">× {a.qty}</span>}
                </p>
                {a.substitute_label && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    À la place : <span className="font-medium">{a.substitute_label}</span>
                    {a.substitute_price != null && a.substitute_price > 0 && (
                      <> · {formatFcfa(a.substitute_price)}</>
                    )}
                  </p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${TON[a.state]}`}>
                {LIBELLE[a.state]}
              </span>
            </div>

            {/* Le shopper renseigne pendant qu'il fait les courses. */}
            {isRunner && !figee && a.state !== "accepted" && a.state !== "refused" && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] flex-1"
                    disabled={enCours === a.id}
                    onClick={() => void signaler(a, "found")}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Trouvé
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] flex-1"
                    disabled={enCours === a.id}
                    onClick={() => void signaler(a, "unavailable")}
                  >
                    <PackageX className="h-4 w-4" aria-hidden="true" />
                    Introuvable
                  </Button>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    className="min-h-[44px] flex-1"
                    placeholder="Proposer autre chose"
                    value={remplacement[a.id]?.label ?? ""}
                    onChange={(e) =>
                      setRemplacement((r) => ({
                        ...r,
                        [a.id]: { label: e.target.value, prix: r[a.id]?.prix ?? "" },
                      }))
                    }
                  />
                  <Input
                    className="min-h-[44px] w-24"
                    inputMode="numeric"
                    placeholder="Prix"
                    value={remplacement[a.id]?.prix ?? ""}
                    onChange={(e) =>
                      setRemplacement((r) => ({
                        ...r,
                        [a.id]: { label: r[a.id]?.label ?? "", prix: e.target.value },
                      }))
                    }
                  />
                  <Button
                    size="sm"
                    className="min-h-[44px]"
                    disabled={enCours === a.id}
                    onClick={() => void signaler(a, "substitute")}
                  >
                    <Repeat className="h-4 w-4" aria-hidden="true" />
                    Proposer
                  </Button>
                </div>
              </div>
            )}

            {/* Le client tranche, et sa décision est datée. */}
            {isCustomer && a.state === "substitute" && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="min-h-[44px] flex-1"
                  disabled={enCours === a.id}
                  onClick={() => void decider(a, true)}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  J'accepte
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] flex-1"
                  disabled={enCours === a.id}
                  onClick={() => void decider(a, false)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Je refuse
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Chaque décision est horodatée : en cas de désaccord, elle fait foi.
      </p>
    </section>
  );
}

export default ErrandItemList;
