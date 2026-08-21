import { escapeHtml, escapeHtmlMultiline, sanitizeHeaderText } from "../_shared/html.ts";
import {
  boundedInteger,
  isEmail,
  isIsoDate,
  isUuid,
  optionalText,
  requiredText,
} from "../_shared/validation.ts";

export interface LeadInput {
  place_id: string | null;
  kind: "lodging" | "restaurant" | "generic";
  full_name: string;
  email: string;
  phone: string | null;
  party_size: number | null;
  date_from: string | null;
  date_to: string | null;
  budget: string | null;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: LeadInput }
  | { ok: false; error: string };

const KINDS = ["lodging", "restaurant", "generic"] as const;

export function validateLead(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Requête invalide." };
  const b = body as Record<string, unknown>;

  const kind = KINDS.find((k) => k === b.kind);
  if (!kind) return { ok: false, error: "Type de demande invalide." };

  const fullName = requiredText(b.full_name, 2, 120);
  if (!fullName) return { ok: false, error: "Nom invalide." };

  const email = typeof b.email === "string" ? b.email.trim() : null;
  if (!email || !isEmail(email)) return { ok: false, error: "Adresse email invalide." };

  const message = requiredText(b.message, 5, 2000);
  if (!message) return { ok: false, error: "Message invalide." };

  if (b.place_id != null && !isUuid(b.place_id)) {
    return { ok: false, error: "Établissement inconnu." };
  }

  const phone = optionalText(b.phone, 30);
  if (phone === undefined) return { ok: false, error: "Numéro de téléphone invalide." };

  const budget = optionalText(b.budget, 60);
  if (budget === undefined) return { ok: false, error: "Budget invalide." };

  // party_size alimente une colonne smallint : au-delà de 32767 l'insertion
  // échouerait côté base.
  let partySize: number | null = null;
  if (b.party_size !== null && b.party_size !== undefined && b.party_size !== "") {
    const parsed = boundedInteger(b.party_size, 1, 500);
    if (parsed === undefined) return { ok: false, error: "Nombre de personnes invalide." };
    partySize = parsed;
  }

  const dateFrom = b.date_from ? (isIsoDate(b.date_from) ? String(b.date_from) : null) : null;
  if (b.date_from && !dateFrom) return { ok: false, error: "Date de début invalide." };
  const dateTo = b.date_to ? (isIsoDate(b.date_to) ? String(b.date_to) : null) : null;
  if (b.date_to && !dateTo) return { ok: false, error: "Date de fin invalide." };
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return { ok: false, error: "La date de fin précède la date de début." };
  }

  return {
    ok: true,
    data: {
      place_id: (b.place_id as string | null) ?? null,
      kind,
      full_name: fullName,
      email,
      phone,
      party_size: partySize,
      date_from: dateFrom,
      date_to: dateTo,
      budget,
      message,
    },
  };
}

/**
 * Objet du courriel adressé au partenaire. Le nom de l'établissement provient
 * d'une fiche saisie par un partenaire : il est nettoyé de tout caractère de
 * contrôle avant de rejoindre un en-tête.
 */
export function buildPartnerEmailSubject(placeName: string | null | undefined): string {
  const name = sanitizeHeaderText(placeName, 120);
  return `Nouvelle demande pour ${name.length > 0 ? name : "votre établissement"}`;
}

/**
 * Corps du courriel adressé au partenaire. Tout ce qui vient du visiteur est
 * échappé : sans cela, le visiteur choisit le balisage que lit le partenaire.
 */
export function buildPartnerEmailHtml(lead: LeadInput): string {
  const rows: string[] = [
    `<p><strong>${escapeHtml(lead.full_name)}</strong> (${escapeHtml(lead.email)})</p>`,
  ];
  if (lead.phone) rows.push(`<p>Téléphone : ${escapeHtml(lead.phone)}</p>`);
  if (lead.party_size) rows.push(`<p>Nombre de personnes : ${escapeHtml(lead.party_size)}</p>`);
  if (lead.date_from || lead.date_to) {
    rows.push(
      `<p>Dates : ${escapeHtml(lead.date_from ?? "-")} au ${escapeHtml(lead.date_to ?? "-")}</p>`,
    );
  }
  if (lead.budget) rows.push(`<p>Budget : ${escapeHtml(lead.budget)}</p>`);
  rows.push(`<p>${escapeHtmlMultiline(lead.message)}</p>`);
  return rows.join("");
}
