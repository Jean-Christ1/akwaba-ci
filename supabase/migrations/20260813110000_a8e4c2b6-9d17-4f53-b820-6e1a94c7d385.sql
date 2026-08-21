-- Lot K : favoris rattaches au compte
--
-- Les favoris ne vivaient que dans le stockage local du navigateur, alors que
-- l'ecran de connexion promet de retrouver ses favoris et ses demandes. Ils
-- etaient donc perdus au changement d'appareil ou au vidage du cache.

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id   uuid        NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON public.user_favorites (user_id);

-- Un favori est strictement personnel : ni lecture ni ecriture croisee.
DROP POLICY IF EXISTS "Own favorites read" ON public.user_favorites;
CREATE POLICY "Own favorites read"
  ON public.user_favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Own favorites add" ON public.user_favorites;
CREATE POLICY "Own favorites add"
  ON public.user_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Own favorites remove" ON public.user_favorites;
CREATE POLICY "Own favorites remove"
  ON public.user_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_favorites FROM anon;
GRANT SELECT, INSERT, DELETE ON public.user_favorites TO authenticated;
GRANT ALL ON public.user_favorites TO service_role;
