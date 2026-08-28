-- Le centre d'aide explique le paiement au comptoir.
--
-- Le dispositif est en base et fonctionne. Personne ne sait s'en servir : le
-- client ne sait pas qu'il doit ouvrir un code, le shopper ne sait pas qu'il
-- n'a rien à avancer, et le commerçant ne sait pas ce que vaut l'autorisation
-- qu'il voit passer.
--
-- Ces trois questions sont exactement celles qui, sans réponse, ramènent le
-- service au point de départ : le shopper paie de sa poche, parce que c'est le
-- seul geste que tout le monde comprend.

INSERT INTO public.help_articles (slug, categorie, audience, question, reponse, lien_action, lien_libelle, position)
VALUES
  ('comptoir-comment-ca-marche', 'Payer au comptoir', 'tous',
   'Comment payer le magasin sans donner d''argent au shopper ?',
   'Trois gestes, un par personne, et l''argent ne passe par personne.'
   || E'\n\n'
   || '1. Vous ouvrez un paiement depuis la page de votre course, en fixant un plafond. Un code apparaît, sous forme de carré à scanner et de seize signes lisibles.'
   || E'\n'
   || '2. Au comptoir, le shopper présente ce code. Le commerçant le saisit et entre le montant exact du ticket.'
   || E'\n'
   || '3. Vous recevez la demande sur votre téléphone. Vous voyez le montant et le nom du commerce, et vous autorisez ou vous refusez.'
   || E'\n\n'
   || 'Le shopper ne peut rien faire de ce code : ni fixer le montant, ni encaisser, ni le transformer en virement vers lui. Il peut seulement le montrer. Si vous n''autorisez rien, le code expire et il ne s''est rien passé.',
   '/courses', 'Ouvrir mes courses', 500),

  ('comptoir-plafond', 'Payer au comptoir', 'client',
   'À quoi sert le plafond, et que se passe-t-il si le ticket le dépasse ?',
   'Le plafond est la limite que vous acceptez d''avance. Un commerçant qui saisirait un montant supérieur est refusé par la plateforme, avant même que vous ne voyiez la demande.'
   || E'\n\n'
   || 'Il ne peut pas dépasser le budget de votre course. Si le ticket réel est plus élevé, le shopper vous le dit par le fil de discussion : vous annulez le code et vous en ouvrez un autre au bon montant. C''est volontairement un peu lourd, parce qu''un dépassement mérite votre attention.'
   || E'\n\n'
   || 'Un seul code peut être ouvert à la fois sur une course. Deux codes vivants permettraient de payer deux fois le même panier.',
   NULL, NULL, 510),

  ('comptoir-shopper', 'Payer au comptoir', 'shopper',
   'Je suis shopper : dois-je avancer l''argent au magasin ?',
   'Non, et c''est le point le plus important de votre métier chez Akwaba.'
   || E'\n\n'
   || 'Quand le client a ouvert un paiement au comptoir, le code apparaît sur la page de la course, de votre côté aussi. Vous le présentez en caisse, le commerçant saisit le montant, le client autorise. Vous ne sortez rien de votre poche.'
   || E'\n\n'
   || 'Si le client n''a pas ouvert de paiement, demandez-le-lui par le fil de discussion avant de passer en caisse. S''il ne répond pas, ne payez pas de votre poche : prévenez le support.'
   || E'\n\n'
   || 'Si un commerçant vous réclame un paiement immédiat en disant qu''il n''a rien reçu, il a raison sur les faits : l''autorisation du client n''est pas un virement instantané, elle enregistre ce qu''Akwaba lui doit. Appelez le support plutôt que d''avancer.',
   '/courses/shopper', 'Ouvrir mes missions', 520),

  ('comptoir-refuse', 'Payer au comptoir', 'tous',
   'Le client a refusé le montant : que faire, au comptoir ?',
   'Rien ne se passe automatiquement, et c''est voulu : personne ne doit se retrouver engagé par un refus.'
   || E'\n\n'
   || 'Le shopper reçoit un avis lui disant de ne rien régler de sa poche. Le commerçant, s''il a un compte Akwaba, reçoit un avis lui disant de ne pas remettre la marchandise.'
   || E'\n\n'
   || 'La suite se règle entre le client et le shopper par le fil de discussion : un article manquant, un prix différent de ce qui était prévu, un doute sur le ticket. Le client peut ensuite ouvrir un nouveau code au bon montant.'
   || E'\n\n'
   || 'Un paiement déjà autorisé, lui, ne s''annule pas d''un bouton : cela effacerait ce qui est dû au commerce. Cette situation relève du litige.',
   '/aide', 'Voir les autres réponses', 530),

  ('comptoir-marchand', 'Payer au comptoir', 'partenaire',
   'Mon commerce peut-il encaisser des courses Akwaba ?',
   'Oui, à trois conditions, et la troisième est celle qu''on oublie.'
   || E'\n\n'
   || '1. Votre commerce doit être inscrit au registre des marchands d''Akwaba, avec le numéro sur lequel vous êtes réglé. Le paiement mobile est accepté ; le virement bancaire ne l''est pas encore.'
   || E'\n'
   || '2. Votre inscription doit être vérifiée. C''est le seul moment où quelqu''un regarde à qui l''argent ira, et tant qu''elle ne l''est pas, aucun encaissement à votre nom n''est possible.'
   || E'\n'
   || '3. Un compte Akwaba doit être rattaché à votre commerce. Sans ce rattachement, vous ne verrez pas votre comptoir, et vous ne pourrez ni saisir un montant ni constater vos encaissements.'
   || E'\n\n'
   || 'Une fois ces trois points réglés, votre comptoir est accessible depuis votre profil.'
   || E'\n\n'
   || 'Un mot sur le délai, pour éviter un malentendu qui coûterait cher à tout le monde : l''autorisation du client n''est pas un virement. Elle enregistre ce qu''Akwaba vous doit, et le règlement vous parvient ensuite par le canal convenu. Ne demandez pas au shopper de payer à la place.',
   '/courses/comptoir', 'Ouvrir mon comptoir', 540),

  ('comptoir-securite', 'Payer au comptoir', 'tous',
   'Ce code peut-il être détourné ?',
   'Voici précisément ce qui est en place, et ce qui ne l''est pas.'
   || E'\n\n'
   || 'Le code ne donne aucun droit sur l''argent. Il désigne une course et une limite, rien d''autre. Le montant est saisi par le commerçant, et l''autorisation vient du client seul.'
   || E'\n\n'
   || 'Le bénéficiaire ne peut être ni le shopper ni le client. La plateforme compare les comptes, et aussi les numéros d''encaissement : un shopper qui inscrirait son propre numéro comme numéro de marchand est reconnu et refusé.'
   || E'\n\n'
   || 'Le code n''est pas conservé en clair. La base en garde une empreinte et une forme chiffrée, que seuls le client et le shopper de la course peuvent faire relire, et chaque relecture laisse une trace.'
   || E'\n\n'
   || 'Ce que cela ne garantit pas : ni Akwaba ni personne ne peut promettre zéro fraude. Un commerçant complice d''un shopper reste possible, comme dans n''importe quel commerce. Ce que le dispositif garantit, c''est que l''argent ne transite jamais par le shopper, et que chaque geste laisse une trace datée et nominative.',
   NULL, NULL, 550)
ON CONFLICT (slug) DO UPDATE SET
  categorie = EXCLUDED.categorie, audience = EXCLUDED.audience,
  question = EXCLUDED.question, reponse = EXCLUDED.reponse,
  lien_action = EXCLUDED.lien_action, lien_libelle = EXCLUDED.lien_libelle,
  position = EXCLUDED.position, updated_at = now();
