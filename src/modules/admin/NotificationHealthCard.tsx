import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Sante {
  configure: boolean;
  expediteur: string | null;
  bac_a_sable: boolean;
  en_attente: number;
  /** Remis à pg_net. Ne veut pas dire accepté par Twilio. */
  remis: number;
  /** Accepté par Twilio, réponse lue. C'est le seul chiffre qui prouve. */
  confirmes: number;
  sans_confirmation: number;
  echoues: number;
  dernier_envoi: string | null;
  dernier_echec: { quand: string; motif: string; tentatives: number } | null;
  cadence_secondes: number;
  lot_max: number;
  porteur_actif: boolean;
  reconciliation_active: boolean;
  porteur_dernier_passage: string | null;
}

const dateCourte = (valeur: string | null) =>
  valeur
    ? new Date(valeur).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "jamais";

/**
 * L'état du portage WhatsApp.
 *
 * Une file qui n'avance pas et une file vide se ressemblent de loin : les deux
 * affichent zéro message en attente. Ce qui les sépare, c'est le passage du
 * porteur, un travail planifié qui part toutes les deux minutes. S'il s'arrête,
 * rien n'échoue, rien n'alerte, et les messages cessent simplement de partir.
 *
 * Le second piège tient au compte Twilio. Tant qu'il est en essai, l'expéditeur
 * est le numéro du bac à sable, partagé par tous les comptes d'essai du monde.
 * Il n'écrit qu'aux personnes qui l'ont explicitement rejoint, et cesse de le
 * faire après trois jours sans échange. C'est de loin la première cause de
 * message non reçu, et l'écran doit le dire plutôt que de laisser chercher.
 */
export function NotificationHealthCard() {
  const [sante, setSante] = useState<Sante | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase.rpc("whatsapp_sante");
    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setSante(data as unknown as Sante);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </section>
    );
  }

  if (erreur) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{erreur}</p>
      </section>
    );
  }

  if (!sante) return null;

  const alertes: string[] = [];
  if (!sante.configure) {
    alertes.push(
      "Aucune clé Twilio dans le coffre de la base : aucun message WhatsApp ne peut partir."
    );
  }
  if (!sante.porteur_actif) {
    alertes.push(
      "Le porteur planifié est arrêté. La file grossit sans que rien n'échoue."
    );
  }
  if (!sante.reconciliation_active) {
    alertes.push(
      "La réconciliation est arrêtée : plus rien ne vérifie ce que Twilio a répondu, " +
        "et un refus passerait pour un envoi réussi."
    );
  }
  if (sante.sans_confirmation > 0 && sante.confirmes === 0 && sante.remis > 0) {
    alertes.push(
      "Aucune remise n'a encore été confirmée par Twilio. Vérifiez que le destinataire " +
        "a rejoint le bac à sable avant de conclure que les messages partent."
    );
  }
  if (sante.bac_a_sable) {
    alertes.push(
      "Compte Twilio en essai : l'expéditeur est le bac à sable partagé. Seules les " +
        "personnes l'ayant rejoint reçoivent, et le lien expire après trois jours sans échange."
    );
  }
  if (sante.en_attente > 20) {
    alertes.push(`${sante.en_attente} messages attendent depuis trop longtemps.`);
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold">Envois WhatsApp</h2>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["En attente", String(sante.en_attente)],
          // « Remis » et « confirmé » ne sont pas le même chiffre : pg_net rend
          // la main avant que Twilio n'ait répondu. L'écart entre les deux est
          // ce qu'il faut regarder.
          ["Confirmés par Twilio", String(sante.confirmes)],
          ["Sans confirmation", String(sante.sans_confirmation)],
          ["Échoués", String(sante.echoues)],
        ].map(([libelle, valeur]) => (
          <div key={libelle} className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{libelle}</dt>
            <dd className="mt-1 text-sm font-semibold">{valeur}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        Porteur planifié : {sante.porteur_actif ? "actif" : "arrêté"}, dernier passage{" "}
        {dateCourte(sante.porteur_dernier_passage)}. Réconciliation :{" "}
        {sante.reconciliation_active ? "active" : "arrêtée"}. Cadence :{" "}
        {sante.cadence_secondes} s entre deux envois, {sante.lot_max} par passage. Expéditeur :{" "}
        {sante.expediteur ?? "non renseigné"}. Dernière remise :{" "}
        {dateCourte(sante.dernier_envoi)}.
      </p>

      {sante.dernier_echec && (
        <p className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Dernier échec le {dateCourte(sante.dernier_echec.quand)} après{" "}
          {sante.dernier_echec.tentatives} tentative
          {sante.dernier_echec.tentatives > 1 ? "s" : ""} : {sante.dernier_echec.motif}
        </p>
      )}

      {alertes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {alertes.map((a) => (
            <li
              key={a}
              className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              {a}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default NotificationHealthCard;
