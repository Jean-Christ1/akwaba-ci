-- Le marché ne propose plus au shopper ses propres courses.
--
-- Une personne peut être cliente et shopper sous la même identité, ce qui est
-- voulu : on n'oblige personne à tenir deux comptes. Mais le marché des
-- courses ouvertes lui montrait les siennes.
--
-- Le serveur refuse déjà qu'elle se les attribue, et cette garde tient. Ce qui
-- reste est une impasse offerte : une carte sur laquelle on clique et qui
-- refuse, dans une liste où chaque ligne devrait être une mission possible.
-- Sur un marché peu fourni, ses propres courses occupent en plus la place des
-- vraies.
--
-- La clause écarte donc l'appelant. Elle est le seul rempart de cette vue, qui
-- s'exécute avec les droits de son propriétaire : c'est son objet même, montrer
-- à un shopper habilité des courses qui ne sont pas les siennes.

CREATE OR REPLACE VIEW public.open_errands_feed
WITH (security_invoker = off) AS
  -- Les colonnes restent qualifiees par l'alias : c'est ainsi que la vue a
  -- toujours ete ecrite, et le controle qui verifie que l'ecran ne lit que
  -- des colonnes publiees s'appuie sur cette qualification.
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
  WHERE status = 'open'::errand_status
    AND runner_id IS NULL
    AND public.is_approved_runner(auth.uid())
    -- On ne propose a personne de travailler pour soi-meme. Le moteur refuse
    -- deja l'offre ; l'ecarter ici evite d'offrir une impasse, et libere la
    -- place sur une liste ou chaque ligne devrait etre une mission possible.
    AND e.customer_id IS DISTINCT FROM auth.uid();

COMMENT ON VIEW public.open_errands_feed IS
  'Marche des courses ouvertes. S''execute avec les droits du proprietaire, car elle montre a un shopper habilite des courses qui ne sont pas les siennes. Sa garde est dans sa clause : statut ouvert, aucun shopper retenu, appelant habilite, et jamais ses propres courses. Lecture seule.';

-- La vue vient d'etre remplacee : elle a repris les privileges par defaut du
-- schema. Une vue de lecture n'accorde que la lecture.
REVOKE ALL ON public.open_errands_feed FROM anon, authenticated;
GRANT SELECT ON public.open_errands_feed TO authenticated;
