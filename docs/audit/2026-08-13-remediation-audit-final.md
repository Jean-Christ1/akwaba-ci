# Remédiation de l'audit final

Un audit adverse en cinq axes a été mené sur le dépôt le 13 août 2026. Il a
rendu 81 constats, dont 21 bloquants, et une note globale de 22 sur 100 avec la
conclusion « non prêt pour la production ».

Ce document dit ce qui a été corrigé, ce qui ne l'a pas été, et pourquoi.

## 1. Notes de l'audit

| Axe | Note |
|---|---|
| Intégrité financière et monétisation | 17 |
| Sécurité | 36 |
| Parcours utilisateur praticables | 22 |
| Exploitabilité au quotidien | 29 |
| Qualité technique et fiabilité | 41 |

## 2. Ce qui a été corrigé

Migration `20260813220000`. Chaque défaut a été vérifié par lecture du code
avant correction, jamais accepté sur la seule parole de l'audit.

### 2.1 Deux défauts qui rendaient l'application inutilisable

**Les colonnes ajoutées après le durcissement n'étaient pas lisibles.** La
lecture d'`errands` est accordée colonne par colonne, pour que le shopper ne
puisse pas lire le code de remise. Cette liste, écrite à la main, n'a jamais été
étendue aux dix-huit colonnes ajoutées ensuite. L'écran de détail d'une course
en sélectionne quatre, et le tableau de bord du shopper faisait un `select("*")`
qui demandait aussi la colonne interdite. Le jour où les migrations passent, les
deux écrans où circule l'argent tombent en 42501.

La liste est désormais **calculée** par `refresh_errand_column_grants()`, qui
accorde toutes les colonnes sauf le code de remise. Deux tests interdisent la
récidive : l'un échoue si une migration ajoute une colonne sans rafraîchir les
privilèges, l'autre si un écran lit `errands` par une étoile.

**Une erreur de lecture s'affichait « Course introuvable ».** Le résultat était
lu sans regarder l'erreur : un refus du serveur devenait une course absente, ce
qui envoie chercher le problème là où il n'est pas. Le message du serveur est
maintenant affiché.

### 2.2 Quatre fuites d'argent

| Fuite | Ce qui se passait | Correction |
|---|---|---|
| Maturation au brut | L'entrée de journal porte le brut, le solde en attente n'a reçu que le net, et la maturation transférait le brut. Le shopper récupérait la commission de la plateforme. | La maturation somme la course entière, retenue comprise, et transfère le net. |
| Pourboire | Fixé par le shopper lui-même, sans plafond, sans commission, jamais montré au client. | Le pourboire devient une décision du client par `errand_add_tip`, plafonné par le barème. La facture ne peut plus y toucher. |
| Litiges successifs | Le dénouement rendait la somme de **tous** les gels passés. Un litige rouvert puis tranché deux fois recréditait deux fois. | On somme tous les ajustements, gels et restitutions : le solde de ce compte est ce qui reste gelé. |
| Course à soi-même | Rien n'empêchait un shopper d'offrir sur sa propre course, puis de se la régler. | Un déclencheur refuse l'offre quand le shopper est le client. |

### 2.3 Trois défauts de sécurité

**Le journal d'audit était forgeable.** `log_audit` était accordée à tout compte
connecté. Une trace que n'importe qui peut écrire ne prouve rien. Elle est
réservée au personnel de la plateforme.

**La garde des colonnes monétaires ignorait ce qui avait été ajouté après
elle.** Le supplément facturé, l'accord du client sur un dépassement de budget,
les jalons de la mission et le barème appliqué à la course étaient écrivables
directement. Une garde écrite la veille désarmait une garde livrée le matin. La
garde couvre désormais dix-huit colonnes de plus.

**Un établissement pouvait se publier et s'attribuer le premium.** La politique
de modification portait un `USING` sans `WITH CHECK` : le propriétaire d'une
fiche pouvait réécrire n'importe laquelle de ses colonnes, dont son état de
modération et son placement premium, c'est-à-dire le produit vendu. La
modération devient une décision de la plateforme, et le `WITH CHECK` manquant a
été rétabli.

### 2.4 Deux défauts d'usage

**Sur poste fixe, aucun chemin vers le compte.** L'en-tête ne contenait que des
liens de découverte et un bouton « Connexion » affiché même une fois connecté :
ni les courses, ni le portefeuille, ni le profil, ni le back-office n'étaient
atteignables. Un menu de compte a été ajouté, avec le back-office pour le seul
personnel.

