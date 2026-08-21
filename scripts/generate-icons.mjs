/**
 * Génère les icônes de l'application installable.
 *
 * Les icônes reprennent la marque : disque vert profond et monogramme doré,
 * exactement les couleurs du composant Logo. Le rendu est fait en pur Node,
 * sans dépendance de traitement d'image, pour que la génération reste
 * reproductible en intégration continue.
 *
 * Usage : node scripts/generate-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(process.cwd(), "public", "icons");

// Couleurs de marque, converties depuis les variables CSS.
// --primary: 175 55% 22%  et  --accent: 38 55% 52%
const VERT = [25, 87, 82];
const OR = [201, 156, 74];
const IVOIRE = [250, 248, 243];

/** Encode un tampon RGBA en PNG. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtre "none"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

/** Distance d'un point au segment, pour tracer les traits du monogramme. */
function distanceAuSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const longueur = dx * dx + dy * dy;
  let t = longueur === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / longueur;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Dessine l'icône.
 * @param taille côté en pixels
 * @param masquable true pour la variante à zone de sécurité (fond plein)
 */
function dessiner(taille, masquable) {
  const px = Buffer.alloc(taille * taille * 4);
  const centre = taille / 2;

  // En version masquable, le système peut rogner jusqu'à 10 % de chaque bord :
  // le disque est donc réduit pour que le monogramme reste entier.
  const rayon = masquable ? taille * 0.42 : taille * 0.48;
  const echelle = masquable ? 0.78 : 0.9;

  // Monogramme "A" : deux montants et une barre, comme le logo applicatif.
  const h = taille * 0.34 * echelle;
  const l = taille * 0.30 * echelle;
  const sommetX = centre;
  const sommetY = centre - h / 2;
  const gaucheX = centre - l / 2;
  const droiteX = centre + l / 2;
  const baseY = centre + h / 2;
  const barreY = baseY - h * 0.32;
  const epaisseur = Math.max(2, taille * 0.055 * echelle);

  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;

      // Fond : disque de marque, ou fond plein si masquable.
      const dCentre = Math.hypot(cx - centre, cy - centre);
      let couverture = masquable ? 1 : Math.max(0, Math.min(1, rayon - dCentre + 0.5));

      if (couverture <= 0) {
        px[i + 3] = 0;
        continue;
      }

      let [r, g, b] = VERT;

      // Traits du monogramme, avec un léger adoucissement des bords.
      const dTraits = Math.min(
        distanceAuSegment(cx, cy, gaucheX, baseY, sommetX, sommetY),
        distanceAuSegment(cx, cy, droiteX, baseY, sommetX, sommetY),
        distanceAuSegment(cx, cy, gaucheX + l * 0.16, barreY, droiteX - l * 0.16, barreY)
      );
      const trait = Math.max(0, Math.min(1, epaisseur / 2 - dTraits + 0.5));

      if (trait > 0) {
        const teinte = masquable ? IVOIRE : OR;
        r = Math.round(r * (1 - trait) + teinte[0] * trait);
        g = Math.round(g * (1 - trait) + teinte[1] * trait);
        b = Math.round(b * (1 - trait) + teinte[2] * trait);
      }

      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = Math.round(couverture * 255);
    }
  }

  return encodePng(taille, taille, px);
}

fs.mkdirSync(OUT, { recursive: true });

const cibles = [
  { nom: "icon-192.png", taille: 192, masquable: false },
  { nom: "icon-512.png", taille: 512, masquable: false },
  { nom: "icon-maskable-192.png", taille: 192, masquable: true },
  { nom: "icon-maskable-512.png", taille: 512, masquable: true },
  { nom: "apple-touch-icon.png", taille: 180, masquable: true },
];

for (const c of cibles) {
  fs.writeFileSync(path.join(OUT, c.nom), dessiner(c.taille, c.masquable));
  console.log(`Généré : public/icons/${c.nom}`);
}
