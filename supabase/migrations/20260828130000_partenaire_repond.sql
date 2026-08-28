-- L'établissement peut enfin répondre, et ne peut plus réécrire la demande.
--
-- Deux problèmes, opposés, sur la même table.
--
-- Le premier est un trou de sécurité. La politique de modification des demandes
-- n'a pas de clause WITH CHECK, et le rôle authenticated dispose du droit
-- d'écrire toutes les colonnes. La clause USING dit qui peut modifier une
-- ligne ; sans WITH CHECK, elle ne dit rien de ce que la ligne devient. Un
-- hôtelier propriétaire d'un établissement pouvait donc, sur une demande qui
-- lui était adressée, changer place_id pour la déplacer chez un confrère, ou
-- réécrire le nom, le courriel, le téléphone et le message du visiteur. La
-- trace de ce que le client avait réellement écrit disparaissait.
--
-- Le second est un trou de produit. Le partenaire reçoit la demande, la voit
-- dans sa console, peut la marquer « recontacté », et le visiteur n'en sait
-- rien. Il attend une réponse qui ne vient pas par le service, et finit par
-- appeler ailleurs. Marquer une case ne remplace pas une réponse.
--
-- La correction est la même pour les deux : l'écriture directe disparaît au
-- profit d'une fonction qui sait ce qu'elle a le droit de changer, et qui
-- prévient le visiteur quand quelque chose le concerne.

-- ---------------------------------------------------------------------------
-- 1. Ce que la demande retient de la réponse
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS partner_reply text,
  ADD COLUMN IF NOT EXISTS replied_at    timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.partner_reply IS
  'Reponse de l''etablissement, visible par le visiteur. partner_note reste interne.';

-- ---------------------------------------------------------------------------
-- 2. Traiter une demande : le statut, la note interne, et la réponse
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lead_traiter(
  p_id      uuid,
  p_status  public.lead_status DEFAULT NULL,
  p_note    text DEFAULT NULL,
  p_reponse text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_demande public.leads;
  v_lieu    public.places;
  v_avant   public.lead_status;
BEGIN
  SELECT * INTO v_demande FROM public.leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lieu FROM public.places WHERE id = v_demande.place_id;

  -- Le propriétaire de l'établissement concerné, ou le personnel. Le visiteur
  -- qui a envoyé la demande, lui, n'a rien à y changer : ce qu'il a écrit fait
  -- foi, et pouvoir le réécrire après coup viderait la trace de son sens.
  IF NOT (
    COALESCE(v_lieu.owner_id = v_uid, false)
    OR public.has_permission(v_uid, 'lieux.moderer')
    OR public.has_permission(v_uid, 'demandes.traiter')
  ) THEN
    RAISE EXCEPTION 'Cette demande ne concerne pas votre établissement.' USING ERRCODE = '42501';
  END IF;

  v_avant := v_demande.status;

  UPDATE public.leads SET
    status       = COALESCE(p_status, status),
    partner_note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), partner_note),
    partner_reply = CASE
      WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL
        THEN left(btrim(p_reponse), 4000)
      ELSE partner_reply
    END,
    replied_at = CASE
      WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL THEN now()
      ELSE replied_at
    END,
    replied_by = CASE
      WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL THEN v_uid
      ELSE replied_by
    END,
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_demande;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'lead_traiter', 'lead', p_id::text,
          jsonb_build_object('statut_avant', v_avant, 'statut_apres', v_demande.status,
                             'reponse', NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL));

  -- Le visiteur est prévenu quand quelque chose le concerne : une réponse
  -- écrite, ou un changement d'état qu'il attend. Une note interne, non : elle
  -- ne lui est pas destinée, et la lui envoyer serait une fuite.
  IF v_demande.user_id IS NOT NULL
     AND (NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL
          OR (p_status IS NOT NULL AND p_status IS DISTINCT FROM v_avant
              AND p_status IN ('contacted'::lead_status, 'closed'::lead_status))) THEN
    PERFORM public.notify_enqueue(
      v_demande.user_id,
      NULL,
      'lead_reponse',
      format('%s a répondu à votre demande', COALESCE(v_lieu.name, 'L''établissement')),
      CASE
        WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL
          THEN left(btrim(p_reponse), 1200)
        WHEN v_demande.status = 'contacted'::lead_status
          THEN 'Votre demande a été prise en charge. L''établissement vous recontacte directement.'
        ELSE 'Votre demande a été clôturée par l''établissement.'
      END
    );
  END IF;

  RETURN jsonb_build_object('id', p_id, 'status', v_demande.status,
                            'repondu', v_demande.replied_at IS NOT NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION public.lead_traiter(uuid, public.lead_status, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_traiter(uuid, public.lead_status, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le droit de traiter, pour le personnel qui n'est pas propriétaire
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES ('demandes.traiter', 'Contenu', 'Traiter les demandes des visiteurs',
        'Répondre à une demande adressée à un établissement et changer son état.', false, 190)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, position = EXCLUDED.position;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'demandes.traiter'),
  ('admin_plateforme', 'demandes.traiter'),
  ('admin_contenu', 'demandes.traiter'),
  ('admin_support', 'demandes.traiter'),
  ('moderateur', 'demandes.traiter')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Fermer l'écriture directe
--
-- Le droit d'écrire toutes les colonnes ne se retire pas en ajoutant une clause
-- WITH CHECK : il se retire en retirant le droit. Le passage par la fonction
-- devient le seul chemin, et c'est elle qui sait ce qu'elle a le droit de
-- changer.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Partners and admins update leads" ON public.leads;

REVOKE UPDATE ON public.leads FROM authenticated;
REVOKE INSERT ON public.leads FROM authenticated;

-- Le visiteur lit sa demande et la réponse ; le partenaire lit celles de son
-- établissement ; le personnel habilité lit tout. La note interne ne sort pas
-- de l'établissement.
DROP POLICY IF EXISTS "Users see own leads, partners see their place leads, admins see" ON public.leads;
CREATE POLICY "Demandes lisibles par ceux qu'elles concernent" ON public.leads
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.places p
       WHERE p.id = leads.place_id AND p.owner_id = auth.uid()
    )
    OR public.has_permission(auth.uid(), 'lieux.moderer')
    OR public.has_permission(auth.uid(), 'demandes.traiter')
  );

