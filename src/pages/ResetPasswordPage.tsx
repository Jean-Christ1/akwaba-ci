import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Logo } from "@/shared/ui/Logo";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("8 caractères minimum");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe mis à jour");
    navigate("/profil");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md akw-card p-8 space-y-4">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="font-display text-2xl font-semibold text-center">Nouveau mot de passe</h1>
        <div>
          <Label htmlFor="pwd">Mot de passe</Label>
          <Input id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : "Mettre à jour"}</Button>
      </form>
    </div>
  );
}
