# La gouvernance des accès

Ce document décrit qui peut quoi dans Akwaba, d'où vient chaque droit, comment
l'accorder, comment le retirer, et comment vérifier que ce que la console
affiche correspond à ce que le serveur applique.

Il est écrit pour être suivi par quelqu'un qui n'a pas écrit le code, et pour
être opposable : chaque geste décrit ici laisse une trace nominative dans le
journal d'audit.

---

## 1. Les trois sources d'un droit

Une personne détient un droit par l'un de ces trois chemins, et par aucun autre.

| Source | D'où cela vient | Comment on le retire |
|---|---|---|
| `role` | Un rôle attribué dans `staff_assignments`, qui porte des droits via `role_permissions`. | Retirer le rôle, ou retirer le droit du rôle. |
| `nominative` | Une exception écrite dans `user_permissions` pour cette personne seule. | Retirer l'exception. |
| `secours` | Le rôle hérité `admin` de `user_roles`, qui ouvre tout. | Ni l'un ni l'autre. Voir la section 6. |

L'écran **Droits d'une personne** affiche la source de chaque droit détenu.
C'est la seule façon de le retirer du premier coup : retirer le rôle d'une
personne qui tient le droit par une exception nominative ne change rien, et la
console continuera d'afficher le droit comme accordé.

Un retrait nominatif prime sur tout, y compris sur le rôle. C'est ce qui permet
de fermer une porte à une personne précise sans démonter son rôle.

---

## 2. Ce que la matrice gouverne réellement

Le principe est simple et il a été vérifié : **un droit du catalogue doit ouvrir
une porte réelle**. Un droit que rien ne consulte s'affiche « accordé » dans la
console et n'ouvre rien, ce qui trompe dans les deux sens. Celui à qui on
l'accorde se croit habilité et se fait refuser à l'usage ; celui qui l'accorde
croit avoir donné quelque chose de précis alors que l'accès réel passait par un
rôle hérité qu'il n'a pas regardé.

La fonction `droits_jamais_consultes()` liste les droits qu'aucune politique ni
aucune fonction ne consulte. Elle doit rendre zéro ligne, et
`scripts/audit-securite-base.mjs --strict` fait échouer la chaîne d'intégration
si un droit sensible réapparaît dans cette liste.

À ce jour : **35 droits au catalogue, 35 portes**.

### La portée compte autant que le droit

Treize droits sont déclarés « restreignables à une ou plusieurs villes ».
Onze ne restreignaient rien : le contrôle appelait `has_permission`, qui répond
oui sans regarder où. Un responsable recruté pour ouvrir Bouaké tranchait donc
les litiges d'Abidjan et validait les shoppers de Yamoussoukro.

`portees_qui_ne_restreignent_pas()` liste les droits dont la restriction est
annoncée et jamais appliquée. Elle doit rendre zéro ligne, et l'audit strict le
vérifie.

Deux pièges rencontrés, qui valent d'être connus :

- **Consulter un droit ne suffit pas.** `courses.corriger` était bien consulté
  par la garde des colonnes, mais la politique de modification exigeait
  toujours un rôle hérité. Le personnel n'atteignait jamais la ligne, et la
  modification ne touchait rien, sans message d'erreur. La politique ouvre la
  ligne, la garde décide des colonnes : les deux sont nécessaires.
- **Une trace peut bloquer un geste.** `log_audit` exigeait un rôle hérité. Un
  modérateur de la matrice tranchait un litige et échouait à la dernière ligne,
  celle qui écrit la trace, avec un message parlant du journal d'audit.

---

## 3. Accorder un accès

Écran : `/admin/permissions`, onglet **Droits d'une personne**.

1. Identifier la personne. L'onglet **Comptes** la retrouve par son adresse
   courriel, son nom, son téléphone ou son identifiant. La recherche
   d'exploitation de `/admin` ne lit pas les adresses : elle ne voit que ce que
   le navigateur a le droit de lire.
2. Choisir le rôle le plus étroit qui couvre le besoin, jamais `super_admin`
   par commodité.
3. Restreindre la portée quand elle a un sens. Un responsable recruté pour
   ouvrir une ville n'a pas besoin des autres. La restriction se pose sur la
   ville, et `mon_perimetre()` la fait respecter côté serveur.
4. Poser une échéance quand l'accès est temporaire. Un droit prêté le temps
   d'un congé se referme alors tout seul, ce qu'aucune revue ne garantit.
5. Écrire le motif. Il est obligatoire pour un droit sensible, et il sera lu
   dans un an par quelqu'un qui se demandera pourquoi cet accès existe.

### Le confinement

Personne ne peut accorder plus que ce qu'il détient lui-même. Le serveur le
refuse, dans les deux sens : ni accorder un droit qu'on n'a pas, ni retirer le
droit de quelqu'un de plus habilité. Un administrateur de ville ne se fabrique
pas un accès financier, et ne neutralise pas sa hiérarchie en lui retirant son
rôle.

---

## 4. Retirer un accès, et la revue

