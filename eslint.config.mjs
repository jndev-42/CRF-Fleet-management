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

  // ── Dominance d'INACTIF : aucun test de rôle en ligne ────────────────────────
  // Les prédicats de src/lib/roles.ts sont enveloppés dans `denyWhenInactive` :
  // un compte portant INACTIF (ou la valeur héritée GUEST) n'exerce aucune
  // autorisation. Un `roles.includes('PRESIDENT')` recodé dans une route court-
  // circuite cette enveloppe, et le compte « bloqué » garde le droit en question
  // — l'interface affiche le blocage, le serveur ne l'applique pas.
  //
  // C'est le pendant, côté APPELANTS, du test d'énumération de
  // src/__tests__/unit/roles.test.ts qui garde le module lui-même. Sans cette
  // règle, le filet ne couvrait que la moitié du chemin : la v1 de la revue de
  // sécurité comptait les routes qui APPELLENT un prédicat, et ne pouvait pas
  // voir les neuf qui comparaient la chaîne brute.
  //
  // Portée : le code serveur, seul à porter la décision d'autorisation. Les
  // composants client gardent leurs `includes` d'affichage — la barrière réelle
  // est la route, et le middleware redirige déjà l'inactif hors des pages.
  {
    files: ["src/app/api/**/*.ts", "src/lib/**/*.ts"],
    // EXEMPTIONS, chacune motivée :
    // - roles.ts : c'est le module qui DÉFINIT les prédicats et l'enveloppe.
    // - session-roles.ts : construit la liste de rôles de la session. Y appeler
    //   un prédicat durci serait circulaire — il faut pouvoir calculer les rôles
    //   d'un compte précisément parce qu'il est bloqué.
    // - licenseStatus.ts : `isDriverRole` y répond à « ce rôle exige-t-il des
    //   papiers à jour ? », pas à « ce compte a-t-il le droit de… ». Le durcir
    //   FERAIT SAUTER le contrôle des papiers pour un compte inactif, soit
    //   l'inverse de l'effet recherché.
    ignores: [
      "src/lib/roles.ts",
      "src/lib/session-roles.ts",
      "src/lib/licenseStatus.ts",
    ],
    rules: {
      "no-restricted-syntax": ["error",
        {
          selector:
            "CallExpression[callee.property.name='includes'][arguments.0.type='Literal']" +
            "[arguments.0.value=/^(SUPER_ADMIN|ADMIN|PRESIDENT|TRESORIER|CADRE|DT|CHVPSP|CHVL|CI\\u002FRPAPS|INACTIF|GUEST)$/]",
          message:
            "Test de rôle en ligne interdit côté serveur : il court-circuite l'enveloppe " +
            "`denyWhenInactive` et rend le droit à un compte INACTIF. Importer le prédicat " +
            "correspondant depuis src/lib/roles.ts (ou l'y ajouter s'il manque).",
        },
        {
          selector:
            "CallExpression[callee.property.name='includes'][arguments.0.object.name='ROLES']",
          message:
            "Test de rôle en ligne interdit côté serveur, même via la constante ROLES : " +
            "il court-circuite `denyWhenInactive`. Importer le prédicat depuis src/lib/roles.ts.",
        },
        // Troisième maille. Les deux sélecteurs ci-dessus ciblent `X.includes(...)` ;
        // le test d'énumération garde le module. Une comparaison directe
        // (`roles[0] === 'INACTIF'`) passe entre les deux — et c'est exactement sous
        // cette forme qu'une copie manuscrite de l'ANCIENNE sémantique d'isInactive
        // avait survécu dans les deux routes d'export de statistiques, laissant un
        // compte bloqué exporter des données nominatives.
        {
          selector: "BinaryExpression[operator=/^===?$/][right.value='INACTIF']",
          message:
            "Ne pas recoder la détection d'inactivité : la sémantique d'INACTIF vit dans " +
            "src/lib/roles.ts. Importer `isInactive` (ou `isQrBlocked` sur le chemin QR).",
        },
        {
          selector: "BinaryExpression[operator=/^===?$/][left.value='INACTIF']",
          message:
            "Ne pas recoder la détection d'inactivité : la sémantique d'INACTIF vit dans " +
            "src/lib/roles.ts. Importer `isInactive` (ou `isQrBlocked` sur le chemin QR).",
        },
      ],
    },
  },
]);

export default eslintConfig;
