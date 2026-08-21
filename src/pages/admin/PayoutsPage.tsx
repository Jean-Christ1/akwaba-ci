import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";
import { CommissionReceivables } from "./CommissionReceivables";

type PayoutStatus = "requested" | "processing" | "paid" | "rejected";

interface PayoutRow {
  id: string;
  user_id: string;
  account_id: string | null;
  amount: number;
  status: PayoutStatus;
  transfer_reference: string | null;
  admin_note: string | null;
  created_at: string;
}

interface AccountRow {
  id: string;
  provider: string;
  account_number: string;
  account_name: string;
}

const STATUS_LABEL: Record<PayoutStatus, string> = {
  requested: "Demandé",
  processing: "En cours",
  paid: "Payé",
  rejected: "Refusé",
};

const STATUS_TONE: Record<PayoutStatus, string> = {
  requested: "bg-muted text-muted-foreground",
  processing: "bg-accent text-accent-foreground",
  paid: "bg-primary-soft text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

const FILTERS: { value: PayoutStatus | "all"; label: string }[] = [
  { value: "requested", label: "À traiter" },
  { value: "processing", label: "En cours" },
  { value: "paid", label: "Payés" },
  { value: "rejected", label: "Refusés" },
  { value: "all", label: "Tous" },
];

export default function PayoutsPage() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [accounts, setAccounts] = useState<Record<string, AccountRow>>({});
  const [filter, setFilter] = useState<PayoutStatus | "all">("requested");
  const [reference, setReference] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(async () => {
    setFetching(true);
    const { data, error } = await supabase
      .from("payout_requests")
      .select("id,user_id,account_id,amount,status,transfer_reference,admin_note,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast.error("Impossible de charger les demandes de retrait.");
      setFetching(false);
      return;
    }

    const list = (data ?? []) as PayoutRow[];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.account_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: accs } = await supabase
        .from("runner_payout_accounts")
        .select("id,provider,account_number,account_name")
        .in("id", ids);
      setAccounts(Object.fromEntries(((accs ?? []) as AccountRow[]).map((a) => [a.id, a])));
    }
    setFetching(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const settle = async (row: PayoutRow, status: PayoutStatus) => {
    if (status === "paid" && !(reference[row.id] ?? "").trim()) {
      return toast.error("Renseignez la référence du transfert avant de marquer comme payé.");
    }
    setBusy(row.id);
    const { error } = await supabase.rpc("payout_request_settle", {
      p_request_id: row.id,
      p_status: status,
      p_reference: (reference[row.id] ?? "").trim() || undefined,
      p_note: undefined,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Demande ${STATUS_LABEL[status].toLowerCase()}.`);
    load();
  };

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  const totals = useMemo(() => {
    const pending = rows.filter((r) => r.status === "requested");
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      paidAmount: rows
        .filter((r) => r.status === "paid")
        .reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };
  }, [rows]);

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé aux administrateurs.{" "}
        <Link className="text-primary" to="/profil">
          Mon profil
        </Link>
      </div>
    );
  }

  return (
    <div className="akw-container max-w-5xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Règlements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ce que la plateforme doit encaisser, et ce qu'elle doit verser.
      </p>

      {/* Les deux sens de l'argent au même endroit : la commission que les
          shoppers doivent, et les retraits qu'ils demandent. Les séparer
          laisserait croire que seul le second existe, ce qui a longtemps été
          le cas à l'écran. */}
      <div className="mt-5">
        <CommissionReceivables />
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold">Retraits shoppers</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Le solde du shopper est débité dès la demande. Un refus le lui recrédite automatiquement.
        En règlement direct, ce solde reste à zéro : le client paie le shopper lui-même.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Demandes à traiter</p>
          <p className="mt-1 font-display text-xl font-semibold">{totals.pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Montant en attente</p>
          <p className="mt-1 font-display text-xl font-semibold">{formatFcfa(totals.pendingAmount)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Déjà versé</p>
          <p className="mt-1 font-display text-xl font-semibold">{formatFcfa(totals.paidAmount)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {fetching ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement des demandes...</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Aucune demande dans cette catégorie.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((row) => {
            const account = row.account_id ? accounts[row.account_id] : undefined;
            const pending = row.status === "requested" || row.status === "processing";
            return (
              <section key={row.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">{formatFcfa(row.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      Demandé le {new Date(row.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs ${STATUS_TONE[row.status]}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </div>

                <p className="mt-2 text-sm">
                  {account
                    ? `${account.provider} · ${account.account_number} · ${account.account_name}`
                    : "Aucun compte de retrait renseigné"}
                </p>

                {row.transfer_reference && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Référence du transfert : {row.transfer_reference}
                  </p>
                )}

                {pending && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <Label className="text-xs">Référence du transfert</Label>
                      <Input
                        className="mt-1"
                        value={reference[row.id] ?? ""}
                        placeholder="Identifiant Wave, Orange Money ou virement"
                        onChange={(e) =>
                          setReference((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.id || row.status === "processing"}
                        onClick={() => settle(row, "processing")}
                      >
                        En cours
                      </Button>
                      <Button size="sm" disabled={busy === row.id} onClick={() => settle(row, "paid")}>
                        Marquer payé
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === row.id}
                        onClick={() => settle(row, "rejected")}
                      >
                        Refuser
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
