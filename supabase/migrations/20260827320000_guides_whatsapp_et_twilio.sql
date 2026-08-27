-- Les guides de configuration entrent au centre d'aide.
--
-- Deux publics, deux guides, et ils ne peuvent pas vivre au même endroit.
--
-- Le client et le shopper ont besoin de savoir pourquoi un message WhatsApp
-- n'arrive pas, et quoi faire. Cela se lit sans être connecté : la question se
-- pose précisément quand on n'a rien reçu.
--
-- L'exploitation a besoin du mode d'emploi du compte Twilio : ce qui est
-- configuré, ce que l'essai interdit, et ce qu'il faudra faire le jour du
-- passage en production. Ce texte-là ne peut pas être public. Il décrit
-- l'intérieur du service, et le centre d'aide est ouvert à tous les visiteurs.
--
-- On ajoute donc une audience « exploitation », que la politique de lecture
-- réserve aux personnes habilitées. Aucun secret n'y figure malgré tout : un
-- guide se lit, se copie et se cite, un jeton non.

-- ---------------------------------------------------------------------------
-- 1. Une audience réservée
-- ---------------------------------------------------------------------------

ALTER TABLE public.help_articles DROP CONSTRAINT IF EXISTS help_articles_audience_check;
ALTER TABLE public.help_articles ADD CONSTRAINT help_articles_audience_check
  CHECK (audience IN ('client', 'shopper', 'partenaire', 'tous', 'exploitation'));

DROP POLICY IF EXISTS "Aide publiee lisible" ON public.help_articles;
CREATE POLICY "Aide publiee lisible" ON public.help_articles
  FOR SELECT TO anon, authenticated
  USING (
    (publie AND audience <> 'exploitation')
    OR public.has_permission(auth.uid(), 'aide.gerer')
    OR (audience = 'exploitation' AND public.has_permission(auth.uid(), 'exploitation.sante'))
  );

-- ---------------------------------------------------------------------------
-- 2. Ce que le client et le shopper doivent pouvoir lire
-- ---------------------------------------------------------------------------

INSERT INTO public.help_articles (slug, categorie, audience, question, reponse, lien_action, lien_libelle, position)
VALUES
  ('whatsapp-comment-recevoir', 'Notifications', 'tous',
   'Comment recevoir les avis Akwaba sur WhatsApp ?',
   'Ouvrez votre profil, section « Comment vous joindre ». Renseignez votre numéro WhatsApp au format international (par exemple +225 07 00 00 00 00) et choisissez WhatsApp comme canal préféré. '
   || E'\n\n'
   || 'Akwaba vous écrit lorsqu''un shopper accepte votre course, lorsqu''un panier attend votre accord, et lorsque la course est livrée. Vous restez libre de changer de canal à tout moment : le courriel prend alors le relais.'
   || E'\n\n'
   || 'Tant que le service fonctionne en phase d''essai, une étape supplémentaire est nécessaire. Elle est décrite dans la réponse suivante.',
   '/compte', 'Ouvrir mon profil', 300),

  ('whatsapp-premier-message', 'Notifications', 'tous',
   'Je ne reçois rien sur WhatsApp, pourquoi ?',
   'Pendant la phase d''essai, Akwaba écrit depuis un numéro partagé fourni par son opérateur de messagerie. Ce numéro n''a le droit d''écrire qu''aux personnes qui l''ont contacté en premier. C''est une règle de l''opérateur, pas un choix d''Akwaba.'
   || E'\n\n'
   || 'Trois causes possibles, dans cet ordre :'
   || E'\n'
   || '1. Vous n''avez pas encore envoyé le message d''adhésion au numéro indiqué par le support. Sans lui, aucun message ne peut vous parvenir.'
   || E'\n'
   || '2. Vous l''avez envoyé il y a plus de trois jours sans autre échange depuis. L''autorisation expire au bout de trois jours et doit être renouvelée de la même façon.'
   || E'\n'
   || '3. Le numéro enregistré dans votre profil n''est pas celui de votre compte WhatsApp.'
   || E'\n\n'
   || 'Dans tous les cas, vous ne perdez rien : Akwaba bascule automatiquement sur le courriel quand WhatsApp ne peut pas aboutir, et la raison du basculement est conservée.',
   '/compte', 'Vérifier mon numéro', 310),

  ('whatsapp-cout', 'Notifications', 'tous',
   'Les messages WhatsApp d''Akwaba sont-ils payants pour moi ?',
   'Non. Akwaba prend en charge l''envoi. De votre côté, seul votre forfait de données s''applique, comme pour n''importe quel message WhatsApp.'
   || E'\n\n'
   || 'Akwaba ne vous demandera jamais un code, un mot de passe ou un identifiant de paiement par WhatsApp. Un message qui le demande ne vient pas d''Akwaba, même s''il en porte le nom.',
   NULL, NULL, 320),

  ('whatsapp-arreter', 'Notifications', 'tous',
   'Comment arrêter de recevoir des messages WhatsApp ?',
   'Dans votre profil, section « Comment vous joindre », choisissez le courriel comme canal préféré, ou retirez votre numéro WhatsApp. Le changement prend effet immédiatement pour les avis suivants.'
   || E'\n\n'
   || 'Les messages liés à la sécurité de votre compte continuent d''être envoyés, par courriel : ils ne relèvent pas d''une préférence mais de la protection de votre compte.',
   '/compte', 'Changer mon canal', 330)
