import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { ErrandStatus } from "@/modules/errands/domain";

export interface ErrandDetail {
  id: string;
  customer_id: string;
  runner_id: string | null;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  /** Nul tant que le lecteur n'est ni le client ni le shopper assigné. */
  delivery_address: string | null;
  /** Nul tant que le lecteur n'est ni le client ni le shopper assigné. */
  notes: string | null;
  items: unknown;
  budget_estimate: number;
  preferred_contact: string;
  scheduled_for: string | null;
  status: ErrandStatus;
  items_total: number;
  service_fee: number;
  delivery_fee: number;
  commission_rate: number;
  commission_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  fund_mode: string;
  advance_proof_url: string | null;
  /** Ce que le shopper reconnaît avoir reçu. Seul montant déduit de la facture. */
  advance_amount: number;
  /** Ce que le client déclare avoir envoyé. Une déclaration, pas une preuve. */
  advance_declared_amount: number;
  advance_declared_at: string | null;
  advance_confirmed_at: string | null;
  receipt_url: string | null;
  rating: number | null;
  review: string | null;
  tip_amount: number;
  distance_km: number;
  estimated_minutes: number;
  actual_distance_km: number | null;
  overtime_minutes: number;
  extra_distance_km: number;
  overrun_fee: number;
  budget_overrun_pending: boolean;
  budget_approved_at: string | null;
  started_at: string | null;
  created_at: string;
}

export interface ErrandOffer {
  id: string;
  runner_id: string;
  price: number;
  eta_minutes: number;
  message: string | null;
  status: string;
}

export interface ErrandMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface RunnerCard {
  user_id: string;
  full_name: string;
  /** Renseigné uniquement pour le shopper assigné à la course. */
  phone: string | null;
  /** Renseigné uniquement pour le shopper assigné à la course. */
  whatsapp: string | null;
  city: string;
  vehicle: string;
  rating: number;
  jobs_completed: number;
}

/**
 * Colonnes lisibles par toute personne autorisée à ouvrir la course, y compris
 * un shopper qui consulte le marché avant de se positionner.
 *
 * La liste est explicite pour deux raisons. D'une part, la lecture de la table
 * est accordée colonne par colonne afin de protéger le code de remise, donc une
 * étoile échouerait pour tout le monde. D'autre part, l'adresse exacte et les
 * notes du client sont volontairement absentes d'ici : la promesse produit est
 * qu'elles n'apparaissent qu'une fois la course attribuée.
 */
const COLONNES_IDENTITE =
  "id,customer_id,runner_id,title,category,city,zone,items,budget_estimate,preferred_contact,scheduled_for,status,created_at" as const;
const COLONNES_MONTANTS =
  "items_total,service_fee,delivery_fee,commission_rate,commission_amount,total_amount,tip_amount" as const;
const COLONNES_PAIEMENT =
  "payment_method,payment_status,fund_mode,advance_amount,advance_declared_amount,advance_declared_at,advance_confirmed_at,advance_proof_url,receipt_url,rating,review" as const;
const COLONNES_MISSION =
  "distance_km,estimated_minutes,actual_distance_km,overtime_minutes,extra_distance_km,overrun_fee,budget_overrun_pending,budget_approved_at,started_at" as const;

// La concaténation reste littérale : le client Supabase déduit le type de la
// ligne renvoyée à partir de la chaîne de sélection, un simple `string` lui
// ferait perdre toute connaissance des colonnes lues.
const COLONNES_PUBLIQUES =
  `${COLONNES_IDENTITE},${COLONNES_MONTANTS},${COLONNES_PAIEMENT},${COLONNES_MISSION}` as const;

/**
 * Colonnes réservées aux parties de la course.
 *
 * La politique de lecture du serveur laisse un shopper validé consulter une
 * course ouverte : demander ces deux colonnes dans la requête commune les
 * enverrait à son navigateur avant toute attribution. Elles font donc l'objet
 * d'une seconde requête, émise seulement quand le lecteur est le client ou le
 * shopper assigné.
 */
const COLONNES_PARTIES = "delivery_address,notes";

interface EtatErrandDetail {
  errand: ErrandDetail | null;
  offers: ErrandOffer[];
  messages: ErrandMessage[];
  runners: Record<string, RunnerCard>;
  loading: boolean;
  /** Message du serveur, à ne jamais confondre avec une course inexistante. */
  messageErreur: string | null;
  recharger: () => Promise<void>;
}

