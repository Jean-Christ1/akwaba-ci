import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { AdminSearch } from "./AdminSearch";
import type { UserHit } from "./search";
import type { AppRole, UserRoleRow } from "./types";

const ROLES: { value: AppRole; label: string; primary?: boolean }[] = [
  { value: "partner", label: "Partenaire" },
  { value: "moderator", label: "Modérateur" },
  { value: "admin", label: "Administrateur", primary: true },
];

/**
 * Attribution des rôles.
 *
 * Le compte à promouvoir se choisit dans la recherche : l'interface ne montre
 * jamais un identifiant complet, si bien qu'exiger de le coller rendait
 * l'attribution impossible en pratique. La cible retenue reste affichée pendant
 * l'opération, pour qu'on sache à qui l'on donne quoi.
 */
export function UsersTab({ users, onReload }: { users: UserRoleRow[]; onReload: () => void }) {
  const [cible, setCible] = useState<UserHit | null>(null);
  const [busy, setBusy] = useState(false);

  const attribuer = async (role: AppRole) => {
    if (!cible?.userId) return;
    setBusy(true);
    const { error } = await supabase.from("user_roles").insert({ user_id: cible.userId, role });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Rôle attribué à ${cible.displayName ?? "ce compte"}.`);
    onReload();
  };

  const revoquer = async (id: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rôle révoqué");
    onReload();
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm font-medium">Promouvoir un utilisateur</p>
        <AdminSearch
          onPickUser={setCible}
          pickLabel="Choisir ce compte"
          hint="Cherchez le compte par son adresse de courriel, son nom ou son téléphone, puis choisissez-le."
        />

        {cible && (
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{cible.displayName ?? "Nom non renseigné"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {[cible.email, cible.phone].filter(Boolean).join(" · ") || "Aucune coordonnée"}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">{cible.userId}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCible(null)}>
                Changer de compte
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <Button
                  key={r.value}
                  size="sm"
                  variant={r.primary ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => attribuer(r.value)}
                >
                  + {r.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User ID</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}…</TableCell>
                <TableCell>{u.profiles?.display_name ?? "-"}</TableCell>
                <TableCell>
                  <Badge>{u.role}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => revoquer(u.id)}>
                    <X className="h-4 w-4" /> Révoquer
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Aucun rôle attribué.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

export default UsersTab;
