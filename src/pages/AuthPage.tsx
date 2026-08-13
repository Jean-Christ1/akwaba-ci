import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Logo } from "@/shared/ui/Logo";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

const emailSchema = z.string().email("Email invalide").max(255);
const passwordSchema = z.string().min(8, "8 caractères minimum").max(72);
const nameSchema = z.string().trim().min(2, "Nom trop court").max(80);

export default function AuthPage() {
  usePageTitle("Connexion", "Connectez-vous pour retrouver vos favoris et vos demandes.");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/profil", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        nameSchema.parse(name);
        emailSchema.parse(email);
        passwordSchema.parse(password);
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/profil`,
            data: { display_name: name },
          },
        });
        if (error) throw error;
        toast.success("Compte créé ! Vérifiez vos emails si la confirmation est activée.");
      } else if (mode === "signin") {
        emailSchema.parse(email);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bienvenue !");
        navigate("/profil");
      } else {
        emailSchema.parse(email);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Email de réinitialisation envoyé.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err instanceof Error ? err.message : null) ?? "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md akw-card p-8">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h1 className="font-display text-2xl font-semibold text-center mb-1">
          {mode === "signin" && "Connexion"}
          {mode === "signup" && "Créer un compte"}
          {mode === "reset" && "Réinitialiser"}
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {mode === "reset" ? "Recevez un lien par email." : "Accédez à vos favoris et demandes."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label htmlFor="name">Nom</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" enterKeyHint="next" />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" />
          </div>
          {mode !== "reset" && (
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} enterKeyHint="go" />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer" : "Envoyer le lien"}
          </Button>
        </form>


        <div className="mt-6 text-center text-sm space-y-2">
          {mode === "signin" && (
            <>
              <button onClick={() => setMode("signup")} className="text-primary hover:underline">Créer un compte</button>
              <div><button onClick={() => setMode("reset")} className="text-muted-foreground hover:underline text-xs">Mot de passe oublié ?</button></div>
            </>
          )}
          {mode === "signup" && (
            <button onClick={() => setMode("signin")} className="text-primary hover:underline">J'ai déjà un compte</button>
          )}
          {mode === "reset" && (
            <button onClick={() => setMode("signin")} className="text-primary hover:underline">Retour</button>
          )}
        </div>
        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:underline">← Retour à l'accueil</Link>
        </div>
      </div>
    </div>
  );
}
