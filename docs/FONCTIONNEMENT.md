# Comment Akwaba fonctionne, de bout en bout

Ce document décrit ce qui se passe réellement, écran par écran et fonction par
fonction. Il sert à comprendre la plateforme sans lire le code, et à vérifier
que ce qui est annoncé correspond à ce qui est fait.

Les gestes d'exploitation, appliquer les migrations, sauvegarder, restaurer,
livrer, revenir en arrière, recetter, traiter une contestation, figurent dans
[EXPLOITATION.md](EXPLOITATION.md).

## 1. Les deux métiers

Akwaba porte deux activités qui partagent le même compte utilisateur.

**Découverte.** Un visiteur cherche une adresse en Côte d'Ivoire, la consulte,
la met en favori, demande une réservation. Les établissements s'inscrivent
eux-mêmes, leur fiche passe en modération, puis devient visible.

**Akwaba Shopper.** Un client confie une course réelle à une personne vérifiée :
achats, marché, retrait de colis, démarche administrative. Des shoppers validés
proposent leur prix, le client choisit, la mission est suivie et réglée.

Le lien entre les deux : un voyageur logé dans un hôtel du catalogue peut
demander une course sans quitter l'application.

## 2. Les acteurs

| Rôle | Ce qu'il peut faire |
|---|---|
| Visiteur | Parcourir le catalogue, la carte, les parcours. Rien de plus. |
| Client (`user`) | Publier une course, accepter une offre, payer, noter, ouvrir un litige. |
| Shopper (`runner_profiles`) | Voir le marché, proposer un prix, exécuter, se faire payer, retirer ses gains. |
| Partenaire (`partner`) | Gérer ses fiches et ses demandes de réservation. |
| Modérateur (`moderator`) | Valider les fiches et les shoppers, trancher les litiges, piloter. |
| Administrateur (`admin`) | Tout le précédent, plus les paramètres, les paiements et les retraits. |

Un shopper reste un client : il peut commander une course comme n'importe qui.
Les habilitations sont cumulatives et vérifiées côté base, jamais seulement à
l'écran.

## 3. Le parcours d'une course, étape par étape

### Étape 1, le client décrit sa demande

Écran `/courses/nouvelle`. Il choisit une catégorie, liste ses articles, indique
sa ville et son quartier, saisit son adresse. En choisissant une suggestion
d'adresse, la course est **localisée** : la distance et la durée sont alors
calculées sur un trajet réel entre le centre de la ville et le point de remise,
au lieu d'être saisies au doigt mouillé.

Le devis s'affiche décomposé : base du véhicule, distance, temps, volume,
urgence, remise. Le budget d'achat est présenté séparément, car il revient
intégralement au marchand.

À la publication, `errand_create` prend la main : **le serveur recalcule le
devis**, fixe la commission depuis le barème en vigueur, et tire un code de
remise à quatre chiffres. Le navigateur n'a fixé aucun montant, et n'a jamais vu
le code avant qu'il existe.

### Étape 2, les shoppers se positionnent

Écran `/courses/shopper`. Un shopper validé voit le marché à travers la vue
`open_errands_feed` : titre, catégorie, ville, quartier, montants, urgence.
**Ni l'adresse exacte, ni les notes, ni l'identité du client.** Il propose son
prix et son délai.

### Étape 3, le client choisit

`errand_accept_offer` affecte le shopper, **recalcule** commission, gain et
total depuis le prix accepté, rejette les autres offres et pose le jalon
`accepted_at`. Les coordonnées des deux parties se dévoilent alors mutuellement,
pas avant.

### Étape 4, la mission se déroule

Le shopper avance par `errand_advance_status` : `shopping`, puis `delivering`,
puis `delivered`. Chaque transition est vérifiée, horodatée et journalisée.

Pendant ce temps, deux compteurs tournent :

- **le temps**, depuis le départ effectif (`shopping_at`), et il continue tant
  que la course n'est pas remise ;
- **la distance**, cumulée depuis les positions transmises par le shopper
  (`errand_tracking`), en ignorant les déplacements inférieurs à trente mètres.

Les deux parties voient ces compteurs en regard de l'estimation. Un dépassement
se discute pendant qu'il se produit, il n'est pas découvert sur la facture.

Si le client a choisi d'avancer le budget, il voit le **compte de réception du
shopper**, copie le numéro, transfère, puis déclare le montant envoyé. Le reste
à payer se recalcule.

### Étape 5, la facture

Le shopper saisit le total des achats et dépose le reçu photographié.
`errand_save_invoice` recalcule tout côté serveur :

- le **dépassement** constaté, plafonné à une part du frais de service ;
- la **commission**, sur les frais de service seuls ;
- le **gain** du shopper et le **reste à payer** du client.

Si les achats dépassent le budget annoncé au delà de la tolérance, la course
passe en attente d'un accord explicite du client, au lieu de le mettre devant le
fait accompli.

### Étape 6, la remise

Le client lit son code à quatre chiffres et le donne au shopper **en main
propre**. Le shopper le saisit : sans le bon code, la course ne peut pas passer
en `delivered`. Le reçu est également exigé dès qu'il y a eu des achats.

