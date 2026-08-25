import { Link } from "react-router-dom";

import { usePageTitle } from "@/shared/hooks/usePageTitle";

/**
 * Pages légales.
 *
 * Une plateforme qui met en relation des particuliers, fait circuler de
 * l'argent et collecte des pièces d'identité ne peut pas se lancer sans dire
 * qui elle est, ce qu'elle fait des données, et qui répond de quoi. Ces textes
 * sont volontairement écrits en langage clair.
 *
 * Les mentions marquées comme à compléter attendent des informations que seule
 * l'entreprise détient : elles sont signalées comme telles plutôt que
 * remplies par des valeurs inventées.
 */

const MAJ = "13 août 2026";

function Cadre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="akw-container max-w-3xl py-8">
      <Link to="/" className="text-sm text-primary">
        Retour à l'accueil
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">{titre}</h1>
      <p className="mt-1 text-xs text-muted-foreground">Dernière mise à jour : {MAJ}</p>
      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold">{titre}</h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}

function AComplete({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent-foreground">
      [À compléter : {children}]
    </span>
  );
}

export function TermsPage() {
  usePageTitle(
    "Conditions générales",
    "Les règles d'utilisation d'Akwaba, du service de découverte et du service Akwaba Shopper."
  );

  return (
    <Cadre titre="Conditions générales d'utilisation">
      <Section titre="Qui nous sommes">
        <p>
          Akwaba est une plateforme ivoirienne qui poursuit deux objets : présenter une sélection
          d'adresses en Côte d'Ivoire, et mettre en relation des clients avec des shoppers vérifiés
          chargés d'exécuter des courses.
        </p>
        <p>
          Éditeur : <AComplete>raison sociale, forme juridique, capital, registre du commerce, siège</AComplete>.
          Directeur de la publication : <AComplete>nom</AComplete>.
        </p>
        <p>
          Hébergement : l'application est publiée par <strong>Cloudflare Pages</strong>
          (Cloudflare, Inc., États-Unis) et les données sont hébergées par
          <strong> Supabase</strong> (Supabase, Inc., États-Unis), dont l'infrastructure de
          base de données est située dans la région déclarée pour ce projet.
        </p>
      </Section>

      <Section titre="Ce qu'Akwaba fait, et ce qu'Akwaba ne fait pas">
        <p>
          Akwaba est un intermédiaire. Nous mettons en relation, nous encadrons le déroulement de la
          mission et nous conservons les preuves échangées. Nous ne sommes ni le vendeur des produits
          achetés, ni l'employeur du shopper.
        </p>
        <p>
          Le shopper exerce en toute indépendance. Il choisit les missions qu'il accepte et
          n'est lié à Akwaba par aucun contrat de travail.
        </p>
      </Section>

      <Section titre="Compte et vérification">
        <p>
          La création d'un compte suppose des informations exactes. Devenir shopper suppose en outre
          la transmission d'une pièce d'identité, examinée par un modérateur avant toute activation.
          Un compte peut être suspendu en cas de manquement, notamment en cas de fausse déclaration
          ou de comportement mettant en danger un utilisateur.
        </p>
      </Section>

      <Section titre="Prix, commission et paiement">
        <p>
          Le prix d'une course se décompose en un budget d'achat, qui revient intégralement au
          marchand, et des frais de service, qui rémunèrent le shopper. Akwaba prélève une commission
          sur les seuls frais de service. L'argent des achats n'est jamais commissionné.
        </p>
        <p>
          Le devis affiché avant publication est calculé par nos serveurs à partir d'un barème
          public. La facture définitive est établie sur la base des achats réellement effectués,
          justifiés par un reçu.
        </p>
        <p>
          Modalités de règlement en vigueur : <strong>aucun prestataire de paiement
          n'intervient</strong>. Le client règle directement le shopper, en espèces ou par
          mobile money, de la main à la main. Akwaba ne détient à aucun moment les fonds des
          courses : la plateforme facture au shopper une commission sur les seuls frais de
          service, jamais sur le prix des achats. Le montant dû par le shopper est visible dans
          son portefeuille.
        </p>
      </Section>

      <Section titre="Déroulement d'une course">
        <p>
          Le client publie sa demande, les shoppers proposent leur prix, le client choisit. La
          remise se confirme par un code à quatre chiffres, communiqué par le client au shopper au
          moment de la remise en main propre. Ce code est la preuve que la mission a bien été
          accomplie.
        </p>
      </Section>

      <Section titre="Annulation, litige et remboursement">
        <p>
          Une course peut être annulée tant qu'elle n'a pas été livrée. Une fois la remise faite,
          le désaccord se règle par l'ouverture d'un litige, que tranche un modérateur. Les gains du
          shopper sont gelés pendant l'instruction.
        </p>
        <p>
          Akwaba ne détenant pas les fonds, elle ne procède pas elle-même à un remboursement.
          Ce que le modérateur tranche est l'issue de la course : soit elle est due au shopper,
          soit elle est annulée sans versement, soit elle est réglée en faveur du client. La
          décision, son motif et son auteur sont inscrits au journal, et les sommes
          éventuellement retenues sur le portefeuille du shopper suivent cette décision. Le
          remboursement de l'argent des achats se règle entre le client et le shopper, la
          plateforme fournissant les preuves : reçu, liste des articles, journal de la course.
        </p>
      </Section>

      <Section titre="Ce qui est interdit">
        <p>
          Sont notamment proscrits : confier une course portant sur des produits illicites, demander
          à un shopper d'accomplir un acte illégal, fournir une fausse identité, contourner la
          plateforme pour échapper à la commission, et tout comportement injurieux ou discriminatoire.
        </p>
      </Section>

      <Section titre="Responsabilité">
        <p>
          Akwaba répond du bon fonctionnement de la plateforme et de la conservation des preuves.
          La bonne exécution matérielle de la course relève du shopper, et la conformité des
          produits relève du marchand. En cas de manquement caractérisé, notre responsabilité
          s'apprécie dans les limites fixées par le droit ivoirien.
        </p>
      </Section>

      <Section titre="Droit applicable">
        <p>
          Les présentes conditions sont régies par le droit ivoirien. Tout différend fera d'abord
          l'objet d'une recherche de solution amiable auprès de notre support.
        </p>
      </Section>
    </Cadre>
  );
}

