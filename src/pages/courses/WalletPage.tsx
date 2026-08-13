import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Wallet, ArrowDownToLine, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatFcfa } from "@/modules/errands/domain";
import { MIN_PAYOUT, MOMO_PROVIDERS, type MomoProvider } from "@/modules/errands/pricing";

interface WalletRow {
  available_balance: number;
  pending_balance: number;
  lifetime_earnings: number;
}
interface AccountRow {
  id: string;
  provider: MomoProvider;
  account_number: string;
  account_name: string;
  is_default: boolean;
}
interface EntryRow {
  id: string;
  kind: string;
  amount: number;
  label: string;
  created_at: string;
}
interface PayoutRow {
  id: string;
  amount: number;
  status: string;
  transfer_reference: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  requested: "Demandé",
  processing: "En traitement",
  paid: "Payé",
  rejected: "Refusé",
};

export default function WalletPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<MomoProvider>("wave");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    // Les gains arrivés au bout du délai anti-litige basculent en solde
    // disponible. L'opération est idempotente et pilotée par le serveur.
    await supabase.rpc("wallet_release_matured_earnings");

    const [w, a, e, p] = await Promise.all([
      supabase.from("runner_wallets").select("available_balance,pending_balance,lifetime_earnings").eq("user_id", user.id).maybeSingle(),
      supabase.from("runner_payout_accounts").select("id,provider,account_number,account_name,is_default").eq("user_id", user.id).order("created_at"),
      supabase.from("wallet_entries").select("id,kind,amount,label,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("payout_requests").select("id,amount,status,transfer_reference,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setWallet((w.data as WalletRow) ?? null);
    setAccounts((a.data ?? []) as AccountRow[]);
    setEntries((e.data ?? []) as EntryRow[]);
    setPayouts((p.data ?? []) as PayoutRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const addAccount = async () => {
    if (!user) return;
    if (number.trim().length < 8 || holder.trim().length < 2) {
      toast.error("Numéro et nom du titulaire requis.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("runner_payout_accounts").insert({
      user_id: user.id,
      provider,
      account_number: number.trim(),
      account_name: holder.trim(),
      is_default: accounts.length === 0,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNumber("");
    setHolder("");
    toast.success("Compte de retrait ajouté");
    load();
  };

  const removeAccount = async (id: string) => {
    const { error } = await supabase.from("runner_payout_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const requestPayout = async () => {
    if (!user) return;
    const value = Number(amount) || 0;
    const available = wallet?.available_balance ?? 0;
    if (value < MIN_PAYOUT) return toast.error(`Minimum ${formatFcfa(MIN_PAYOUT)}.`);
    if (value > available) return toast.error("Montant supérieur au solde disponible.");
    const def = accounts.find((a) => a.is_default) ?? accounts[0];
    if (!def) return toast.error("Ajoutez d'abord un compte de retrait.");
    setBusy(true);
    // Gardes d'interface ci-dessus pour un retour immédiat. Le serveur
    // revérifie le plancher, le solde et la propriété du compte, puis débite
    // le portefeuille de façon atomique : c'est lui qui fait autorité.
    const { error } = await supabase.rpc("payout_request_create", {
      p_amount: value,
      p_account_id: def.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setAmount("");
    toast.success("Demande de retrait envoyée, traitée sous 1 jour ouvré.");
    load();
  };

  if (!user) {
    return (
      <div className="akw-container py-10 text-center">
        <h1 className="font-display text-xl font-semibold">Portefeuille shopper</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connectez-vous pour voir vos gains.</p>
        <Button asChild className="mt-4">
          <Link to="/auth?redirect=/courses/portefeuille">Se connecter</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="akw-container flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="akw-container py-5 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="akw-eyebrow text-muted-foreground">Akwaba Courses</p>
          <h1 className="font-display text-2xl font-semibold">Mon portefeuille</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/courses/shopper">Mes missions</Link>
        </Button>
      </header>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <Wallet className="h-5 w-5 text-primary" />
          <p className="mt-2 text-xs text-muted-foreground">Disponible</p>
          <p className="font-display text-2xl font-semibold">{formatFcfa(wallet?.available_balance)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">En attente (24 h)</p>
          <p className="font-display text-2xl font-semibold">{formatFcfa(wallet?.pending_balance)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total gagné</p>
          <p className="font-display text-2xl font-semibold">{formatFcfa(wallet?.lifetime_earnings)}</p>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Retrait */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Retirer mes gains</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum {formatFcfa(MIN_PAYOUT)}. Virement sur votre compte mobile money sous 1 jour ouvré.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              inputMode="numeric"
              placeholder="Montant en FCFA"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button onClick={requestPayout} disabled={busy}>
              <ArrowDownToLine className="mr-1.5 h-4 w-4" /> Retirer
            </Button>
          </div>

          <h3 className="mt-5 text-sm font-semibold">Comptes de retrait</h3>
          <ul className="mt-2 space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                <span>
                  {MOMO_PROVIDERS.find((p) => p.value === a.provider)?.emoji}{" "}
                  <strong>{MOMO_PROVIDERS.find((p) => p.value === a.provider)?.label}</strong> ·{" "}
                  {a.account_number} - {a.account_name}
                </span>
                <Button variant="ghost" size="icon" onClick={() => removeAccount(a.id)} aria-label="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            {accounts.length === 0 && (
              <li className="text-sm text-muted-foreground">Aucun compte enregistré.</li>
            )}
          </ul>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Opérateur</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as MomoProvider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOMO_PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.emoji} {p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Numéro</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="07 00 00 00 00" />
            </div>
            <div>
              <Label className="text-xs">Titulaire</Label>
              <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Nom complet" />
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={addAccount} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" /> Ajouter ce compte
          </Button>
        </section>

        {/* Historique */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg font-semibold">Historique</h2>
          <h3 className="mt-3 text-sm font-semibold">Retraits</h3>
          <ul className="mt-2 space-y-1.5">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("fr-FR")} · {STATUS_LABEL[p.status] ?? p.status}
                  {p.transfer_reference ? ` · réf ${p.transfer_reference}` : ""}
                </span>
                <strong>{formatFcfa(p.amount)}</strong>
              </li>
            ))}
            {payouts.length === 0 && <li className="text-sm text-muted-foreground">Aucun retrait.</li>}
          </ul>

          <h3 className="mt-4 text-sm font-semibold">Mouvements</h3>
          <ul className="mt-2 space-y-1.5">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString("fr-FR")} · {e.label}
                </span>
                <strong className={e.amount < 0 ? "text-destructive" : "text-primary"}>
                  {e.amount < 0 ? "" : "+"}
                  {formatFcfa(e.amount)}
                </strong>
              </li>
            ))}
            {entries.length === 0 && (
              <li className="text-sm text-muted-foreground">Vos gains apparaîtront ici après votre première course.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