**Le portefeuille n'avait aucun point d'entrée**, sur aucun appareil. Il est
maintenant accessible depuis le profil et depuis le menu de compte.

### 2.5 Un défaut de cohérence

**La commission affichée divergeait de celle enregistrée.** L'écran arrondissait
à cinquante francs, le serveur au centime. Sur un frais de service de 1 650 F,
le client lisait 250 F et la base enregistrait 247,50 F. L'écran arrondit
maintenant exactement comme le serveur, et un test parcourt six distances pour
le vérifier.

## 3. Ce qui n'a pas été corrigé, et pourquoi

### 3.1 Le modèle économique est inversé, et c'est une décision, pas un bug

C'est le constat le plus lourd de l'audit, et il est juste.

Aucun agrégateur de paiement n'est branché : il n'y a dans tout le dépôt ni
Stripe, ni CinetPay, ni Paystack, ni Flutterwave, ni webhook. Le client règle le
shopper **directement**, sur son compte Wave ou Orange Money. Aucun franc ne
transite par la plateforme.

Or, à la clôture, la plateforme **crédite** le portefeuille du shopper des frais
de service nets, puis règle réellement ce solde par virement depuis l'écran des
retraits. Le shopper a donc encaissé une première fois du client, et la
plateforme le paie une seconde fois. Sur une course à 2 000 F de service et
300 F de commission, l'éditeur ne gagne pas 300 F : il perd 1 700 F.

**Je n'ai pas corrigé ce point, et je ne devais pas le faire seul.** Le corriger
suppose de choisir entre deux modèles :

- **Paiement direct assumé.** Le client règle le shopper, et la plateforme
  facture sa commission **au shopper**. Le portefeuille cesse d'être une
  créance du shopper pour devenir une dette envers la plateforme. C'est
  cohérent avec ce qui se passe réellement aujourd'hui, et cela ne demande
  aucun prestataire.
- **Encaissement par la plateforme.** La plateforme encaisse le client, retient
  sa commission, reverse le shopper. C'est le modèle que le code laisse croire,
  mais il suppose un contrat marchand et des identifiants réels, qui ne sont ni
  disponibles ni inventables.

Ce choix engage le contrat, la fiscalité et la trésorerie : il revient au
propriétaire du produit.

Ce qui a été fait en attendant, par honnêteté : le tableau de bord affichait
`Commission encaissée`. Il affiche maintenant **`Commission due`**, avec la
mention qu'aucun paiement ne transite par la plateforme. Un indicateur qui
présente une créance comme une recette est une contre-vérité, même quand le
calcul est juste.

### 3.2 Le moteur monétaire n'a toujours aucun test exécuté

Les tests d'intégration PL/pgSQL existent mais sont marqués `ignore` quand les
secrets sont absents, ce qui est le cas dans la chaîne d'intégration. Ils ne
couvrent d'ailleurs ni la maturation, ni le pourboire, ni la cohérence entre le
journal et les soldes, c'est-à-dire précisément les quatre fuites trouvées.

Les corriger vraiment suppose une base de test accessible. Les 131 tests qui
passent portent sur le calcul du devis, le rendu des écrans et la cohérence des
migrations, pas sur les fonctions qui manipulent l'argent.

### 3.3 Exploitation

Il n'existe ni canal de support, ni notification hors application, ni recherche
d'un utilisateur ou d'une course dans la console, ni procédure de sauvegarde et
de retour arrière, ni étape de déploiement dans la chaîne d'intégration. Ces
manques sont réels et restent ouverts.

## 4. État après remédiation

| Mesure | Avant | Après |
|---|---|---|
| Tests | 126 | 131 |
| Fichiers de test | 13 | 14 |
| Erreurs de typage | 0 | 0 |
| Erreurs de lint | 0 | 0 |
| Constats bloquants traités | 0 | 11 sur 21 |

Les dix constats bloquants non traités relèvent, pour huit d'entre eux, du même
défaut de modèle économique décrit en 3.1, et pour les deux autres de
l'exploitation et des tests d'intégration.

## 5. Ce que cela ne garantit pas

Aucune de ces corrections n'a été **exécutée contre une base de données**, car
les migrations ne sont toujours pas appliquées. Elles sont vérifiées par
lecture, par typage et par les tests du dépôt, ce qui n'est pas la même chose
que par l'exécution.

La plateforme ne doit pas encaisser d'argent en l'état.
