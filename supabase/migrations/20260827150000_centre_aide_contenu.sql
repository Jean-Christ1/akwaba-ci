-- Contenu du centre d'aide.
--
-- Chaque réponse décrit un comportement vérifié dans le code ou dans la base.
-- Aucune ne promet une fonctionnalité absente : quand quelque chose n'existe
-- pas, elle le dit. Un centre d'aide qui décrit un produit imaginaire fabrique
-- des réclamations au lieu de les éviter.
--
-- Séparé de la migration de structure : le contenu se corrige souvent, la
-- table rarement. Les deux ne doivent pas se rejouer ensemble.

INSERT INTO public.help_articles
  (slug, categorie, audience, question, reponse, lien_action, lien_libelle, position)
VALUES

-- --------------------------------------------------------------- Le service
('qu-est-ce-qu-akwaba', 'Comprendre le service', 'tous',
 'Qu''est-ce qu''Akwaba, concrètement ?',
 'Vous décrivez ce qu''il vous faut : une liste de courses, un retrait de colis, une démarche. Un shopper vérifié s''en charge et vous suit jusqu''à la remise. Akwaba met en relation, calcule les frais de service et conserve les preuves de chaque étape. La plateforme ne vend rien elle-même et ne détient à aucun moment l''argent de vos achats.',
 '/courses/nouvelle', 'Publier une course', 10),

('villes-couvertes', 'Comprendre le service', 'tous',
 'Dans quelles villes puis-je demander une course ?',
 'Les courses sont ouvertes ville par ville. Quand vous publiez une demande, seules les villes ouvertes vous sont proposées ; si la vôtre n''y figure pas encore, c''est qu''aucun shopper n''y est validé pour l''instant. Le catalogue des lieux, lui, couvre toute la Côte d''Ivoire.',
 '/explorer', 'Voir les adresses', 20),

-- ------------------------------------------------------------------- Le prix
('comment-le-prix-est-calcule', 'Prix et paiement', 'tous',
 'Comment le prix de ma course est-il calculé ?',
 'Akwaba ne facture que des frais de service, jamais le prix de vos achats. Ces frais se composent d''une prise en charge selon le véhicule, d''un montant au kilomètre, du temps au-delà des minutes comprises, d''un supplément de volume et d''urgence, et d''une remise si vous venez récupérer vous-même. Le montant s''affiche pendant que vous décrivez la course, donc avant de commander, et il est recalculé par nos serveurs : ce n''est pas votre téléphone qui fixe le prix.',
 '/courses/comment-ca-marche', 'Voir la grille tarifaire', 30),

('prix-different-selon-la-ville', 'Prix et paiement', 'tous',
 'Pourquoi le tarif n''est-il pas le même partout ?',
 'Le barème peut être ajusté ville par ville, parce que le carburant, les distances utiles et les conditions de circulation n''y sont pas les mêmes. Le tarif appliqué est toujours celui affiché au moment où vous publiez la course, et il ne change plus ensuite, même si le barème est révisé le lendemain.',
 NULL, NULL, 40),

('qui-touche-la-commission', 'Prix et paiement', 'tous',
 'Qui touche la commission ?',
 'Akwaba prélève une commission sur les frais de service uniquement, jamais sur le prix des achats ni sur le pourboire. Le reste des frais rémunère le shopper. Le détail est affiché sur votre devis avant que vous ne commandiez, et sur la facture ensuite.',
 NULL, NULL, 50),

('qui-detient-mon-argent', 'Prix et paiement', 'tous',
 'Akwaba garde-t-elle mon argent ?',
 'Non. Aucun prestataire de paiement n''intervient aujourd''hui et la plateforme ne détient à aucun moment les fonds d''une course. Vous réglez le shopper directement, par le moyen dont vous avez l''habitude. Akwaba facture ensuite sa commission au shopper.',
 NULL, NULL, 60),

('moyens-de-paiement', 'Prix et paiement', 'client',
 'Comment puis-je payer ?',
 'Vous convenez du moyen avec le shopper : espèces à la remise, ou transfert mobile. Les moyens proposés à la publication d''une course sont ceux que la plateforme a activés ; ils peuvent évoluer. Ne communiquez jamais un code de retrait ni un code reçu par message à qui que ce soit.',
 NULL, NULL, 70),

-- ------------------------------------------------------- L'argent des achats
('qui-avance-l-argent-des-achats', 'Argent des achats', 'tous',
 'Qui avance l''argent des achats ?',
 'Trois cas, que vous choisissez à la publication. Soit vous envoyez le budget estimé au shopper avant qu''il parte, et on régularise au franc près sur le reçu. Soit le shopper avance, ce qui est réservé aux shoppers vérifiés et plafonné, et vous le remboursez à la remise. Soit il n''y a pas d''achat à faire, et vous réglez tout à la fin.',
 NULL, NULL, 80),

