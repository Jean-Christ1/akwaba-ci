/**
 * Ce que Twilio sait deja de nous.
 *
 * A lancer avant toute configuration : creer une cle ou un expediteur la ou il
 * en existe deja se defait mal, et le compte peut etre en essai, auquel cas les
 * regles d'envoi ne sont pas les memes.
 *
 * Aucun secret n'est affiche : seuls les identifiants publics, les noms et les
 * etats le sont.
 *
 * Usage : node scripts/twilio-etat.mjs
 */
import { lireCoffre, twilio, twilioMessaging } from "./lib/twilio.mjs";

const coffre = lireCoffre();

/** Interroge sans s'arreter : une ressource refusee est une information. */
const essayer = async (libelle, appel) => {
  try {
    return { ok: true, valeur: await appel() };
  } catch (e) {
    return { ok: false, message: String(e.message), status: e.status, libelle };
  }
};

// --- Le compte ---------------------------------------------------------------
const compte = await twilio("");
console.log(`compte    : ${compte.friendly_name}`);
console.log(`  statut  : ${compte.status}`);
console.log(`  type    : ${compte.type}`);

const essai = compte.type === "Trial";
if (essai) {
  console.log("");
  console.log("  COMPTE D'ESSAI. Trois consequences qui commandent tout le reste :");
  console.log("   1. l'API des cles est refusee : on ne peut ni creer ni lister de cle ;");
  console.log("   2. WhatsApp passe par le bac a sable, dont le numero est partage ;");
  console.log("   3. chaque destinataire doit rejoindre le bac a sable avant de recevoir.");
}

const solde = await essayer("solde", () => twilio("/Balance.json"));
if (solde.ok) console.log(`  solde   : ${solde.valeur.balance} ${solde.valeur.currency}`);

// --- Cles d'API --------------------------------------------------------------
const cles = await essayer("cles", () => twilio("/Keys.json"));
if (cles.ok) {
  console.log(`\ncles d'API (${cles.valeur.keys?.length ?? 0}) :`);
  for (const k of cles.valeur.keys ?? []) {
    const marque =
      k.sid === coffre.api_key_console?.sid
        ? " (console)"
        : k.sid === coffre.api_key_application?.sid
          ? " (application)"
          : "";
    console.log(`  ${k.sid}  ${(k.friendly_name || "sans nom").padEnd(24)}${marque}`);
  }
} else {
  console.log(`\ncles d'API : non listables (${cles.status ?? "?"})`);
  if (cles.message.includes("20003")) {
    console.log("  L'API des cles demande un compte payant. La cle creee a la main dans la");
    console.log("  console reste la seule disponible, et elle suffit a envoyer.");
  }
}

// --- Numeros -----------------------------------------------------------------
const numeros = await essayer("numeros", () => twilio("/IncomingPhoneNumbers.json"));
const liste = numeros.ok ? (numeros.valeur.incoming_phone_numbers ?? []) : [];
console.log(`\nnumeros du compte : ${liste.length}`);
for (const n of liste) {
  const cap = Object.entries(n.capabilities ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  console.log(`  ${n.phone_number.padEnd(18)} ${n.friendly_name}  [${cap}]`);
}
if (liste.length === 0) {
  console.log("  Aucun numero achete. Le bac a sable WhatsApp n'y figure jamais :");
  console.log("  il partage le +14155238886 avec tous les comptes d'essai.");
}

// --- Services de messagerie --------------------------------------------------
const services = await essayer("services", () => twilioMessaging("/Services"));
if (services.ok) {
  console.log(`\nservices de messagerie : ${services.valeur.services?.length ?? 0}`);
  for (const s of services.valeur.services ?? []) {
    console.log(`  ${s.sid}  ${s.friendly_name}`);
  }
} else {
  console.log(`\nservices de messagerie : non lisibles (${services.status ?? "?"})`);
}

// --- La cle de la console sait-elle travailler ? -----------------------------
//
// C'est la seule question qui compte : une cle qu'on ne peut pas lister mais
// qui fonctionne fait le travail. On interroge une ressource anodine sous son
// identite plutot que d'expedier un message pour le savoir.
console.log("\nla cle de la console est-elle utilisable ?");
if (coffre.api_key_console?.sid && coffre.api_key_console?.secret) {
  const cle = { sid: coffre.api_key_console.sid, secret: coffre.api_key_console.secret };
  const essaiCle = await essayer("cle", () => twilio("/Messages.json?PageSize=1", { cle }));
  if (essaiCle.ok) {
    console.log(`  oui : ${essaiCle.valeur.messages?.length ?? 0} message(s) au compte, lecture acceptee`);
  } else {
    console.log(`  non : ${essaiCle.message.slice(0, 150)}`);
  }
} else {
  console.log("  aucune cle au coffre");
}

// --- Ce que le coffre porte --------------------------------------------------
console.log("\ncoffre :");
console.log(`  cle application     : ${coffre.api_key_application?.sid ?? "ABSENTE"}`);
console.log(`  expediteur WhatsApp : ${coffre.whatsapp?.expediteur ?? "non renseigne"}`);
console.log(`  service de messagerie : ${coffre.messaging_service_sid ?? "non renseigne"}`);
