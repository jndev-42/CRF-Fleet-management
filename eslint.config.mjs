import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── Intégrité des PDF scellés ───────────────────────────────────────────────
  // Un PDF signé ne peut être complété que par incremental update. Toute
  // réécriture complète (`pdf-lib.save()`, ou l'import de `pdf-lib` sur le chemin
  // de scellement) casserait le condensat des signatures déjà posées — et le
  // défaut ne serait visible qu'à l'ouverture dans Acrobat, une fois le document
  // figé par DocMDP.
  {
    files: ["src/lib/pdf/**/*.ts", "src/lib/expenses/sealing.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "pdf-lib",
          message:
            "pdf-lib réécrit le document entier et invaliderait les signatures existantes. " +
            "Utiliser src/lib/pdf/incremental.ts, qui n'ajoute que des incremental updates.",
        }, {
          name: "@cantoo/pdf-lib",
          message: "Même raison que pdf-lib — voir src/lib/pdf/incremental.ts.",
        }],
      }],
      // `no-restricted-imports` ne sait pas interdire un APPEL de méthode :
      // il faut un sélecteur AST pour attraper `.save()` sur ce chemin.
      "no-restricted-syntax": ["error", {
        selector: "CallExpression[callee.property.name='save']",
        message:
          "Appel à .save() interdit sur le chemin de scellement : il réécrirait le PDF " +
          "en entier. Les modifications doivent passer par augmentIncremental().",
      }],
    },
  },
]);

export default eslintConfig;
