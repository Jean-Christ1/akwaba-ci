#!/usr/bin/env node
// Porte de sécurité sur les dépendances. Le compteur brut de npm audit mélange
// l'outillage de développement et ce qui part réellement dans le navigateur :
// seul le second peut atteindre un visiteur, c'est donc lui qui bloque la
// fusion. Les tolérances vivent dans un fichier daté, jamais dans un drapeau
// silencieux passé à npm.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SEVERITES_BLOQUANTES = new Set(["high", "critical"]);
const FICHIER_EXCEPTIONS = new URL("../dependency-audit-exceptions.json", import.meta.url);
const COMMANDE_NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function rapportAudit() {
  const arguments_ = ["audit", "--json", "--omit=dev"];
  try {
    // Sous Windows, npm est un script .cmd : il ne se lance qu'à travers le
    // shell. Les arguments sont des constantes, il n'y a rien à injecter ici.
    const sortie = execFileSync(COMMANDE_NPM, arguments_, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === "win32",
    });
    return JSON.parse(sortie);
  } catch (erreur) {
    // npm audit sort en code non nul dès qu'il trouve quelque chose. Le rapport
    // reste écrit sur la sortie standard, et c'est lui qui nous intéresse.
    if (typeof erreur.stdout === "string" && erreur.stdout.trim().startsWith("{")) {
      return JSON.parse(erreur.stdout);
    }
    throw erreur;
  }
}

function identifiantAvis(via) {
  const dernierSegment = String(via.url ?? "").split("/").pop();
  return dernierSegment || `source-${via.source}`;
}

function main() {
  const rapport = rapportAudit();
  const exceptions = JSON.parse(readFileSync(FICHIER_EXCEPTIONS, "utf8"));
  const parAvis = new Map((exceptions.tolerances ?? []).map((t) => [t.avis, t]));
  const maintenant = new Date();

  const bloquantes = [];
  const tolerees = [];
  const perimees = [];
  const deja = new Set();

  for (const [paquet, vulnerabilite] of Object.entries(rapport.vulnerabilities ?? {})) {
    for (const via of vulnerabilite.via ?? []) {
      if (typeof via !== "object") continue;
      if (!SEVERITES_BLOQUANTES.has(via.severity)) continue;
      const avis = identifiantAvis(via);
      const cle = `${paquet}|${avis}`;
      if (deja.has(cle)) continue;
      deja.add(cle);

      const description = `${paquet} : ${via.severity} ${avis} ${via.title}`;
      const tolerance = parAvis.get(avis);
      if (!tolerance) {
        bloquantes.push(description);
      } else if (Number.isNaN(Date.parse(tolerance.expire_le)) || new Date(tolerance.expire_le) < maintenant) {
        perimees.push(`${description} (tolérance échue le ${tolerance.expire_le})`);
      } else {
        tolerees.push(`${description} (tolérée jusqu'au ${tolerance.expire_le} : ${tolerance.motif})`);
      }
    }
  }

  const compteurs = rapport.metadata?.vulnerabilities ?? {};
  console.log(
    `Dépendances d'exécution : ${compteurs.critical ?? 0} critique(s), ${compteurs.high ?? 0} haute(s), ` +
      `${compteurs.moderate ?? 0} modérée(s), ${compteurs.low ?? 0} faible(s).`,
  );

  for (const ligne of tolerees) console.log(`Tolérée : ${ligne}`);
  for (const ligne of perimees) console.log(`::error::Tolérance expirée : ${ligne}`);
  for (const ligne of bloquantes) console.log(`::error::Vulnérabilité bloquante : ${ligne}`);

  if (bloquantes.length || perimees.length) {
    console.error(
      `Audit refusé : ${bloquantes.length} vulnérabilité(s) haute(s) ou critique(s) non tolérée(s), ` +
        `${perimees.length} tolérance(s) expirée(s).`,
    );
    process.exit(1);
  }

  console.log("Audit accepté : aucune vulnérabilité haute ou critique non tolérée dans les dépendances d'exécution.");
}

main();
