-- Arrêter une majoration ne doit pas dépendre de l'horloge.
--
-- surge_arreter posait `actif = false` et, par précaution, ramenait aussi la fin
-- à maintenant. Cette précaution introduit une panne.
--
-- À l'intérieur d'une transaction, now() ne bouge pas : il vaut l'instant où la
-- transaction a commencé. Une majoration ouverte puis arrêtée dans la même
-- transaction voit donc sa fin ramenée exactement à son début, ce que la
-- contrainte `fin > debut` refuse. L'arrêt échoue, la majoration reste active,
-- et rien ne le dit à l'appelant.
--
-- En production les deux gestes sont séparés de plusieurs minutes, et le piège
-- ne se referme pas. C'est précisément ce qui le rend dangereux : il n'apparaît
-- que là où l'on va vite, c'est-à-dire dans un incident.
--
-- La précaution était de toute façon inutile. surge_en_vigueur exige `actif` :
-- poser le drapeau suffit à arrêter. La fin reste ce qu'elle était, ce qui a
-- aussi le mérite de conserver la durée qui avait été annoncée.

CREATE OR REPLACE FUNCTION public.surge_arreter(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi   uuid := auth.uid();
  v_surge public.pricing_surges;
BEGIN
  SELECT * INTO v_surge FROM public.pricing_surges WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Majoration introuvable.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_scoped_permission(v_moi, 'majoration.publier', v_surge.city_slug) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''arrêter cette majoration.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_surge.actif THEN
    RAISE EXCEPTION 'Cette majoration est déjà arrêtée.' USING ERRCODE = '22023';
  END IF;

  -- On ne touche ni à la fin ni à la ligne : les courses publiées pendant
  -- qu'elle courait portent son prix, et le motif de ce prix doit rester
  -- consultable.
  UPDATE public.pricing_surges SET actif = false WHERE id = p_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'surge_arreter', 'pricing_surge', p_id::text,
          jsonb_build_object('ville', v_surge.city_slug,
                             'multiplicateur', v_surge.multiplicateur,
                             'fin_annoncee', v_surge.fin));

  RETURN jsonb_build_object('id', p_id, 'actif', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.surge_arreter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.surge_arreter(uuid) TO authenticated;
