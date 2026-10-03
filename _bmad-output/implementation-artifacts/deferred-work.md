# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-uniformes-emprunt-rendu.md`
  summary: La désactivation d'un menu (MenuSetting) n'est pas appliquée côté serveur ni pour les non-SUPER_ADMIN — les routes /api/uniforms/*, /api/qr-uniforms/*, la page QR et le bandeau restent actifs.
  evidence: `GET /api/settings/menus` répond 403 hors SUPER_ADMIN, donc `MenuSettingsProvider` renvoie toujours 'available' aux autres ; aucun contrôle de visibilité dans les routes. Antérieur à cette spec (stats/inventaire/missions également touchés).
- source_spec: `_bmad-output/implementation-artifacts/spec-uniformes-emprunt-rendu.md`
  summary: La page /uniforms (onglets visibles par rôle, redirection menu/INACTIF, rechargement du catalogue au changement d'UL) n'a pas de test de page.
  evidence: aucune occurrence de `app/uniforms` ni `useUniformCatalog` dans src/__tests__ ; l'autorisation est garantie côté API, seul le comportement UX est non couvert.
- source_spec: `_bmad-output/implementation-artifacts/spec-vehicle-verification-guide-pdf.md`
  summary: Le nettoyage de l'objet R2 fraîchement écrit quand l'UPDATE du guide échoue (POST /api/vehicles/[id]/guide) n'a pas de test.
  evidence: maybe-false, gravité medium si vrai (supprimer `previousKey` au lieu de `key` ferait pointer le véhicule vers un objet supprimé) ; à régler par un test injectant un échec de `db.execute` sur l'UPDATE.
- source_spec: `_bmad-output/implementation-artifacts/spec-vehicle-verification-guide-pdf.md`
  summary: La ligne de migration v5.17.0 dans CLAUDE.md doit aussi signaler que DELETE /api/vehicles/[id] répond 500 tant que les colonnes guide n'existent pas.
  evidence: `src/app/api/vehicles/[id]/route.ts` sélectionne explicitement `guideR2Key` dans le DELETE ; la ligne CLAUDE.md ne cite que les routes /guide.
- source_spec: `_bmad-output/implementation-artifacts/spec-vue-dt-filtres-disponibilite.md`
  summary: Vue DT — option « Regrouper par UL » (sections par UL, UL active en premier puis par nombre de véhicules disponibles décroissant).
  evidence: Proposé par bmad-ux (EXPERIENCE.md) ; reporté par l'humain pour garder une PR de taille raisonnable.
- source_spec: `_bmad-output/implementation-artifacts/spec-vue-dt-filtres-disponibilite.md`
  summary: Vue DT — synchroniser le calendrier mensuel avec les filtres (filtre Type, ouverture sur le mois du début, surlignage de la période).
  evidence: Proposé par bmad-ux (EXPERIENCE.md) ; reporté par l'humain pour garder une PR de taille raisonnable.
- source_spec: `_bmad-output/implementation-artifacts/spec-vue-dt-filtres-disponibilite.md`
  summary: Vue DT — tuiles FleetStatsRow propres au mode (Réservés / Potentiellement disponibles) pour que la somme des tuiles égale le Total, et tuiles cliquables.
  evidence: Revue (Blind Hunter) : en Vue DT, Réservé et Potentiel ne sont comptés que dans le Total ; prévu par EXPERIENCE.md mais hors tâches de la spec.

- source_spec: `_bmad-output/implementation-artifacts/spec-audit-trail.md`
  summary: Tester le rendu de la page Administration selon le rôle (onglet « Journal d'audit » visible pour SUPER_ADMIN seulement).
  evidence: Aucun test ne rend `src/app/users/page.tsx` ; retirer `isSuperAdminUser &&` ne casserait aucun test (le 403 serveur, lui, est testé).

- source_spec: `_bmad-output/implementation-artifacts/spec-themes-saisonniers.md`
  summary: Tester côté page admin que les onglets réservés au super admin (« Thèmes », « Journal d'audit ») sont absents pour un ADMIN.
  evidence: `src/app/users/page.tsx` n'a aucun test de rendu ; seuls les 403 des API sont couverts.
