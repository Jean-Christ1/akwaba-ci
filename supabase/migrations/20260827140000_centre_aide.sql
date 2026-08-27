-- Centre d'aide.
--
-- Il n'existait pas. Aucun fichier, aucune route, aucune table. Un client qui
-- se demandait qui détient son argent, un shopper qui voulait savoir quand il
-- serait payé, un candidat bloqué sur sa pièce d'identité : personne n'avait
-- de réponse à leur donner, et le support recevait la même question chaque
-- semaine.
--
-- Les articles vivent en base et non dans le code, pour deux raisons. La
-- première est qu'une réponse se corrige plus souvent qu'on ne déploie. La
-- seconde est qu'une réponse fausse est pire que pas de réponse : il faut
-- pouvoir la retirer tout de suite.
--
-- Le contenu déposé ici ne décrit que ce que la plateforme fait réellement.
-- Aucune promesse de fonctionnalité absente : un centre d'aide qui décrit un
-- produit imaginaire fabrique des réclamations.

CREATE TABLE IF NOT EXISTS public.help_articles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  categorie   text NOT NULL,
  -- À qui la réponse s'adresse. La même question n'a pas la même réponse selon
  -- qu'on paie ou qu'on est payé.
  audience    text NOT NULL DEFAULT 'client'
                CHECK (audience IN ('client', 'shopper', 'partenaire', 'tous')),
  question    text NOT NULL CHECK (char_length(btrim(question)) >= 5),
  reponse     text NOT NULL CHECK (char_length(btrim(reponse)) >= 20),
  -- Ce que l'article permet de faire ensuite, quand il y a un écran pour cela.
  lien_action text,
  lien_libelle text,
  publie      boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 100,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS help_articles_recherche
  ON public.help_articles USING gin (to_tsvector('french', question || ' ' || reponse));

-- ---------------------------------------------------------------------------
-- Le droit de tenir le centre d'aide
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES ('aide.gerer', 'Contenu', 'Tenir le centre d''aide',
        'Ecrire, corriger et retirer les reponses du centre d''aide.', false, 185)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, position = EXCLUDED.position;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'aide.gerer'),
  ('admin_plateforme', 'aide.gerer'),
  ('admin_contenu', 'aide.gerer'),
  ('admin_support', 'aide.gerer'),
  ('moderateur', 'aide.gerer')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Écrire une réponse
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.help_article_upsert(
  p_slug         text,
  p_categorie    text,
  p_audience     text,
  p_question     text,
  p_reponse      text,
  p_lien_action  text DEFAULT NULL,
  p_lien_libelle text DEFAULT NULL,
  p_publie       boolean DEFAULT true,
  p_position     integer DEFAULT 100
)
RETURNS public.help_articles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_article public.help_articles;
BEGIN
  IF NOT public.has_permission(v_uid, 'aide.gerer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de tenir le centre d''aide.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.help_articles
    (slug, categorie, audience, question, reponse, lien_action, lien_libelle,
     publie, position, updated_by)
  VALUES (p_slug, p_categorie, p_audience, btrim(p_question), btrim(p_reponse),
          NULLIF(btrim(COALESCE(p_lien_action, '')), ''),
          NULLIF(btrim(COALESCE(p_lien_libelle, '')), ''),
          p_publie, p_position, v_uid)
  ON CONFLICT (slug) DO UPDATE SET
    categorie = EXCLUDED.categorie, audience = EXCLUDED.audience,
    question = EXCLUDED.question, reponse = EXCLUDED.reponse,
    lien_action = EXCLUDED.lien_action, lien_libelle = EXCLUDED.lien_libelle,
    publie = EXCLUDED.publie, position = EXCLUDED.position,
    updated_at = now(), updated_by = v_uid
  RETURNING * INTO v_article;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'help_article_upsert', 'help_article', v_article.id::text,
          jsonb_build_object('slug', p_slug, 'publie', p_publie));

  RETURN v_article;
END;
$fn$;

ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aide publiee lisible" ON public.help_articles;
CREATE POLICY "Aide publiee lisible" ON public.help_articles
  FOR SELECT TO anon, authenticated
  USING (publie OR public.has_permission(auth.uid(), 'aide.gerer'));

REVOKE ALL ON public.help_articles FROM anon, authenticated;
GRANT SELECT ON public.help_articles TO anon, authenticated;
GRANT ALL ON public.help_articles TO service_role;

REVOKE ALL ON FUNCTION public.help_article_upsert(text, text, text, text, text, text, text, boolean, integer)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.help_article_upsert(text, text, text, text, text, text, text, boolean, integer)
  TO authenticated;
