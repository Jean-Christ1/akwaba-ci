-- Le canal « dans l'application » délivre enfin quelque chose.
--
-- L'écran des préférences le propose à chacun, avec cette phrase : « Dans
-- l'application, aucun message envoyé au dehors ». C'est aussi le dernier
-- maillon du routage, celui qui ne peut pas échouer : quand la personne n'a ni
-- numéro ni adresse, le message y atterrit.
--
-- Il n'atterrissait nulle part. Le message était déposé dans la file, la file
-- n'est lisible que du personnel, et aucun écran de l'application ne la
-- montrait. Quelqu'un qui choisissait ce canal ne recevait plus rien, du tout,
-- et l'application le lui avait pourtant proposé comme un choix légitime.
--
-- Le manque était d'un côté seulement : le dépôt marchait, la lecture
-- n'existait pas. On l'écrit, avec ce qu'elle suppose : voir ses propres
-- messages, savoir lesquels sont neufs, et les marquer lus.

ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS lue_le timestamptz;

COMMENT ON COLUMN public.notification_outbox.lue_le IS
  'Date à laquelle le destinataire a lu l''avis dans l''application. Ne concerne que le canal in_app.';

-- L'index sert la requête de l'écran : les avis d'une personne, les neufs
-- d'abord. Partiel, parce que seuls les avis internes sont lus ici.
CREATE INDEX IF NOT EXISTS notification_outbox_in_app_idx
  ON public.notification_outbox (user_id, created_at DESC)
  WHERE channel = 'in_app';

-- ---------------------------------------------------------------------------
-- Le destinataire lit ce qui lui est adressé
--
-- Et rien d'autre. La politique du personnel reste ce qu'elle est : la file
-- entière porte des adresses et des numéros, et se lit avec le droit
-- « exploitation.sante ».
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Avis internes lisibles par leur destinataire" ON public.notification_outbox;
CREATE POLICY "Avis internes lisibles par leur destinataire" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND channel = 'in_app');

-- ---------------------------------------------------------------------------
-- Marquer lu
--
-- Par une fonction, et non par une politique de modification. Ouvrir la
-- modification de la file au destinataire le laisserait aussi changer le corps
-- du message qu'il a reçu, ou son état d'envoi : la trace de ce que la
-- plateforme lui a dit cesserait de valoir.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.avis_marquer_lu(p_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
  v_n   integer;
BEGIN
  IF v_moi IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté.' USING ERRCODE = '42501';
  END IF;

  -- Sans identifiant, tout ce qui est neuf. C'est le geste « tout marquer
  -- comme lu », et il ne concerne que ses propres avis.
  UPDATE public.notification_outbox
     SET lue_le = now()
   WHERE user_id = v_moi
     AND channel = 'in_app'
     AND lue_le IS NULL
     AND (p_id IS NULL OR id = p_id);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.avis_marquer_lu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avis_marquer_lu(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ce que l'écran lit
--
-- Une fonction plutôt qu'une lecture directe : la table porte des colonnes qui
-- ne regardent pas le destinataire, la destination et le motif de repli
-- notamment, et le privilège de colonne est déjà accordé sur la table entière.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mes_avis(p_limite integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  evenement text,
  sujet text,
  corps text,
  errand_id uuid,
  recu_le timestamptz,
  lue_le timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT o.id, o.event, o.subject, o.body, o.errand_id, o.created_at, o.lue_le
    FROM public.notification_outbox o
   WHERE o.user_id = auth.uid()
     AND o.channel = 'in_app'
     AND auth.uid() IS NOT NULL
   ORDER BY o.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 30), 1), 200);
$fn$;

REVOKE ALL ON FUNCTION public.mes_avis(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mes_avis(integer) TO authenticated;

COMMENT ON FUNCTION public.mes_avis(integer) IS
  'Les avis internes du compte connecté, les plus récents d''abord. Ne rend que le canal in_app.';

CREATE OR REPLACE FUNCTION public.mes_avis_non_lus()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(count(*), 0)::integer
    FROM public.notification_outbox o
   WHERE o.user_id = auth.uid()
     AND o.channel = 'in_app'
     AND o.lue_le IS NULL
     AND auth.uid() IS NOT NULL;
$fn$;

REVOKE ALL ON FUNCTION public.mes_avis_non_lus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mes_avis_non_lus() TO authenticated;
