/**
 * Génère la migration de données de démarrage du catalogue de lieux.
 *
 * Les fiches éditoriales vivent dans `src/modules/places/infrastructure/data.ts`.
 * Ce script les transpile, les lit, puis produit un fichier SQL idempotent qui
 * insère ces lieux dans la table `places` avec des identifiants déterministes.
 *
 * Objectif : une seule source de vérité pour le contenu de démarrage, et aucune
 * recopie manuelle qui divergerait au fil du temps.
 *
 * Usage : node scripts/generate-place-seed.mjs <chemin-du-fichier-sql>
 */
import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const assetStub = {
  name: "asset-stub",
  setup(build) {
    build.onResolve({ filter: /\.(jpg|jpeg|png|webp|svg)$/ }, (args) => ({
      path: args.path,
      namespace: "asset",
    }));
    build.onLoad({ filter: /.*/, namespace: "asset" }, (args) => ({
      contents: `export default ${JSON.stringify("/assets/" + path.basename(args.path))}`,
      loader: "js",
    }));
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: path.join(root, "src", args.path.slice(2)),
    }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(root, "src/modules/places/infrastructure/data.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  plugins: [assetStub],
});

const code = result.outputFiles[0].text;
const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const quote = (value) => {
  if (value === undefined || value === null || value === "") return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
};
const json = (value) => "'" + JSON.stringify(value ?? []).replace(/'/g, "''") + "'::jsonb";

const rows = mod.PLACES.map((p) => {
  const cols = [
    quote(p.id),
    quote(p.slug),
    quote(p.name),
    `${quote(p.type)}::place_type`,
    quote(p.city),
    quote(p.zone),
    quote(p.address),
    quote(p.tagline),
    quote(p.description),
    quote(p.story),
    String(p.coords.lat),
    String(p.coords.lng),
    String(p.standing),
    quote(p.priceBand),
    quote(p.phone),
    quote(p.whatsapp),
    quote(p.email),
    quote(p.website),
    quote(p.image),
    json(p.gallery),
    json(p.services),
    json(p.tags),
    json(p.cuisines),
    json(p.whyVisit),
    json(p.bestFor),
    quote(p.bestTime),
    quote(p.averageDuration),
    json(p.practicalTips),
    quote(p.curatorNote),
    p.premium ? "true" : "false",
    json(p.hours ?? { open: true }),
    "'published'::place_status",
  ];
  return "  (" + cols.join(", ") + ")";
}).join(",\n");

const sql = `-- Données de démarrage du catalogue de lieux.
--
-- FICHIER GÉNÉRÉ : ne pas modifier à la main.
-- Source : src/modules/places/infrastructure/data.ts
-- Régénération : node scripts/generate-place-seed.mjs <fichier>
--
-- Les identifiants sont déterministes, ce qui rend cette insertion rejouable et
-- permet aux parcours et aux favoris de référencer des lieux stables.

-- Les horaires d'ouverture font partie du modèle métier mais n'existaient pas
-- encore en base : le catalogue les portait uniquement côté front.
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS hours jsonb NOT NULL DEFAULT '{"open": true}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_places_type ON public.places (type);
CREATE INDEX IF NOT EXISTS idx_places_slug ON public.places (slug);

INSERT INTO public.places (
  id, slug, name, type, city, zone, address, tagline, description, story,
  lat, lng, standing, price_band, phone, whatsapp, email, website,
  image, gallery, services, tags, cuisines, why_visit, best_for,
  best_time, average_duration, practical_tips, curator_note, premium, hours, status
) VALUES
${rows}
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  city = EXCLUDED.city,
  zone = EXCLUDED.zone,
  address = EXCLUDED.address,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  story = EXCLUDED.story,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  standing = EXCLUDED.standing,
  price_band = EXCLUDED.price_band,
  phone = EXCLUDED.phone,
  whatsapp = EXCLUDED.whatsapp,
  email = EXCLUDED.email,
  website = EXCLUDED.website,
  image = EXCLUDED.image,
  gallery = EXCLUDED.gallery,
  services = EXCLUDED.services,
  tags = EXCLUDED.tags,
  cuisines = EXCLUDED.cuisines,
  why_visit = EXCLUDED.why_visit,
  best_for = EXCLUDED.best_for,
  best_time = EXCLUDED.best_time,
  average_duration = EXCLUDED.average_duration,
  practical_tips = EXCLUDED.practical_tips,
  curator_note = EXCLUDED.curator_note,
  premium = EXCLUDED.premium,
  hours = EXCLUDED.hours,
  updated_at = now();
`;

const target = process.argv[2];
if (!target) {
  console.error("Chemin du fichier SQL manquant.");
  process.exit(1);
}
fs.writeFileSync(target, sql, "utf8");
console.log(`Généré : ${mod.PLACES.length} lieux vers ${target}`);