('regularisation-du-budget', 'Argent des achats', 'tous',
 'Et si les achats coûtent plus cher que prévu ?',
 'Le shopper enregistre sa facture réelle avec le reçu. La différence entre votre avance et le montant réel apparaît sur la facture : soit il vous reste à payer, soit on vous rend la différence. Un dépassement important n''est pas appliqué automatiquement : il vous est soumis, et il est plafonné.',
 NULL, NULL, 90),

('article-introuvable', 'Argent des achats', 'client',
 'Un article de ma liste est introuvable en rayon',
 'Le shopper vous propose un remplacement depuis l''application, avec le produit et son prix. Vous acceptez ou vous refusez, et la décision est datée. Il ne peut pas décider seul de remplacer un article par un autre.',
 NULL, NULL, 100),

-- ------------------------------------------------------------------ La remise
('code-de-remise', 'Remise et livraison', 'tous',
 'À quoi sert le code à quatre chiffres ?',
 'Il prouve que la remise a bien eu lieu, entre vous et le bon shopper. Vous le lisez dans l''application au moment de la remise et vous le lui donnez ; lui seul peut le saisir. Le shopper ne peut pas le lire à l''avance.',
 NULL, NULL, 110),

('code-de-remise-bloque', 'Remise et livraison', 'tous',
 'Le code a été saisi plusieurs fois de travers, que faire ?',
 'Après cinq saisies erronées, la remise se verrouille pour éviter qu''on la force. Contactez le support : un modérateur la rouvre après vérification, et son intervention est inscrite au journal. Votre course n''est pas perdue et le shopper sera payé.',
 NULL, NULL, 120),

('livraison-par-un-tiers', 'Remise et livraison', 'client',
 'Le shopper peut-il confier ma course à un livreur ?',
 'Oui, si vous avez choisi ce mode à la publication. Les frais de livraison sont alors réduits, mais la responsabilité de la remise reste suivie dans l''application, avec le même code.',
 NULL, NULL, 130),

-- ------------------------------------------------------ Annulation et litige
('annuler-une-course', 'Annulation et litige', 'client',
 'Puis-je annuler ma course ?',
 'Tant que les achats n''ont pas commencé, oui. Dès que le shopper a acheté pour vous, l''annulation est refusée : les articles sont payés et, en Côte d''Ivoire, ils ne se rendent généralement pas. Si quelque chose ne va pas à ce stade, ouvrez un litige plutôt qu''une annulation.',
 NULL, NULL, 140),

('ouvrir-un-litige', 'Annulation et litige', 'tous',
 'Comment ouvrir un litige ?',
 'Depuis la course concernée. Décrivez ce qui s''est passé et joignez ce que vous avez : photo du reçu, photo des articles, messages. Un modérateur tranche à partir des preuves déposées de part et d''autre. Sa décision, son motif et son auteur sont inscrits.',
 NULL, NULL, 150),

('remboursement', 'Annulation et litige', 'client',
 'Comment se passe un remboursement ?',
 'Ne détenant pas les fonds, la plateforme ne rembourse pas elle-même. Ce que le modérateur tranche, c''est l''issue de la course : à qui revient l''argent des achats et les frais de service. Le règlement se fait ensuite entre vous et le shopper, la plateforme fournissant les preuves de chaque étape.',
 NULL, NULL, 160),

('refuser-une-livraison', 'Annulation et litige', 'tous',
 'Le client refuse la livraison alors que les achats sont faits',
 'C''est le cas que la plateforme traite le plus sérieusement. Les preuves comptent : reçu d''achat, photos, horodatage, historique des remplacements acceptés. Le modérateur tranche à partir de ces éléments. C''est aussi pourquoi un remplacement d''article doit être validé par le client avant l''achat : sans cet accord, le refus devient discutable.',
 NULL, NULL, 170),

-- ----------------------------------------------------------- Devenir shopper
('devenir-shopper', 'Devenir shopper', 'shopper',
 'Comment devenir shopper ?',
 'Vous déposez votre dossier depuis l''application : identité, ville, quartiers où vous circulez, véhicule. Il vous faut avoir dix-huit ans révolus, fournir une pièce d''identité en cours de validité et un selfie. Un modérateur rapproche votre visage de votre pièce avant de valider.',
 '/courses/devenir-shopper', 'Déposer mon dossier', 180),

('pourquoi-un-selfie', 'Devenir shopper', 'shopper',
 'Pourquoi me demander un selfie ?',
 'Parce qu''un shopper reçoit l''argent d''un inconnu et se rend chez lui. Le selfie permet à un modérateur de vérifier que la personne du dossier est bien celle de la pièce. Aucune analyse automatique de votre visage n''est faite, et aucune mesure biométrique n''est conservée : seules la photo et votre date de naissance sont gardées, cette dernière uniquement pour établir votre majorité.',
 NULL, NULL, 190),

