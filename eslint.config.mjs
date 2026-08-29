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
    // Worktrees git locaux (gitignorés) : ce sont d'autres checkouts du repo,
    // avec leur propre `.next/` que le glob `.next/**` ci-dessus, ancré à la
    // racine, ne couvre pas. Les parcourir fait exploser la heap d'ESLint.
    "worktrees/**",
  ]),

  // ── Intégrité des PDF scellés ───────────────────────────────────────────────
  // Un PDF signé ne peut être complété que par incremental update. Toute
  // réécriture complète (`pdf-lib.save()`, ou l'import de `pdf-lib` sur le chemin
  // de scellement) casserait le condensat des signatures déjà posées — et le
  // défaut ne serait visible qu'à l'ouverture dans Acrobat, une fois le document
  // figé par DocMDP.
  {
    // `fields.ts` est volontairement EXCLU : il pose les champs de signature sur
    // le document ENCORE NON SIGNÉ, avant le premier scellement. C'est le seul
    // endroit où une réécriture complète est non seulement permise mais requise —
    // un champ ajouté après la certification invaliderait toutes les signatures.
    files: ["src/lib/pdf/**/*.ts", "src/lib/expenses/sealing.ts"],
    ignores: ["src/lib/pdf/fields.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "pdf-lib",
          message:
            "pdf-lib réécrit le document entier et invaliderait les signatures existantes. " +
            "Utiliser src/lib/pdf/incremental.ts, qui n'ajoute que des incremental updates. " +
            "Seul fields.ts y échappe : il agit avant la première signature.",
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
          "en entier. Les modifications doivent passer par addPlaceholderToField().",
      }],
    },
  },
]);

export default eslintConfig;
