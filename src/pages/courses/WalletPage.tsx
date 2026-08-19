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
import { MOMO_PROVIDERS, type MomoProvider } from "@/modules/errands/pricing";
import { usePageTitle } from "@/shared/hooks/usePageTitle";
import {
  useCommissionRule,
  type SettlementMode,
} from "@/modules/errands/application/useCommissionRule";

interface WalletRow {
  available_balance: number;
  pending_balance: number;
  lifetime_earnings: number;
  /** Ce que le shopper doit à la plateforme quand le règlement est direct. */
  commission_due: number;
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

interface PayoutSectionProps {
  settlement: SettlementMode;
  /** Vrai tant que le barème n'est pas lu : on n'affirme rien avant de savoir. */
  baremeEnCours?: boolean;
  minPayout: number;
  commissionDue: number;
  accounts: AccountRow[];
  busy: boolean;
  onAddAccount: (compte: {
    provider: MomoProvider;
    number: string;
    holder: string;
  }) => Promise<boolean>;
  onRemoveAccount: (id: string) => void;
  onRequestPayout: (montant: number) => Promise<boolean>;
}

/**
 * Retrait des gains, ou explication de son absence.
 *
 * Défaut constaté : le barème actif règle en direct, et la clôture d'une course
 * n'alimente alors ni le solde disponible ni le solde en attente. Elle inscrit
 * seulement la commission due et le total gagné. Le shopper lisait donc
 * « Total gagné 5 100 FCFA », « Disponible 0 », saisissait 5 100 et recevait
 * « Montant supérieur au solde disponible », à chaque tentative et pour
 * toujours. Sa dette, elle, n'apparaissait sur aucun de ses écrans : seul le
 * back-office la voyait.
 */
export function PayoutSection({
  settlement,
  baremeEnCours = false,
  minPayout,
  commissionDue,
  accounts,
  busy,
  onAddAccount,
  onRemoveAccount,
  onRequestPayout,
}: PayoutSectionProps) {
  const [provider, setProvider] = useState<MomoProvider>("wave");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState("");

  const ajouterCompte = async () => {
    // Les champs ne se vident que si l'enregistrement a réellement abouti,
    // sinon une erreur réseau ferait resaisir tout le compte.
    if (await onAddAccount({ provider, number, holder })) {
      setNumber("");
      setHolder("");
    }
  };

  const demanderRetrait = async () => {
    if (await onRequestPayout(Number(amount) || 0)) setAmount("");
  };

  const comptes = (
    <ComptesDeReception
      accounts={accounts}
      busy={busy}
      provider={provider}
      setProvider={setProvider}
      number={number}
      setNumber={setNumber}
      holder={holder}
      setHolder={setHolder}
      onAdd={ajouterCompte}
      onRemoveAccount={onRemoveAccount}
    />
  );

  if (baremeEnCours) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Vos gains</h2>
        <p className="mt-1 text-sm text-muted-foreground">Lecture du barème en cours…</p>
        {comptes}
      </section>
    );
  }

  if (settlement === "direct") {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Commission à régler</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Le client vous paie lui-même : la plateforme ne détient aucun de vos gains, votre solde
          disponible reste à zéro et il n'y a donc rien à retirer ici. En contrepartie, la
          commission reste due à Akwaba.
        </p>
        <p className="mt-4 text-xs text-muted-foreground">Commission due</p>
        <p
          className={
            commissionDue > 0
              ? "font-display text-2xl font-semibold text-destructive"
              : "font-display text-2xl font-semibold"
          }
        >
          {formatFcfa(commissionDue)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {commissionDue > 0
            ? "Akwaba vous indique les coordonnées de versement au moment du prélèvement. Le montant est déduit dès que la plateforme enregistre votre versement."
            : "Aucune commission en attente de règlement."}
        </p>
        {comptes}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg font-semibold">Retirer mes gains</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Minimum {formatFcfa(minPayout)}. Virement sur votre compte mobile money sous 1 jour ouvré.
      </p>
      {commissionDue > 0 && (
        <p className="mt-1 text-xs text-destructive">
          Commission due à Akwaba : {formatFcfa(commissionDue)}. Elle reste à régler, même si vos
          gains vous sont désormais versés par la plateforme.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Input
          inputMode="numeric"
          placeholder="Montant en FCFA"
          aria-label="Montant du retrait en francs CFA"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button onClick={demanderRetrait} disabled={busy}>
          <ArrowDownToLine className="mr-1.5 h-4 w-4" /> Retirer
        </Button>
      </div>

      {comptes}
    </section>
  );
}

/**
 * Les comptes de réception, qui ne dépendent pas du mode de règlement.
 *
 * Ils étaient rendus à l'intérieur de la section de retrait. Masquer le retrait
 * en règlement direct les emportait avec lui : un shopper ne pouvait plus ni
 * consulter ni supprimer son numéro et le nom du titulaire, alors que c'est le
 * seul écran de l'application qui le lui permet, et que l'administration, elle,
 * continue de les lire. Or c'est précisément en règlement direct que ce compte
 * sert le plus : c'est celui que le client voit pour lui envoyer le budget des
 * achats.
 */
function ComptesDeReception({
  accounts,
  busy,
  provider,
  setProvider,
  number,
  setNumber,
  holder,
  setHolder,
  onAdd,
  onRemoveAccount,
}: {
  accounts: AccountRow[];
  busy: boolean;
  provider: MomoProvider;
  setProvider: (v: MomoProvider) => void;
  number: string;
  setNumber: (v: string) => void;
  holder: string;
  setHolder: (v: string) => void;
  onAdd: () => void;
  onRemoveAccount: (id: string) => void;
}) {
  return (
    <>
      <h3 className="mt-5 text-sm font-semibold">Comptes de réception</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        C'est le compte que le client voit pour vous envoyer le budget des achats.
      </p>
      <ul className="mt-2 space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
            <span>
              {MOMO_PROVIDERS.find((p) => p.value === a.provider)?.emoji}{" "}
              <strong>{MOMO_PROVIDERS.find((p) => p.value === a.provider)?.label}</strong> ·{" "}
              {a.account_number} - {a.account_name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => onRemoveAccount(a.id)}
              aria-label={`Supprimer le compte ${a.account_number}`}
            >
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
          <Label className="text-xs" htmlFor="operateur">Opérateur</Label>
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
          <Label className="text-xs" htmlFor="numero">Numéro</Label>
          <Input id="numero" type="tel" inputMode="tel" autoComplete="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="07 00 00 00 00" />
        </div>
        <div>
          <Label className="text-xs" htmlFor="titulaire">Titulaire</Label>
          <Input id="titulaire" autoComplete="name" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Nom complet" />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 min-h-[44px]"
        onClick={onAdd}
        disabled={busy}
      >
        <Plus className="mr-1.5 h-4 w-4" /> Ajouter ce compte
      </Button>
    </>
  );
}

export default function WalletPage() {
  usePageTitle("Portefeuille shopper", "Vos gains et vos retraits.");
  const { user } = useAuth();
  // Le seuil de retrait et le mode de règlement font autorité côté serveur : on
  // affiche les mêmes. Tant qu'ils ne sont pas lus, le hook rend son repli, qui
  // vaut « direct » : l'afficher comme un fait affirmerait au shopper que la
  // plateforme ne détient rien, ce qui serait faux sous un barème en séquestre.
  const { rule, loading: baremeEnCours } = useCommissionRule();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Un portefeuille illisible n'est pas un portefeuille vide. Afficher zéro
  // franc sur un refus de droits ferait croire au shopper qu'il a perdu ses
  // gains, alors que la donnée n'a simplement pas pu être lue.
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    // Les gains arrivés au bout du délai anti-litige basculent en solde
    // disponible. L'opération est idempotente et pilotée par le serveur. Son
    // échec n'empêche pas l'affichage : les soldes lus restent justes, seule
    // la bascule attendra le prochain passage.
    const { error: erreurMaturation } = await supabase.rpc("wallet_release_matured_earnings");

    const [w, a, e, p] = await Promise.all([
      supabase.from("runner_wallets").select("available_balance,pending_balance,lifetime_earnings,commission_due").eq("user_id", user.id).maybeSingle(),
      supabase.from("runner_payout_accounts").select("id,provider,account_number,account_name,is_default").eq("user_id", user.id).order("created_at"),
      supabase.from("wallet_entries").select("id,kind,amount,label,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("payout_requests").select("id,amount,status,transfer_reference,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    const premiereErreur =
      w.error ?? a.error ?? e.error ?? p.error ?? erreurMaturation ?? null;
    setMessageErreur(premiereErreur ? premiereErreur.message : null);

    setWallet((w.data as WalletRow) ?? null);
    setAccounts((a.data ?? []) as AccountRow[]);
    setEntries((e.data ?? []) as EntryRow[]);
    setPayouts((p.data ?? []) as PayoutRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Le formulaire vit dans la section de retrait : elle vide ses champs quand
  // l'enregistrement a réellement abouti, d'où le booléen rendu.
  const addAccount = async (compte: {
    provider: MomoProvider;
    number: string;
    holder: string;
  }): Promise<boolean> => {
    if (!user) return false;
    if (compte.number.trim().length < 8 || compte.holder.trim().length < 2) {
      toast.error("Numéro et nom du titulaire requis.");
      return false;
    }
    setBusy(true);
    const { error } = await supabase.from("runner_payout_accounts").insert({
      user_id: user.id,
      provider: compte.provider,
      account_number: compte.number.trim(),
      account_name: compte.holder.trim(),
      is_default: accounts.length === 0,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Compte de retrait ajouté");
    load();
    return true;
  };

  const removeAccount = async (id: string) => {
    const { error } = await supabase.from("runner_payout_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const requestPayout = async (montant: number): Promise<boolean> => {
    if (!user) return false;
    const available = wallet?.available_balance ?? 0;
    if (montant < rule.minPayout) {
      toast.error(`Minimum ${formatFcfa(rule.minPayout)}.`);
      return false;
    }
    if (montant > available) {
      toast.error("Montant supérieur au solde disponible.");
      return false;
    }
    const def = accounts.find((a) => a.is_default) ?? accounts[0];
    if (!def) {
      toast.error("Ajoutez d'abord un compte de retrait.");
      return false;
    }
    setBusy(true);
    // Gardes d'interface ci-dessus pour un retour immédiat. Le serveur
    // revérifie le plancher, le solde et la propriété du compte, puis débite
    // le portefeuille de façon atomique : c'est lui qui fait autorité.
    const { error } = await supabase.rpc("payout_request_create", {
      p_amount: montant,
      p_account_id: def.id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Demande de retrait envoyée, traitée sous 1 jour ouvré.");
    load();
    return true;
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

      {messageErreur && (
        <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            Votre portefeuille n'a pas pu être chargé entièrement.
          </p>
          <p className="mt-1 text-muted-foreground">{messageErreur}</p>
          <p className="mt-1 text-muted-foreground">
            Les montants ci-dessous peuvent être incomplets : ne demandez pas de retrait tant que
            cette erreur persiste.
          </p>
        </div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <Wallet className="h-5 w-5 text-primary" />
          <p className="mt-2 text-xs text-muted-foreground">Disponible</p>
          <p className="font-display text-2xl font-semibold">{formatFcfa(wallet?.available_balance)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">En attente</p>
          <p className="font-display text-2xl font-semibold">{formatFcfa(wallet?.pending_balance)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total gagné</p>
          <p className="font-display text-2xl font-semibold">{formatFcfa(wallet?.lifetime_earnings)}</p>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <PayoutSection
          settlement={rule.settlement}
          baremeEnCours={baremeEnCours}
          minPayout={rule.minPayout}
          commissionDue={wallet?.commission_due ?? 0}
          accounts={accounts}
          busy={busy}
          onAddAccount={addAccount}
          onRemoveAccount={removeAccount}
          onRequestPayout={requestPayout}
        />

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