REVOKE SELECT ON public.leads FROM authenticated;
GRANT SELECT (id, user_id, place_id, kind, full_name, email, phone, party_size,
              date_from, date_to, budget, message, status, partner_reply,
              replied_at, created_at, updated_at)
  ON public.leads TO authenticated;

-- partner_note est la note interne de l'établissement. Le visiteur ne doit pas
-- la lire, et la lecture par colonne est le seul moyen de le garantir : une
-- politique de ligne ne sait pas cacher une colonne.
--
-- Conséquence assumée : le partenaire ne relit pas sa propre note depuis la
-- table. Elle lui revient par lead_note_interne, qui vérifie que c'est bien son
-- établissement.

CREATE OR REPLACE FUNCTION public.lead_note_interne(p_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_demande public.leads;
  v_lieu    public.places;
BEGIN
  SELECT * INTO v_demande FROM public.leads WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lieu FROM public.places WHERE id = v_demande.place_id;

  IF NOT (
    COALESCE(v_lieu.owner_id = v_uid, false)
    OR public.has_permission(v_uid, 'lieux.moderer')
    OR public.has_permission(v_uid, 'demandes.traiter')
  ) THEN
    RAISE EXCEPTION 'Cette note ne vous concerne pas.' USING ERRCODE = '42501';
  END IF;

  RETURN v_demande.partner_note;
END;
$fn$;

REVOKE ALL ON FUNCTION public.lead_note_interne(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_note_interne(uuid) TO authenticated;

-- La fonction qui dépose une demande écrit sous service_role : l'insertion
-- directe par un visiteur n'a plus lieu d'être, et la retirer ferme la
-- possibilité d'écrire une demande au nom d'un autre.
COMMENT ON TABLE public.leads IS
  'Demandes des visiteurs aux etablissements. Ecriture par submit-lead et lead_traiter uniquement.';