export function PrivacyPage() {
  usePageTitle(
    "Politique de confidentialité",
    "Quelles données Akwaba collecte, pourquoi, combien de temps, et quels sont vos droits."
  );

  return (
    <Cadre titre="Politique de confidentialité">
      <Section titre="Notre principe">
        <p>
          Nous ne collectons que ce qui sert à faire fonctionner le service, et nous le disons.
          Aucune donnée n'est vendue à un tiers.
        </p>
      </Section>

      <Section titre="Ce que nous collectons">
        <p>
          Pour tout compte : adresse électronique, nom d'affichage, et le cas échéant numéro de
          téléphone. Pour une course : l'adresse de remise, les articles demandés, vos échanges avec
          le shopper et les preuves déposées. Pour un shopper : en plus, une pièce d'identité, une
          zone d'activité et un compte de réception des gains.
        </p>
      </Section>

      <Section titre="Qui voit quoi">
        <p>
          Vos coordonnées ne sont révélées au shopper qu'une fois la course attribuée, et
          réciproquement. Avant l'attribution, un shopper qui consulte le marché voit la ville et le
          quartier, jamais votre adresse exacte ni vos notes.
        </p>
        <p>
          Une pièce d'identité n'est accessible qu'à son titulaire et aux modérateurs qui
          instruisent la candidature. Elle est stockée dans un espace privé, jamais accessible par
          une adresse publique.
        </p>
      </Section>

      <Section titre="Combien de temps">
        <p>
          Les données d'une course sont conservées le temps nécessaire au traitement d'un éventuel
          litige et au respect de nos obligations comptables.
        </p>
        <p>
          Concrètement : vos données personnelles vivent tant que votre compte existe. Le jour
          où vous le supprimez, votre profil, votre dossier de shopper, vos comptes de
          réception, votre portefeuille, vos favoris et vos messages sont effacés
          immédiatement. Vos courses terminées restent dans nos écritures comptables, sans votre
          nom : elles ne portent plus que des montants et des dates.
        </p>
        <p>
          Aucune purge automatique n'est en place à ce jour : nous ne supprimons rien de nous
          mêmes avant votre demande. Nous préférons vous le dire plutôt que d'annoncer une durée
          que nous n'appliquerions pas.
        </p>
      </Section>

      <Section titre="Vos droits">
        <p>
          Vous pouvez demander l'accès à vos données, leur rectification, leur suppression, ou vous
          opposer à certains traitements. La suppression d'un compte entraîne celle des données
          associées, sauf ce que la loi nous impose de conserver.
        </p>
        <p>
          <strong>La suppression s'exerce directement</strong>, depuis l'onglet « Compte » de
          votre profil. Elle est refusée tant qu'une course est en cours, qu'une commission
          reste due ou qu'un retrait est en traitement : l'écran vous dit alors précisément ce
          qui l'empêche, pour que rien ne disparaisse avec de l'argent en suspens.
        </p>
        <p>
          Pour une demande d'accès, de rectification ou d'opposition, écrivez-nous par le canal
          de support de l'application. Vous
          pouvez également saisir l'autorité ivoirienne de protection des données.
        </p>
      </Section>

      <Section titre="Traceurs">
        <p>
          L'application n'utilise pas de traceur publicitaire. Le stockage local du navigateur sert
          uniquement à retenir vos favoris hors connexion et vos préférences d'affichage.
        </p>
      </Section>
    </Cadre>
  );
}

export default TermsPage;
