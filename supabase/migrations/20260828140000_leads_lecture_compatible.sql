-- Rétablir la lecture des demandes pour le frontal déployé.
--
-- Faute reconnue. La migration précédente a restreint la lecture de la table
-- des demandes colonne par colonne, pour que la note interne de
-- l'établissement cesse d'être lisible par le visiteur. C'est la bonne
-- correction, et elle reste à faire.
--
-- Mais elle a été appliquée à la base avant que le frontal correspondant ne
-- soit livré. Or le frontal en production demande « select * » sur cette
-- table, ce qu'une lecture accordée colonne par colonne refuse : l'onglet des
-- demandes de la console, le fil des messages et le suivi du visiteur dans son
-- profil ne rendaient plus rien du tout. Une correction de sécurité qui casse
-- trois écrans en production n'est pas une correction, c'est une panne.
--
-- On rétablit donc la lecture de la table, ce qui remet exactement l'état
-- antérieur : partner_note redevient lisible par le visiteur sur sa propre
-- demande, comme elle l'était depuis toujours. La fuite n'est pas creusée, elle
-- est seulement laissée telle qu'elle était le temps que le frontal suive.
--
-- Ce qui est conservé, en revanche, c'est le retrait du droit d'écrire. Il ne
-- casse rien qu'on ne veuille casser : un partenaire ne peut plus réécrire le
-- message du visiteur ni déplacer sa demande chez un confrère. Le bouton de la
-- console qui écrivait en direct répondra une erreur jusqu'à la livraison du
-- frontal, qui passe par lead_traiter. Un bouton qui refuse vaut mieux qu'un
-- champ que n'importe quel partenaire peut réécrire.
--
-- La restriction par colonne revient dans une migration ultérieure, une fois le
-- frontal en ligne. L'ordre compte : le code d'abord, le verrou ensuite.

GRANT SELECT ON public.leads TO authenticated;

COMMENT ON COLUMN public.leads.partner_note IS
  'Note interne de l''etablissement. Lisible par le visiteur tant que le frontal deploye demande select *. A refermer des que la lecture par colonne pourra revenir.';
