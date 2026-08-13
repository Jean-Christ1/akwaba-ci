/**
 * Journalisation applicative.
 *
 * Les traces de mise au point ne doivent pas partir en production : elles
 * exposent la mécanique interne dans la console du navigateur et polluent la
 * sortie. Les erreurs, elles, restent toujours signalées, car c'est le seul
 * signal exploitable quand un incident survient chez un utilisateur.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** Trace de mise au point, silencieuse en production. */
  debug(...args: unknown[]) {
    if (isDev) console.info(...args);
  },

  /** Avertissement, conservé en production. */
  warn(...args: unknown[]) {
    console.warn(...args);
  },

  /** Erreur, toujours conservée. */
  error(...args: unknown[]) {
    console.error(...args);
  },
};

export default logger;
