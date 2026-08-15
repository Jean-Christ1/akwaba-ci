-- ---------------------------------------------------------------------------
-- Ce qu'un exploitant doit voir pour tenir le service.
--
-- La console permet aujourd'hui de trancher un litige, de valider un shopper et
-- de constater un règlement. Elle ne permet pas de voir l'activité : combien de
-- courses attendent une offre depuis trop longtemps, laquelle est bloquée en
-- attente d'un accord de budget, laquelle a été livrée sans que le client
-- confirme. Autrement dit, elle sait réagir mais pas surveiller.
--
-- Or ce sont ces courses-là qui font perdre un client : celle qui reste ouverte
-- sans offre, celle dont le shopper attend une réponse, celle qui est livrée
-- mais jamais réglée. Aucune n'est en litige, donc aucune n'apparaît nulle part.
--
-- Cette vue rassemble ce qu'il faut pour les repérer, sans jamais exposer plus
-- que nécessaire : ni code de remise, ni notes privées du client.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.errand_operations
WITH (security_invoker = on)
AS
SELECT
  e.id,
  e.title,
  e.category,
  e.city,
  e.zone,
  e.status,
  e.payment_status,
  e.customer_id,
  e.runner_id,
  e.budget_estimate,
  e.service_fee,
  e.commission_amount,
  e.total_amount,
  e.created_at,
  e.accepted_at,
  e.delivered_at,
  e.budget_overrun_pending,
  e.handover_locked_at,
  e.substitution_policy,
  cp.display_name  AS client_nom,
  cp.phone         AS client_telephone,
  rp.full_name     AS shopper_nom,
  rp.phone         AS shopper_telephone,

  -- Age de la course, pour trier ce qui traine.
  EXTRACT(EPOCH FROM (now() - e.created_at)) / 3600 AS heures_depuis_creation,

  (SELECT count(*) FROM public.errand_offers o
    WHERE o.errand_id = e.id AND o.status = 'pending'::offer_status)::int AS offres_en_attente,

  (SELECT count(*) FROM public.errand_items i
    WHERE i.errand_id = e.id AND i.state = 'substitute'::errand_item_state)::int AS remplacements_en_attente,

  -- Ce qui appelle une intervention, nomme plutot que laisse a deviner. L'ordre
  -- des conditions est celui de l'urgence : un blocage passe avant un retard.
  CASE
    WHEN e.status = 'disputed'::errand_status THEN 'litige'
    WHEN e.handover_locked_at IS NOT NULL THEN 'remise bloquee'
    WHEN e.budget_overrun_pending THEN 'accord de budget attendu'
    WHEN e.status = 'delivered'::errand_status
         AND e.payment_status <> 'paid'::pay_status
         AND e.delivered_at < now() - interval '24 hours' THEN 'livree sans confirmation'
    WHEN e.status = 'open'::errand_status
         AND e.created_at < now() - interval '2 hours'
         AND NOT EXISTS (SELECT 1 FROM public.errand_offers o WHERE o.errand_id = e.id)
      THEN 'sans offre'
    WHEN e.status IN ('assigned'::errand_status, 'shopping'::errand_status, 'delivering'::errand_status)
         AND e.accepted_at < now() - interval '6 hours' THEN 'mission qui traine'
    ELSE NULL
  END AS alerte
FROM public.errands e
LEFT JOIN public.profiles cp ON cp.id = e.customer_id
LEFT JOIN public.runner_profiles rp ON rp.user_id = e.runner_id;

COMMENT ON VIEW public.errand_operations IS
  'Suivi d''exploitation des courses. Ne porte ni code de remise ni notes privées du client.';

GRANT SELECT ON public.errand_operations TO authenticated;

-- ---------------------------------------------------------------------------
-- La vue applique les politiques de l'appelant : seuls le personnel et les
-- participants d'une course y voient quelque chose. Le personnel doit pouvoir
-- lire les profils pour nommer les parties, ce que la politique de lecture des
-- profils autorise deja.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_interdites text[];
BEGIN
  SELECT array_agg(a.attname)
  INTO v_interdites
  FROM pg_attribute a
  WHERE a.attrelid = 'public.errand_operations'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attname IN ('handover_code', 'notes', 'delivery_address', 'third_party_contact');

  IF v_interdites IS NOT NULL THEN
    RAISE EXCEPTION 'Le suivi d''exploitation exposerait des données privées : %',
      array_to_string(v_interdites, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Le compte des courses qui appellent une intervention.
--
-- Un exploitant a besoin de savoir en un coup d'oeil s'il y a quelque chose a
-- faire, sans parcourir la liste entiere.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_alert_counts()
RETURNS TABLE (alerte text, nombre integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.alerte, count(*)::int
  FROM public.errand_operations o
  WHERE o.alerte IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'moderator'::app_role))
  GROUP BY o.alerte
  ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.errand_alert_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_alert_counts() TO authenticated;
