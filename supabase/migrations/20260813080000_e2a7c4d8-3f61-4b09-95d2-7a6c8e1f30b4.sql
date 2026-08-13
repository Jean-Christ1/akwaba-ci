-- Lot D : stockage prive des documents sensibles
--
-- Corrige la faille P1 confirmee en base : le projet ne disposait que du bucket
-- place-images en public=true. Les colonnes id_doc_url, advance_proof_url,
-- receipt_url et proof_url sont pourtant prevues pour des pieces d'identite et
-- des preuves de paiement, qui seraient devenues accessibles a toute personne
-- connaissant l'URL.
--
-- Deux buckets prives sont crees, avec des politiques d'acces strictes et un
-- plafond de taille. Les fichiers ne sont lisibles que par leur proprietaire,
-- les moderateurs, les administrateurs, et pour les preuves de course, par
-- l'autre partie de la course concernee.

-- ---------------------------------------------------------------------------
-- 1. Buckets prives
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('identity-docs', 'identity-docs', false, 8388608,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('errand-proofs', 'errand-proofs', false, 8388608,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Le bucket public existant ne doit jamais accueillir de piece d'identite :
-- on lui pose egalement un plafond et une liste de types autorises.
UPDATE storage.buckets
SET file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'place-images';

-- ---------------------------------------------------------------------------
-- 2. Pieces d'identite : le proprietaire depose, seuls les moderateurs lisent
--
-- Convention de chemin : identity-docs/<user_id>/<fichier>
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Identity docs upload own" ON storage.objects;
CREATE POLICY "Identity docs upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'identity-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Identity docs read own or moderator" ON storage.objects;
CREATE POLICY "Identity docs read own or moderator"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'identity-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
    )
  );

DROP POLICY IF EXISTS "Identity docs update own" ON storage.objects;
CREATE POLICY "Identity docs update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'identity-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Identity docs delete own or admin" ON storage.objects;
CREATE POLICY "Identity docs delete own or admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'identity-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Preuves de course : recu d'achat et preuve d'avance
--
-- Convention de chemin : errand-proofs/<errand_id>/<fichier>
-- Les deux parties de la course y accedent, ce qui est necessaire pour que le
-- client verifie le recu et que le shopper verifie l'avance.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Errand proofs upload participant" ON storage.objects;
CREATE POLICY "Errand proofs upload participant"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'errand-proofs'
    AND public.is_errand_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "Errand proofs read participant" ON storage.objects;
CREATE POLICY "Errand proofs read participant"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'errand-proofs'
    AND (
      public.is_errand_participant(((storage.foldername(name))[1])::uuid, auth.uid())
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'moderator'::app_role)
    )
  );

DROP POLICY IF EXISTS "Errand proofs delete admin" ON storage.objects;
CREATE POLICY "Errand proofs delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'errand-proofs'
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ---------------------------------------------------------------------------
-- 4. Enregistrement d'une preuve sur la course
--
-- Le chemin de stockage n'est pas une URL publique : c'est une cle d'objet que
-- le front resout en URL signee a duree courte au moment de l'affichage.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_attach_proof(
  p_errand_id uuid,
  p_kind      text,
  p_path      text,
  p_amount    numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  IF p_kind NOT IN ('receipt', 'advance') THEN
    RAISE EXCEPTION 'Type de preuve inconnu.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(char_length(trim(p_path)), 0) = 0 THEN
    RAISE EXCEPTION 'Fichier de preuve manquant.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_errand_participant(p_errand_id, auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  IF p_kind = 'receipt' THEN
    -- Le recu des achats est depose par le shopper.
    IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
      RAISE EXCEPTION 'Seul le shopper assigné peut déposer le reçu des achats.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.errands SET receipt_url = p_path WHERE id = p_errand_id RETURNING * INTO v_errand;

    INSERT INTO public.errand_payments (errand_id, payer_id, kind, method, amount, proof_url)
    VALUES (p_errand_id, auth.uid(), 'service_fee'::errand_payment_kind, v_errand.payment_method,
            COALESCE(p_amount, v_errand.items_total, 0), p_path);
  ELSE
    -- La preuve d'avance est deposee par le client qui envoie le budget d'achat.
    IF v_errand.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'Seul le client peut déposer la preuve de son avance.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.errands SET
      advance_proof_url    = p_path,
      advance_amount       = COALESCE(p_amount, advance_amount),
      advance_confirmed_at = now()
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

    INSERT INTO public.errand_payments (errand_id, payer_id, kind, method, amount, proof_url, confirmed_at)
    VALUES (p_errand_id, auth.uid(), 'shopping_advance'::errand_payment_kind, v_errand.payment_method,
            COALESCE(p_amount, v_errand.advance_amount, 0), p_path, now());
  END IF;

  PERFORM public.log_errand_event(
    p_errand_id,
    v_errand.status,
    CASE WHEN p_kind = 'receipt' THEN 'Reçu des achats déposé' ELSE 'Preuve d''avance déposée' END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_attach_proof(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_attach_proof(uuid, text, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Index de filtrage sur les paiements de course
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_errand_payments_errand ON public.errand_payments (errand_id);
CREATE INDEX IF NOT EXISTS idx_errand_payments_payer  ON public.errand_payments (payer_id);
