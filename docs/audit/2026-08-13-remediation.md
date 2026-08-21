# Remédiation du 13 août 2026, état livré

Ce document consigne ce qui a été fait, ce qui est prouvé, et ce qui reste
ouvert. Il complète le rapport d'état initial
[2026-08-akwaba-current-state.md](2026-08-akwaba-current-state.md).

## 1. Chiffres

| Indicateur | Avant | Après |
|---|---|---|
| Erreurs de lint | 76 | **0** |
| Tests automatisés | 31 | **102** |
| Chunk d'entrée | 1 903 Ko | **172 Ko** |
| Fonctions serveur du moteur | 0 | **28** |
| Intégration continue | aucune | lint, types, tests, build, budget de poids, Deno |
| Application installable | non | oui, avec fonctionnement hors ligne |

## 2. Ce qui a été corrigé

### Sécurité et intégrité financière

- **Autorité serveur sur l'argent.** Le client ne fixe plus aucun montant :
  publication, acceptation d'offre, facture, clôture, retrait et litige passent
  par des fonctions `SECURITY DEFINER` qui vérifient l'acteur, contrôlent la
  transition et recalculent depuis un barème stocké. Des déclencheurs rejettent
  toute écriture directe des colonnes sensibles.
- **Contournement du KYC fermé.** Un candidat ne peut plus se déclarer shopper
  validé, ni s'attribuer une note ou un compteur de missions.
- **Données personnelles protégées.** Téléphone, WhatsApp et pièce d'identité
  ne sont plus lisibles par tout utilisateur connecté. Deux buckets privés
  accueillent les documents sensibles, servis par URL signée de courte durée.
- **Code de remise étanche.** Le privilège de lecture sur `errands` est accordé
  colonne par colonne pour exclure `handover_code` : le shopper ne peut plus
  valider lui-même une remise qu'il n'a pas faite.
- **Confidentialité du marché.** Une course ouverte est consultable par un
  shopper sans exposer l'adresse exacte ni les notes du client.
- **Portefeuille et retraits.** Les gains sont crédités à la clôture, mûrissent
  puis deviennent disponibles ; un retrait vérifie le solde et le débite sous
  verrou. Un refus recrédite.

### Fonctionnel

- **Catalogue relié à la base.** Les écrans publics lisent les fiches publiées,
  ce qui fait enfin exister le parcours partenaire vers client.
- **Réservation réparée.** Les identifiants de lieux sont de vrais UUID :
  chaque demande échouait auparavant sur une erreur de conversion.
- **Litiges arbitrables.** États d'annulation et de litige atteignables, écran
  de modération, gel et restitution des gains tracés au journal.
- **Preuves câblées.** Reçu d'achat, preuve d'avance et code de remise vérifié
  conditionnent désormais la clôture.
- **Tarification ancrée.** Distance et durée dérivent d'une adresse géocodée,
  non d'une saisie libre.

### Produit et exploitation

Application installable et utilisable hors ligne, textes légaux publiés, pied de
page, référentiel de villes administrable, repli monopage et en-têtes de
sécurité, accessibilité des écrans monétaires, reprise réseau sur les lectures.

## 3. Ce qui reste ouvert

### Migrations non appliquées

Les migrations livrées **ne sont pas appliquées** sur le projet Supabase. Tant
qu'elles ne le sont pas, aucune protection décrite ici n'est active en base :
l'environnement d'exécution utilisé pour ces travaux interdit l'écriture directe
sur la base de production, et ce garde-fou n'a pas été contourné.

Vérification à rejouer après application :

```sql
-- Doit retourner une expression, non NULL, pour les politiques UPDATE
SELECT c.relname, p.polname, pg_get_expr(p.polwithcheck, p.polrelid)
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('errands', 'runner_profiles') AND p.polcmd = 'w';

-- Doit lister les déclencheurs de garde
SELECT tgname FROM pg_trigger WHERE tgname LIKE '%guard%' AND NOT tgisinternal;
```

### Décisions qui vous appartiennent

Consignées dans [DECISIONS.md](../../DECISIONS.md) : prestataire de paiement,
politique de remboursement et de litige, modalités de vérification des shoppers,
villes ouvertes au lancement, et taux de commission définitif.

### Limites assumées

- **Aucune passerelle de paiement.** Les structures existent, aucune intégration
  n'est branchée : aucun écran ne prétend qu'un règlement a eu lieu sans
  transaction réelle. C'est délibéré tant que le prestataire n'est pas arbitré.
- **Tests d'intégration RLS non exécutés.** Ils existent et couvrent les
  protections critiques, mais exigent des secrets Supabase en intégration
  continue pour tourner. Sans eux, ils s'ignorent au lieu d'échouer.
- **Services cartographiques de démonstration.** Nominatim et OSRM conviennent
  au démarrage mais n'offrent aucun engagement de service ; le passage en volume
  suppose un fournisseur avec clé.
- **Aucun suivi des erreurs en production.** Les erreurs sont journalisées en
  console, pas remontées vers un service.

## 4. Méthode de vérification

Le travail a été soumis à une relecture adversariale indépendante, chargée de
trouver ce qui était cassé plutôt que de confirmer que tout allait bien. Elle a
relevé seize défauts bloquants, dont plusieurs introduits par la remédiation
elle-même : un garde-fou qui empêchait la clôture de toute course, une condition
mal écrite ouvrant l'annulation à n'importe qui, une fuite du code de remise, et
un modérateur incapable d'entrer dans le back-office. Tous ont été corrigés et
livrés.

Sont vérifiés automatiquement à chaque exécution :

| Contrôle | Résultat |
|---|---|
| Concordance des 16 appels serveur avec les signatures SQL | aucun écart |
| Ordre des migrations et dépendances entre fonctions | cohérent |
| Lint, types, tests, build | verts |
| Démarrage de l'application et service des ressources | vérifié |
| Critères d'installabilité | tous satisfaits |
