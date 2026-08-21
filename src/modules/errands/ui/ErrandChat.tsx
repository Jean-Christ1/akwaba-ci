import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { ErrandMessage } from "@/modules/errands/application/useErrandDetail";

interface ErrandChatProps {
  errandId: string;
  messages: ErrandMessage[];
  /** Identifiant du lecteur, pour aligner ses propres messages à droite. */
  userId: string | undefined;
  /** Seules les parties de la course peuvent écrire. */
  peutEcrire: boolean;
}

/**
 * Fil de discussion entre le client et son shopper.
 *
 * Les messages arrivent en direct par l'abonnement posé sur la course : ce
 * composant se contente d'écrire, il ne recharge rien lui-même.
 */
export function ErrandChat({ errandId, messages, userId, peutEcrire }: ErrandChatProps) {
  const [draft, setDraft] = useState("");
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bas.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const envoyer = async () => {
    if (!draft.trim() || !userId) return;
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase
      .from("errand_messages")
      .insert({ errand_id: errandId, sender_id: userId, body });
    if (error) {
      // La saisie est rendue plutôt que perdue : le message n'est pas parti.
      setDraft(body);
      toast.error(error.message);
    }
  };

  return (
    <section className="flex h-[420px] flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Discussion</h2>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun message. Coordonnez-vous ici en temps réel.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
              m.sender_id === userId
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {m.body}
            <span className="mt-0.5 block text-[10px] opacity-70">
              {new Date(m.created_at).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
        <div ref={bas} />
      </div>
      {peutEcrire && (
        <div className="flex gap-2 border-t border-border p-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && envoyer()}
            placeholder="Écrire un message…"
          />
          <Button size="icon" onClick={envoyer} aria-label="Envoyer">
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  );
}

export default ErrandChat;
