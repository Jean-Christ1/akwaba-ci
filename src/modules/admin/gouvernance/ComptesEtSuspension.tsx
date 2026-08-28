import { useCallback, useEffect, useState } from "react";
import { Ban, Loader2, Mail, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

interface Compte {
  user_id: string;
  courriel: string | null;
  nom_affiche: string | null;
  telephone: string | null;
  cree_le: string;
  suspendu_le: string | null;
  suspendu_motif: string | null;
  suspendu_par_courriel: string | null;
  roles: string[];
  courses: number;
}

/** Le motif se saisit dans la boîte, jamais dans un window.prompt : il finit
 *  dans le journal d'audit, et quelqu'un le relira dans un an. */
const MOTIF_MINIMUM = 5;

/**
 * Les comptes, et la suspension.
 *
 * Le droit « utilisateurs.suspendre » figurait au catalogue depuis le début et
 * n'ouvrait rien. La console l'affichait accordé, il n'existait aucun écran
 * pour l'exercer, et la seule façon de fermer un compte était d'écrire
 * directement dans la base, sans trace ni motif.
 *
 * Deux choses manquaient. Le geste, écrit côté serveur avec ses refus : on ne
 * se suspend pas soi-même, on ne suspend pas plus habilité que soi, on ne lève
 * pas sa propre suspension. Et le chemin pour y arriver : la recherche
 * d'exploitation ne lit pas les adresses courriel, donc un compte dont on
 * n'avait que l'adresse était introuvable.
 *
 * Cet écran ne décide de rien. Le serveur refuse ce qu'il doit refuser, et
 * chaque geste laisse une trace nominative avec son motif.
 */
export function ComptesEtSuspension({ mesDroits }: { mesDroits: string[] }) {
  const [recherche, setRecherche] = useState("");
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cible, setCible] = useState<Compte | null>(null);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [destinataire, setDestinataire] = useState<Compte | null>(null);
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");

  const jePeuxSuspendre = mesDroits.includes("utilisateurs.suspendre");
  const jePeuxEcrire = mesDroits.includes("notifications.envoyer");

  const charger = useCallback(async (terme: string) => {
    setChargement(true);
    const { data, error } = await supabase.rpc("annuaire_des_comptes", {
      p_recherche: terme.trim() || null,
      p_limite: 40,
    });
    setChargement(false);
    if (error) {
      setErreur(error.message);
      setComptes([]);
      return;
    }
    setErreur(null);
    setComptes((data ?? []) as unknown as Compte[]);
  }, []);

  useEffect(() => {
    void charger("");
  }, [charger]);

  const confirmer = async () => {
    if (!cible) return;
    const suspendre = !cible.suspendu_le;
    if (suspendre && motif.trim().length < MOTIF_MINIMUM) {
      toast.error("Indiquez le motif de la suspension.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("compte_suspendre", {
      p_user_id: cible.user_id,
      p_suspendre: suspendre,
      p_motif: suspendre ? motif.trim() : null,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(suspendre ? "Compte suspendu." : "Compte réactivé.");
    setCible(null);
    setMotif("");
    void charger(recherche);
  };

  const envoyer = async () => {
    if (!destinataire) return;
    setEnCours(true);
    const { data, error } = await supabase.rpc("message_envoyer", {
      p_user_id: destinataire.user_id,
      p_sujet: sujet.trim(),
      p_corps: corps.trim(),
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Le canal choisi est dit à l'expéditeur : écrire à quelqu'un qui n'a
    // accepté ni WhatsApp ni le SMS part par courriel, et il doit le savoir
    // avant d'attendre une réponse immédiate.
    const canal = (data as { canal?: string } | null)?.canal;
    toast.success(canal ? `Message déposé, envoi par ${canal}.` : "Message déposé.");
    setDestinataire(null);
    setSujet("");
    setCorps("");
  };

  const suspendus = comptes.filter((c) => c.suspendu_le).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Suspendre ferme l'accès, cela n'efface rien : le compte garde ses données et
        continue de consulter ce qui le concerne, il ne publie simplement plus de course.
        Une suspension se lève, un effacement non.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void charger(recherche);
        }}
      >
        <div className="flex-1 sm:max-w-sm">
          <Label className="text-xs" htmlFor="annuaire">
            Adresse, nom, téléphone ou identifiant
          </Label>
          <div className="relative mt-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="annuaire"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="konan@exemple.ci"
              className="pl-9"
            />
          </div>
        </div>
        <Button type="submit" variant="outline" disabled={chargement}>
          {chargement && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
          Chercher
        </Button>
        {!jePeuxSuspendre && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Lecture seule : vous n'avez pas le droit de suspendre.
          </p>
        )}
      </form>

      {erreur && (
        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {erreur}
        </p>
      )}

      {!erreur && !chargement && (
        <p className="text-[11px] text-muted-foreground">
          {comptes.length} compte{comptes.length > 1 ? "s" : ""}
          {suspendus > 0 && `, dont ${suspendus} suspendu${suspendus > 1 ? "s" : ""}`}
          {comptes.length === 40 && " (les 40 premiers, affinez la recherche)"}
        </p>
      )}

      <ul className="space-y-2">
        {comptes.map((c) => (
          <li
            key={c.user_id}
            className={`rounded-xl border p-3 ${
              c.suspendu_le ? "border-destructive/30 bg-destructive/5" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {c.nom_affiche || "Sans nom affiché"}
                  {c.suspendu_le && (
                    <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      suspendu
                    </span>
                  )}
                  {c.roles.map((r) => (
                    <span
                      key={r}
                      className="ml-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary"
                    >
                      {r}
                    </span>
                  ))}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.courriel ?? "adresse inconnue"}
                  {c.telephone && ` · ${c.telephone}`}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Inscrit le {new Date(c.cree_le).toLocaleDateString("fr-FR")} · {c.courses} course
                  {c.courses > 1 ? "s" : ""}
                  <span className="ml-1 font-mono">{c.user_id.slice(0, 8)}</span>
                </p>
                {c.suspendu_le && (
                  <p className="mt-1 text-[11px] text-destructive">
                    Suspendu le {new Date(c.suspendu_le).toLocaleDateString("fr-FR")}
                    {c.suspendu_par_courriel && ` par ${c.suspendu_par_courriel}`}
                    {c.suspendu_motif && ` : ${c.suspendu_motif}`}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
              {jePeuxEcrire && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDestinataire(c);
                    setSujet("");
                    setCorps("");
                  }}
                >
                  <Mail className="mr-1 h-3 w-3" aria-hidden="true" />
                  Écrire
                </Button>
              )}
              {jePeuxSuspendre && (
                <Button
                  size="sm"
                  variant={c.suspendu_le ? "outline" : "destructive"}
                  onClick={() => {
                    setCible(c);
                    setMotif("");
                  }}
                >
                  {c.suspendu_le ? (
                    <>
                      <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
                      Réactiver
                    </>
                  ) : (
                    <>
                      <Ban className="mr-1 h-3 w-3" aria-hidden="true" />
                      Suspendre
                    </>
                  )}
                </Button>
              )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!chargement && !erreur && comptes.length === 0 && (
        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Aucun compte ne correspond.
        </p>
      )}

      <AlertDialog open={cible !== null} onOpenChange={(o) => !o && setCible(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cible?.suspendu_le ? "Réactiver ce compte" : "Suspendre ce compte"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cible?.courriel ?? cible?.user_id}
              {cible?.suspendu_le
                ? ". Le compte pourra de nouveau publier des courses."
                : ". Le compte ne pourra plus publier de course. Il gardera l'accès à ses données pour pouvoir contester."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!cible?.suspendu_le && (
            <div>
              <Label className="text-xs" htmlFor="motif-suspension">
                Motif, conservé dans le journal d'audit
              </Label>
              <Textarea
                id="motif-suspension"
                className="mt-1"
                rows={3}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Colis réclamés jamais reçus, trois signalements concordants"
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={enCours}
              onClick={(e) => {
                // Le geste part vers le serveur : la boite ne se referme qu'au
                // retour, sinon un refus disparaitrait avec elle.
                e.preventDefault();
                void confirmer();
              }}
            >
              {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
              {cible?.suspendu_le ? "Réactiver" : "Suspendre"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={destinataire !== null}
        onOpenChange={(o) => !o && setDestinataire(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Écrire à ce compte</AlertDialogTitle>
            <AlertDialogDescription>
              {destinataire?.courriel ?? destinataire?.user_id}. Le message part par le canal
              que la personne a accepté. Sans consentement WhatsApp ni SMS, il part par
              courriel.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs" htmlFor="sujet-message">
                Sujet
              </Label>
              <Input
                id="sujet-message"
                className="mt-1"
                value={sujet}
                onChange={(e) => setSujet(e.target.value)}
                placeholder="Suite à votre appel"
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="corps-message">
                Message, conservé dans le journal d'envoi
              </Label>
              <Textarea
                id="corps-message"
                className="mt-1"
                rows={5}
                value={corps}
                onChange={(e) => setCorps(e.target.value)}
                placeholder="Votre remboursement a été validé, il arrive sous 48 heures."
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={enCours}
              onClick={(e) => {
                e.preventDefault();
                void envoyer();
              }}
            >
              {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
              Envoyer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ComptesEtSuspension;
