-- ---------------------------------------------------------------------------
-- Ce qui est réellement gelé, et qui a validé quel shopper.
--
-- Deux constats distincts, tous deux dans la console d'exploitation.
--
-- 1. L'écran des litiges additionne `runner_payout` et l'appelle « gains
--    gelés ». Ce montant est le gain théorique, calculé à la publication puis
--    à l'acceptation de l'offre. Il n'a rien à voir avec ce que l'ouverture du
--    litige a effectivement retiré du portefeuille. Pour une course contestée
--    avant tout règlement, aucune écriture n'existe : rien n'est gelé, et
--    l'écran annonce pourtant un montant. Le modérateur tranche sur un chiffre
--    inventé, et la phrase « les gains du shopper restent gelés » est fausse.
--
--    Le montant gelé ne se lit pas depuis cet écran : la table des écritures
--    est réservée à son propriétaire et aux administrateurs, or les litiges
--    sont tranchés par des modérateurs. D'où cette fonction.
--
-- 2. Valider, suspendre ou refuser un shopper se fait par une écriture directe
--    sur son dossier, sans la moindre trace. Une décision qui ouvre ou ferme
--    l'accès au travail, et donc au revenu, doit dire qui l'a prise et
--    pourquoi.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispute_frozen_amounts()
RETURNS TABLE (errand_id uuid, gele numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id,
         GREATEST(COALESCE(-sum(w.amount), 0), 0)::numeric
  FROM public.errands e
  LEFT JOIN public.wallet_entries w
    ON w.errand_id = e.id
   AND w.kind = 'adjustment'::wallet_entry_kind
  WHERE e.status = 'disputed'::errand_status
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'moderator'::app_role))
  GROUP BY e.id;
$$;

COMMENT ON FUNCTION public.dispute_frozen_amounts() IS
  'Montant réellement gelé par course en litige, calculé sur les écritures et non sur le gain théorique.';

REVOKE ALL ON FUNCTION public.dispute_frozen_amounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_frozen_amounts() TO authenticated;

-- ---------------------------------------------------------------------------
-- Le statut d'un shopper change par une fonction, qui laisse une trace.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_set_status(
  p_runner_id uuid,
  p_status public.runner_status,
  p_reason text DEFAULT NULL
)
RETURNS public.runner_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_avant  public.runner_profiles;
  v_apres  public.runner_profiles;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul le personnel de la plateforme change le statut d''un shopper.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_avant FROM public.runner_profiles WHERE id = p_runner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dossier de shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_avant.status = p_status THEN
    -- Rien ne change : ne pas inscrire une décision qui n'a pas eu lieu.
    RETURN v_avant;
  END IF;

  -- Suspendre ou refuser prive quelqu'un de son revenu : le motif est exigé,
  -- alors qu'une validation se suffit à elle-même.
  IF p_status IN ('suspended'::runner_status, 'rejected'::runner_status)
     AND char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de la suspension ou du refus.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.runner_profiles
  SET status = p_status
  WHERE id = p_runner_id
  RETURNING * INTO v_apres;

  PERFORM public.log_audit('set_status', 'runner_profile', p_runner_id::text,
    jsonb_build_object(
      'avant', v_avant.status,
      'apres', p_status,
      'motif', COALESCE(NULLIF(btrim(p_reason), ''), 'non precise')
    ));

  RETURN v_apres;
END;
$fn$;

COMMENT ON FUNCTION public.runner_set_status(uuid, public.runner_status, text) IS
  'Change le statut d''un dossier de shopper et l''inscrit au journal d''audit. Réservé au personnel.';

REVOKE ALL ON FUNCTION public.runner_set_status(uuid, public.runner_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.runner_set_status(uuid, public.runner_status, text) TO authenticated;
