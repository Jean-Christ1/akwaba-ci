/**
 * Applique une migration a la base reelle, dans une transaction.
 *
 * Sans transaction, une migration qui echoue a mi-chemin laisse le schema dans
 * un etat que personne n'a decrit : la moitie des objets crees, l'autre non.
 *
 * Usage : node scripts/appliquer-migration.mjs <chemin.sql>
 */
import fs from "node:fs";
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const chemin = process.argv[2];
if (!chemin) { console.error("Indiquez le fichier de migration."); process.exit(1); }

const c = new pg.Client(exigerConfiguration("application de migration"));
await c.connect();
try {
  await c.query("begin");
  await c.query(fs.readFileSync(chemin, "utf8"));
  await c.query("commit");
  console.log("applique :", chemin.split(/[\/]/).pop());
} catch (e) {
  await c.query("rollback");
  console.error("ECHEC, rien n'a ete applique :", e.message);
  process.exit(1);
} finally { await c.end(); }
