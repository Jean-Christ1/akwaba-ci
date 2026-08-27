import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compresserImage } from "@/shared/media/compresserImage";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { VEHICLES, type RunnerStatus } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";
import { useServiceAreas, zonesOfCity } from "@/modules/places/application/useServiceAreas";

export default function RunnerSignupPage() {
  usePageTitle("Devenir shopper", "Rejoignez le réseau des shoppers Akwaba.");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [existing, setExisting] = useState<{ status: RunnerStatus } | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [zones, setZones] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState("moto");
  const [bio, setBio] = useState("");
  const [idDocPath, setIdDocPath] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  // Un shopper recoit l'argent d'un inconnu et se rend chez lui. La plateforme
  // doit pouvoir dire qui il est, et prouver qu'il est majeur.
  const [naissance, setNaissance] = useState("");
  const [typePiece, setTypePiece] = useState("cni");
  const [echeancePiece, setEcheancePiece] = useState("");
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  const { cities: villes, zones: quartiers } = useServiceAreas();
  const villesCourses = villes.filter((v) => v.errandsEnabled);
  const villeCourante = villes.find((v) => v.name === city || v.slug === city);
  const quartiersDeLaVille = villeCourante ? zonesOfCity(quartiers, villeCourante.slug) : [];

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    supabase
      .from("runner_profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setExisting(data as { status: RunnerStatus } | null);
        setChecking(false);
      });
  }, [user]);

  const toggleZone = (z: string) =>
    setZones((p) => (p.includes(z) ? p.filter((x) => x !== z) : [...p, z]));

  // La pièce d'identité part dans un bucket privé : elle n'est lisible que par
  // son propriétaire et par les modérateurs qui instruisent la candidature.
  const uploadIdDoc = async (choisi: File) => {
    if (!user) return;

    const accepted = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!accepted.includes(choisi.type)) {
      return toast.error("Formats acceptés : JPEG, PNG, WebP ou PDF.");
    }

    setUploadingDoc(true);

    // Une pièce d'identité photographiée pèse plusieurs mégaoctets. On la réduit
    // avant l'envoi, sans quoi la candidature échoue sur un réseau lent, au
    // moment précis où le candidat vient de faire tout le reste du formulaire.
    const { fichier: file } = await compresserImage(choisi);

    if (file.size > 8 * 1024 * 1024) {
      setUploadingDoc(false);
      return toast.error("Fichier trop lourd, 8 Mo maximum même après réduction.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/piece-identite-${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("identity-docs")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploadingDoc(false);
    if (error) return toast.error(error.message);
    setIdDocPath(path);
    toast.success("Pièce d'identité enregistrée.");
  };

  /**
   * Le selfie sert au rapprochement avec la piece. Aucun traitement
   * biometrique n'est appliqué : un humain regarde les deux images. Pretendre
   * comparer automatiquement un visage sans prestataire contractualise
   * produirait une garantie fausse.
   */
  const uploadSelfie = async (choisi: File) => {
    if (!user) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(choisi.type)) {
      return toast.error("Le selfie doit être une photo : JPEG, PNG ou WebP.");
    }

    setUploadingSelfie(true);
    const { fichier: file } = await compresserImage(choisi);
    if (file.size > 8 * 1024 * 1024) {
      setUploadingSelfie(false);
      return toast.error("Photo trop lourde, 8 Mo maximum même après réduction.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/selfie-${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("identity-docs")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploadingSelfie(false);
    if (error) return toast.error(error.message);
    setSelfiePath(path);
    toast.success("Selfie enregistré.");
  };

  /** Dix-huit ans révolus, calculés comme le serveur les calcule. */
  const majeur = (() => {
    if (!naissance) return false;
    const d = new Date(naissance);
    if (Number.isNaN(d.getTime())) return false;
    const limite = new Date();
    limite.setFullYear(limite.getFullYear() - 18);
    return d <= limite;
  })();

  const submit = async () => {
    if (!user) return navigate("/auth?redirect=/courses/devenir-shopper");
    if (fullName.trim().length < 2 || phone.trim().length < 6) {
      return toast.error("Nom et téléphone requis.");
    }
    // Le serveur refuse de toute façon, mais le dire ici évite au candidat
    // d'envoyer un dossier pour apprendre ensuite qu'il ne pouvait pas aboutir.
    if (!naissance) return toast.error("Votre date de naissance est obligatoire.");
    if (!majeur) return toast.error("Il faut avoir dix-huit ans révolus pour devenir shopper.");
    if (!idDocPath) return toast.error("La pièce d'identité est obligatoire.");
    if (!selfiePath) return toast.error("Le selfie est obligatoire.");

    setSaving(true);
    const { error } = await supabase.from("runner_profiles").insert({
      user_id: user.id,
      full_name: fullName.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || null,
      city,
      zones: zones as unknown as never,
      vehicle,
      bio: bio.trim() || null,
      id_doc_url: idDocPath,
    });
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }

    // L'identité passe par la fonction serveur, qui refuse la minorité, une
    // pièce périmée ou un dossier incomplet. L'insertion ci-dessus ne fait que
    // créer le dossier ; c'est ici que la vérification s'établit.
    const { error: erreurIdentite } = await supabase.rpc("runner_submit_identity", {
      p_date_of_birth: naissance,
      p_document_type: typePiece,
      p_document_expires: echeancePiece || null,
      p_id_doc_url: idDocPath,
      p_selfie_url: selfiePath,
    });
    setSaving(false);
    if (erreurIdentite) return toast.error(erreurIdentite.message);
    toast.success("Candidature envoyée - validation sous 24 h.");
    setExisting({ status: "pending" });
  };

  if (checking) return null;

  if (existing) {
    const label: Record<RunnerStatus, string> = {
      pending: "Votre candidature est en cours de validation (sous 24 h).",
      approved: "Vous êtes shopper validé. Bonnes missions !",
      suspended: "Votre compte shopper est suspendu. Contactez le support.",
      rejected: "Votre candidature a été refusée.",
    };
    return (
      <div className="akw-container max-w-xl py-10 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 font-display text-2xl font-semibold">Statut shopper</h1>
        <p className="mt-2 text-sm text-muted-foreground">{label[existing.status]}</p>
        {existing.status === "approved" && (
          <Button asChild className="mt-4"><Link to="/courses/shopper">Voir les missions</Link></Button>
        )}
      </div>
    );
  }

  return (
    <div className="akw-container max-w-2xl py-6">
      <p className="akw-eyebrow">Akwaba Courses</p>
      <h1 className="font-display text-2xl font-semibold">Devenir shopper</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Réalisez des courses pour d'autres Ivoiriens et gagnez un revenu. Validation manuelle sous 24 h.
      </p>

      {!user && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <Link className="font-medium text-primary" to="/auth?redirect=/courses/devenir-shopper">
            Connectez-vous
          </Link>{" "}
          pour candidater.
        </div>
      )}

      <div className="mt-5 space-y-4">
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <Label>Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Koffi Aya" autoComplete="name" enterKeyHint="next" />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225 07 00 00 00 00" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+225 07 …" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" />
          </div>
          <div>
            <Label>Moyen de déplacement</Label>
            <Select value={vehicle} onValueChange={setVehicle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ville</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {villesCourses.map((v) => v.name).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {city === "Abidjan" && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <Label>Zones couvertes</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {quartiersDeLaVille.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => toggleZone(z)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    zones.includes(z)
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4">
          <Label>Présentation</Label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Votre expérience, vos disponibilités, vos points forts…"
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <Label htmlFor="naissance">Date de naissance</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Elle sert uniquement à vérifier que vous êtes majeur. Nous ne conservons ni le numéro
            de votre pièce, ni aucune mesure de votre visage.
          </p>
          <Input
            id="naissance"
            type="date"
            className="mt-2 min-h-[44px]"
            value={naissance}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setNaissance(e.target.value)}
          />
          {naissance && !majeur && (
            <p className="mt-2 text-xs text-destructive">
              Il faut avoir dix-huit ans révolus pour devenir shopper. Nous ne pouvons pas confier
              l'argent et l'adresse d'un client à un mineur.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="type-piece">Type de pièce</Label>
              <select
                id="type-piece"
                className="mt-2 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={typePiece}
                onChange={(e) => setTypePiece(e.target.value)}
              >
                <option value="cni">Carte nationale d'identité</option>
                <option value="passeport">Passeport</option>
                <option value="permis">Permis de conduire</option>
                <option value="attestation_identite">Attestation d'identité</option>
                <option value="carte_consulaire">Carte consulaire</option>
              </select>
            </div>
            <div>
              <Label htmlFor="echeance-piece">Date d'expiration</Label>
              <Input
                id="echeance-piece"
                type="date"
                className="mt-2 min-h-[44px]"
                value={echeancePiece}
                onChange={(e) => setEcheancePiece(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Nous vous redemanderons une pièce à son échéance.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <Label>Selfie</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Une photo de votre visage, prise maintenant. Un modérateur la rapproche de votre pièce :
            c'est ce qui permet de dire au client que la personne qui sonne à sa porte est bien celle
            du dossier.
          </p>
          <Input
            type="file"
            className="mt-2 min-h-[44px]"
            accept="image/*"
            capture="user"
            disabled={uploadingSelfie}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadSelfie(file);
              e.target.value = "";
            }}
          />
          {uploadingSelfie && (
            <p className="mt-2 text-xs text-muted-foreground">Envoi du selfie en cours…</p>
          )}
          {selfiePath && !uploadingSelfie && (
            <p className="mt-2 text-xs text-primary">Selfie reçu.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <Label>Pièce d'identité</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Carte nationale, passeport ou permis. Le document reste confidentiel : seuls les
            modérateurs qui instruisent votre candidature peuvent le consulter.
          </p>
          {/* Sur telephone, capture ouvre directement l'appareil photo : le
              candidat photographie sa piece au lieu de la chercher dans sa
              galerie, ou elle n'est le plus souvent pas encore. */}
          <Input
            type="file"
            className="mt-2 min-h-[44px]"
            accept="image/*"
            capture="environment"
            disabled={uploadingDoc}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadIdDoc(file);
              e.target.value = "";
            }}
          />
          <Input
            type="file"
            className="mt-2 min-h-[44px]"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={uploadingDoc}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadIdDoc(file);
              e.target.value = "";
            }}
          />
          {uploadingDoc && (
            <p className="mt-2 text-xs text-muted-foreground">Envoi du document en cours...</p>
          )}
          {idDocPath && !uploadingDoc && (
            <p className="mt-2 text-xs text-primary">Document reçu.</p>
          )}
        </section>

        <Button className="w-full" size="lg" disabled={saving} onClick={submit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Envoyer ma candidature
        </Button>
      </div>
    </div>
  );
}
