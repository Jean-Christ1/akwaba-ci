import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  /**
   * Les droits atomiques de la personne connectee, tels que le serveur les
   * resout : role d'exploitation, octroi nominatif, et le role herite admin
   * qui les porte tous.
   */
  droits: string[];
  loading: boolean;
  isAdmin: boolean;
  isPartner: boolean;
  isModerator: boolean;
  /**
   * Vrai si la personne porte ce droit.
   *
   * A n'utiliser que pour decider ce qu'on AFFICHE. Le serveur refuse de
   * lui-meme ce qu'il doit refuser : masquer un bouton n'a jamais protege une
   * table, et un ecran qui se croirait seul gardien serait contourne par un
   * appel direct.
   */
  peut: (code: string) => boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [droits, setDroits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    const [{ data }, { data: permissions }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      // Le serveur resout les droits : l'ecran ne les recalcule pas a partir
      // des roles, sinon deux regles coexisteraient et finiraient par diverger.
      supabase.rpc("my_permissions"),
    ]);
    setRoles((data ?? []).map((r) => r.role as AppRole));
    setDroits(((permissions as string[]) ?? []) as string[]);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
        setDroits([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRoles(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    // Force a session refresh so any DB-side role change becomes effective
    // and re-load roles from the user_roles table without requiring sign-out.
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
        await loadRoles(data.session.user.id);
        return;
      }
    } catch {
      // ignore: fall back to local refresh
    }
    if (user) await loadRoles(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        loading,
        droits,
        peut: (code: string) => droits.includes(code),
        isAdmin: roles.includes("admin"),
        isPartner: roles.includes("partner") || roles.includes("admin"),
        isModerator: roles.includes("moderator") || roles.includes("admin"),
        signOut,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
