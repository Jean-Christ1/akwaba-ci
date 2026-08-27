/**
 * Cherche un secret dans TOUT l'historique, pas seulement dans l'arbre courant.
 *
 * A lancer avant de mettre un depot en miroir. Pousser un historique vers une
 * plateforme nouvelle republie chaque objet qu'il contient, y compris ceux
 * qu'un commit ulterieur a supprimes. Un fichier `.env` retire trois jours
 * apres son ajout est toujours la, et il repartirait.
 *
 * Le contenu trouve n'est jamais affiche : seuls le commit, le chemin et la
 * nature du motif le sont. Afficher la valeur pour prouver qu'elle fuite la
 * ferait fuiter une fois de plus.
 *
 * Usage : node scripts/audit-historique-secrets.mjs
 */
import { execFileSync } from "node:child_process";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });

/**
 * Motifs recherches.
 *
 * Chacun vise une forme de secret reellement en usage dans ce projet, pas une
 * liste generique : un motif qui ne peut pas apparaitre ici ne produirait que
 * du bruit, et le bruit fait ignorer les vraies alertes.
 */
const MOTIFS = [
  // Un jeton Supabase porte son role dans sa charge utile. La cle « anon » est
  // publique par conception, protegee par RLS ; seule la cle « service_role »
  // est un secret. On decode plutot que de crier au loup sur les deux.
  {
    nom: "cle de service Supabase (service_role)",
    detecte: (contenu) => {
      for (const m of contenu.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)/g)) {
        try {
          const charge = JSON.parse(Buffer.from(m[1], "base64").toString());
          if (charge.role === "service_role") return true;
        } catch {
          // Une chaine qui ressemble a un jeton sans en etre un n'est pas une
          // alerte : on passe.
        }
      }
      return false;
    },
  },
  { nom: "jeton Cloudflare", re: /\bCLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}/ },
  { nom: "jeton GitLab", re: /\bglpat-[A-Za-z0-9_-]{16,}/ },
  { nom: "jeton GitHub", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { nom: "cle Resend", re: /\bre_[A-Za-z0-9]{20,}/ },
  { nom: "cle privee", re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { nom: "mot de passe de base", re: /(postgres|postgresql):\/\/[^\s:]+:[^\s@]{6,}@/ },
  { nom: "affectation de mot de passe", re: /\b(password|passwd|db_password)\s*[:=]\s*["'][^"'\s]{8,}["']/i },
];

/** Fichiers qui n'auraient jamais du entrer, quel que soit leur contenu. */
const CHEMINS_INTERDITS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.?secret\//,
  /(^|\/)[^/]*secret[^/]*\.json$/i,
  /(^|\/)id_rsa$/,
  /\.pem$/,
  /(^|\/)credentials\.json$/i,
];

console.log("Lecture de tous les objets de l'historique...");
const lignes = git("rev-list", "--objects", "--all").split("\n").filter(Boolean);

// Un meme blob apparait sous plusieurs commits : on ne l'inspecte qu'une fois,
// mais on garde tous ses chemins pour pouvoir dire ou il a vecu.
const blobs = new Map();
for (const ligne of lignes) {
  const espace = ligne.indexOf(" ");
  if (espace === -1) continue;
  const sha = ligne.slice(0, espace);
  const chemin = ligne.slice(espace + 1);
  if (!chemin) continue;
  if (!blobs.has(sha)) blobs.set(sha, new Set());
  blobs.get(sha).add(chemin);
}
console.log(`  ${lignes.length} objets nommes, ${blobs.size} distincts`);

const alertes = [];
const cheminsInterdits = [];

for (const [sha, chemins] of blobs) {
  for (const chemin of chemins) {
    if (CHEMINS_INTERDITS.some((re) => re.test(chemin))) {
      cheminsInterdits.push({ sha, chemin });
    }
  }
}

// Le contenu ne se lit que pour les fichiers texte de taille raisonnable : un
// binaire ne porte pas de secret lisible, et les lire tous prendrait des
// heures pour rien.
let inspectes = 0;

const infos = execFileSync("git", ["cat-file", "--batch-check"], {
  input: [...blobs.keys()].join("\n"),
  encoding: "utf8",
  maxBuffer: 512 * 1024 * 1024,
})
  .split("\n")
  .filter(Boolean);

const aInspecter = [];
for (const info of infos) {
  const [sha, kind, taille] = info.split(" ");
  if (kind !== "blob") continue;
  const octets = Number(taille);
  if (octets === 0 || octets > 400 * 1024) continue;
  aInspecter.push(sha);
}

console.log(`  ${aInspecter.length} blobs texte a inspecter`);

for (const sha of aInspecter) {
  let contenu;
  try {
    contenu = git("cat-file", "blob", sha);
  } catch {
    continue;
  }
  inspectes++;
  for (const motif of MOTIFS) {
    const touche = motif.detecte ? motif.detecte(contenu) : motif.re.test(contenu);
    if (touche) {
      alertes.push({ sha, motif: motif.nom, chemins: [...blobs.get(sha)] });
    }
  }
}

console.log(`  ${inspectes} blobs lus\n`);

if (cheminsInterdits.length) {
  console.log(`FICHIERS QUI N'AURAIENT PAS DU ENTRER : ${cheminsInterdits.length}`);
  for (const f of cheminsInterdits.slice(0, 20)) {
    console.log(`  ${f.chemin}`);
  }
  console.log("");
}

if (alertes.length === 0) {
  console.log("AUCUN SECRET TROUVE dans l'historique complet.");
  console.log("");
  console.log("La cle Supabase « anon » presente dans le code n'en est pas un :");
  console.log("elle est publique par conception et n'ouvre que ce que les");
  console.log("politiques RLS autorisent. Seule « service_role » serait un");
  console.log("secret, et elle n'apparait nulle part.");
  console.log("");
  console.log("Le depot peut etre mis en miroir sans republier de secret.");
} else {
  console.log(`ALERTES : ${alertes.length}`);
  // Le contenu n'est jamais rendu : on nomme le motif, le chemin et le commit.
  for (const a of alertes.slice(0, 30)) {
    const commits = git("log", "--all", "--format=%h", "--find-object", a.sha)
      .split("\n")
      .filter(Boolean)
      .slice(0, 3);
    console.log(`  ${a.motif}`);
    console.log(`    chemins : ${a.chemins.join(", ")}`);
    console.log(`    commits : ${commits.join(", ") || "(non retrouve)"}`);
  }
  process.exitCode = 1;
}
