-- ---------------------------------------------------------------------------
-- L'adresse exacte cesse d'être visible avant l'attribution de la course.
--
-- La documentation promet qu'un shopper ne découvre l'adresse de livraison
-- qu'une fois la course confiée. Le marché ouvert, lui, ne montre que la ville
-- et le quartier. Cette promesse était tenue par les vues, et par elles seules.
--
-- Défaut constaté en interrogeant la base sous l'identité d'un shopper validé
-- non assigné : la politique de lecture laissait accéder à la table errands
-- elle-même pour toute course ouverte. Une requête directe, à la portée de
-- quiconque possède la clé publique et un compte shopper validé, rendait
-- l'adresse complète et les notes privées du client, où figurent couramment un
-- code de portail, un étage ou une consigne personnelle.
--
-- RLS ne filtre pas les colonnes : on ne peut pas rendre une partie de la
-- ligne. La lecture directe est donc réservée aux participants, et le marché
-- ouvert passe par une vue qui ne porte ni adresse ni notes.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Errand visibility" ON public.errands;

CREATE POLICY "Errand visibility"
  ON public.errands FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR runner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

COMMENT ON POLICY "Errand visibility" ON public.errands IS
  'Participants et personnel seulement. Le marche ouvert se lit par open_errands_feed, qui masque adresse et notes.';

-- ---------------------------------------------------------------------------
-- Le marché ouvert reste accessible aux shoppers validés, par la vue seule.
--
-- La vue s'exécute avec les droits de son propriétaire, ce qui lui permet de
-- publier le marché malgré la politique ci-dessus. Ce contournement est
-- volontaire et borné de deux façons : elle ne rend que des colonnes
-- publiables, et elle ne rend rien du tout à qui n'est pas shopper validé.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.open_errands_feed;

CREATE VIEW public.open_errands_feed
WITH (security_invoker = off)
AS
SELECT
  e.id,
  e.title,
  e.category,
  e.city,
  e.zone,
  e.budget_estimate,
  e.service_fee,
  e.delivery_fee,
  e.total_amount,
  e.runner_payout,
  e.distance_km,
  e.estimated_minutes,
  e.vehicle_required,
  e.volume_size,
  e.urgency,
  e.dropoff_mode,
  e.fund_mode,
  e.items,
  e.scheduled_for,
  e.created_at
FROM public.errands e
WHERE e.status = 'open'::errand_status
  AND e.runner_id IS NULL
  AND public.is_approved_runner(auth.uid());

REVOKE ALL ON public.open_errands_feed FROM anon;
GRANT SELECT ON public.open_errands_feed TO authenticated;

-- ---------------------------------------------------------------------------
-- Contrôle exécuté à la migration : le marché ne doit exposer aucune donnée
-- privée. Une colonne ajoutée par distraction à cette vue rendrait à tous les
-- shoppers ce que la politique vient tout juste de leur retirer.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_interdites text[];
BEGIN
  SELECT array_agg(a.attname)
  INTO v_interdites
  FROM pg_attribute a
  WHERE a.attrelid = 'public.open_errands_feed'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname IN ('delivery_address', 'notes', 'customer_id', 'handover_code',
                      'lat', 'lng', 'third_party_contact', 'preferred_contact');

  IF v_interdites IS NOT NULL THEN
    RAISE EXCEPTION 'Le marché ouvert exposerait des données privées : %',
      array_to_string(v_interdites, ', ');
  END IF;
END
$$;