### Étape 7, la clôture et le paiement du shopper

Le client confirme. `errand_confirm_payment` est idempotente : un double clic
ne règle pas deux fois, et ne renvoie pas d'erreur non plus.

Ce qu'elle fait dépend du **mode de règlement** figé sur la course.

**En règlement direct**, qui est le mode actif aujourd'hui puisque aucun
agrégateur n'encaisse : le client a réglé le shopper de la totalité, donc la
plateforme ne verse rien. Elle inscrit à la charge du shopper la **commission
qu'il lui doit**, et l'expose dans l'écran des règlements. Le shopper la verse
ensuite par le canal convenu, et un membre du personnel constate ce versement,
avec sa référence, ce qui solde la créance.

**En règlement par séquestre**, le jour où un agrégateur encaissera pour le
compte de la plateforme : celle-ci porte le gain net au crédit du shopper, avec
une date de maturité, et conserve sa commission. Après le délai anti-litige,
`wallet_release_matured_earnings` bascule ce gain en solde disponible, que le
shopper peut alors demander en retrait.

Dans les deux cas, la course passe en `completed` et `paid`, et le compteur de
missions du shopper est incrémenté.

Le mode est lu sur le barème **figé à la création de la course**, jamais sur le
barème courant : changer de modèle ne re-liquide pas les missions en vol.

### Étape 8, le retrait

Le shopper demande un retrait. `payout_request_create` vérifie le plancher, le
solde et la propriété du compte, puis **débite sous verrou de ligne** : deux
demandes simultanées ne peuvent pas dépenser le même argent. Un administrateur
traite la demande depuis `/admin/payouts` ; un refus recrédite automatiquement.

### En cas de désaccord

Avant la remise, la course peut être annulée. Après, elle ne peut plus l'être :
le désaccord passe par un **litige**, ce qui laisse une trace et un arbitre.
L'ouverture d'un litige **gèle** les gains, en puisant d'abord dans le solde en
attente puis dans le disponible. Un modérateur tranche depuis `/admin/litiges`,
avec sous les yeux la chronologie complète, les montants et la présence du reçu.

## 4. Le parcours d'un établissement

1. Il s'inscrit par `/partner/signup`. La fonction `register-partner` lui
   attribue le rôle partenaire et crée sa fiche en attente.
2. Un modérateur l'examine et l'approuve depuis `/admin`. La fonction
   `moderate-place` journalise la décision et notifie par courriel.
3. La fiche devient visible dans le catalogue public, sur la carte et dans la
   recherche.
4. Les demandes de réservation arrivent dans son espace.

## 5. Ce qui protège l'argent

Le principe tient en une phrase : **le navigateur ne fixe jamais un montant, un
statut ou un solde.**

| Protection | Mécanisme |
|---|---|
| Montants | Calculés par des fonctions serveur depuis `commission_rules` |
| Écriture directe | Rejetée par des déclencheurs de garde sur `errands`, `runner_profiles`, `errand_offers` |
| Prix d'une offre | Modifiable seulement par le shopper qui l'a proposée, tant qu'elle est en attente |
| Code de remise | Privilège de lecture accordé colonne par colonne, le shopper ne peut pas le lire |
| Solde | Crédité par la clôture seule, débité sous verrou |
| Auto-promotion | Un utilisateur ne peut ni se déclarer shopper validé, ni s'attribuer une note |
| Documents d'identité | Bucket privé, URL signée de cinq minutes, lisible par les seuls modérateurs |
| Actions d'exploitation | Journalisées nominativement dans `audit_logs` |

## 6. Ce que voit l'éditeur

| Écran | Contenu |
|---|---|
| `/admin` | Fiches, demandes, messages, modération, utilisateurs |
| `/admin/pilotage` | Volume, commission due, suppléments, durée moyenne, **écart entre estimé et réalisé**, courses qui ont dérapé |
| `/admin/litiges` | Litiges ouverts, chronologie, montants gelés, arbitrage |
| `/admin/payouts` | Demandes de retrait, traitement, référence de transfert |
| `/admin/shoppers` | Candidatures, validation, suspension |
| `/admin/parametres` | Barème versionné, moyens de paiement, villes ouvertes |

Le barème se publie depuis la console : changer un taux crée une version et
désactive la précédente, si bien que chaque course garde la trace de celui qui
lui était appliqué.

Les moyens de paiement s'activent par un interrupteur. **Les clés d'un
prestataire ne sont jamais stockées en base** : la console enregistre le nom du
secret Supabase qui les porte, car toute valeur inscrite là partirait dans le
navigateur.

## 7. L'application sur téléphone

Installable sur l'écran d'accueil, avec un fonctionnement dégradé mais utile
hors ligne. Les ressources versionnées sont servies depuis le cache, la
navigation retombe sur la coquille en cas de coupure, et **aucune donnée n'est
jamais mise en cache** : afficher un solde périmé serait pire qu'afficher une
erreur.

Les lectures du catalogue réessaient les défaillances passagères, sans jamais
rejouer une écriture.