Onglet **Revue**.

Un droit s'accorde en trois secondes et se retire rarement, parce que rien ne le
rappelle. La revue liste les accès qu'aucun relecteur n'a confirmés depuis trois
mois pour les droits sensibles, un an pour les autres.

Confirmer un accès dit « je l'ai regardé et il reste justifié ». Le geste est
tracé nominativement. La revue ne retire rien toute seule : fermer un accès
sensible parce que personne ne l'a relu couperait la console à quelqu'un un
dimanche, sans que personne comprenne pourquoi.

Un accès à échéance n'y figure pas : il se referme de lui-même.

---

## 5. Suspendre un compte

Onglet **Comptes**. Droit requis : `utilisateurs.suspendre`.

Suspendre **ferme l'accès, cela n'efface rien**. Le compte garde ses données et
continue de consulter ce qui le concerne, ce qui lui permet de contester. Il ne
publie simplement plus de course. Une suspension se lève, un effacement non.

Le serveur refuse quatre choses, et la recette
`scripts/recette-suspension-compte.mjs` le prouve contre la vraie base :

- suspendre sans motif écrit ;
- se suspendre soi-même, ce qui fermerait la console à celui qui le fait sans
  moyen de revenir en arrière ;
- suspendre un compte qui attribue les droits quand on ne le peut pas
  soi-même, ce qui serait la même escalade que lui retirer son rôle ;
- lever sa propre suspension. Les colonnes de suspension ne sont accordées ni
  en écriture ni en insertion au client : un `UPDATE` sur son propre profil ne
  les atteint pas.

Les deux gestes, suspension et réactivation, sont tracés avec leur auteur et
leur motif.

---

## 6. L'accès de secours

Le rôle hérité `admin` de `user_roles` ouvre tout, sans figurer dans la matrice.
Il reste, parce que se fermer soi-même la console sans moyen de la rouvrir
serait pire que le risque qu'il porte.

Il n'est pas invisible pour autant :

- `permissions_effectives()` le rend avec la source `secours` ;
- l'onglet **Réconciliation** compare ce que la matrice annonce et ce que le
  serveur applique ;
- l'indicateur **Accès de secours seuls** de l'en-tête compte les personnes qui
  ne tiennent leurs droits que par là, et passe au rouge dès qu'il y en a ;
- l'audit signale un accès de secours sans rôle correspondant dans la matrice.

La bonne pratique est de donner à ces personnes un rôle explicite, pour que
l'accès de secours ne soit plus le seul chemin.

---

## 7. Écrire à un compte

Onglet **Comptes**, bouton **Écrire**. Droit requis : `notifications.envoyer`.

Le message part de la plateforme et non de la messagerie personnelle de celui
qui écrit. Il existe donc quelque part le jour où la personne conteste ce qu'on
lui a dit.

Le canal est choisi par le routage habituel : WhatsApp et SMS seulement si la
personne les a acceptés, sinon courriel. Le canal retenu est annoncé à
l'expéditeur, pour qu'il n'attende pas une réponse immédiate à un courriel.

---

## 8. Gérer une organisation

Droit requis : `organisations.gerer`.

Une organisation se crée et se gouverne toute seule tant que son responsable est
là. Quand il part, elle est bloquée : plus personne ne renouvelle le code
d'adhésion, plus personne ne corrige un courriel de contact devenu faux.

Le personnel qui détient ce droit corrige les coordonnées et renouvelle le code.
Il ne devient pas membre et ne voit pas ce que les membres échangent.

---

## 9. Vérifier que tout cela est vrai

Ces commandes se lancent depuis le poste d'exploitation, avec les variables de
connexion à la base chargées dans la session. Les recettes travaillent dans une
transaction annulée : elles ne laissent rien derrière elles.

| Commande | Ce qu'elle prouve |
|---|---|
| `node scripts/audit-securite-base.mjs --strict` | Douze classes de défauts déjà rencontrées, dont les droits sensibles que rien ne consulte. |
| `node scripts/recette-gouvernance-acces.mjs` | Confinement, portées, échéances, revue, réconciliation. |
| `node scripts/recette-suspension-compte.mjs` | La suspension, ses quatre refus, l'annuaire des comptes. |
| `node scripts/recette-droits-vivants.mjs` | Les lieux, l'envoi d'un message, la gestion d'une organisation, et qu'aucun droit du catalogue n'est mort. |
| `node scripts/recette-portee-par-ville.mjs` | Une personne restreinte à une ville passe chez elle et se fait refuser ailleurs, sur les treize droits concernés. |

Les cinq tournent dans la chaîne d'intégration à chaque poussée.

---

## 10. Ce que ce document ne couvre pas

- La création du tout premier administrateur, décrite dans
  `docs/EXPLOITATION.md`.
- Les rôles applicatifs `client`, `shopper` et `partner`, qui décrivent ce
  qu'une personne fait sur la plateforme et non ce qu'elle administre.
- L'effacement d'un compte au titre du RGPD, qui n'est pas une suspension et
  suit une procédure distincte.
