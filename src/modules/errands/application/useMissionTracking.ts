import { useCallback, useEffect, useRef, useState } from "react";

import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  errandId: string;
  /** Le suivi ne tourne que pour le shopper assigné, mission en cours. */
  actif: boolean;
}

interface Etat {
  distanceParcourue: number;
  minutesEcoulees: number;
  suiviActif: boolean;
  refus: boolean;
}

/**
 * Suivi de la mission en cours.
 *
 * Deux compteurs tournent tant que la course n'est pas terminée : le temps
 * écoulé depuis le départ, et la distance réellement parcourue. Sans eux, un
 * dépassement ne laisse aucune trace, le shopper travaille gratuitement au delà
 * de l'estimation et aucun litige sur la durée n'est arbitrable.
 *
 * La position part au serveur à intervalle espacé : relever chaque mètre
 * viderait la batterie et le forfait pour une précision dont personne n'a
 * besoin.
 */
const INTERVALLE_MS = 60_000;

export function useMissionTracking(
  { errandId, actif }: Options,
  depart: string | null
): Etat {
  const [distanceParcourue, setDistance] = useState(0);
  const [minutesEcoulees, setMinutes] = useState(0);
  const [suiviActif, setSuiviActif] = useState(false);
  const [refus, setRefus] = useState(false);
  const dernierEnvoi = useRef(0);

  // Compteur de temps : il continue de courir tant que la mission est ouverte.
  useEffect(() => {
    if (!actif || !depart) return;

    const calcul = () => {
      const debut = new Date(depart).getTime();
      setMinutes(Math.max(0, Math.floor((Date.now() - debut) / 60_000)));
    };

    calcul();
    const minuteur = window.setInterval(calcul, 30_000);
    return () => window.clearInterval(minuteur);
  }, [actif, depart]);

  // Relevé de position, transmis au serveur qui cumule la distance.
  useEffect(() => {
    if (!actif) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const veille = navigator.geolocation.watchPosition(
      (position) => {
        setSuiviActif(true);
        setRefus(false);

        const maintenant = Date.now();
        if (maintenant - dernierEnvoi.current < INTERVALLE_MS) return;
        dernierEnvoi.current = maintenant;

        supabase
          .rpc("errand_track_position", {
            p_errand_id: errandId,
            p_lat: position.coords.latitude,
            p_lng: position.coords.longitude,
            p_accuracy: position.coords.accuracy ?? null,
          })
          .then(({ data, error }) => {
            if (error) {
              logger.debug("[suivi] position refusée", error.message);
              return;
            }
            if (typeof data === "number") setDistance(data);
          });
      },
      (erreur) => {
        // Un refus de localisation ne doit pas empêcher de travailler : la
        // mission continue, seule la distance ne sera pas mesurée.
        setSuiviActif(false);
        if (erreur.code === erreur.PERMISSION_DENIED) setRefus(true);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );

    return () => navigator.geolocation.clearWatch(veille);
  }, [actif, errandId]);

  return { distanceParcourue, minutesEcoulees, suiviActif, refus };
}

/** Écart entre estimé et réalisé, tel qu'on l'affiche aux deux parties. */
export function useOverrun(errandId: string, actif: boolean) {
  const [depassement, setDepassement] = useState<{
    overtimeMinutes: number;
    extraDistanceKm: number;
    overrunFee: number;
    capped: boolean;
  } | null>(null);

  const recharger = useCallback(async () => {
    if (!actif) return;
    const { data, error } = await supabase.rpc("errand_compute_overrun", {
      p_errand_id: errandId,
    });
    if (error) return;

    const ligne = Array.isArray(data) ? data[0] : data;
    if (!ligne) return;

    setDepassement({
      overtimeMinutes: Number(ligne.overtime_minutes ?? 0),
      extraDistanceKm: Number(ligne.extra_distance_km ?? 0),
      overrunFee: Number(ligne.overrun_fee ?? 0),
      capped: Boolean(ligne.capped),
    });
  }, [errandId, actif]);

  useEffect(() => {
    recharger();
    if (!actif) return;
    // Réévalué régulièrement : le dépassement grandit tant que la course dure.
    const minuteur = window.setInterval(recharger, 120_000);
    return () => window.clearInterval(minuteur);
  }, [recharger, actif]);

  return { depassement, recharger };
}
