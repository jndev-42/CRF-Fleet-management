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
- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-vehicule.md`
  summary: Cloisonner par UL les routes de gestion qui ne le sont pas : réservations (POST vehicles/[id]/reservations, PATCH/DELETE reservations/[id], reservations/recurrence/[groupId]), trips/[id] (DELETE, checkout, desinf-pre), PATCH/DELETE incidents/[id], POST vehicles, checklist, metrics et qr-token. Aujourd'hui, un gestionnaire de l'UL A peut agir sur les données de l'UL B.
  evidence: faille antérieure relevée pendant l'implémentation du rôle RESP_VEHICULE. La corriger change le comportement d'ADMIN, CADRE et PRESIDENT, et casse les tests qui créent des sessions sans ulId : hors périmètre.
  resolved: `spec-permis-et-cloisonnement-ul.md` (v5.31.0) — `isOutsideUl` → 404 sur GET/POST vehicles/[id]/reservations, PATCH/PUT/DELETE reservations/[id], PATCH/DELETE reservations/recurrence/[groupId] (chaque véhicule du groupe), trips/[id] (DELETE, checkout, desinf-pre, checkin, second-driver, refresh-renault), PATCH/DELETE incidents/[id] (`isWithinUlScope`), GET/POST vehicles/[id]/checklist, PATCH metrics, GET/POST/DELETE qr-token, POST stats/csv et stats/pdf ; motif en ligne durci dans vehicles/[id], maintenance, maintenance/[recordId], vehicles/[id]/trips, checklist/[itemId], desinfections, renault/[vin]. POST /api/vehicles était déjà cloisonné. Tests : `src/__tests__/integration/ul-scoping.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-vehicule.md`
  summary: Le trou de cloisonnement par UL (entrée précédente) concerne désormais aussi chaque RESP_VEHICULE, donc chaque cadre migré. Prioriser les routes destructrices : DELETE trips/[id], DELETE incidents/[id], DELETE réservations.
  evidence: revue de la PR RESP_VEHICULE ; `canManageVehicles` ne vérifie pas l'UL et ces routes ne comparent pas `session.user.ulId` à `vehicle.ulId`.
  resolved: `spec-permis-et-cloisonnement-ul.md` (v5.31.0) — DELETE trips/[id], DELETE incidents/[id], DELETE reservations/[id] et reservations/recurrence/[groupId] répondent 404 hors UL, RESP_VEHICULE compris (cf. entrée précédente).
- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-vehicule.md`
  summary: Un CADRE ou PRESIDENT sans rôle chauffeur ne peut pas créer de réservation au nom d'autrui depuis l'UI : le contournement d'éligibilité suit `canManageVehicles`, alors que le serveur les accepte comme valideurs (`canManageReservations`).
  evidence: antérieur (le contournement était `isAdminOrAbove`) ; à arbitrer avec l'utilisateur, car « le cadre doit avoir CHVL pour emprunter ».
- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-vehicule.md`
  summary: Les listes de chauffeurs de GET /api/users filtrent sur `UserRole` global (et non sur `UserUL.roles` de l'UL) et n'excluent pas les comptes INACTIF.
  evidence: même sémantique dans la branche ADMIN existante et dans la nouvelle branche des gestionnaires de flotte ; un INACTIF peut être choisi comme conducteur.
- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-vehicule.md`
  summary: Ajouter un test de rendu de /stats vérifiant qu'une session CADRE ou RESP_VEHICULE n'est pas redirigée.
  evidence: seul le prédicat `canViewStatsPage` est testé.
