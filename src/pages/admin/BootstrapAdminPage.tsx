import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export default function BootstrapAdminPage() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [userId, setUserId] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const useMyId = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) setUserId(data.user.id);
    else toast.error("Connectez-vous d'abord");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("bootstrap-admin", {
        body: { user_id: userId.trim(), token: token.trim() },
      });
      if (error) throw error;
      const payload = data as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      await refreshRoles();
      toast.success("Admin créé. Vos accès sont actifs immédiatement.");
      setTimeout(() => navigate("/admin"), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="akw-container py-10 max-w-xl">
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl">Promotion administrateur</h1>
            <p className="text-xs text-muted-foreground">À usage unique — désactivé après le premier admin.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>User ID</Label>
            <div className="flex gap-2">
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid de l'utilisateur" required />
              <Button type="button" variant="outline" onClick={useMyId}>Mon ID</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Token de bootstrap</Label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Le secret BOOTSTRAP_ADMIN_TOKEN configuré dans Lovable Cloud.</p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Création…" : "Devenir administrateur"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