('mineur-refuse', 'Devenir shopper', 'shopper',
 'J''ai moins de dix-huit ans, puis-je quand même être shopper ?',
 'Non. La plateforme refuse le dossier au dépôt, et non après une attente inutile. Confier de l''argent et l''adresse privée d''un client à un mineur n''est pas envisageable.',
 NULL, NULL, 200),

('piece-perimee', 'Devenir shopper', 'shopper',
 'Ma pièce d''identité arrive à échéance',
 'Redéposez-en une en cours de validité depuis votre dossier. Une pièce périmée suspend l''habilitation : vous ne recevez plus de course tant que le dossier n''est pas à jour. Vous serez prévenu avant l''échéance si vous nous l''avez indiquée.',
 NULL, NULL, 210),

('sans-argent-au-depart', 'Devenir shopper', 'shopper',
 'Je n''ai pas d''argent pour avancer les achats, puis-je commencer ?',
 'Oui. C''est même le cas courant : le client envoie le budget estimé avant que vous ne partiez, et vous régularisez au franc près sur le reçu. Avancer vos propres fonds est une possibilité réservée aux shoppers vérifiés et plafonnée, jamais une obligation pour commencer.',
 NULL, NULL, 220),

('quand-suis-je-paye', 'Devenir shopper', 'shopper',
 'Quand suis-je payé ?',
 'À la remise, directement par le client, puisque la plateforme ne détient pas les fonds. Votre portefeuille indique ce qui vous revient et la commission que vous devez à Akwaba sur les frais de service. Le pourboire vous revient en entier et n''est jamais commissionné.',
 '/courses/portefeuille', 'Voir mon portefeuille', 230),

-- --------------------------------------------------------- Compte et données
('ou-je-recois-mes-messages', 'Compte et données', 'tous',
 'Où est-ce que je reçois le suivi de mes courses ?',
 'Sur le canal que vous choisissez dans votre profil : WhatsApp, SMS, courriel, ou dans l''application seulement. Si nous n''arrivons pas à vous joindre par votre canal préféré, nous essayons le suivant, et le message reste toujours consultable dans l''application. Vous pouvez revenir sur ces choix à tout moment.',
 '/profil', 'Régler mes préférences', 240),

('supprimer-mon-compte', 'Compte et données', 'tous',
 'Comment supprimer mon compte ?',
 'Depuis l''onglet Compte de votre profil. Votre profil, votre dossier de shopper, vos coordonnées de paiement, votre portefeuille, vos favoris et vos messages sont effacés. Vos courses terminées restent dans nos comptes, avec les montants et les dates mais sans votre nom, parce que la loi impose de conserver ces écritures. La suppression est refusée tant qu''une course est en cours ou qu''un solde reste en suspens, et l''écran vous dit précisément ce qui bloque.',
 '/profil', 'Aller à mon profil', 250),

('mes-donnees', 'Compte et données', 'tous',
 'Que faites-vous de mes données ?',
 'Vos données personnelles vivent tant que votre compte existe. Aucune purge automatique n''est en place à ce jour : nous ne supprimons rien de nous-mêmes avant votre demande. Les pièces d''identité des shoppers sont conservées dans un espace privé, accessible aux seuls modérateurs qui instruisent les dossiers.',
 '/confidentialite', 'Lire la politique de confidentialité', 260),

-- ------------------------------------------------------------------ Sécurité
('eviter-les-arnaques', 'Sécurité', 'tous',
 'Comment Akwaba limite-t-elle les arnaques ?',
 'Plusieurs garde-fous, aucun infaillible. Le shopper est identifié avant d''être habilité. Les montants et les statuts sont fixés par nos serveurs, jamais par un téléphone. La remise exige un code que le shopper ne peut pas connaître à l''avance. Chaque changement d''état, chaque remplacement et chaque décision de modérateur est inscrit et daté. Un litige se tranche sur ces traces, pas sur la parole de l''un contre l''autre.',
 NULL, NULL, 270),

('signaler-un-comportement', 'Sécurité', 'tous',
 'Je veux signaler un comportement anormal',
 'Ouvrez un litige sur la course concernée et décrivez les faits, ou contactez le support si aucune course n''est en jeu. Un modérateur peut suspendre un compte, et il doit alors indiquer son motif, qui est conservé.',
 NULL, NULL, 280),

('ne-jamais-partager', 'Sécurité', 'tous',
 'Que ne dois-je jamais communiquer ?',
 'Votre mot de passe, le code à quatre chiffres avant la remise effective, et tout code reçu par message. Akwaba ne vous demandera jamais votre mot de passe, ni un code de retrait, ni vos identifiants bancaires. Nous ne collectons aucune donnée bancaire dans l''application.',
 NULL, NULL, 290)

ON CONFLICT (slug) DO UPDATE SET
  categorie = EXCLUDED.categorie, audience = EXCLUDED.audience,
  question = EXCLUDED.question, reponse = EXCLUDED.reponse,
  lien_action = EXCLUDED.lien_action, lien_libelle = EXCLUDED.lien_libelle,
  position = EXCLUDED.position, updated_at = now();