ON CONFLICT (slug) DO UPDATE SET
  categorie = EXCLUDED.categorie, audience = EXCLUDED.audience,
  question = EXCLUDED.question, reponse = EXCLUDED.reponse,
  lien_action = EXCLUDED.lien_action, lien_libelle = EXCLUDED.lien_libelle,
  position = EXCLUDED.position, updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Le mode d'emploi de l'exploitation
--
-- Ce qui suit décrit l'état constaté du compte, pas l'état souhaité. Chaque
-- affirmation a été vérifiée contre l'API de Twilio le 27 août 2026.
-- ---------------------------------------------------------------------------

INSERT INTO public.help_articles (slug, categorie, audience, question, reponse, lien_action, lien_libelle, position)
VALUES
  ('twilio-etat-du-compte', 'Configuration Twilio', 'exploitation',
   'Dans quel état est le compte Twilio d''Akwaba ?',
   'Le compte est actif et de type « Trial », c''est-à-dire en essai. Cet état a été lu directement sur l''API de Twilio, il n''est pas supposé.'
   || E'\n\n'
   || 'Trois conséquences commandent tout le reste :'
   || E'\n'
   || '1. L''API des clés est refusée en essai. Une clé d''API supplémentaire ne peut donc pas être créée par programme ; Twilio répond une erreur 20003. La clé créée à la main dans la console reste la seule disponible, et elle suffit à envoyer.'
   || E'\n'
   || '2. WhatsApp passe par le bac à sable, dont le numéro d''expéditeur est partagé avec tous les comptes d''essai.'
   || E'\n'
   || '3. Aucun numéro n''est acheté sur le compte, et aucun service de messagerie n''y est déclaré.'
   || E'\n\n'
   || 'L''écran de pilotage affiche l''état réel des envois. C''est lui qu''il faut consulter avant de conclure quoi que ce soit sur une panne.',
   '/admin/pilotage', 'Voir l''état des envois', 400),

  ('twilio-ou-vivent-les-identifiants', 'Configuration Twilio', 'exploitation',
   'Où sont rangés les identifiants Twilio, et pourquoi là ?',
   'Quatre valeurs sont déposées dans le coffre chiffré de la base : l''identifiant du compte, l''identifiant de la clé d''API, le secret de cette clé, et le numéro expéditeur WhatsApp.'
   || E'\n\n'
   || 'Elles ne peuvent pas vivre dans une migration : une migration est un fichier du dépôt, versionné et poussé. Elles ne peuvent pas non plus vivre dans le navigateur : tout ce que le client reçoit est lisible par le client. Le coffre les chiffre au repos et n''en rend le clair qu''au propriétaire du schéma, ce que seules les fonctions du moteur traversent.'
   || E'\n\n'
   || 'Conséquence pratique : le message WhatsApp est envoyé par la base elle-même, sans passer par une fonction déployée à part. Un envoi ne dépend donc que de la base et du travail planifié.'
   || E'\n\n'
   || 'Pour déposer ou renouveler ces valeurs, lancer le script de configuration prévu à cet effet, qui lit le coffre local et ne les affiche jamais.',
   NULL, NULL, 410),

  ('twilio-comment-un-message-part', 'Configuration Twilio', 'exploitation',
   'Par quel chemin un message WhatsApp part-il ?',
   'Quatre étapes, chacune observable :'
   || E'\n'
   || '1. Un évènement de course dépose une ligne dans la file d''envoi, avec le canal choisi selon les préférences du destinataire et son consentement.'
   || E'\n'
   || '2. Un travail planifié, qui passe toutes les deux minutes, prend un lot de la file et remet chaque message à Twilio. Il respecte une cadence réglable, car le numéro du bac à sable n''accepte qu''un message toutes les trois secondes.'
   || E'\n'
   || '3. La remise est asynchrone : la base rend la main avant que Twilio n''ait répondu. La ligne est donc marquée « remise », pas « reçue ».'
   || E'\n'
   || '4. Un second travail planifié lit la réponse de Twilio et corrige la file : accepté, refusé avec son motif, ou à refaire si le débit a été dépassé.'
   || E'\n\n'
   || 'Cette distinction entre « remis » et « confirmé » est la seule qui permette de savoir si un message est vraiment parti. Un compteur qui ne montrerait que les remises afficherait du vert alors que personne ne reçoit rien.',
   '/admin/pilotage', 'Voir remis et confirmés', 420),

  ('twilio-destinataire-ne-recoit-pas', 'Configuration Twilio', 'exploitation',
   'Un destinataire ne reçoit rien : que vérifier, et dans quel ordre ?',
   'Dans cet ordre, car chaque étape rend la suivante inutile si elle échoue :'
   || E'\n'
   || '1. Le destinataire a-t-il rejoint le bac à sable ? En essai, le numéro partagé n''écrit qu''aux personnes qui lui ont envoyé le message d''adhésion. Le texte exact à envoyer est affiché dans la console Twilio, rubrique Messaging, « Try it out », « Send a WhatsApp message ».'
   || E'\n'
   || '2. L''a-t-il fait il y a moins de trois jours ? L''autorisation expire au bout de trois jours sans échange, et doit être renouvelée.'
   || E'\n'
   || '3. Le dernier échange remonte-t-il à moins de vingt-quatre heures ? Au-delà, WhatsApp n''accepte plus que des messages fondés sur un modèle approuvé, et le bac à sable n''en propose que trois, tous étrangers à nos usages.'
   || E'\n'
   || '4. Que dit le motif du dernier échec sur l''écran de pilotage ? Twilio nomme la cause, et ce motif est conservé tel quel.'
   || E'\n\n'
   || 'Ces limites ne sont pas des défauts d''Akwaba : elles tiennent au compte d''essai. Elles disparaissent avec le passage en production, décrit dans la réponse suivante.',
   '/admin/pilotage', 'Lire le dernier motif', 430),

  ('twilio-passer-en-production', 'Configuration Twilio', 'exploitation',
   'Que faut-il faire pour passer WhatsApp en production ?',
   'Cinq étapes, dans l''ordre, à mener depuis la console Twilio :'
   || E'\n'
   || '1. Créditer le compte, ce qui le fait sortir de l''essai. L''API des clés redevient alors accessible, et une clé propre à l''application peut être créée pour ne plus dépendre de celle de la console.'
   || E'\n'
   || '2. Enregistrer un compte WhatsApp Business et lui rattacher un numéro Akwaba. Le numéro du bac à sable cesse alors d''être utilisé, avec sa règle d''adhésion et sa cadence de trois secondes.'
   || E'\n'
   || '3. Faire approuver les modèles de message correspondant à nos avis : course acceptée, panier à valider, course livrée. Sans modèle approuvé, aucun message ne peut être envoyé au-delà de vingt-quatre heures depuis le dernier échange.'
   || E'\n'
   || '4. Mettre à jour, dans le coffre de la base, l''identifiant de la clé, son secret et le numéro expéditeur.'
   || E'\n'
   || '5. Remonter la cadence dans les réglages d''envoi : la limite d''un message toutes les trois secondes ne vaut que pour le bac à sable.'
   || E'\n\n'
   || 'Tant que ces étapes ne sont pas faites, WhatsApp reste un canal d''appoint. Le courriel demeure le canal sur lequel on peut compter, et le basculement est automatique.',
   NULL, NULL, 440),

  ('twilio-reglages-envoi', 'Configuration Twilio', 'exploitation',
   'Comment régler la cadence et la taille des lots d''envoi ?',
   'Trois réglages existent, et ils ne se règlent pas au hasard :'
   || E'\n'
   || '1. Le délai entre deux envois. Il vaut trois secondes tant que le bac à sable est utilisé, parce que c''est sa limite. Le descendre plus bas ferait refuser tout ce qui suit le premier message d''un lot.'
   || E'\n'
   || '2. La taille maximale d''un lot. Le travail planifié passe toutes les deux minutes : un lot de vingt messages espacés de trois secondes tient dans cette fenêtre, un lot de cent n''y tiendrait pas.'
   || E'\n'
   || '3. Le délai au-delà duquel une remise sans réponse est déclarée invérifiable. Les réponses de l''opérateur ne sont conservées que quelques heures ; passé ce délai, personne ne saura jamais ce qui s''est passé, et le dire vaut mieux que de laisser la ligne passer pour un envoi réussi.'
   || E'\n\n'
   || 'Ces réglages sont enregistrés en base, avec une trace de qui les a changés. Changer un chiffre ne demande donc pas de livrer l''application.',
   '/admin/pilotage', 'Voir les réglages en cours', 450)
ON CONFLICT (slug) DO UPDATE SET
  categorie = EXCLUDED.categorie, audience = EXCLUDED.audience,
  question = EXCLUDED.question, reponse = EXCLUDED.reponse,
  lien_action = EXCLUDED.lien_action, lien_libelle = EXCLUDED.lien_libelle,
  position = EXCLUDED.position, updated_at = now();
