---
title: 'Consignes de déclaration d’incident : remplacer le lorem ipsum par le texte définitif'
type: 'bugfix'
created: '2026-11-06'
status: 'done'
baseline_commit: '2bf543271aaf2fd508e190b4a3fafd4a200bad5c'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L’écran « 📋 Consignes incident » (proposé avant toute déclaration d’incident véhicule) affiche deux paragraphes de lorem ipsum, et ses consignes ne correspondent qu’en partie au formulaire réel (Onyx, constat, flash radar absents).

**Approach:** Réécrire `IncidentGuidelines` avec un texte définitif en français, aligné sur le formulaire existant : urgences (15/18/17/112), conduite à tenir après un accident (sécuriser, secourir, prévenir Onyx, constat amiable, photos), rappel pour le flash radar / l’infraction, puis délai de déclaration dans l’application.

**Décisions (humain, 2026-11-06) :** délai de déclaration dans l’application = **24 heures** ; texte rédigé par l’agent à partir de l’appli et de la loi, relu par l’humain dans la PR (pas de note officielle fournie).

## Boundaries & Constraints

**Always:** Uniquement des faits présents dans l’appli ou établis par la loi : Onyx = cadre de permanence, 01 84 83 28 00 (repris de `src/app/aide/page.tsx`), numéros cliquables en `tel:`. Le titre « Consignes en cas d’incident » ne change pas (le test existant s’appuie dessus). Les couleurs passent par les variables CSS (mode sombre).

**Never:** Ne toucher ni au flux de la modale, ni à l’API, ni à la base de données. N’inventer aucun numéro, aucun contact, aucune procédure interne qui ne figure pas dans le dépôt.

</frozen-after-approval>

## Code Map

- `src/components/vehicle/IncidentGuidelines.tsx` — composant purement statique (styles en ligne) ; seul fichier qui contient du lorem ipsum (`grep -ri lorem src public`).
- `src/components/vehicle/modals/IncidentReportModal.tsx:285` — seul appel du composant (étape `GUIDELINES_VIEW`) ; types ACCIDENT et FLASH ; cases « Appel 15/18/17 », « Contact Onyx », « Constat effectué », photos des dégâts et du constat, champ « N° Fiche Inter ». À ne pas modifier.
- `src/app/aide/page.tsx:178` — numéro d’Onyx (Cadre) et format des liens `tel:`.
- `src/__tests__/components/IncidentReportModal.test.tsx:86-87` — vérifie le titre de la modale et le `<h3>` des consignes.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/vehicle/IncidentGuidelines.tsx` — remplacer le contenu par le texte définitif (sections Urgence / Accident / Flash radar / Délai), retirer le commentaire « Phase 2 », lien `tel:` vers Onyx.
- [x] `src/__tests__/components/IncidentGuidelines.test.tsx` — nouveau test : aucun « lorem » dans le rendu, présence d’Onyx avec `href="tel:0184832800"`, présence des sections accident et flash.
- [x] `package.json` / `package-lock.json` / `CHANGELOG.md` — version patch et entrée en français, centrée sur l’utilisateur.

**Acceptance Criteria:**
- Given un utilisateur qui déclare un incident, when il choisit « Oui, voir les consignes », then il lit un texte entièrement en français, sans lorem ipsum, qui couvre l’accident et le flash radar.
- Given l’écran des consignes sur mobile, when il touche le numéro d’Onyx, then le téléphone propose d’appeler le 01 84 83 28 00.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|--------|---------|---------|----------------|
| 1 | edge-case + blind | Le paragraphe « Délai » cite Onyx, constat et photos, absents du formulaire FLASH | medium | patch — `FORM_FLASH` ne contient que date, lieu, fiche inter, hors SAMU |
| 2 | blind | La section flash laisse entendre que le bénévole désigne le conducteur | medium | patch — l’avis part au titulaire du certificat d’immatriculation (UL), qui désigne le conducteur |
| 3 | blind | Rien sur l’identité du tiers, les témoins, le refus de constat ou la fuite | medium | patch — l’ancien texte mentionnait les témoins, le nouveau les a perdus |
| 4 | blind | Liens `--crf-red` peu lisibles dans le bandeau rouge en mode sombre | low | patch — `--crf-red` n’est pas redéfini en mode sombre, alors que le bandeau passe en `#fca5a5` |
| 5 | blind | package-lock.json pas mis à jour | false | `package-lock.json` est en 5.44.1 (lignes 3 et 9) ; il manquait seulement dans le fichier de diff |
| 6 | blind | Numéro d’Onyx copié à trois endroits | low | rejeté — duplication qui existait déjà ; la corriger demande un nouveau module partagé |
| 7 | blind | Délais de 5 jours ouvrés et de 45 jours sans source | false | délais légaux : C. assur. L113-2 et C. route L121-6 ; la relecture humaine se fait dans la PR (décision dans l’Intent) |
| 8 | blind | La case du formulaire dit « Appel 15/18/17 », sans le 112 | low | rejeté — il faudrait modifier la modale, ce que la spec exclut ; peu gênant pour l’utilisateur |
| 9 | blind | Les titres en `h4` sautent un niveau | false | titre de la modale en `h2`, titre des consignes en `h3`, sections en `h4` : la hiérarchie est continue |
| 10 | blind | Les emoji des titres sont lus par les lecteurs d’écran | low | rejeté — l’appli utilise les emoji partout de la même façon ; à traiter globalement si besoin |
| 11 | blind | Tests trop légers (délais, noms accessibles, intégration à la modale) | low | rejeté — l’intégration est couverte par `IncidentReportModal.test.tsx:86-87` ; le reste est du texte statique |
| 12 | blind | Le changelog range l’entrée dans « Corrections » | low | rejeté — remplacer un texte provisoire est bien une correction |
| 13 | blind | AGENTS.md pas mis à jour | low | rejeté — la description « Incident reporting guidance text » reste exacte |
| 14 | verification-gap | Aucun manque | — | — |
| 15 | orchestrateur (après correctifs) | `style={{bannerLinkStyle}}` : le style des liens du bandeau n’était pas appliqué | medium | patch appliqué directement → `style={bannerLinkStyle}` ; tsc, tests et lint au vert |

## Verification

**Commands:**
- `npx vitest run src/__tests__/components/IncidentGuidelines.test.tsx src/__tests__/components/IncidentReportModal.test.tsx` — attendu : vert
- `npm run lint` — attendu : 0 erreur, 0 warning
