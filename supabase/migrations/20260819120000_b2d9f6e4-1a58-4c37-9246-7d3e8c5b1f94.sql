-- ---------------------------------------------------------------------------
-- Une seule façon de rouvrir une remise bloquée.
--
-- Cinq codes de remise erronés verrouillent la remise : la course ne peut plus
-- passer en livrée, donc plus être réglée, donc le shopper n'est jamais payé.
-- L'écran du client annonce que la remise « devra être rouverte par un
-- modérateur ». La fonction qui le fait existe. En deux exemplaires.
--
-- `errand_unlock_handover(uuid)` et `errand_unlock_handover(uuid, text)`
-- coexistent, la seconde avec une valeur par défaut. Un appel qui ne passe que
-- l'identifiant correspond donc aux deux, et PostgREST refuse de choisir :
-- il répond PGRST203. Le générateur de types, pour la même raison, n'expose
-- aucune des deux. Le déverrouillage était inatteignable par construction, et
-- rien ne le signalait puisque personne ne l'appelait.
--
-- On garde celle qui demande un motif : rouvrir une remise verrouillée est une
-- décision, et une décision se justifie. La variante muette disparaît.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.errand_unlock_handover(uuid);

DO $$
DECLARE
  v_nombre integer;
BEGIN
  SELECT count(*)
  INTO v_nombre
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'errand_unlock_handover';

  IF v_nombre <> 1 THEN
    RAISE EXCEPTION
      'La réouverture de remise doit avoir exactement une signature, % trouvée(s) : l''appel resterait ambigu.',
      v_nombre;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- La réouverture échouait de toute façon, pour une seconde raison.
--
-- Elle journalise son geste au registre d'audit en passant un détail nul, alors
-- que la colonne est déclarée obligatoire. L'appel lève donc une violation de
-- contrainte, et la remise reste verrouillée. Personne ne l'avait constaté :
-- l'ambiguïté de signature empêchait déjà d'arriver jusque-là.
--
-- Deux corrections, parce que deux fautes distinctes. Le registre accepte
-- désormais un détail absent en le ramenant à un objet vide : un appelant qui
-- n'a rien à dire ne doit pas faire échouer l'action qu'il journalise. Et la
-- réouverture, elle, dit quelque chose : le motif du modérateur.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text,
  p_entity text,
  p_entity_id text DEFAULT NULL::text,
  p_details jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Le journal d''audit est réservé au personnel de la plateforme.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), left(p_action, 80), left(p_entity, 80), left(p_entity_id, 120),
          COALESCE(p_details, '{}'::jsonb));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.errand_unlock_handover(p_errand_id uuid, p_reason text DEFAULT NULL::text)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_errand public.errands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir une remise verrouillée.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    handover_attempts  = 0,
    handover_locked_at = NULL
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Le marqueur du moteur est propre à la transaction : celui qui l'arme le
  -- désarme, sinon il reste ouvert pour tout ce qui suit dans la même
  -- transaction.
  PERFORM set_config('app.errand_engine', 'off', true);

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Remise rouverte par la modération' ||
    CASE WHEN p_reason IS NOT NULL THEN ' : ' || left(trim(p_reason), 300) ELSE '' END);

  PERFORM public.log_audit('unlock', 'errand_handover', p_errand_id::text,
    jsonb_build_object('motif', COALESCE(NULLIF(trim(p_reason), ''), 'non precise')));

  RETURN v_errand;
END;
$fn$;

REVOKE ALL ON FUNCTION public.errand_unlock_handover(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_unlock_handover(uuid, text) TO authenticated;
