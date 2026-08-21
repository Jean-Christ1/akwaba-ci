import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Les fonctions edge tournent sous Deno, pas sous le navigateur : les
    // analyser avec la configuration front produit du bruit sans valeur. Elles
    // ont leur propre chaîne de vérification (deno check, deno test).
    ignores: ["dist", "supabase/functions/**", "scripts/**"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Signale le code mort sans bloquer, en tolérant la convention du
      // préfixe souligné pour un argument volontairement ignoré.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Le fichier de types Supabase est généré : le reformater ou le typer à la
    // main serait écrasé à la prochaine génération.
    files: ["src/integrations/supabase/types.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    // Les primitives shadcn/ui sont reprises telles quelles de la bibliothèque.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
);
