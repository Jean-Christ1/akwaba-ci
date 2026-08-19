# Journal des décisions

Décisions structurantes prises pendant les travaux, avec leur raison. Une
décision inscrite ici ne se rediscute pas sans motif nouveau.

## 2026-08-13, base commissionnable : le frais de service seul

**Contexte.** Trois sources de vérité contradictoires coexistaient : 0,15 dans
`pricing.ts`, 0,10 dans `domain.ts`, et 0,10 en valeur par défaut SQL. Les bases
de calcul divergeaient aussi, l'une commissionnant le frais de service, l'autre
le service plus la livraison.

**Décision.** Taux unique de 0,15 appliqué au **frais de service seul**, stocké
dans la table versionnée `commission_rules`.

**Raison.** L'argent des achats appartient au marchand et ne peut pas être
commissionné sans tromper le client. Les frais de livraison reviennent à celui
qui livre. Le commentaire d'origine de `pricing.ts` énonçait déjà cette règle,
c'est le code qui s'en écartait.

**À valider.** Le taux de 0,15 est repris de l'existant. Il reste un arbitrage
commercial : il se change désormais en base, sans toucher au code.

## 2026-08-13, autorité serveur sur l'argent et les états

**Contexte.** Les politiques de mise à jour n'avaient aucune garde de colonne.
Un participant pouvait fixer les montants, la commission et passer une course en
« payée » d'un simple appel client.

**Décision.** Toute opération touchant un montant, un statut, une affectation ou
un solde passe par une fonction `SECURITY DEFINER`. Des déclencheurs rejettent
l'écriture directe des colonnes sensibles. Le client ne pilote plus que le
contenu éditorial de sa course.

**Raison.** Une garde d'interface est cosmétique : la clé anon est publique, donc
tout appel direct est possible. Seul le serveur peut faire autorité.

## 2026-08-13, le fichier .env reste versionné

**Contexte.** Le backlog prévoyait de retirer `.env` du suivi git.

**Décision.** Il reste versionné pour l'instant. Un `.env.example` documenté est
ajouté, et le README avertit explicitement que toute variable `VITE_` finit dans
le bundle.

**Raison.** La vérification a établi que ce fichier ne contient que la clé
publishable, de rôle `anon`, publique par conception et de toute façon présente
dans le bundle. Aucun secret serveur n'y transite : `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY` et `BOOTSTRAP_ADMIN_TOKEN` sont lus par les fonctions edge
depuis les secrets Supabase. Le retirer du suivi risquerait en revanche de
priver la chaîne de publication Lovable de sa configuration, pour un gain de
sécurité nul.

**Condition de révision.** Dès qu'une variable réellement sensible devrait
figurer dans ce fichier, ou avant toute ouverture publique du dépôt, il faut le
désindexer et couvrir `.env*` dans `.gitignore`.

## 2026-08-13, identifiants de lieux en UUID déterministes

**Contexte.** Le catalogue éditorial utilisait des identifiants `p-001` à
`p-007`, tandis que `leads.place_id` est un `uuid` à clé étrangère. Toute
demande de réservation échouait donc avec une erreur de conversion.

**Décision.** Les lieux portent des UUID déterministes, partagés par la source
éditoriale et la migration de données de démarrage.

**Raison.** Cela répare le seul canal de conversion de la partie Découverte, et
rend les données de démarrage rejouables sans casser les favoris ni les parcours
qui référencent ces identifiants.

## 2026-08-13, confidentialité du marché des courses

**Contexte.** Tout shopper validé lisait l'adresse exacte, les coordonnées et
les notes de chaque course ouverte, avant toute mise en relation.

**Décision.** Le marché ouvert est servi par la vue `open_errands_feed`, qui
expose la ville, la zone et la nature de la mission, mais jamais l'adresse
précise ni l'identité du client. L'adresse complète n'apparaît qu'au shopper
assigné.

**Raison.** Un shopper n'a pas besoin de l'adresse exacte pour décider s'il se
positionne. La divulguer à tout le réseau expose les clients sans contrepartie.

## 2026-08-13, le catalogue public lit la base

**Contexte.** Les écrans de découverte lisaient un tableau figé de sept lieux et
ne requêtaient jamais la table `places`, pourtant alimentée par le parcours
partenaire et la modération. Une fiche approuvée n'atteignait donc jamais les
visiteurs.

**Décision.** Les écrans publics lisent les fiches publiées depuis la base. Le
contenu éditorial d'origine devient une migration de données de démarrage,
générée par script depuis la même source.

**Raison.** Sans cela, le parcours partenaire ne débouchait sur rien, et le
discours du produit sur une sélection tenue à jour n'était pas tenu.

## 2026-08-13, pas d'intégration de paiement tant qu'aucun prestataire n'est validé

**Décision.** Aucune passerelle mobile money n'est branchée. Les structures
existent, les fonctions serveur sont en place, mais aucun bouton ne prétend
qu'un paiement a eu lieu sans transaction réelle.

**Raison.** Le choix du prestataire, la détention des fonds et la politique de
remboursement sont des décisions d'entreprise, pas techniques. Simuler un
paiement réussi serait la faute la plus grave du produit.

**En attente.** Choix de l'agrégateur, modalités de séquestre, politique de
remboursement et de litige.

## 2026-08-19, l'itinéraire s'affiche en place, il n'ouvre plus de page

**Décision.** Le calcul d'itinéraire reste entier, dans `RoutePanel`, ouvert
en vue intégrée par `RouteDialog` depuis la fiche d'un lieu, la carte et les
parcours. La page autonome `/itineraire` est retirée. Les applications
externes, Google Maps et Apple Plans, restent proposées en secours, jamais en
premier.

**Raison.** La page existait, fonctionnait, et aucun lien de l'application ne
la désignait : elle était livrée, chargée et maintenue sans jamais être vue.
Le propriétaire a demandé une vue qui ne fasse pas sortir de l'écran en
cours ; garder les deux formes aurait laissé un doublon de plus.

**Conséquence.** Un contrôle de santé structurelle refuse désormais toute
route qu'aucun lien n'ouvre.

## 2026-08-19, les tâches périodiques sont déclenchées par la base

**Décision.** L'ordonnanceur des courses programmées est appelé par `pg_cron`,
directement sur la fonction PostgreSQL, sans passer par une fonction de
bordure. La file de notifications, elle, passe par la fonction de bordure, qui
détient les clés des fournisseurs, et n'est planifiée que lorsque l'adresse du
projet et le secret partagé sont présents dans le coffre.

**Raison.** Les deux mécanismes étaient complets et n'étaient appelés par
personne. Un détour par HTTP pour une logique déjà transactionnelle en base
n'ajouterait qu'un secret à gérer et un point de panne. Inscrire une adresse
de projet ou un secret dans une migration les mettrait dans l'historique Git
pour de bon.

**En attente.** Application de la migration en production, et dépôt des deux
secrets dans le coffre pour armer l'envoi des notifications.
