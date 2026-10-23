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

- source_spec: `_bmad-output/implementation-artifacts/spec-themes-saisonniers-3.md`
  summary: Tester les scripts de migration (cas de `add-seasonal-themes.ts` sur une base qui a `SeasonalTheme` mais pas `SeasonalThemeUL`).
  evidence: Aucun script de migration n'est couvert par un test ; une régression vers un retour anticipé ferait sauter la table de liaison et les trois routes des thèmes répondraient 500.

- source_spec: `_bmad-output/implementation-artifacts/spec-theme-halloween.md`
  summary: Extraire un socle CSS commun aux thèmes saisonniers (scènes, navbar, titres, cartes, boutons) piloté par des variables `--season-*`, pour ne plus dupliquer chaque feuille.
  evidence: `halloween.css` reprend règle pour règle `vendanges-montmartre.css` ; des commentaires y ont déjà divergé. Chaque correction future doit être reportée dans N feuilles.
- source_spec: `_bmad-output/implementation-artifacts/spec-theme-halloween.md`
  summary: Le test `licenseCheck.test.ts` n°6 (« Driver avec last_validation expirée ») échoue sur `main` (`expected 15 to be 14`).
  evidence: Reproduit le 16/10/2026 sur le dépôt principal sans le changement Halloween ; probablement lié à la date courante.
- source_spec: `_bmad-output/implementation-artifacts/spec-theme-noel.md`
  summary: Le test d'intégration `licenseCheck.test.ts` (cas 6, `daysLeft` attendu à 14) échoue quand le délai de grâce de 14 jours englobe un changement d'heure.
  evidence: `src/lib/licenseStatus.ts` l.80 calcule `Math.ceil(msLeft / 86 400 000)` en millisecondes : le passage à l'heure d'hiver du 25 octobre 2026 ajoute une heure et donne 15 ; constaté le 16 octobre 2026, aucun fichier de licence touché par cette branche.
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-report-document-scanner.md`
  summary: L'étape « Compte rendu signé » annonce « Maximum 15 Mo par fichier » (maxSizeMB=15) alors que /api/drive/upload refuse tout fichier > 4,2 Mo.
  evidence: src/components/missions/steps/Step7SignedReport.tsx (maxSizeMB={15}, hint) vs src/app/api/drive/upload/route.ts L45 (MAX_FILE_SIZE = 4.2 Mo) ; un PDF de galerie de 5 à 15 Mo passe le contrôle client puis échoue à l'envoi. Préexistant, non causé par le scanner.

- source_spec: `_bmad-output/implementation-artifacts/spec-web-push-natif-vapid.md`
  summary: Exclure les comptes INACTIF du ciblage de `sendPushNotification` (in-app et push) et supprimer leurs abonnements push à la désactivation.
  evidence: la requête de ciblage de `src/lib/push.ts` (héritée de `onesignal.ts`) ne filtre pas INACTIF ; un compte désactivé garde ses appareils abonnés.
- source_spec: `_bmad-output/implementation-artifacts/spec-web-push-natif-vapid.md`
  summary: Fusionner les deux appels `sendPushNotification` (ADMIN puis RESPO) de `vehicles/[id]/reservations/route.ts` en un seul `roles: ['ADMIN','RESPO']`.
  evidence: un utilisateur à la fois SUPER_ADMIN et PRESIDENT reçoit deux notifications in-app et deux push par demande de réservation.
- source_spec: `_bmad-output/implementation-artifacts/spec-web-push-natif-vapid.md`
  summary: Passer des URL relatives (et non `https://cr-chauffeur.vercel.app/...`) aux notifications des routes metrics et reservations.
  evidence: la notification in-app pointe vers la prod depuis preview et local.
- source_spec: `_bmad-output/implementation-artifacts/spec-web-push-natif-vapid.md`
  summary: Vérifier dans les tests des routes appelantes (trips, checkin, reservations, metrics, cron) les rôles passés à `sendPushNotification`.
  evidence: tous les mocks `@/lib/push` sont des `vi.fn()` sans assertion d'arguments ; une erreur de rôle passerait inaperçue.
- source_spec: `_bmad-output/implementation-artifacts/spec-web-push-natif-vapid.md`
  summary: Détacher l'abonnement push de l'appareil sur tous les chemins de déconnexion (page /inactif, expiration de session).
  evidence: seul le bouton Déconnexion de la Navbar appelle `detachDevice`.
- source_spec: none
  summary: Alertes d'échéance du cron quotidien — désinfection VPSP bientôt due ou dépassée (Admins + CHVPSP) et produits du stock bientôt périmés ou en rupture (responsables du stock), une alerte par échéance et non chaque jour.
  evidence: découpé à la demande de l'utilisateur de la PR « doublons + liens dynamiques + notifications événementielles » (livrable indépendant, nécessite une table de dédoublonnage des alertes).
- source_spec: `_bmad-output/implementation-artifacts/spec-cloche-mobile.md`
  summary: Rendre les notifications de la cloche atteignables au clavier (boutons ou liens au lieu de `div` cliquables) et ajouter un piège de focus dans la modale mobile.
  evidence: les éléments de liste sont des `div onClick` sans `tabIndex` ni gestion d'Entrée/Espace (préexistant) ; la modale mobile place et rend le focus mais ne le retient pas.

- source_spec: `_bmad-output/implementation-artifacts/spec-expense-respo-validation.md`
  summary: Mettre à jour les AGENTS.md et commentaires qui décrivent encore l'ancien rôle RESPO comme manager (src/AGENTS.md:33, api/reservations, vehicles/[id]/reservations, metrics, banners, ul/[id], users ; commentaires users/route.ts:17, validate-papers:11, missions/route.ts:157).
  evidence: RESPO désigne désormais le responsable d'activité (notes de frais seulement) ; ces documents induisent les agents en erreur.
- source_spec: `_bmad-output/implementation-artifacts/spec-expense-respo-validation.md`
  summary: Préciser dans CLAUDE.md que sans la migration add-expense-respo-step, toute la page Notes de frais (liste et détail) répond 500, pas seulement la soumission.
  evidence: GET /api/expenses et /api/expenses/[id] sélectionnent workflowVersion et respo* dans toutes les branches.
- source_spec: `_bmad-output/implementation-artifacts/spec-qr-checkout-correction-km-carburant.md`
  summary: L'emprunt par QR code n'envoie pas la notification « Incident signalé à la prise » quand l'état est « Dégradé » ou « Problème signalé », contrairement à POST /api/trips.
  evidence: src/app/api/trips/route.ts:271-292 notifie PRESIDENT/CADRE ; src/app/api/qr/[token]/checkout/route.ts n'a pas d'équivalent (préexistant).
- source_spec: `_bmad-output/implementation-artifacts/spec-qr-checkout-correction-km-carburant.md`
  summary: Dans CheckOutModal, vider le champ « Kilométrage réel » le transforme en 0 km, qui est alors enregistré ; mutualiser le bloc de correction (DataCorrectionFields) et la notification « données incorrectes » entre la modale et le parcours QR.
  evidence: CheckOutModal.tsx:273 `Number(e.target.value)` sur un champ vide donne 0 et `required` ne bloque plus ; le parcours QR est corrigé, la modale non (préexistant, et notification dupliquée entre trips/route.ts et qr/[token]/checkout/route.ts).