/**
 * Chargement du détail d'une course et de son fil de discussion.
 *
 * Un refus de lecture remonte tel quel : afficher « course introuvable » sur un
 * refus de droits envoie chercher un problème là où il n'est pas.
 */
export function useErrandDetail(
  id: string | undefined,
  userId: string | undefined
): EtatErrandDetail {
  const [errand, setErrand] = useState<ErrandDetail | null>(null);
  const [offers, setOffers] = useState<ErrandOffer[]>([]);
  const [messages, setMessages] = useState<ErrandMessage[]>([]);
  const [runners, setRunners] = useState<Record<string, RunnerCard>>({});
  const [loading, setLoading] = useState(true);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  const chargerRunners = useCallback(
    async (offresRecues: ErrandOffer[], runnerAssigne: string | null) => {
      const ids = Array.from(
        new Set(
          [...offresRecues.map((o) => o.runner_id), runnerAssigne].filter(Boolean) as string[]
        )
      );
      if (!ids.length) return;

      // Vitrine publique des shoppers : nom, ville, véhicule, réputation.
      // Ne contient jamais de coordonnées, y compris pour les offres reçues.
      const { data: pub } = await supabase
        .from("runner_public_profiles")
        .select("user_id,full_name,city,vehicle,rating,jobs_completed")
        .in("user_id", ids);

      const cartes: Record<string, RunnerCard> = Object.fromEntries(
        (pub ?? []).map((r) => [
          r.user_id as string,
          {
            user_id: r.user_id as string,
            full_name: r.full_name ?? "Shopper",
            phone: null,
            whatsapp: null,
            city: r.city ?? "",
            vehicle: r.vehicle ?? "",
            rating: Number(r.rating ?? 0),
            jobs_completed: Number(r.jobs_completed ?? 0),
          },
        ])
      );

      // Les coordonnées ne sont révélées que pour le shopper effectivement
      // assigné, afin que l'appel et le WhatsApp fonctionnent pendant la mission.
      if (runnerAssigne) {
        const { data: assigne } = await supabase
          .from("runner_profiles")
          .select("user_id,full_name,phone,whatsapp,city,vehicle,rating,jobs_completed")
          .eq("user_id", runnerAssigne)
          .maybeSingle();
        if (assigne) cartes[assigne.user_id] = assigne as RunnerCard;
      }

      setRunners(cartes);
    },
    []
  );

  const recharger = useCallback(async () => {
    if (!id) return;

    const { data: e, error: erreurCourse } = await supabase
      .from("errands")
      .select(COLONNES_PUBLIQUES)
      .eq("id", id)
      .maybeSingle();

    if (erreurCourse) {
      setMessageErreur(erreurCourse.message);
      setLoading(false);
      return;
    }
    setMessageErreur(null);
    if (!e) {
      setErrand(null);
      setLoading(false);
      return;
    }

    const estPartie = !!userId && (e.customer_id === userId || e.runner_id === userId);
    let adresse: string | null = null;
    let notes: string | null = null;
    if (estPartie) {
      const { data: prive } = await supabase
        .from("errands")
        .select(COLONNES_PARTIES)
        .eq("id", id)
        .maybeSingle();
      adresse = prive?.delivery_address ?? null;
      notes = prive?.notes ?? null;
    }

    setErrand({ ...e, delivery_address: adresse, notes } as ErrandDetail);

    const [{ data: o }, { data: m }] = await Promise.all([
      supabase.from("errand_offers").select("*").eq("errand_id", id).order("created_at"),
      supabase
        .from("errand_messages")
        .select("id,sender_id,body,created_at")
        .eq("errand_id", id)
        .order("created_at"),
    ]);
    const offresRecues = (o ?? []) as ErrandOffer[];
    setOffers(offresRecues);
    setMessages((m ?? []) as ErrandMessage[]);

    await chargerRunners(offresRecues, e.runner_id);
    setLoading(false);
  }, [id, userId, chargerRunners]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  useEffect(() => {
    if (!id) return;
    const canal = supabase
      .channel(`errand-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "errand_messages",
          filter: `errand_id=eq.${id}`,
        },
        (payload) => setMessages((p) => [...p, payload.new as ErrandMessage])
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "errands", filter: `id=eq.${id}` },
        () => recharger()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "errand_offers", filter: `errand_id=eq.${id}` },
        () => recharger()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [id, recharger]);

  return { errand, offers, messages, runners, loading, messageErreur, recharger };
}

export default useErrandDetail;
