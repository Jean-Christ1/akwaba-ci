import { Component, type ErrorInfo, type ReactNode } from "react";

import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  erreur: Error | null;
}

/**
 * Filet de sécurité contre l'écran blanc.
 *
 * Sans lui, une erreur de rendu non interceptée démonte tout l'arbre React et
 * laisse l'utilisateur devant une page vide, sans explication ni moyen de
 * repartir. Ce composant présente un message compréhensible et deux issues :
 * réessayer, ou revenir à l'accueil.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    // La trace part vers la console du navigateur. Elle constituera le point de
    // branchement d'un service de suivi des erreurs le jour venu.
    logger.error("[rendu] erreur non interceptée", erreur, info.componentStack);
  }

  private reessayer = () => {
    this.setState({ erreur: null });
  };

  render() {
    if (!this.state.erreur) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="font-display text-xl font-semibold">Une erreur est survenue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nous n'avons pas pu afficher cette page. Vous pouvez réessayer, ou revenir à
            l'accueil et reprendre votre navigation.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.reessayer}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Réessayer
            </button>
            <a
              href="/"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium"
            >
              Retour à l'accueil
            </a>
          </div>

          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-left text-[11px] text-muted-foreground">
              {this.state.erreur.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
