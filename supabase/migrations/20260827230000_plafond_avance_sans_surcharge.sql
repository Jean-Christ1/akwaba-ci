-- Le plafond d'avance s'ajoute à la fonction existante, sans la dédoubler.
--
-- La migration précédente a créé une seconde version d'errand_declare_advance,
-- avec un paramètre de plus. PostgreSQL a donc gardé les deux, et tout appel
-- est devenu ambigu : « function errand_declare_advance(unknown, integer) is
-- not unique ». L'écran du client, qui appelle la version à deux paramètres,
-- aurait échoué à chaque envoi déclaré.
--
-- Elle avait aussi perdu au passage une garde de l'originale : une avance déjà
-- reconnue par le shopper ne peut pas être réduite. Sans elle, un client
-- pouvait revoir à la baisse ce que le shopper avait déjà confirmé avoir reçu,
-- et le shopper se retrouvait débiteur d'une somme qu'il avait bien touchée.
--
-- On reprend donc la fonction d'origine mot pour mot, on lui ajoute le seul
-- contrôle nouveau, et on supprime la surcharge.

DROP FUNCTION IF EXISTS public.errand_declare_advance(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.errand_declare_advance(
  p_errand_id uuid,
  p_amount    numeric
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_errand  public.errands;
  v_palier  public.runner_trust_levels;
  v_plafond numeric(12,2);
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Le montant de l''avance ne peut pas être négatif.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut déclarer son avance.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  IF p_amount < COALESCE(v_errand.advance_amount, 0) THEN
    RAISE EXCEPTION 'Une avance déjà reconnue par le shopper ne peut pas être réduite.'
      USING ERRCODE = '22023';
  END IF;

  -- Le seul controle nouveau. Le produit annoncait au client, a l'ecran, que
  -- l'avance etait plafonnee ; le plafond n'existait que dans le TypeScript.
  -- Il suit desormais le palier du shopper, et le palier suit ce qu'il a
  -- prouve : un compte neuf porte peu, donc en creer cent ne rapporte rien.
  IF v_errand.runner_id IS NOT NULL AND p_amount > 0 THEN
    v_palier := public.runner_trust_level(v_errand.runner_id);
    v_plafond := COALESCE(v_palier.plafond_avance, 0);

    IF v_plafond <= 0 THEN
      RAISE EXCEPTION 'Ce shopper n''est pas habilité à recevoir une avance.'
        USING ERRCODE = '42501';
    END IF;

    IF p_amount > v_plafond THEN
      RAISE EXCEPTION
        'Ce shopper peut recevoir au plus % FCFA d''avance (palier %). Fractionnez l''envoi, ou réglez le reste à la remise.',
        trunc(v_plafond), COALESCE(v_palier.libelle, 'inconnu')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    advance_declared_amount = p_amount,
    advance_declared_at     = now(),
    -- Le reste à payer ne tient compte que de l'avance reconnue reçue.
    balance_due             = GREATEST(COALESCE(total_amount, 0) - COALESCE(advance_amount, 0), 0)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Avance de ' || p_amount || ' FCFA déclarée par le client, en attente de confirmation du shopper');

  RETURN v_errand;
END;
$fn$;
