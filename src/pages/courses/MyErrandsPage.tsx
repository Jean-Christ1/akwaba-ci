import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, PackageSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { formatFcfa, STATUS_LABEL, statusTone, type ErrandStatus } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Row {
  id: string;
  title: string;
  city: string;
  zone: string | null;
  status: ErrandStatus;
  budget_estimate: number;
  total_amount: number;
  created_at: string;
}

export default function MyErrandsPage() {
  usePageTitle("Mes courses", "Suivez vos courses en cours et passées.");
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  // Un refus de lecture n'est pas une liste vide. Les confondre annonce au
  // client qu'il n'a aucune course alors que ses courses existent bel et bien.
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setBusy(false);
      return;
    }
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("errands")
        .select("id,title,city,zone,status,budget_estimate,total_amount,created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        setMessageErreur(error.message);
        setBusy(false);
        return;
      }
      setMessageErreur(null);
      setRows((data ?? []) as Row[]);
      setBusy(false);
    };
    load();

    const channel = supabase
      .channel("my-errands")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "errands", filter: `customer_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) return null;

  return (
    <div className="akw-container max-w-4xl py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="akw-eyebrow">Akwaba Courses</p>
          <h1 className="font-display text-2xl font-semibold">Mes courses</h1>
        </div>
        <Button asChild size="sm">
          <Link to="/courses/nouvelle"><Plus className="mr-1 h-4 w-4" /> Nouvelle</Link>
        </Button>
      </div>

      {!user && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center text-sm">
          Connectez-vous pour suivre vos demandes.{" "}
          <Link className="font-medium text-primary" to="/auth?redirect=/courses">Se connecter</Link>
        </div>
      )}

      {user && !busy && messageErreur && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-center text-sm">
          <p className="font-medium text-destructive">Vos courses n'ont pas pu être chargées.</p>
          <p className="mt-1 text-muted-foreground">{messageErreur}</p>
        </div>
      )}

      {user && !busy && !messageErreur && rows.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Aucune course pour le moment.</p>
          <Button asChild className="mt-3" size="sm"><Link to="/courses/nouvelle">Commander une course</Link></Button>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              to={`/courses/${r.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.zone ? `${r.zone}, ` : ""}{r.city} · {new Date(r.created_at).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone(r.status)}`}>
                  {STATUS_LABEL[r.status]}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatFcfa(r.total_amount || r.budget_estimate)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