## 8. Comptes de démonstration

Le script `scripts/seed-demo-accounts.mjs` crée un compte par profil, avec un
mot de passe commun, pour parcourir l'application dans chaque rôle.

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-accounts.mjs
```

| Compte | Profil |
|---|---|
| `client@example.com` | Client |
| `shopper@example.com` | Shopper validé |
| `shopper-attente@example.com` | Candidature en attente |
| `partenaire@example.com` | Établissement |
| `moderateur@example.com` | Modérateur |
| `admin@example.com` | Administrateur |

Le script refuse de s'exécuter sur une base qui porte déjà des données réelles,
sauf mention explicite.

## 9. Ce qui n'est pas fait

Tout ce qui précède décrit le code du dépôt. Cette section dit ce qui manque
pour que ce code devienne un service. Les points sont classés du plus grave au
moins grave, et aucun n'est arrondi.

### 9.1 Rien n'a jamais tourné contre une base

**Aucune migration du dépôt n'est appliquée en base.** Tant qu'elles ne sont pas
jouées, rien de ce document n'est actif : ni les fonctions serveur, ni les
déclencheurs de garde, ni les privilèges par colonne. Les corrections apportées jusqu'ici ont été vérifiées
par lecture, par typage et par les tests du dépôt, ce qui n'est pas la même
chose que par l'exécution.

La procédure d'application figure dans [EXPLOITATION.md](EXPLOITATION.md),
section 2.

### 9.2 Le règlement est direct, et la commission est une créance

Ce point a longtemps été un défaut, et il est utile de dire lequel : la
plateforme créditait le portefeuille du shopper alors qu'elle n'avait rien
encaissé, puis lui versait ce solde par virement. Le shopper encaissait donc
deux fois, une fois du client et une fois de la plateforme. Sur une course à
2 000 francs de frais et 300 francs de commission, l'éditeur ne gagnait pas
300 francs, il perdait 1 700 francs.

Le sens de la dette a été rétabli. Puisque le client règle le shopper
directement, c'est le shopper qui **doit** sa commission à la plateforme. Le
portefeuille cesse d'être une créance du shopper pour devenir le compte de ce
qu'il doit, et l'écran des règlements montre ce qu'il reste à encaisser, par
shopper, avec le moyen de constater chaque versement.

Le mode est explicite (`direct` ou `escrow`) et porté par le barème, non inscrit
en dur dans une fonction. C'est précisément le caractère implicite de l'ancien
modèle qui a rendu son inversion invisible aussi longtemps. Brancher un
agrégateur un jour se fera en publiant un barème en mode séquestre, sans
réécrire le moteur.

### 9.3 Aucune passerelle de paiement n'est branchée

Il n'y a dans le dépôt ni agrégateur, ni webhook, ni encaissement automatique.
Les structures existent et la console permet de déclarer les fournisseurs, mais
les transferts se font de compte à compte, avec preuve déposée. Aucun bouton ne
prétend qu'un paiement a eu lieu sans transaction réelle, et c'est délibéré.

Conséquence à connaître au support : lorsqu'un litige est tranché en faveur du
client, l'état passe à « remboursée » mais **aucun argent ne part**. Le
remboursement effectif se fait hors application. Voir
[EXPLOITATION.md](EXPLOITATION.md), section 9.

### 9.4 Le moteur monétaire n'a aucun test exécuté

Les tests d'intégration PL/pgSQL existent mais sont ignorés faute de base de
test accessible. Ils ne couvrent d'ailleurs ni la maturation des gains, ni le
pourboire, ni la cohérence entre le journal du portefeuille et les soldes. Les
tests qui passent portent sur le calcul du devis, le rendu des écrans et la
cohérence des migrations.

### 9.5 Aucune notification hors application

Ni courriel ni message pour prévenir qu'une offre est arrivée, qu'une course
attend une confirmation, qu'un gain est disponible ou qu'un litige a été
tranché. Une seule fonction d'envoi existe, `test-email`, déclenchée à la main
depuis la console d'administration, et elle passe par un expéditeur de bac à
sable qui ne convient pas à un envoi réel.

Les douze événements à couvrir et ce que suppose leur branchement sont listés
dans [EXPLOITATION.md](EXPLOITATION.md), section 8.

### 9.6 Le canal de support et la remontée d'erreur sont préparés, pas ouverts

Un utilisateur n'a toujours aucun moyen de signaler un problème depuis
l'application, et les pages légales portent encore la mention « À compléter :
adresse de contact ».

Deux pièces existent désormais : un composant de lien de support qui ne
s'affiche que si une adresse est configurée, et une référence d'incident au
format `AKW-XXXX-XXXX` produite au moment de l'erreur. Il reste à renseigner
l'adresse, décision de l'éditeur, et à poser ces deux pièces sur les écrans.
Voir [EXPLOITATION.md](EXPLOITATION.md), sections 6 et 7.

### 9.7 Les substitutions d'articles ne sont pas modélisées

Quand un article est introuvable ou plus cher, l'échange se fait dans la
conversation, sans décision tracée ligne par ligne.