- source_spec: `_bmad-output/implementation-artifacts/spec-permis-et-cloisonnement-ul.md`
  summary: Cloisonner par UL la gestion des utilisateurs : liste complète de GET /api/users, PATCH validate-papers, édition des rôles. Un admin de l'UL A peut aujourd'hui valider les papiers d'un utilisateur de l'UL B.
  evidence: hors de l'intention de cette spec (faille des routes véhicule) ; `validate-papers` ne vérifie que `canAccessAdminPanel`.
  resolved: `spec-cloisonnement-ul-utilisateurs.md` (v5.31.0) — PATCH validate-papers répond 404 hors SUPER_ADMIN si la cible a une UL et aucune dans l'UL active de l'acteur ; un compte sans UL reste validable. La liste complète de GET /api/users et la gestion des rôles et des UL (`users/[email]`, `users/[email]/ul`) restent volontairement non cloisonnées, par décision de l'utilisateur (2026-10-23). Tests : `src/__tests__/integration/licenseCheck.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-permis-et-cloisonnement-ul.md`
  summary: Mettre à jour les AGENTS.md qui décrivent encore le contrôle des papiers comme réservé aux chauffeurs (src/app/api/me/AGENTS.md:7,15 ; src/app/users/AGENTS.md ; validate-papers/AGENTS.md) et harmoniser la casse « Cross-UL ».
  evidence: le contrôle des papiers s'applique désormais à tout conducteur.
  resolved: `spec-cloisonnement-ul-utilisateurs.md` (v5.31.0) — api/me, validate-papers, api/users et app/users corrigés (papiers de tout compte qui emprunte, liste complète visible) ; « (cross-UL ( » en minuscule dans checklist et refresh-renault.
- source_spec: `_bmad-output/implementation-artifacts/spec-mcp-server-tokens.md`
  summary: Permettre à l'IA connectée en MCP d'agir sur une autre UL que l'UL d'attache du propriétaire du jeton (paramètre `ulId` validé contre ses UL).
  evidence: La session MCP est figée sur l'UL d'attache (`resolveActiveUL`) ; un admin de plusieurs UL ne peut pas agir sur une UL secondaire via le MCP (revue edge/blind).

- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-inventaire.md`
  summary: `sendPushNotification` (src/lib/push.ts) cible aussi les comptes portant INACTIF (ADMIN, RESP_INVENTAIRE…) — exclure les destinataires inactifs de la requête UserUL/UserRole.
  evidence: la requête filtre par `',' || uu.roles || ',' LIKE '%,ROLE,%'` sans condition sur INACTIF ; un `['ADMIN','INACTIF']` reçoit donc le résumé de stock et les alertes véhicule.
  resolved: v5.37.0 — `sendPushNotification` exclut INACTIF/GUEST (rôles CSV de l'UL, sinon rôles globaux) ; tests dans `push.test.ts`.
- source_spec: `_bmad-output/implementation-artifacts/spec-role-responsable-inventaire.md`
  summary: Description du menu Inventaire dans `src/components/admin/MenusTab.tsx` obsolète (« onglet Inventaire sur la fiche véhicule » n'existe plus) et muette sur l'accès des responsables inventaire en « Admin uniquement ».
  evidence: MenusTab.tsx l.26 ; aucun onglet Inventaire dans la fiche véhicule ; `canSeeInventoryMenu` accepte RESP_INVENTAIRE en admin_only.
  resolved: v5.37.0 — description du menu Inventaire corrigée.
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-type-entrainement.md`
  summary: Centraliser la liste des types de mission dans une constante partagée (CheckOutModal, EditCheckOutModal, CheckOutForm QR, filtre Statistiques).
  evidence: Les trois formulaires et le filtre de src/app/stats/page.tsx:49 tiennent chacun leur propre liste, déjà divergentes (le QR propose Opération/Formation/Administratif/Autre, pas les modales ; le filtre stats ne propose ni DPS ni Entraînement).
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-type-entrainement.md`
  summary: Modifier une prise créée par QR avec un type absent de EditCheckOutModal (Formation, Opération, Administratif, Autre) affiche puis peut enregistrer un autre type.
  evidence: Bug antérieur. EditCheckOutModal initialise missionType à trip.missionType mais son select n'a pas d'option pour ces valeurs ; un select contrôlé sans option correspondante affiche la première option (DPS).
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-type-entrainement.md`
  summary: Valider côté serveur missionType contre la liste connue (z.enum ou refine) pour éviter des variantes orthographiques qui scindent les statistiques.
  evidence: checkOutSchema.missionType est z.string().min(1) ; un client API/MCP peut envoyer « Entrainement » sans accent. Nécessite au préalable la constante partagée et la prise en compte des valeurs historiques en base.
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-report-accident-et-historique.md`
  summary: Un lien de notification vers un objet d'une autre UL que l'UL active renvoie 403 jusqu'au changement manuel d'UL (toutes notifications ciblées par UL, dont les alertes d'incident mission).
  evidence: `canReadMissionReport` compare à `session.user.ulId` ; aucun basculement d'UL à l'ouverture d'une notification.
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-report-accident-et-historique.md`
  summary: La ligne de migration v5.36.0 (`add-mission-report-edits.ts`) est insérée avant celle de la v5.35.0 dans CLAUDE.md — à remettre dans l'ordre chronologique.
  evidence: ordre des commandes de migration dans la section Commands de CLAUDE.md.
  resolved: v5.38.0 — ligne `add-mission-report-edits.ts` placée après celle de la v5.37.0.
- source_spec: `_bmad-output/implementation-artifacts/spec-mission-report-accident-et-historique.md`
  summary: Vérifier que `sendPushNotification` exclut les comptes portant INACTIF dans `UserUL.roles` (non vérifié, pré-existant ; medium si avéré).
  evidence: la requête de ciblage de `src/lib/push.ts` (~l.66-80) filtre par LIKE sur les rôles sans exclusion explicite d'INACTIF ; à confirmer par un test d'intégration.
  resolved: v5.37.0 — `sendPushNotification` exclut INACTIF/GUEST (cf. entrée RESP_INVENTAIRE ci-dessus).

- source_spec: `_bmad-output/implementation-artifacts/spec-mission-report-accident-et-historique.md`
  summary: DELETE /api/missions/[id] laisse orphelines les lignes mission_report_supplies et mission_report_interventions (les FK ne sont pas activées, le ON DELETE CASCADE ne joue pas).
  evidence: `src/__tests__/integration/setup.ts` (« les FK ne sont pas activées dans ce repo ») ; le DELETE ne supprime que mission_report_edits et mission_reports.

- source_spec: `_bmad-output/implementation-artifacts/spec-reservation-pour-autrui-cadre.md`
  summary: Aucune route de réservation (POST /api/vehicles/[id]/reservations, PATCH /api/reservations/[id]) ne vérifie les papiers de qui réserve à son propre nom ; un gestionnaire chauffeur aux papiers non validés peut se réserver lui-même (fiche véhicule déjà, dashboard depuis la 5.39.0).
  evidence: Le contrôle des papiers n'existe que côté interface (`getReservationCtaState`, `ReservationBlock`) ; la décision 3 de la spec a aligné le dashboard sur la fiche véhicule, qui laissait déjà passer ce cas.

- source_spec: `_bmad-output/implementation-artifacts/spec-mode-demo-bac-a-sable.md`
  summary: Test de composant de la page Aide pour l'affichage conditionnel de la carte démo (`isDemoAvailable || isDemoMode`).
  evidence: Aucun test ne rend `AidePage` ; une régression masquerait l'activation ou la sortie de la démo sans faire échouer de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-mode-demo-bac-a-sable.md`
  summary: Compléter CLAUDE.md et AGENTS.md : `maxDuration` 300 exige Fluid compute ou l'offre Pro, variables `TURSO_DEMO_*` à définir aussi en preview, démo indisponible pendant la recopie de 23h59.
  evidence: Relevé en revue ; ce sont des fichiers de contexte agent, donc reportés.
- source_spec: `_bmad-output/implementation-artifacts/spec-qr-stock-recherche-scroll-infini.md`
  summary: Mettre à jour `src/app/api/qr-stock/AGENTS.md` avec le nouveau contrat de `GET /stock` (`q`/`offset`/`limit`, `total`, `hasMore`, page par défaut de 30).
  evidence: Le fichier documente encore `{ stock, items }` ; seuls les AGENTS.md de la page ont été mis à jour (route « defer » des fichiers de contexte agent).
- source_spec: `_bmad-output/implementation-artifacts/spec-photo-vehicule.md`
  summary: Le script `scripts/add-vehicle-photo.ts` n'est exécuté par aucun test (dry-run, `--apply`, seconde exécution).
  evidence: Une colonne retirée de `COLUMNS` passerait inaperçue et `POST /photo` répondrait 500 en prod ; même lacune que `add-vehicle-guide.ts`, atténuée par la lecture du dry-run.
- source_spec: `_bmad-output/implementation-artifacts/spec-vehicle-documents.md`
  summary: Rendre obligatoire dans `CLAUDE.md` la relance de `scripts/add-vehicle-documents.ts --apply` juste après le déploiement de la v5.44.0, au lieu de « relançable ».
  evidence: Plus aucune route ne lit `Vehicle.guide*` : un guide déposé après la dernière exécution disparaît de l'interface. Fichier de contexte agent, donc reporté.
- source_spec: `_bmad-output/implementation-artifacts/spec-vehicle-documents.md`
  summary: Documenter dans `CLAUDE.md` que la base démo n'a pas la table `VehicleDocument` avant la recopie de 23h59, et la migrer si besoin avec `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` de la démo.
  evidence: `db` route les requêtes démo vers leur base et `listVehicleDocuments` y lève : les fiches véhicule répondent 500 en mode démo jusqu'à la recopie. Fichier de contexte agent, donc reporté.
- source_spec: `_bmad-output/implementation-artifacts/spec-photo-vehicule-dashboard.md`
  summary: En Vue DT, cliquer sur la carte d'un véhicule d'une autre UL mène à « Véhicule non trouvé » ; `src/app/vehicles/AGENTS.md` ne signale pas cette réserve.
  evidence: `useVehicleDetail` appelle `GET /api/vehicles/[id]`, qui répond 404 hors UL malgré `?dtView=true` ; comportement antérieur à la vignette, lu dans le code et non rejoué.
- source_spec: `_bmad-output/implementation-artifacts/spec-photo-vehicule-dashboard.md`
  summary: Aucun test automatisé ne couvre en navigateur le clic sur la vignette, le recalage du contenu, les hauteurs égales et le débordement sur téléphone.
  evidence: jsdom n'applique ni CSS ni mise en page ; `e2e/` tourne hors CI, sans données photo.

- source_spec: `_bmad-output/implementation-artifacts/spec-securite-et-recopie-demo-manuelle.md`
  summary: Prévenir les SUPER_ADMIN quand une recopie de la base démo échoue ou est sautée.
  evidence: Le résultat `failed` ou `locked` du cron ne va que dans les logs ; un verrou tenu à 23h59 saute la recopie de la nuit sans nouvel essai.
- source_spec: `_bmad-output/implementation-artifacts/spec-securite-et-recopie-demo-manuelle.md`
  summary: Tester la ligne d'audit réellement écrite par `POST /api/demo/refresh`.
  evidence: `demo-refresh.test.ts` n'exécute pas le traçage ; seul le contrôle statique de `withAudit` couvre la route.
- source_spec: `_bmad-output/implementation-artifacts/spec-securite-et-recopie-demo-manuelle.md`
  summary: Vérifier Drive avec les versions montées de ses bibliothèques.
  evidence: Non vérifié : les tests mockent `googleapis`. À trancher par une action Drive réelle sur preview.

- source_spec: `_bmad-output/implementation-artifacts/spec-ndf-r2-dossier-ul.md`
  summary: Réconcilier automatiquement (cron quotidien) la copie publiée `ndf/{UL}/{id}.pdf` avec la révision courante quand son écriture post-commit a échoué.
  evidence: l'écriture est best-effort ; après un échec à la dernière étape (paiement), Drive reste périmé jusqu'à une relance manuelle de `move-expense-pdfs-to-ul-folders.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-ndf-r2-dossier-ul.md`
  summary: Tester le câblage CLI de `scripts/move-expense-pdfs-to-ul-folders.ts` (slug passé en segment, code de sortie) et la copie publiée de `backfill-signed-pdfs.ts`.
  evidence: seule la logique `relocateReport` est testée ; un alias SQL erroné rangerait sous l'ulId sans qu'aucun test n'échoue.

- source_spec: `_bmad-output/implementation-artifacts/spec-images-r2-par-ul.md`
  summary: Ranger par UL les objets R2 existants hors UL — `vehicle-photos/{slug}/{nom véhicule}/` (`Vehicle.photoR2Key`), `vehicle-documents/{slug}/{nom véhicule}/` (`Vehicle.guideR2Key`, `VehicleDocument.r2Key`), `expenses-staging/{slug}/` (`ExpenseReport.pendingReceiptKeys`) — constructeurs de clés + script de rangement ; seul `referentiels/` reste hors UL.
  evidence: découpage choisi par l'utilisateur (spec > 1600 jetons) ; livrable indépendant de la migration Drive → R2 des images.

- source_spec: `_bmad-output/implementation-artifacts/spec-images-r2-par-ul.md`
  summary: Retirer le proxy Drive en lecture seule (`/api/drive/photos/**`, `src/lib/drive.ts`, branches de repli Drive) une fois la migration Drive → R2 appliquée en prod et vérifiée.
  evidence: le repli n'existe que pour la fenêtre entre déploiement et migration. BLOQUANT : les anciens justificatifs de notes de frais (`ExpenseReport.driveFolderId`) restent sur Drive (hors périmètre par décision utilisateur) — les migrer ou les abandonner avant de retirer le proxy.

- source_spec: `_bmad-output/implementation-artifacts/spec-images-r2-par-ul.md`
  summary: Supprimer les lignes `IncidentReport` d'un véhicule supprimé (le `ON DELETE CASCADE` du schéma n'est pas appliqué sur la connexion) ; leurs photos sont déjà supprimées.
  evidence: `src/app/api/vehicles/[id]/route.ts` supprime Trip et Vehicle, pas IncidentReport ; les lignes survivantes pointent vers des dossiers supprimés (PDF d'incident sans photos).

- source_spec: `_bmad-output/implementation-artifacts/spec-images-r2-par-ul.md`
  summary: Balayer les préfixes R2 médias jamais rattachés (envoi abandonné, 400 après envoi, échec partiel d'un lot) au-delà d'un délai, par exemple dans le cron quotidien.
  evidence: les fichiers sont écrits avant l'enregistrement ; aucun chemin ne nettoie un préfixe non rattaché.