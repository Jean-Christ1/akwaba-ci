-- Le mode d'emploi de la gouvernance des accès.
--
-- Le dispositif est en base, éprouvé, et personne ne sait s'en servir. Celui
-- qui accorde un droit ne sait pas qu'il ne peut donner que ce qu'il détient ;
-- celui qui en cherche l'origine ne sait pas qu'il existe un accès de secours ;
-- celui qui mène la revue ne sait pas pourquoi elle ne retire rien.
--
-- Ces réponses sont réservées à l'exploitation : elles décrivent l'intérieur du
-- service, et le centre d'aide est ouvert à tous les visiteurs.

INSERT INTO public.help_articles (slug, categorie, audience, question, reponse, lien_action, lien_libelle, position)
VALUES
  ('gouvernance-comment-ca-marche', 'Gouvernance des accès', 'exploitation',
   'Comment quelqu''un obtient-il un droit chez Akwaba ?',
   'Par trois chemins, et il faut les connaître tous les trois pour retirer un droit à quelqu''un.'
   || E'\n\n'
   || '1. Un rôle. C''est le chemin normal : on confie un rôle, le rôle porte des droits. Retirer le rôle retire les droits.'
   || E'\n'
   || '2. Une exception nominative. Un droit accordé à une personne seule, avec un motif écrit. Elle prime sur le rôle, dans les deux sens : une exception peut ouvrir un droit que le rôle ne donne pas, ou fermer un droit que le rôle donne.'
   || E'\n'
   || '3. L''accès de secours. Un compte portant le rôle hérité « admin » obtient les trente-quatre droits sans figurer dans la matrice. Ni le retrait d''un rôle ni une exception ne les lui enlèvent.'
   || E'\n\n'
   || 'L''écran « Droits d''une personne » nomme la source de chaque droit. C''est elle qui dit comment le retirer, et c''est pour cela qu''elle est affichée : sans elle, on retirait le rôle et la personne gardait le droit.',
   '/admin/droits', 'Ouvrir la gouvernance', 600),

  ('gouvernance-confinement', 'Gouvernance des accès', 'exploitation',
   'Pourquoi ne puis-je pas accorder ce droit ?',
   'Trois règles encadrent l''attribution, et elles existent pour que déléguer le droit d''attribuer ne revienne pas à tout déléguer.'
   || E'\n\n'
   || '1. On n''accorde que ce qu''on détient soi-même. Si vous n''avez pas le droit de lire le journal d''audit, vous ne pouvez l''accorder à personne.'
   || E'\n'
   || '2. On n''attribue pas un rôle plus étendu que le sien, ni un rôle qui ouvrirait des droits qu''on n''a pas. Le rang seul ne suffit pas : deux rôles de même rang ouvrent des portes différentes.'
   || E'\n'
   || '3. On ne modifie jamais ses propres droits. Un droit se demande à un collègue, il ne se prend pas.'
   || E'\n\n'
   || 'Sans ces règles, il suffisait de détenir « Attribuer les rôles et les droits » pour s''accorder n''importe quoi et devenir super administrateur en deux gestes. La séparation entre le responsable financier et les pièces d''identité, entre l''administrateur plateforme et le journal d''audit, ne tenait alors sur rien.',
   '/admin/droits', 'Voir la matrice', 610),

  ('gouvernance-perimetre', 'Gouvernance des accès', 'exploitation',
   'Comment limiter quelqu''un à une ville ?',
   'En confiant son rôle sur cette ville plutôt que partout. Choisissez la ville au moment de l''attribution : le rôle ouvre alors les mêmes droits, mais seulement sur les courses de cette ville.'
   || E'\n\n'
   || 'Douze des trente-quatre droits sont restreignables ainsi. Les autres n''ont pas de sens par ville : régler un barème ou tenir le centre d''aide vaut partout ou nulle part. Le tiroir de chaque droit dit lequel des deux il est.'
   || E'\n\n'
   || 'Une même personne peut recevoir le même rôle sur plusieurs villes : c''est le cas courant dès qu''on ouvre une seconde ville. Sans restriction, le rôle vaut partout, ce qui reste le cas de la quasi-totalité des comptes.'
   || E'\n\n'
   || 'Attention à un effet de bord : quelqu''un de restreint verra moins de choses que ses collègues, et un écran plus vide ressemble à une panne. L''application le lui dit plutôt que de le laisser deviner.',
   '/admin/droits', 'Voir les périmètres', 620),

  ('gouvernance-echeance', 'Gouvernance des accès', 'exploitation',
   'Quand faut-il mettre une échéance sur un droit ?',
   'Chaque fois que la raison de l''accorder a une fin connue. Un remplacement pendant un congé, un renfort pour la haute saison, un audit trimestriel : tous ont une date de fin, et la donner au moment de l''attribution évite d''avoir à y penser plus tard.'
   || E'\n\n'
   || 'Un accès à échéance se referme tout seul, chaque nuit. Il ne figure pas dans la revue des accès : il n''y a rien à relire sur un droit qui va disparaître.'
   || E'\n\n'
   || 'À l''inverse, un accès sans terme demande une relecture : tous les trois mois pour un droit sensible, tous les ans pour les autres. C''est du travail. Une échéance bien posée en épargne beaucoup.',
   '/admin/droits', 'Ouvrir la revue', 630),

  ('gouvernance-revue', 'Gouvernance des accès', 'exploitation',
   'À quoi sert la revue des accès, si elle ne retire rien ?',
   'À poser une question que personne ne pose spontanément : ce droit est-il encore justifié ?'
   || E'\n\n'
   || 'Un droit s''accorde en trois secondes, pour une raison évidente sur le moment. Il ne se retire presque jamais, parce que rien ne le rappelle. Au bout d''un an, plus personne ne sait qui détient quoi ni pourquoi. La revue est l''endroit où la question se pose, et la date de relecture est la trace qu''elle a été posée.'
   || E'\n\n'
   || 'Elle ne retire rien d''elle-même, et c''est voulu. Fermer un accès sensible parce que personne ne l''a relu couperait la console à quelqu''un au pire moment, un dimanche, sans que personne comprenne pourquoi. Elle montre ; c''est un humain qui tranche.'
   || E'\n\n'
   || 'Vos propres accès sont relus par quelqu''un d''autre : se relire soi-même n''est pas une relecture, c''est se donner raison.',
   '/admin/droits', 'Mener la revue', 640),

  ('gouvernance-acces-de-secours', 'Gouvernance des accès', 'exploitation',
   'Qu''est-ce que l''« accès de secours », et faut-il le retirer ?',
   'C''est le rôle hérité « admin » posé sur un compte. Il ouvre les trente-quatre droits sans figurer dans la matrice, et c''est précisément ce qui le rend à la fois utile et dangereux.'
   || E'\n\n'
   || 'Utile : sans lui, se fermer la console par une erreur d''attribution serait sans retour, puisque rien dans l''application ne permettrait de la rouvrir.'
   || E'\n\n'
   || 'Dangereux : un accès qu''on ne voit nulle part est un accès qu''on oublie. L''écran de réconciliation existe pour cela. Il sépare deux situations très différentes : un compte dont le rôle hérité est doublé par la matrice, qui est alignable sans rien perdre ; et un compte qui n''a que le rôle hérité, qui tient tout d''un chemin invisible.'
   || E'\n\n'
   || 'La marche à suivre pour le second cas, dans cet ordre : confier d''abord un rôle de la matrice, vérifier que la personne a bien ce qu''il lui faut, retirer ensuite le rôle hérité. L''inverse lui ferme la porte d''un coup.',
   '/admin/droits', 'Voir la réconciliation', 650),

  ('gouvernance-ce-qui-nest-pas-garanti', 'Gouvernance des accès', 'exploitation',
   'Que ce dispositif ne garantit-il pas ?',
   'Trois choses, dites franchement, parce qu''une garantie qu''on croit avoir est pire qu''une garantie qu''on sait ne pas avoir.'
   || E'\n\n'
   || '1. Il ne protège pas d''un compte compromis. Quelqu''un qui prend la main sur le compte d''un super administrateur détient ses droits, et aucune règle d''attribution n''y change rien.'
   || E'\n'
   || '2. Il ne protège pas d''une décision légitime mais mauvaise. Confier un rôle trop large à quelqu''un est autorisé si vous détenez ce rôle : la trace dira qui l''a fait, elle ne l''aura pas empêché.'
   || E'\n'
   || '3. Il ne couvre pas ce qui vit hors de l''application : l''accès direct à la base de données, les secrets du coffre, les comptes des prestataires. Ceux-là se gouvernent ailleurs.'
   || E'\n\n'
   || 'Ce qu''il garantit, en revanche : personne ne s''accorde un droit à soi-même, personne n''accorde plus qu''il ne détient, et chaque geste laisse une trace nominative et datée que rien dans l''application ne permet d''effacer.',
   NULL, NULL, 660)
ON CONFLICT (slug) DO UPDATE SET
  categorie = EXCLUDED.categorie, audience = EXCLUDED.audience,
  question = EXCLUDED.question, reponse = EXCLUDED.reponse,
  lien_action = EXCLUDED.lien_action, lien_libelle = EXCLUDED.lien_libelle,
  position = EXCLUDED.position, updated_at = now();
