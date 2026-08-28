-- Une preuve de consentement ne s'écrit pas soi-même.
--
-- Trouvé par l'audit systématique. Les trois dates de consentement du profil,
-- pour le courriel, le SMS et WhatsApp, sont modifiables directement par la
-- personne qu'elles concernent. Elles servent pourtant de preuve : elles disent
-- qu'à tel moment, cette personne a accepté d'être jointe sur ce canal.
--
-- Une preuve que le sujet peut écrire lui-même ne prouve plus rien, et c'est
-- justement en cas de contestation qu'on la produirait : quelqu'un se plaint
-- d'avoir été démarché, on sort la date, et la date ne vaut rien puisqu'il
-- pouvait la poser lui-même.
--
-- Le chemin légitime existe déjà : notification_preferences_set enregistre le
-- consentement en même temps que le canal choisi. Le droit d'écrire ces
-- colonnes en direct est un reliquat, que rien dans l'application déployée
-- n'utilise : l'écran du profil n'écrit que le nom affiché, le téléphone et la
-- langue.
--
-- Même raisonnement pour l'identifiant du profil. Le laisser modifiable n'ouvre
-- rien aujourd'hui, la clé étrangère refusant tout identifiant inconnu, mais il
-- n'y a aucune raison de garder ouverte une porte dont on démontre qu'elle ne
-- sert jamais.

REVOKE UPDATE ON public.profiles FROM authenticated;

-- Accordé colonne par colonne, comme partout ailleurs : un GRANT sur la table
-- entière suivi d'un REVOKE sur une colonne ne protège rien, le privilège de
-- table couvrant toutes les colonnes, présentes comme futures.
GRANT UPDATE (display_name, phone, locale, avatar_url, updated_at)
  ON public.profiles TO authenticated;

COMMENT ON COLUMN public.profiles.whatsapp_consent_at IS
  'Preuve du consentement WhatsApp. Ecrite par notification_preferences_set uniquement.';
COMMENT ON COLUMN public.profiles.sms_consent_at IS
  'Preuve du consentement SMS. Ecrite par notification_preferences_set uniquement.';
COMMENT ON COLUMN public.profiles.email_consent_at IS
  'Preuve du consentement courriel. Ecrite par notification_preferences_set uniquement.';

-- ---------------------------------------------------------------------------
-- La règle, dite aussi là où on la cherche
--
-- Le retrait du droit suffit à fermer la porte. La clause WITH CHECK est
-- ajoutée par-dessus parce qu'un lecteur de la politique doit y voir la limite,
-- sans avoir à deviner qu'un privilège de colonne la tient ailleurs.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
