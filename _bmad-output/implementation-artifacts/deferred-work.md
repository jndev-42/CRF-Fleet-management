# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-uniformes-emprunt-rendu.md`
  summary: La désactivation d'un menu (MenuSetting) n'est pas appliquée côté serveur ni pour les non-SUPER_ADMIN — les routes /api/uniforms/*, /api/qr-uniforms/*, la page QR et le bandeau restent actifs.
  evidence: `GET /api/settings/menus` répond 403 hors SUPER_ADMIN, donc `MenuSettingsProvider` renvoie toujours 'available' aux autres ; aucun contrôle de visibilité dans les routes. Antérieur à cette spec (stats/inventaire/missions également touchés).
- source_spec: `_bmad-output/implementation-artifacts/spec-uniformes-emprunt-rendu.md`
  summary: La page /uniforms (onglets visibles par rôle, redirection menu/INACTIF, rechargement du catalogue au changement d'UL) n'a pas de test de page.
  evidence: aucune occurrence de `app/uniforms` ni `useUniformCatalog` dans src/__tests__ ; l'autorisation est garantie côté API, seul le comportement UX est non couvert.
