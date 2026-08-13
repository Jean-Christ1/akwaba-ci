import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PrivateDocumentButton } from "@/modules/admin/PrivateDocumentButton";
import type { RunnerStatus } from "@/modules/errands/domain";

interface Runner {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  whatsapp: string | null;
  city: string;
  zones: unknown;
  vehicle: string;
  bio: string | null;
  /** Clé d'objet dans le bucket privé, jamais une URL publique. */
  id_doc_url: string | null;
  status: RunnerStatus;
  jobs_completed: number;
  created_at: string;
}

const STATUS_LABEL: Record<RunnerStatus, string> = {
  pending: "En attente",
  approved: "Validé",
  suspended: "Suspendu",
  rejected: "Refusé",
};

export default function ShoppersPage() {
  const { isModerator, loading } = useAuth();
  const [rows, setRows] = useState<Runner[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("runner_profiles").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as Runner[]);
  }, []);

  useEffect(() => { if (isModerator) load(); }, [isModerator, load]);

  const setStatus = async (r: Runner, status: RunnerStatus) => {
    const { error } = await supabase.from("runner_profiles").update({ status }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(`${r.full_name} → ${STATUS_LABEL[status]}`);
    load();
  };

  if (loading) return null;
  if (!isModerator)
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé aux modérateurs. <Link className="text-primary" to="/profil">Mon profil</Link>
      </div>
    );

  return (
    <div className="akw-container max-w-5xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Validation des shoppers</h1>

      <ul className="mt-4 space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune candidature.</p>}
        {rows.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.phone} · {r.vehicle} · {r.city}
                  {Array.isArray(r.zones) && r.zones.length ? ` · ${(r.zones as string[]).join(", ")}` : ""}
                </p>
                {r.bio && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{r.bio}</p>}
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            {/* Approuver une candidature revient à certifier une identité au
                client. Sans accès à la pièce déposée, la validation ne repose
                sur rien. */}
            <div className="mt-3 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-medium">Pièce d'identité</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Document personnel : à ouvrir pour instruire la candidature, jamais à diffuser ni à
                conserver hors de l'application.
              </p>
              <div className="mt-2">
                <PrivateDocumentButton
                  bucket="identity-docs"
                  path={r.id_doc_url}
                  label="Ouvrir la pièce d'identité"
                  emptyLabel="Aucune pièce déposée par ce candidat"
                  notice="Refermez l'onglet après consultation."
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setStatus(r, "approved")} disabled={r.status === "approved"}>
                Valider
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus(r, "suspended")}>Suspendre</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus(r, "rejected")}>Refuser</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
