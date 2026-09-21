# Changelog

## [5.15.0] — 21 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Générer et imprimer le QR code de son UL depuis l'écran des comptes rendus de mission** — un bouton « QR Code » apparaît dans l'en-tête de `/missions` pour les cadres, présidents et administrateurs, ouvrant une fenêtre pour télécharger le QR code de leur UL active, copier son lien ou le régénérer (ce qui invalide aussitôt l'ancien code imprimé).

### 🔧 Améliorations

- **Reconnexion automatique en cas de session expirée** — si la session expire pendant la rédaction d'un compte rendu de mission (formulaire classique ou dépôt par QR code), l'application propose désormais de se reconnecter au lieu d'afficher une erreur générique.
- **Accessibilité des pages de scan** — les états de chargement et d'erreur des pages ouvertes par un QR code (véhicule, stock, UL) sont maintenant annoncés aux lecteurs d'écran.
- **Fiche d'un compte rendu de mission** — la consultation de sa propre fiche fonctionne désormais de façon fiable même dans certaines configurations où l'identifiant de session diffère de l'identifiant en base.
- **Modales de gestion du stock** — une double validation accidentelle (double-clic ou double-Entrée) sur un formulaire (article, lot, import CSV) n'envoie plus deux fois la même demande.

## [5.14.0] — 21 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Déposer un compte rendu de mission en scannant le QR code de son UL** — chaque unité locale dispose désormais de son propre QR code. Le scanner ouvre directement le formulaire de compte rendu, déjà rattaché à l'UL : plus besoin de choisir la structure, l'étape « UL / DT » disparaît et un bandeau rappelle « Rattaché à … ». La génération et l'impression du QR code seront disponibles dans une prochaine version.
- **Ouvert à tous les bénévoles présents sur le poste** — contrairement au formulaire habituel, réservé aux CI/RPAPS et aux administrateurs, le dépôt par QR code est accessible à n'importe quel compte actif, y compris à un bénévole sans rôle attribué. Seuls les comptes inactifs sont refusés.
- **Confirmation sur place, sans quitter la page** — une fois le compte rendu envoyé, un message de confirmation s'affiche avec un bouton « Nouveau rapport » pour enchaîner un second dépôt. Aucune redirection vers un écran dont le bénévole n'aurait pas forcément l'accès.

### ⚠️ À faire avant la mise en production

- **Lancer la migration `npx tsx scripts/add-ul-qr-token.ts --apply` AVANT de déployer cette version.** Elle ajoute la colonne qui stocke le QR code de chaque UL. Tant qu'elle n'est pas passée, la génération ou la lecture d'un QR code d'UL échoue avec une erreur serveur.

## [5.13.0] — 18 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Détailler les interventions d'un poste** — quand un compte rendu déclare au moins une intervention, une nouvelle étape « Répartition interventions » s'ajoute juste après « Général ». On y ventile le même total deux fois : par type de prise en charge (soins sans décharge ni évac, décharge, mise en oeuvre DAE, évac CRF, évac Autres) et par nature (petits soins, malaise, traumatisme, inconscience, arrêt cardiaque).
- **Un compteur en direct pour chaque grille** — chaque groupe affiche son total courant face au nombre d'intervention à atteindre (ex. « 2 / 3 »). Tant que l'une des deux grilles ne tombe pas juste, le passage à l'étape suivante est refusé avec un message explicite.
- **La répartition apparaît sur la fiche du compte rendu** — deux tableaux « Répartition des interventions » listent les catégories renseignées. Les comptes rendus déposés avant cette nouveauté continuent d'afficher leur total seul, sans section ni erreur.

### 🔧 Améliorations

- **« Nombre de victimes prises en charge » devient « Nombre d'intervention »** dans le formulaire et sur la fiche détaillée ; la colonne « Victimes » de la liste des comptes rendus s'intitule désormais « Interventions ». Le chiffre affiché est inchangé.

## [5.12.0] — 18 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Choisir l'UL ou la DT du poste au début du compte rendu** — une première étape « UL / DT » s'ajoute au formulaire de compte rendu de mission. On y sélectionne l'unité locale qui héberge le poste, ou directement une Direction Territoriale (ex. « DT 75 ») pour un poste de niveau départemental. Le compte rendu reste rattaché à ce choix, et non plus à l'UL sur laquelle on se trouvait au moment de la saisie.
- **Toutes les ULs sont proposées, pas seulement la sienne** — la liste couvre l'ensemble des unités locales ainsi qu'une entrée par Direction Territoriale existante. On peut donc renseigner un poste tenu pour une autre UL sans changer d'UL active au préalable.
- **Onglet « Mes rapports »** — chacun retrouve l'intégralité des comptes rendus qu'il a déposés, toutes ULs et DT confondues, même après avoir changé d'UL active. Chaque ligne indique l'UL ou la DT de rattachement.
- **Onglet « Tous les rapports » pour les responsables** — les administrateurs, présidents et cadres disposent d'une seconde vue listant les comptes rendus de l'UL actuellement sélectionnée en haut de page. Changer d'UL avec le sélecteur existant change la liste affichée.

### 🔧 Améliorations

- **L'UL ou la DT du rapport est affichée sur sa fiche détaillée**, à côté de la date et du lieu.

### ⚠️ À faire avant la mise en production

- **Lancer la migration `npx tsx scripts/add-mission-report-dt-code.ts --apply` AVANT de déployer cette version.** Elle ajoute la colonne qui stocke la Direction Territoriale d'un compte rendu. Tant qu'elle n'est pas passée, toute soumission de compte rendu échoue avec une erreur serveur.

## [5.11.0] — 17 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Créer un stock complet depuis un fichier CSV** — un bouton « Importer un CSV » s'ajoute à côté de « Nouveau stock » sur la page Inventaire. On donne un nom au stock, on choisit son fichier, et tous les articles sont créés d'un coup, avec leurs quantités, catégories, dates de péremption, seuils d'alerte et notes. Fini la saisie article par article pour monter un nouveau stock.
- **Import tout ou rien, avec les erreurs listées ligne par ligne** — si une seule ligne du fichier est incorrecte (nom manquant, quantité qui n'est pas un nombre, date impossible), rien n'est importé et la liste des lignes à corriger s'affiche avec leur numéro et la colonne fautive. Aucun stock à moitié rempli à nettoyer derrière.

## [5.10.2] — 17 septembre 2026

### 🐛 Corrections

- **Scan de QR code avant connexion** — quand on scanne le QR code d'un véhicule ou d'un article de stock sans être connecté, on arrive maintenant directement sur la bonne page après s'être connecté, au lieu de retomber sur la page d'accueil et devoir re-scanner.

## [5.10.1] — 17 septembre 2026

### 🔒 Correctifs de sécurité

- **Envoi d'emails sécurisé** — les emails envoyés par l'application (notifications, réinitialisation de mot de passe...) ne peuvent plus être détournés vers un domaine malveillant, et l'application est protégée contre un ralentissement provoqué par une liste de destinataires malformée.

## [5.10.0] — 17 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Réserver un véhicule en deux clics depuis le tableau de bord** — un bouton « 📅 Réserver » prend place aux côtés de « Emprunter » sur la page Véhicules. Il ouvre la liste des véhicules, puis le formulaire de réservation, sans jamais quitter la page ni passer par la fiche du véhicule.
- **Les véhicules en mission ou à l'atelier sont réservables** — contrairement à l'emprunt, qui exige un véhicule disponible tout de suite, la réservation porte sur un créneau futur : un véhicule sorti aujourd'hui peut être réservé pour la semaine prochaine. Seul le permis filtre la liste — un chauffeur VL ne voit pas les VPSP, et inversement.
- **L'occupation du véhicule est affichée pendant la réservation** — un mini-calendrier montre les jours déjà pris par une réservation, un emprunt ou une maintenance, et permet de choisir la plage de dates d'un clic à l'autre. La navigation d'un mois à l'autre permet de réserver au-delà du mois courant.
- **Le formulaire rapide est le même que celui de la fiche véhicule** — mêmes dates et heures, même motif, même choix du chauffeur pour les responsables, même option de récurrence, et le même avertissement lorsque des créneaux sont ignorés faute de place.

### 🔧 Notes techniques

- Le formulaire de création de réservation a été extrait dans un composant partagé, utilisé à l'identique par la fiche véhicule et par le nouveau parcours rapide — une seule logique de réservation à maintenir.
- Aucune nouvelle API : le parcours s'appuie sur les routes de réservation et de calendrier existantes. Réserver ne modifie jamais le statut du véhicule.

## [5.9.0] — 16 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Un véhicule peut partir à l'atelier sans attendre d'être rendu** — c'est le cas le plus courant : quelqu'un prend le véhicule justement pour l'amener en révision. Jusqu'ici il fallait attendre son retour pour déclarer la maintenance, et une fois déclarée elle restait invisible — la fiche n'affichait que « En mission ». La maintenance se déclare désormais à tout moment, et le bandeau rouge s'affiche aux côtés du bandeau d'emprunt.
- **Celui qui a le véhicule peut toujours le rendre** — le passer en maintenance pendant qu'il est dehors ne le déclare plus rentré : le bouton « Rendre le véhicule » reste en place pour son emprunteur. Une fois rendu, le véhicule bascule de lui-même en maintenance.
- **Sur le tableau de bord, les deux états s'affichent ensemble** — « En mission » et « 🔧 Maintenance » cohabitent sur la même carte, au lieu que l'un masque l'autre. Le filtre « 🔴 Maintenance » liste lui aussi ces véhicules, alors qu'ils en disparaissaient.
- **Le compteur « Maintenance » inclut les véhicules partis à l'atelier** — un véhicule conduit en révision était compté « En mission », ce qui laissait croire la flotte plus mobilisable qu'elle ne l'est. Il est désormais compté en maintenance, et une seule fois : le compteur annonce exactement ce que le filtre affiche.
- **Corriger ou annuler une maintenance depuis le calendrier** — ouvrir la fiche d'un événement de maintenance permet d'en changer les dates ou le motif, ou de le supprimer, sans passer par la fiche du véhicule. Valable pour les maintenances à venir comme pour celles en cours ; les maintenances passées restent consultables sans être modifiables. La suppression demande confirmation, et le véhicule redevient disponible aussitôt.
- **Un véhicule en maintenance ne peut plus être emprunté par mégarde** — y compris lorsque la maintenance a été programmée à l'avance, cas qui passait jusqu'ici entre les mailles du filet, et y compris en scannant le QR code du véhicule.
- **« Remettre en service » n'apparaît plus tant que le véhicule est dehors** — le bouton pouvait déclarer disponible un véhicule physiquement en mission, et laisser quelqu'un d'autre l'emprunter au même moment.

### 🔒 Correctifs de sécurité

- **Chaque unité locale reste maîtresse de sa flotte** — il n'est plus possible de mettre en maintenance, de remettre en service ni d'emprunter un véhicule appartenant à une autre unité locale. L'emprunt par QR code reste quant à lui ouvert entre unités, comme auparavant : c'est tout son intérêt quand on croise un véhicule en déplacement.
- **Les messages d'erreur ne renseignent plus sur la flotte des autres unités** — tenter d'emprunter un véhicule d'une autre unité répond exactement comme pour un véhicule inexistant, sans laisser deviner s'il existe ni dans quel état il se trouve.

## [5.8.0] — 14 septembre 2026

### ✨ Nouvelles fonctionnalités

- **L'historique des incidents s'ouvre à toute l'unité locale** — jusqu'ici, un bénévole n'y voyait que ses propres déclarations, et seuls les administrateurs voyaient l'ensemble. Désormais, tout membre de l'UL consulte l'historique complet des véhicules de son unité : la liste, le détail d'un rapport et son PDF. L'intérêt est collectif — savoir qu'un véhicule a déjà eu trois flashs radar ou un accrochage change la façon de le confier.
- **Le déclarant reste anonyme** — sur le rapport d'une autre personne, la ligne Auteur affiche « Anonyme ». Sur les siens, le nom s'affiche avec un badge « Vous ». L'anonymat est appliqué par le serveur : le nom et l'adresse e-mail du déclarant ne sont tout simplement pas transmis au navigateur, ils ne sont donc pas récupérables. Les administrateurs continuent de voir qui a déclaré quoi.
- **Les brouillons restent privés** — seuls les rapports validés sont partagés. Un brouillon en cours de rédaction n'est visible que de son auteur (et des administrateurs) : une déclaration inachevée n'a pas à circuler.
- **Modifier et supprimer ne changent pas** — continuer ou supprimer un brouillon reste réservé à son auteur et aux administrateurs. Voir davantage ne signifie pas pouvoir toucher davantage.

### 🔒 Correctifs de sécurité

- **Cloisonnement entre unités locales sur l'historique des incidents** — la liste des incidents d'un véhicule était résolue par le nom du véhicule, sans vérifier l'unité locale. Deux ULs pouvant nommer un véhicule à l'identique, les incidents de l'homonyme d'une autre UL pouvaient remonter. La résolution est désormais bornée à l'UL de la personne connectée, et un véhicule d'une autre UL est traité comme inexistant.
- **Les comptes INACTIF sont refusés sur l'historique des incidents** — au même titre que partout ailleurs dans l'application.

## [5.7.0] — 14 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Un QR code par stock d'inventaire** — un bouton QR apparaît sur chaque onglet de la page Inventaire, réservé aux administrateurs. Il produit une affichette à imprimer et à coller sur l'armoire. En la scannant, n'importe quel bénévole connecté arrive sur une page dédiée à ce seul stock, sans passer par l'application.
- **Déclarer ce qu'on prend et ce qu'on remet** — la page liste les articles avec leur quantité, et un « − » / « + » sur chacun. On enchaîne plusieurs articles : les mouvements s'accumulent dans une barre récapitulative en bas de l'écran, chaque ligne affiche son total en attente, et un bouton unique valide le tout. Tant qu'on n'a pas validé, rien n'est enregistré — la page le dit.
- **Ajouter en désignant le lot** — un « + » demande à quel lot les unités s'ajoutent, en listant les dates de péremption existantes, avec la possibilité de créer un nouveau lot daté. Un « − » retire automatiquement du lot qui périme le plus tôt : c'est le bon réflexe, on n'a pas à y penser.
- **Déclarer plus que ce que l'écran affiche** — si l'écran indique 2 compresses et que vous en avez pris 5, vous saisissez 5. Le stock tombe à 0 et l'historique conserve « −5 » : l'écart révèle un inventaire désynchronisé au lieu de le masquer.
- **Aucune création d'article depuis le QR** — on ne peut qu'ajuster des articles existants. Créer, renommer ou supprimer reste réservé à la page Inventaire.
- **Le QR fonctionne pour tout le monde** — aucun rôle particulier n'est exigé, et aucune restriction d'unité locale : un renfort venu d'une autre UL peut déclarer ses mouvements. Chaque mouvement est enregistré au nom de la personne connectée.

### 🔒 Accès et rôles — à lire par les administrateurs d'unité locale

- **Cocher INACTIF bloque désormais réellement — et décocher débloque.** Jusqu'ici, cocher INACTIF dans l'éditeur de rôles répondait « enregistré » sans rien bloquer pour un compte rattaché à une unité locale, et l'opération inverse ne débloquait pas davantage. **Les administrateurs qui ont cru bloquer quelqu'un ne l'ont pas fait** : c'est l'information la plus importante de cette version. Le blocage vaut quelle que soit l'unité locale sur laquelle la personne se connecte, et prend effet au rafraîchissement de sa session.
- **INACTIF l'emporte sur tous les autres rôles.** Un compte portant INACTIF **et** Chauffeur VL était traité comme un chauffeur actif. Il est désormais bloqué partout : statistiques, notes de frais, budgets, signalement de bug, menu, QR véhicule et QR stock. **Les rôles attribués ne sont pas effacés** — décocher INACTIF rend l'accès immédiatement, sans rien réattribuer.
- **INACTIF s'attribue sur l'unité locale de rattachement.** L'option n'est plus proposée sur une UL secondaire, et l'API refuse la requête. Posé ailleurs, le rôle ne bloquait le compte que par intermittence, selon l'UL active au moment de la connexion. Les comptes portant déjà un INACTIF mal placé restent modifiables.
- **Un compte sans rôle attribué peut utiliser les QR codes** — véhicules comme stocks. Un bénévole fraîchement inscrit, pas encore qualifié, peut consulter un véhicule, l'emprunter et déclarer des mouvements de stock. La restitution d'un véhicule reste réservée au conducteur du trajet ou à un administrateur, comme avant.

### 🔧 Notes techniques

- **Migration à exécuter avant la mise en ligne** : `npx tsx scripts/add-stock-qr-token.ts --apply` ajoute la colonne `InvStockList.qrToken` et son index unique partiel. Sans elle, chaque scan renvoie une erreur serveur.
- La logique lots / FEFO / resynchronisation est extraite dans `src/lib/inventory/adjustments.ts` et partagée avec `/api/inventory/adjust`. Le panier est validé en une transaction unique dont les écritures partent par paquets via `tx.batch()`.
- La résolution des rôles de session est factorisée dans `src/lib/session-roles.ts`, appelée par les deux callbacks NextAuth, et ne se replie jamais sur les rôles du jeton — un tel repli aurait empêché toute révocation.
- Tous les prédicats d'autorisation passent par une enveloppe refusant les comptes INACTIF ; un test énumère les exports du module et échoue si un prédicat futur n'est pas enveloppé, et une règle ESLint interdit les tests de rôle en ligne côté serveur.
- Couverture : 1769 tests, dont un filet de non-régression écrit sur `POST /api/inventory/adjust` avant son refactor et une spec E2E Playwright du flux QR stock.

## [5.6.0] — 10 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Dupliquer un stock d'inventaire** — un bouton ⧉ apparaît sur chaque onglet de la page Inventaire, à côté du crayon. Il crée un nouveau stock de votre unité locale à partir de celui-ci, avec tous ses articles : nom, catégorie, seuil d'alerte et notes. Le nom est pré-rempli en « <stock> (copie) », modifiable avant validation. Pratique pour monter un stock véhicule à partir du stock principal sans ressaisir la centaine d'articles un par un.
- **Choisir de copier ou non le stock réel** — une case « Copier le stock actuel (quantités + dates de péremption) » décide de ce qui est repris. Décochée, vous obtenez la liste des articles avec des quantités à zéro : le squelette du stock, à remplir. Cochée, chaque lot est recopié à l'identique, avec sa quantité et sa date de péremption. Quantités et péremptions vont ensemble : une quantité est toujours portée par un lot, qui porte lui-même sa date.
- **Une ligne d'historique honnête** — l'historique des mouvements n'est jamais recopié : ces mouvements n'ont pas eu lieu dans le nouveau stock. À la place, chaque article repris avec du stock reçoit une seule ligne « Import initial — dupliqué depuis <stock source> », à votre nom et à la date du jour.
- **Réservé aux administrateurs** — comme la création, le renommage et la suppression d'un stock. Le bouton n'apparaît pas pour les autres rôles.
- **Le stock d'origine n'est jamais touché** — la duplication ne lit que la source. En cas d'erreur en cours de copie, rien n'est écrit du tout : pas de stock à moitié rempli à nettoyer à la main.

### 🔧 Améliorations techniques

- Nouvelle route `POST /api/inventory/stocks/duplicate` et fonction `duplicateStock()` dans `src/lib/inventory/stocks.ts`, exécutées dans une transaction unique (`db.transaction('write')`) pour garantir le tout-ou-rien.
- Les lots du stock source sont lus en une requête groupée par tranches de 500 identifiants, sans requête par article, et dans la limite des variables liées de SQLite.
- Les écritures sont envoyées par paquets de 500 via `tx.batch()` plutôt qu'une par une : la duplication d'un stock de 500 articles passe de plusieurs milliers d'allers-retours réseau à une poignée, ce qui la garde dans le budget de temps de la route.
- Aucune migration de base : la duplication n'ajoute ni table ni colonne.
- Couverture : 13 tests d'intégration sur la route (401, 403, 400, 404, copies avec et sans stock, invariants, retour arrière sur échec) et 16 tests de composants sur `StockTabs` et `StockModal`.

## [5.5.0] — 10 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Connecter un véhicule à son compte constructeur, depuis sa fiche** — un bouton « Connecter le véhicule » apparaît en haut de la fiche d'un véhicule non connecté. Vous choisissez la marque, saisissez le numéro de châssis (VIN) et les identifiants du compte MyRenault de votre unité locale : le kilométrage, le carburant et l'autonomie remontent aussitôt, sans rechargement de la page. Jusqu'ici, connecter un véhicule supposait une intervention technique sur la configuration du serveur.
- **Le bouton est réservé aux administrateurs** — un chauffeur ne le voit pas. Un administrateur ne peut connecter que les véhicules de son unité locale ; seul un super-administrateur intervient sur les autres.
- **Un compte constructeur par unité locale** — les identifiants sont saisis une seule fois. Dès le deuxième véhicule de la même unité locale, le formulaire ne demande plus que le VIN : le compte déjà enregistré est réutilisé et rappelé à l'écran. Un lien « Utiliser un autre compte » permet de le remplacer si nécessaire.
- **Les identifiants et le VIN sont validés immédiatement** — la connexion n'est enregistrée que si le compte constructeur répond et reconnaît le véhicule. Un mot de passe erroné ou un VIN qui n'appartient pas au compte est refusé sur-le-champ, avec le motif affiché et rien d'écrit en base. Fini le véhicule « connecté » qui ne remonte jamais rien.
- **Un bandeau rouge quand la connexion se rompt** — si le compte constructeur cesse de répondre (mot de passe changé, compte verrouillé), la fiche affiche « Connexion au compte constructeur interrompue » avec le motif, et un bouton « Reconnecter ». Tous les véhicules rattachés au même compte affichent le bandeau ensemble : le problème vient du compte, pas d'un véhicule en particulier. La connexion est retentée automatiquement à chaque passage de la tâche quotidienne, et le bandeau disparaît de lui-même dès qu'elle repasse.
- **Déconnecter un véhicule** — un bouton « Déconnecter » retire la connexion sans supprimer le véhicule ni son historique. Les identifiants du compte ne sont effacés que lorsque le dernier véhicule qui les utilisait est déconnecté.

### 🔧 Changements

- **Le VIN ne se saisit plus depuis « Modifier le véhicule »** — le champ a disparu du formulaire d'édition, et de celui de création. Le numéro de châssis n'est plus qu'une conséquence de la connexion : il est posé, vérifié et retiré par elle seule. Un VIN saisi par erreur ne pouvait de toute façon rien connecter, mais il bloquait la saisie manuelle du kilométrage.
- **Le kilométrage redevient modifiable à la main sur un véhicule non connecté** — y compris s'il porte encore un VIN hérité de l'ancien système. Seule une connexion active réserve désormais le kilométrage à la télémétrie.

### 🔒 Sécurité

- **Les mots de passe constructeur sont chiffrés en base** — chiffrement AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`), jamais renvoyés par l'API ni journalisés. Le compte MyRenault unique et partagé, jusqu'ici stocké en variables d'environnement du serveur (`RENAULT_MAIL` / `RENAULT_PASS`), est supprimé.
- **Le QR code n'expose pas le motif d'erreur** — la page atteinte par QR code, accessible sans contrôle d'unité locale, affiche l'état de la connexion mais jamais le message du constructeur, qui contient l'identifiant du compte.

### 🔧 Améliorations techniques

- Chiffrement AES-256-GCM au format `iv:authTag:ciphertext` (`src/lib/crypto.ts`), avec clé de rotation optionnelle `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` et script de re-chiffrement dédié.
- Nouvelles tables `BrandCredential` (un compte par unité locale × marque) et `VehicleConnection` (véhicule ↔ compte, VIN, statut).
- Le cache de session Gigya passe d'une ligne unique globale à une ligne par compte (`RenaultSession.credentialId`) : deux unités locales ne se volent plus leur jeton.
- `src/lib/renault.ts` redevient un pur client de fetch, sans lecture de la base ni écriture de statut ; la résolution du véhicule et les effets métier vivent dans `src/lib/vehicle-connection.ts`. La télémétrie se demande par identifiant technique de véhicule, jamais par VIN ni par nom.
- La tâche quotidienne isole chaque véhicule : un compte en échec n'interrompt plus le traitement des suivants, et le nombre d'exceptions est journalisé à chaque passage.
- `GIGYA_API_KEY` est conservée : c'est une constante de configuration de marque, pas un secret de compte.

### ⚙️ Mise en service

> **La migration de production doit être exécutée AVANT le merge sur `main`.**

```bash
# 1. Générer et déclarer la clé de chiffrement (Vercel : Production, Preview, Development)
openssl rand -hex 32   # → CREDENTIALS_ENCRYPTION_KEY

# 2. Migration (dry-run puis écriture ; --ul est obligatoire en --apply)
npx tsx scripts/add-vehicle-connections.ts
npx tsx scripts/add-vehicle-connections.ts --apply --ul=ul-paris-18

# 3. Vérification bloquante, en lecture seule
npx tsx scripts/verify-vehicle-connections.ts
```

> `RENAULT_MAIL` et `RENAULT_PASS` ne doivent être retirés de Vercel qu'**après** le déploiement sur `main` et une vérification verte.

## [5.4.0] — 9 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Une réservation sans chauffeur désigné ne bloque plus personne** — quand un responsable pose une réservation « Chauffeur non décidé », le véhicule reste empruntable par n'importe quel chauffeur ayant les droits dessus, sur toute la période réservée. Jusqu'ici seule la personne qui avait créé la réservation pouvait prendre le véhicule, ce qui n'était pas l'intention : une réservation sans chauffeur sert justement à bloquer le créneau sans décider qui conduira.
- **Le créneau se libère à la prise du véhicule** — le premier chauffeur qui emprunte consomme la réservation, exactement comme pour une réservation nominative. Le créneau ne reste donc pas ouvert à un second emprunt derrière lui.
- **Le bouton « Emprunter » et la fiche véhicule suivent la même règle** — un véhicule sous réservation sans chauffeur apparaît dans la liste des véhicules empruntables du tableau de bord, et son bouton « Prendre le véhicule » reste actif sur sa fiche.

### 🔧 Améliorations techniques

- Les règles de rôle restent prioritaires : un chauffeur qui n'a pas le droit de conduire ce type de véhicule (VL / VPSP) reste refusé, réservation libre ou non.
- Une réservation sans chauffeur encore en attente de validation n'est pas consommée par un emprunt.
- Une réservation nominative concomitante continue de bloquer normalement, même si une réservation sans chauffeur couvre le même créneau.
- Le libellé « Chauffeur non décidé » est désormais une constante partagée (`src/lib/reservationDriver.ts`) au lieu d'être recopié dans sept fichiers.

## [5.3.0] — 4 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Emprunter un véhicule en deux clics depuis le tableau de bord** — un bouton « Emprunter » prend la place des quatre cartes de statistiques, en haut de la page Véhicules. Il ouvre la liste des véhicules que vous pouvez prendre ; vous en choisissez un, le formulaire de prise en charge s'ouvre. Fini le défilement jusqu'aux cartes puis l'ouverture de la fiche du véhicule.
- **La liste ne propose que ce que vous pouvez réellement prendre** — un véhicule en mission, en maintenance, incompatible avec votre rôle ou réservé par quelqu'un d'autre à cet instant n'y apparaît pas. Plus de mauvaise surprise après avoir rempli le formulaire.
- **Quand rien n'est disponible, le bouton le dit** — il devient inactif, affiche la raison et renvoie vers le calendrier. Si vos papiers de conduite ne sont pas validés, il est grisé avec un lien pour les régulariser.
- **Rendre un véhicule en deux clics depuis le tableau de bord** — un bouton « Rendre » accompagne le bouton « Emprunter », et n'apparaît que si vous avez au moins un véhicule en cours. Avec un seul emprunt, le bouton le nomme et ouvre directement le formulaire de retour ; avec plusieurs, il propose la liste de vos véhicules, exactement comme pour l'emprunt. Plus besoin de retrouver la fiche du véhicule pour le rendre.
- **Le bouton « Rendre » ne montre que vos propres emprunts** — un véhicule pris par quelqu'un d'autre n'y figure jamais, y compris pour un administrateur : le raccourci du tableau de bord répond à « qu'ai-je emprunté ? ». Clore le trajet d'un tiers reste possible depuis la fiche du véhicule.
- **Les compteurs de flotte tiennent sur une ligne** — total, disponibles, en mission et maintenance passent sous le bouton. La page est plus courte, le calendrier remonte.

### 🐛 Corrections

- **Un véhicule réservé ne peut plus vous être pris** — jusqu'ici, une réservation validée n'empêchait personne de partir avec le véhicule : votre mission pouvait se retrouver sans voiture. La prise est désormais refusée à un autre utilisateur pendant votre créneau. Vous restez libre de prendre le véhicule que vous avez vous-même réservé ; une réservation encore en attente de validation ou un créneau à venir ne bloque rien. Les administrateurs peuvent passer outre.

- **Papiers de conduite non validés : la prise est désormais refusée** — le contrôle n'existait qu'à l'affichage, le bouton était grisé mais rien n'empêchait la prise en passant outre. Le serveur la refuse maintenant, une fois le délai de régularisation de 14 jours écoulé. Pendant ce délai, vous conduisez normalement ; les administrateurs ne sont pas concernés.

### 🔧 Changements

- **Chauffeurs VPSP : plus de bouton qui mène à une erreur** — un utilisateur porteur du seul rôle CHVPSP voyait, sur la fiche d'un véhicule léger, un bouton « Prendre le véhicule » actif qui échouait à la validation. Ce bouton est maintenant désactivé, en cohérence avec ce que le serveur autorise réellement. Un utilisateur cumulant CHVL et CHVPSP garde l'accès aux deux types de véhicules, et les administrateurs restent autorisés partout.

### 🔒 Sécurité

- **Authentification renforcée** — correction d'une faille permettant de contourner la restriction des connexions au domaine `@croix-rouge.fr` à l'aide d'un caractère ressemblant visuellement à `@`, et d'une faiblesse des cookies de connexion Google. Douze vulnérabilités de dépendances au total ont été corrigées, dont deux critiques ; il n'en reste aucune.

### 📌 À savoir

- Réserver un créneau à l'avance se fait toujours depuis la fiche du véhicule : le bouton du tableau de bord ne gère que la prise immédiate.

## [5.2.0] — 4 septembre 2026

### ✨ Nouvelles fonctionnalités

- **Boîte de vitesses du véhicule** — la fiche de création et d'édition d'un véhicule propose désormais un choix « Manuelle » ou « Automatique ». L'information sert aux conducteurs qui ne sont à l'aise qu'avec l'une des deux boîtes : elle se lit avant la réservation, sans ouvrir la fiche.
- **Tag boîte de vitesses** — un tag ⚙️ apparaît sur la carte du véhicule (tableau de bord) et sur sa page de détail, au même titre que le tag d'énergie. Violet pour une boîte manuelle, turquoise pour une automatique.

### ⚙️ Mise en service

> **La migration de production doit être exécutée AVANT le merge sur `main`.**

```bash
npx tsx scripts/add-vehicle-transmission.ts
```

Les véhicules existants restent sans boîte renseignée (`NULL`) : aucun tag ne s'affiche tant qu'un administrateur ne l'a pas complétée depuis la fiche du véhicule.

## [5.1.0] — 29 août 2026

### ✨ Nouvelles fonctionnalités

- **Budgets analytiques sur les notes de frais** — chaque ligne de dépense s'impute désormais à un budget choisi dans une liste propre à l'Unité Locale : Repas, Matériel, Entretien véhicule, Entretien local, Essence. Une même note peut ainsi répartir ses dépenses entre plusieurs budgets — un repas et un plein de carburant ne sont plus confondus. Le budget est une donnée de gestion : il n'apparaît pas sur le document officiel, dont le scellement cryptographique reste inchangé.
- **Liste de budgets gérée par l'Unité Locale** — les cadres, présidents, trésoriers et administrateurs ajoutent, renomment et archivent les budgets depuis une modale dédiée sur l'écran des notes de frais. Chaque UL dispose de sa propre liste, initialisée automatiquement à sa création. Renommer un budget met à jour l'historique : les statistiques passées affichent le nouveau nom.
- **Archiver plutôt que supprimer** — un budget retiré disparaît du menu de saisie mais conserve son nom dans les statistiques des années écoulées : un bilan clos ne change plus rétroactivement. Le dernier budget actif d'une UL ne peut pas être archivé, sans quoi plus aucune note ne pourrait y être saisie.
- **Statistiques par budget** — l'écran des statistiques, l'export CSV et l'export PDF présentent une répartition des dépenses par budget. Les lignes antérieures à cette version, qui n'en portent aucun, sont regroupées sous « N/A » — un libellé d'affichage, jamais un choix proposé à la saisie.

### ⚙️ Mise en service

> **La migration de production doit être exécutée AVANT le merge sur `main`.**
> Sans la table `ExpenseBudget`, le déploiement Vercel rend la saisie de toute note de frais impossible.
>
> ```
> npx tsx scripts/add-expense-budgets.ts            # dry-run : DDL seule, aucun budget inséré
> npx tsx scripts/add-expense-budgets.ts --apply    # migration réelle
> ```
>
> Contrôler ensuite que chaque UL possède au moins un budget actif, puis merger sur `main`.

## [5.0.0] — 28 août 2026

### ✨ Nouvelles fonctionnalités

- **Notes de frais scellées à chaque étape du circuit** — soumission par le demandeur, validation par le responsable, paiement par le trésorier : chaque étape appose une signature numérique sur le PDF sans jamais réécrire les précédentes. Le contenu est verrouillé dès la soumission — seules les signatures suivantes peuvent encore s'y ajouter — et toute modification ultérieure du document est détectable. Les signatures manuscrites du demandeur et du responsable apparaissent sur la feuille ; celle du trésorier n'existe que cryptographiquement et figure au panneau Signatures des lecteurs PDF. Le PDF téléchargé depuis l'application est ce document scellé lui-même, jamais une reconstitution.

- **Le refus est signé, et définitif** — refuser une note exige la signature du responsable, au même titre que la validation. Une note refusée ne peut plus être ni validée ni payée : la correction passe par une nouvelle note.

- **Les justificatifs sont intégrés au PDF** — photos et reçus au format PDF ne sont plus déposés sur Google Drive : ils deviennent des pages du document scellé, qui contient donc la note entière, justificatifs compris, sans dépendance externe. Les photos sont compressées à l'envoi pour que le fichier reste léger.

- **Nouveau modèle de feuille de frais** — le PDF suit le formulaire officiel de septembre 2023.

### 🐛 Correctifs

- **Signature stylisée illisible en thème sombre** — dans la fenêtre de signature, l'aperçu du nom s'affichait en clair sur le fond clair de la zone. Il reprend désormais les couleurs de la signature réellement produite, lisibles dans les deux thèmes.

### 📌 À savoir

- **Une note tient 9 postes de dépense** — au-delà, elle occuperait deux pages, ce qui est incompatible avec le placement des signatures. La soumission est alors refusée, avec invitation à scinder la note.

- **Portée de la vérification** — le certificat de signature est auto-signé : Adobe Acrobat affiche « signature valide, identité inconnue » tant qu'il n'a pas été ajouté aux identités approuvées. Toute modification du document après émission reste détectée. La date de signature est celle déclarée par l'application, sans horodatage par un tiers.

- **Plus aucune mention d'un prestataire externe** — la fenêtre s'intitule « Signature électronique ». Le sceau apposé est celui de la Croix-Rouge française ; aucun service tiers n'intervient.

## [4.12.0] — 26 août 2026

### ✨ Nouvelles fonctionnalités

- **Retour de véhicule — contrôle de plausibilité du kilométrage** — le kilométrage saisi au retour est désormais vérifié avant enregistrement, sur les deux parcours (application et QR Code). Un kilométrage inférieur à celui du départ est refusé : le champ passe en rouge, le bouton de validation est désactivé et un message rappelle que le véhicule restera indisponible tant que le retour n'est pas enregistré, en indiquant qu'un responsable peut corriger le kilométrage de départ depuis la fiche du véhicule. Au-delà de 150 km par tranche de 24 h d'emprunt entamée, une double confirmation est demandée : une fenêtre affiche la distance parcourue, la durée de l'emprunt et le plafond attendu, avec le choix entre corriger la saisie ou confirmer malgré tout. Le contrôle ne porte que sur la saisie manuelle : les véhicules connectés, dont le kilométrage remonte automatiquement depuis Renault Connect, ne sont pas concernés.

## [4.11.0] — 23 août 2026

### ✨ Nouvelles fonctionnalités

- **Note de frais — nom et date de mission** — ajout de deux champs obligatoires "Nom de la mission" et "Date de la mission" lors de la création ou de la modification d'une note de frais. La date de mission est distincte de la date de soumission, la note pouvant être saisie plusieurs jours après la mission ; elle ne peut pas être postérieure à la date du jour. Ces informations alimentent la colonne "Date et objet de la mission" du PDF généré et sont affichées dans le détail de la note. Les notes de frais déjà générées ne sont pas impactées : leur PDF conserve son rendu d'origine.

## [4.10.2] — 21 août 2026

### 🐛 Corrections & Améliorations

- **Véhicule — champ VIN restreint à l'UL Paris 18** — le champ "Numéro de châssis / VIN" (création et édition de véhicule) n'est désormais visible que pour les véhicules de l'unité locale Paris 18, la seule à utiliser l'intégration Renault Connect.

## [4.10.1] — 18 août 2026

### 🐛 Corrections & Améliorations

- **Compte rendu de mission — présence UL dynamique** — le champ "Présence UL 18 ?" de l'étape Équipe affichait ce libellé pour tous les utilisateurs, quelle que soit leur unité locale réelle. Il affiche désormais le nom de l'UL d'appartenance du soumetteur (ex. "Présence UL Paris 18 ?"). La colonne UL du tableau des comptes rendus et la fiche détaillée d'un compte rendu affichent également le nom réel de l'UL concernée au lieu de "18" en dur. Le champ en base de données a été renommé de `ul18_present` en `presence_ul` pour refléter cette généralisation.

## [4.10.0] — 18 août 2026

### ✨ Nouvelles fonctionnalités

- **Compte rendu de mission — étape Commentaire** — ajout d'une nouvelle étape "Commentaire" dans le formulaire de compte rendu de mission, juste avant l'étape Photos. Permet d'ajouter une observation libre sur la mission, quel que soit le type de mission. Le commentaire est visible dans une section dédiée sur la page de consultation du compte rendu.

## [4.9.3] — 13 août 2026

### 🐛 Corrections

- **Lisibilité en mode sombre** — plusieurs éléments d'interface (badges de statut, indicateurs, cartes de statistiques) utilisaient des couleurs fixes qui pouvaient devenir peu lisibles en mode sombre. Corrigé sur l'ensemble de l'application.

## [4.9.2] — 13 août 2026

### 🐛 Corrections

- **Export des statistiques (PDF/CSV)** — l'export échouait parfois de façon intermittente en production ("fichier non trouvé"). Corrigé, l'export est désormais fiable à chaque fois.

## [4.9.1] — 12 août 2026

### 🐛 Corrections

- **Modification des intervalles de révision d'un véhicule** — l'enregistrement échouait systématiquement ("Véhicule non trouvé"). Corrigé.
- **Page Inventaire** — changer rapidement de stock pouvait afficher les articles du stock précédemment sélectionné au lieu du bon. Corrigé.
- **Badge carburant Diesel illisible en mode sombre** — corrigé.
- **Notifications (toasts) qui se coupaient** — deux notifications rapprochées pouvaient se tronquer l'une l'autre. Corrigé.
- **Mode démo** — le bouton "Réinitialiser" ne restaurait pas toujours correctement les données d'origine. Corrigé.
- **Vérification quotidienne du kilométrage** — la tâche automatique échouait dès qu'un véhicule connecté était en maintenance, empêchant les alertes de fonctionner pour toute la flotte ce jour-là. Corrigé.

### ♿ Accessibilité

- **Fenêtres modales** (prise/retour de véhicule, désinfection, incidents, maintenance) — le contenu était partiellement inaccessible aux lecteurs d'écran. Corrigé sur l'ensemble de l'application.
- Les fenêtres modales peuvent désormais être fermées avec la touche **Échap**.

### 🛠️ Fiabilité

- **Écran de récupération en cas d'erreur inattendue** — un bouton "Réessayer" s'affiche désormais au lieu d'une page blanche.

## [4.9.0] — 11 août 2026

### 🔒 Sécurité

- **Isolation entre Unités Locales renforcée** — plusieurs écrans (calendrier des véhicules, fiche véhicule, désinfections, incidents, télémétrie Renault) pouvaient exposer ou permettre de modifier des données d'une autre Unité Locale. Corrigé.
- **Accès aux photos et justificatifs Google Drive restreint** — un utilisateur ne peut désormais accéder qu'aux photos/justificatifs de ses propres trajets, incidents ou notes de frais.
- **Comptes nouvellement créés sans rôle attribué** — pouvaient auparavant accéder à certaines fonctionnalités réservées. L'accès est désormais bloqué tant qu'aucun rôle n'est attribué.
- **Exports PDF de notes de frais et d'incidents** — sécurisés avec le même contrôle d'accès que leurs équivalents à l'écran.
- **Actions administratives destructrices** — un administrateur local ne peut plus modifier ou supprimer des véhicules, trajets ou maintenances d'une autre Unité Locale.

## [4.8.1] — 4 août 2026

### 🐛 Correctifs

- **Fix du chargement infini lors de l'affichage de toutes les notes de frais** — Résolution du blocage/timeout réseau sur l'écran des notes de frais (`/expenses`) lors du cochage du filtre *"Afficher toutes les notes (y compris déjà traitées)"* :
  - **Optimisation du payload SQL** : Remplacement de `SELECT er.*` par une sélection explicite de colonnes dans `/api/expenses`. Les chaînes base64 très lourdes des signatures manuscrites (`userSignature`, `validatorSignature`) des notes traitées ne sont plus rapatriées inutilement dans la liste globale, réduisant la réponse réseau de plusieurs mégaoctets à quelques kilo-octets (temps de réponse sous les 170ms).
  - **Requête SQL & Jointures** : Remplacement des `JOIN` stricts par des `LEFT JOIN` sur la table `User` afin d'éviter tout blocage si l'utilisateur lié n'est plus présent en base.
  - **Parsing & Sécurisation** : Sécurisation du parsing JSON du champ `items` et du montant `total` pour parer aux données `null`.
  - **Gestion réactive du chargement** : Déclenchement réactif de `fetchReports` sur les changements d'état (`viewScope`, `includeProcessed`) avec gestion de `tableLoading` sans démontage de la page.
- **Remise en attente de validation lors de la modification de date de réservation** — Lorsqu'une réservation déjà validée voit sa date ou son horaire modifié, son statut repasse automatiquement en attente de validation (`PENDING`).

### 📱 Améliorations & Responsivité

- **Ergonomie et responsivité de la Saisie de Note de Frais** — Optimisation complète de l'écran de saisie et de gestion des notes de frais pour l'utilisation sur mobile et tablette (`/expenses`) :
  - **Empilement intelligent des dépenses** : Ajustement automatique (`flex-wrap`) des lignes de dépenses sur les écrans mobiles (< 640px). La description s'affiche sur la première ligne et le montant avec bouton de suppression sur la seconde, garantissant un accès sans défilement horizontal ni tronquage de la partie droite.
  - **Actions et formulaires adaptés** : Mise en forme responsive du sélecteur d'imputation et alignement vertical des boutons d'action ("Annuler", "Brouillon", "Signer et Soumettre") sur mobile pour faciliter la saisie tactile.
  - **Grille adaptative & Modales** : Bascule dynamique en 1 colonne sur mobile pour la vue tableau et le panneau de détails, ajustement du défilement des modales et correction de l'échelle des coordonnées tactiles du canvas de signature manuscrite.

## [4.8.0] — 28 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Bandeaux de communication administrables** — Outil dans le menu Administration (`/users`) permettant de configurer des bandeaux d'information affichés en haut de l'application.
  - **Permissions & Scoping** : accessible aux rôles `SUPER_ADMIN`, `ADMIN`, `PRESIDENT` et `CADRE`. Les `SUPER_ADMIN` peuvent créer des bandeaux communs à toutes les ULs (`is_global`), tandis que les autres rôles sont restreints à leur Unité Locale.
  - **Ciblage par page** : possibilité de diffuser le bandeau partout (`ALL`), ou uniquement sur les pages Véhicules (`VEHICLES`), Missions (`MISSIONS`) ou Inventaire (`INVENTORY`).
  - **Pagination intelligente** : en cas de pluralité de bandeaux actifs sur le même écran, une barre de pagination (`‹ 1/N ›`) s'affiche automatiquement dans le bandeau pour naviguer entre les messages.

## [4.7.0] — 27 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Notion de DT de rattachement pour les ULs** — Ajout d'une notion de Délégation Territoriale (DT) de rattachement pour les Unités Locales (ex: DT 75, DT 69).
  - Gestion du champ `dtCode` dans les formulaires d'administration des ULs (création et édition).
  - Badges visuels DT sur les cartes des ULs dans l'onglet Administration.
- **Vision DT de la Flotte de Véhicules & Calendrier** — Bascule d'affichage "Vue UL / Vue DT" sur le tableau de bord des véhicules pour les utilisateurs disposant du rôle `DT` :
  - Consultation globale de la flotte et du calendrier de toutes les ULs rattachées à la même DT.
  - Mode lecture seule complet appliqué à la vision DT (désactivation des emprunts, restitutions, incidents, maintenances et réservations cross-UL avec bannière d'information).
- **Réservations récurrentes** — Possibilité de créer une série de réservations récurrentes pour un véhicule depuis la fiche véhicule.
  - **Toggle de récurrence** dans la modale `+ Réserver` : activer le mode récurrence remplace le formulaire date/heure classique par un panneau dédié.
  - **Sélection des jours** : cases à cocher pour choisir un ou plusieurs jours de la semaine (Lundi, Mardi, … Dimanche).
  - **Plage horaire** : saisie des heures de début et de fin valable pour chaque occurrence.
  - **Période de récurrence** : date de premier et dernier passage, avec une limite maximale de **6 mois** à partir de la date du jour.
  - **Résumé humain** en temps réel : _"Tous les Lundi et Mercredi de 08:00 à 12:00 jusqu'au 31/01/2027 (12 occurrences)"_.
  - **Insertion partielle** : les créneaux en conflit avec une réservation existante sont automatiquement ignorés. Un bandeau d'alerte liste les dates skippées.
  - **Badge 🔁 Récurrente** visible sur chaque occurrence dans la liste des réservations.
  - **Annulation groupée** : bouton `🔁✕ Annuler tout` pour supprimer toutes les occurrences **futures** d'une même récurrence en une seule action.
  - Les occurrences individuelles restent modifiables et supprimables indépendamment.
  - Migration DB : ajout de la colonne `recurrenceGroupId` sur la table `Reservation` (index inclus).

### 🐛 Correctifs

- **Rafraîchissement automatique du calendrier lors du changement d'UL** — Le calendrier des véhicules se rafraîchit désormais automatiquement lors du changement d'Unité Logistique via le sélecteur d'UL.

## [4.6.0] — 22 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Déclaration d'incident via QR Code** — Possibilité pour tout utilisateur d'un QR Code de véhicule d'accéder au bouton "Déclarer un incident" et de remplir la modale de déclaration d'incident (avec génération PDF) directement sur la page QR Code.
- **Export des Statistiques de Frais (CSV & PDF)** — Export complet au format CSV et génération d'un rapport PDF officiel pour les statistiques de frais, avec filtres par période, isolation par UL et accès sécurisé réservé aux rôles gestionnaires (`PRESIDENT`, `TRESORIER`, `SUPER_ADMIN`).
- **Support des justificatifs PDF (Notes de frais)** — Prise en charge des fichiers PDF en tant que justificatifs de dépenses avec aperçu en icône et ouverture/téléchargement depuis la modale dédiée.
- **Onglets Statistiques (Véhicules & Frais)** — Organisation de la page des statistiques en onglets ("Véhicules" et "Frais"). Analyse complète des dépenses par mois, par bénévole et par imputation, avec accès restreint aux gestionnaires (`PRESIDENT`, `TRESORIER`, `SUPER_ADMIN`) et isolation par UL.
- **Notifications cloche pour les notes de frais (Président & Trésorier)** — Notification automatique dans la cloche d'alerte en haut à droite de l'application :
  - **Pour le Président (`PRESIDENT`)** : Lorsqu'une nouvelle note de frais est soumise pour validation.
  - **Pour le Trésorier (`TRESORIER`)** : Lorsqu'une note de frais avec demande de remboursement est validée et passe en attente de paiement.
- **Modale de mise en maintenance & Suivi des motifs** — Passage d'un véhicule en maintenance via modale avec date de début, date de fin optionnelle (ou "Date de fin inconnue") et motif explicatif.
  - Encadré d'information sur la fiche véhicule et affichage visuel différencié sur le calendrier (rouge plein / rouge pointillé).
  - Date de fin automatique lors de la remise en service du véhicule.
- **Imputation des dépenses (Notes de frais)** — Sélection de l'imputation de la dépense (`DLUS`, `DLAS`, `UL`, `Autre`) avec saisie libre en cas de choix "Autre".
- **Génération PDF Note de frais conforme (C2 INTERNE) & signature électronique** — Génération du PDF officiel de note de frais respectant le modèle C2 INTERNE avec signature électronique et manuscrite du demandeur et du responsable, et tampon officiel de l'UL.
- **Refus de la note de frais avec commentaire** — Possibilité pour les valideurs (`SUPER_ADMIN` ou `PRESIDENT`) de refuser une note soumise en joignant obligatoirement un commentaire explicatif.
- **Rôle Trésorier (`TRESORIER`) & Workflow de paiement** — Rôle centralisé `TRESORIER` avec accès aux notes en attente de paiement et possibilité d'indiquer les notes comme payées (`traité`).
- **Pagination et tri interactif du tableau de notes de frais** — Tri ascendant/descendant interactif sur toutes les colonnes et barre de pagination configurable (5, 10, 25, 50 par page).

### 🐛 Corrections & Améliorations

- **Affichage de la cloche pour tous les utilisateurs actifs** — Modification de la `Navbar` pour afficher la cloche de notification à l'ensemble des rôles d'utilisateurs actifs (Présidents, Trésoriers, Cadres, Chauffeurs) et non plus uniquement aux administrateurs.
- **Fonctionnement des notifications in-app sans OneSignal** — Prise en charge intégrale de la création et du traitement des notifications in-app en base de données, même lorsque l'intégration OneSignal est absente ou désactivée (ex: environnement Preview ou local).

## [4.3.0] — 19 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des Notes de Frais (Frais)** — Ajout d'un module complet de gestion des notes de frais accessible via un nouvel onglet "Frais" dans la navbar.
  - Saisie dynamique des lignes de dépenses avec calcul en temps réel du total.
  - Option de remboursement commutable et téléversement de justificatifs photo dans un dossier parent dédié sur Google Drive.
  - Déclaration sur l'honneur obligatoire en l'absence de justificatif papier.
  - Possibilité de sauvegarder au format brouillon, de modifier les brouillons existants et de les soumettre.
  - Validation des notes de frais par les rôles d'administration (`PRESIDENT` et `SUPER_ADMIN`).
  - Mock de l'intégration Google Drive en environnement de prévisualisation (preview) pour éviter les dépendances externes.

## [4.2.0] — 19 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Bypass QR Code — Accès véhicule sans restriction d'UL** — Génération d'un lien unique `/qr/[token]` par véhicule permettant à tout utilisateur connecté d'effectuer un emprunt ou un retour, indépendamment de son Unité Locale ou de son rôle chauffeur. Interface épurée dédiée hors dashboard et possibilité de régénérer le token (réservé aux rôles d'administration).
- **Gestion multi-stocks par onglets** — Ajout d'onglets dans le module d'inventaire pour gérer séparément plusieurs stocks, avec prise en charge du dark mode et compatibilité avec le rôle `SUPER_ADMIN`.
- **Édition des réservations & Chauffeur non décidé** — Possibilité d'éditer les réservations existantes et sélection du statut "CH (Chauffeur non décidé)" lors de leur création ou modification.
- **Modification des informations de prise d'emprunt** — Autorisation pour les administrateurs et super-administrateurs de modifier les détails de départ (compteur, carburant, remarques) d'un emprunt en cours de trajet.

### 🐛 Corrections & Améliorations

- **Défilement du calendrier sur mobile** — Ajout d'un défilement horizontal sur le calendrier mensuel des véhicules pour les écrans de petite taille.

## [4.1.0] — 19 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Calendrier des véhicules sur le Tableau de bord** — Ajout d'un calendrier mensuel sur le tableau de bord affichant les réservations (en jaune), les emprunts effectués (en vert) et les emprunts en cours (en vert avec bordure en pointillés).
- **Emplacements de parking par Unité Locale** — Gestion et attribution des places de parking par défaut spécifiques à chaque Unité Locale (`defaultParkingSpots`).
- **Suivi de la désinfection des véhicules** — Extension du suivi de la désinfection aux véhicules non-VPSP et affichage du statut dans l'historique des sorties.
- **Refonte des rôles & permissions** — Restructuration complète des niveaux d'accès (`SUPER_ADMIN`, `ADMIN`, `RESPO`, `CHVL`, `CHVPSP`, `GUEST`, `INACTIF`) avec mise à jour des droits.
- **Conformité RGPD & Mentions légales** — Implémentation des pages relatives à la gestion des données personnelles et aux mentions légales.
- **Isolation des notifications par UL** — Filtrage et ciblage des notifications de la flotte selon l'Unité Locale de l'utilisateur.
- **Gestion des numéros de téléphone des ULs & VCard** — Gestion dynamique des contacts de garde et export au format VCard.
- **Tutoriel interactif adaptatif** — Prise en charge des étapes adaptées selon le rôle de l'utilisateur dans le `GuidedTour`.
- **Support des environnements de prévisualisation (Preview Env)** — Intégration de la configuration d'environnement de prévisualisation.

### 🐛 Corrections & Améliorations

- **Plage visuelle des emprunts en cours** : Restriction de la plage visuelle d'un trajet en cours sur le calendrier pour qu'il s'arrête au jour courant et ne déborde plus sur les jours futurs du mois.
- **Gestion des sessions & rafraîchissement des rôles** : Correction du rafraîchissement en temps réel des rôles utilisateur depuis la base de données et préservation des droits d'administration.
- **Validation à la création des véhicules** : Vérification de l'unicité du nom et de la plaque d'immatriculation et rattachement automatique à l'UL active.
- **Correction du formulaire de restitution (CheckInModal)** : Résolution des problèmes de typage TypeScript et d'état initial lors du retour d'un véhicule.
- **Correction des étapes du GuidedTour** : Correctif pour la fonction `buildActiveSteps` afin d'éviter tout blocage lors de la visite guidée.

## [4.0.0] — 08 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Feature Inventaire** — Ajout de la fonctionnalité de gestion d'inventaire.
- **Déclaration d'incident/accident/radar** — Ajout de la fonctionnalité de déclaration d'incident, d'accident et de radar.

### 🐛 Corrections

- **Gestion des rôles** — Correction des problèmes liés aux rôles des utilisateurs.

## [3.2.0] — 04 juin 2026

### ✨ Nouvelles fonctionnalités

- **Historique des incidents** — Ajout de l'historique des incidents d'un véhicule pour les administrateurs avec téléchargement du rapport PDF.

## [3.0.0] — 16 mai 2026

### ✨ Nouvelles fonctionnalités

- **Refonte complète de l'inventaire** — Passage à un système de gestion de stock global simplifié. L'inventaire est désormais centralisé (plus de gestion par sac/véhicule) et permet un suivi précis des quantités disponibles.
- **Historique des mouvements de stock** — Chaque modification de quantité est désormais enregistrée avec le nom de l'auteur, la date et une note, permettant une traçabilité complète (audit trail).
- **Interface d'administration de l'inventaire** — Nouveau tableau paginé avec recherche instantanée et boutons d'ajustement rapide (+/-) pour les administrateurs.

### 🔧 Changements

- **Restriction d'accès à l'inventaire** — L'accès au module d'inventaire et sa gestion sont désormais strictement réservés aux administrateurs.
- **Suppression du rôle Secouriste** — Le rôle "Secouriste" a été retiré du système car il n'est plus nécessaire avec la nouvelle structure des permissions.
- **Simplification du modèle de données** — Suppression des concepts de "Sacs", "Lots", "Groupes" et "Modèles de sacs" au profit d'un catalogue d'articles unique et efficace.

## [2.5.0] — 13 mai 2026

### ✨ Nouvelles fonctionnalités

- **Véhicules extérieurs & formulaire adaptatif** — Ajout de la possibilité de sélectionner "VL extérieure" ou "VPSP extérieur" lors de la saisie d'un compte rendu de mission. Les étapes de saisie du matériel et de l'oxygène sont désormais automatiquement masquées lors de l'utilisation de ces véhicules.

### 🐛 Corrections

- **Validation des permis à la création** — Correction d'un bug où les nouveaux profils de chauffeurs (CHVL/CHVPSP) avaient leurs papiers automatiquement validés. Désormais, ils sont correctement marqués comme non validés à la création, nécessitant une vérification manuelle.

## [2.4.9] — 12 avril 2026

### 🐛 Corrections

- **Correction des listes en mode démo** — Les listes de missions, véhicules et utilisateurs s'affichent désormais correctement même avec des paramètres de filtrage ou de pagination. L'intercepteur `fetch` a été assoupli pour supporter les query strings.
- **Missions de test** — Ajout d'un jeu de données initial pour les missions en mode démo afin que la page ne soit pas vide à la première activation.

## [2.4.8] — 12 avril 2026

### 🐛 Corrections

- **Statistiques en mode démo** — Correction d'un crash sur la page statistiques dû à des champs manquants dans le mock global (`completedTrips`, `totalIncidents`, etc.).

## [2.4.7] — 12 avril 2026

### 🐛 Corrections

- **Stabilité du Mode Démo** — Correction des erreurs `filter is not a function` dues à des formats de réponse API incorrects. Le mode démo respecte désormais strictement les structures de données attendues par le frontend (tableaux vs objets).
- **Réinitialisation des données** — Ajout d'un bouton "Réinitialiser" dans la bannière démo pour effacer le stockage local et repartir sur une base propre en cas de corruption de données.

## [2.4.6] — 12 avril 2026

### 🔧 Changements

- **Validation automatique des permis en démo** — En mode démo, le contrôle des permis de conduire renvoie désormais systématiquement un statut valide. Cela évite l'affichage de bannières d'alerte ou le blocage des fonctionnalités d'emprunt pour les utilisateurs dont les papiers réels seraient en attente de validation.

## [2.4.5] — 12 avril 2026

### 🐛 Corrections

- **Mode Démo Robuste** — Correction du crash lors de la consultation des détails d'un véhicule en mode démo (gestion correcte des identifiants par nom).
- **Parité Fonctionnelle** — Ajout de la gestion complète des missions, de l'historique de maintenance, des statistiques et de la télémétrie Renault simulée dans le mode démo.
- **Isolation Totale** — Simulation du contrôle des permis pour garantir une expérience fluide même pour les utilisateurs ayant des papiers à régulariser dans le monde réel.

## [2.4.4] — 12 avril 2026

### ✨ Nouvelles fonctionnalités

- **Mode Démo (Bac à sable)** — Ajout d'un mode démo accessible depuis la page Aide. Il permet de tester toutes les fonctionnalités (emprunt, rendu, missions) sans impacter la base de données réelle.
- **Isolation totale** — Les données du mode démo sont stockées uniquement dans le navigateur de l'utilisateur (LocalStorage). Les modifications faites par un utilisateur ne sont pas visibles par les autres.
- **Indicateur visuel** — Une bannière orange persistante s'affiche en mode démo pour éviter toute confusion avec l'environnement réel.
- **Moteur d'interception** — Utilisation d'un proxy `fetch` transparent pour simuler les réponses API sans changer le code métier.

## [2.4.3] — 12 avril 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau sélecteur de photos unifié** — Introduction d'un composant dédié proposant deux boutons distincts : "Appareil photo" et "Galerie". Cette approche garantit que l'utilisateur a toujours le choix, quel que soit son appareil ou son navigateur.
- **Interface cohérente** — Déploiement du nouveau sélecteur sur tous les points d'entrée : prise de véhicule, retour de véhicule, photos de mission et rapport signé.

## [2.4.2] — 12 avril 2026

### 🔧 Changements

- **Sélecteur de photos flexible** — Suppression de la contrainte d'appareil photo forcé sur mobile. Les utilisateurs peuvent désormais choisir entre prendre une photo en direct ou sélectionner des images depuis leur galerie.

## [2.4.1] — 1 avril 2026

### ✨ Nouvelles fonctionnalités

- **Signature du rapport de mission** — Nouvelle étape obligatoire lors de la saisie d'un compte rendu : l'utilisateur doit désormais joindre une photo du rapport papier signé par l'organisateur.
- **Capture simplifiée** — Prise de photo directe (mode scanner) ou import d'un document existant depuis la galerie.
- **Sauvegarde sécurisée** — Archivage automatique des rapports signés dans un espace de stockage partagé sécurisé.
- **Consultation immédiate** — Le rapport signé est désormais visible directement sur la fiche détaillée du compte rendu de mission.

### 🔧 Changements

- **Parcours utilisateur fluidifié** — Réorganisation des étapes du formulaire de mission pour intégrer la signature du rapport de manière intuitive.

## [2.4.0] — 29 mars 2026

### ✨ Nouvelles fonctionnalités

- **Environnement de développement modernisé** — Lancement automatique d'une base de données locale isolée et performante pour les tests.
- **Mode test avec données réelles** — Possibilité d'initialiser l'environnement de travail avec une copie sécurisée des données réelles pour des tests plus fiables.
- **Outils de gestion simplifiés** — Nouvelles commandes pour réinitialiser ou arrêter l'environnement de travail en toute simplicité.

### 🔧 Changements

- **Configuration adaptative** — L'environnement s'adapte désormais automatiquement au mode de travail sélectionné.
- **Documentation à jour** — Guide de contribution mis à jour avec les nouveaux outils de démarrage.

## [2.3.2] — 29 mars 2026

### 🐛 Corrections

- **Gestion des réservations** — Correction d'un problème permettant des conflits de réservation pour certains profils, y compris les administrateurs.

## [2.3.1] — 25 mars 2026

### ✨ Nouvelles fonctionnalités

- **Infos de désinfection persistantes** — Les informations de désinfection (responsable et numéro de lot) sont désormais sauvegardées et survivent au rechargement de la page pour pré-remplir le formulaire de retour.

### 🔧 Changements

- **Indicateur de saisie** — L'indicateur visuel des informations de désinfection reflète désormais l'état réel des données enregistrées en base.

### 🐛 Corrections

- _Aucune correction._

## [2.3.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des comptes inactifs** — Les utilisateurs dont le compte est désactivé sont désormais redirigés vers une page d'information dédiée.
- **Statistiques pour tous** — La section Statistiques & exports est désormais accessible à tous les membres actifs de l'organisation.

### 🔧 Changements

- **Clarification des rôles** — Le rôle "Invité" est renommé en "Inactif" pour plus de clarté.
- **Spécialisation des permis** — Les chauffeurs sont désormais restreints aux types de véhicules (VL ou VPSP) correspondant à leurs habilitations.
- **Légende des permissions** — Mise à jour des descriptions pour mieux refléter les accès réels aux statistiques et à l'inventaire.
- **Sécurité des réglages** — L'accès à la configuration avancée des menus est désormais réservé aux administrateurs.

### 🐛 Corrections

- _Aucune correction._

## [2.2.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Accès dédié aux missions** — Nouveau rôle permettant aux responsables de gérer les comptes rendus de mission de manière isolée.
- **Contrôle d'affichage des menus** — Les administrateurs peuvent désormais activer ou masquer chaque menu de la navigation pour les utilisateurs.
- **Page Administration unifiée** — Refonte de la page de gestion regroupant désormais les utilisateurs et le paramétrage des menus.

### 🔧 Changements

- **Attribution automatique du rôle Secouriste** — Simplification de la gestion des droits avec l'attribution automatique du rôle de base lors de la création d'un compte.
- **Accès Inventaire** — L'accès aux fiches d'inventaire nécessite désormais explicitement le rôle correspondant pour plus de sécurité.

### 🐛 Corrections

- _Aucune correction._

## [2.1.0] — 20 mars 2026

### ✨ Nouvelles fonctionnalités

- **Photos de communication** — Possibilité d'ajouter des photos du poste ou de l'équipe (jusqu'à 10) lors de la saisie d'un compte rendu de mission.
- **Galerie photos intégrée** — Visualisation directe des photos de communication sur la page de détail du compte rendu.

### 🔧 Changements

- **Formulaire de mission enrichi** — Ajout d'une étape optionnelle dédiée aux photos en fin de saisie.

### 🐛 Corrections

- _Aucune correction._

## [2.0.2] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Traçabilité des validations** — Affichage du nom du validateur lors de la vérification des papiers d'un chauffeur.

### 🔧 Changements

- _Aucun changement._

### 🐛 Corrections

- _Aucune correction._

## [2.0.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau rôle Secouriste** — Création d'un profil dédié pour les bénévoles effectuant des missions sans conduite de véhicule.

### 🔧 Changements

- **Légende visuelle** — Mise à jour des couleurs et descriptions dans la gestion des utilisateurs.

### 🐛 Corrections

- _Aucune correction._

## [2.0.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Module Comptes Rendus de Mission (CRM)** — Saisie directe des rapports de mission dans l'application via un formulaire guidé.
- **Formulaire complet en 6 étapes** — Saisie détaillée de l'équipage, du matériel consommé, de l'oxygène et des incidents.
- **Tableau de bord des missions** — Liste filtrable des rapports pour les chauffeurs et les responsables.
- **Gestion simplifiée** — Possibilité pour les administrateurs de supprimer ou modifier les rapports erronés.

### 🔧 Changements

- **Navigation enrichie** — Ajout d'un lien direct "Missions" dans la barre de navigation.

### 🐛 Corrections

- _Aucune correction._

## [1.21.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Flexibilité des révisions** — Possibilité de modifier les dates d'immatriculation et les intervalles de maintenance sans recréer le véhicule.

### 🔧 Changements

- _Aucun changement._

### 🐛 Corrections

- _Aucune correction._

## [1.21.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation annuelle des papiers** — Mise en place d'un contrôle obligatoire de la validité du permis de conduire.
- **Alertes visuelles** — Bannière d'information indiquant le délai restant avant le blocage pour non-validation.
- **Blocage de sécurité** — Désactivation automatique des réservations si les papiers ne sont pas validés à temps.
- **Gestion déléguée** — Les responsables peuvent désormais valider les papiers des chauffeurs directement.

### 🔧 Changements

- **Suivi administratif** — Ajout d'un statut clair sur la validité des documents dans la fiche utilisateur.

### 🐛 Corrections

- _Aucune correction._

## [1.20.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi d'entretien visuel** — Indicateurs colorés pour le contrôle technique et les révisions à venir.
- **Historique de maintenance** — Journal complet des interventions effectuées sur chaque véhicule.
- **Configuration précise** — Paramétrage des intervalles de révision lors de l'ajout d'un véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.19.0] — 18 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion de la désinfection** — Suivi automatique de la désinfection périodique obligatoire pour les véhicules sanitaires (VPSP).
- **Indicateur de validité** — Décompte visuel en jours jusqu'à la prochaine désinfection obligatoire.
- **Formulaire de retour renforcé** — Saisie obligatoire des informations de désinfection lors des missions sanitaires.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.18.0] — 14 mars 2026

### ✨ Nouvelles fonctionnalités

- **Réservation pour tiers** — Les administrateurs peuvent désormais réserver un véhicule au nom d'un autre chauffeur.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.17.1] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Aide à la gestion** — Ajout d'une légende détaillée des rôles et des niveaux d'accès.

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Accès restreint** — Suppression de la création automatique de compte ; seuls les utilisateurs invités peuvent se connecter.

### 🐛 Corrections

- _Aucune correction._

## [1.17.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi électrique** — Gestion de la capacité batterie et statistiques de consommation en kWh/100km pour les véhicules électriques.

### 🔧 Changements

- **Unités adaptatives** — Affichage dynamique des consommations en Litres ou en kWh selon le type de moteur.

### 🐛 Corrections

- _Aucune correction._

## [1.16.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Filtres de statistiques** — Nouveaux filtres par véhicule, chauffeur et type de mission.
- **Indicateurs de performance** — Taux d'utilisation, niveau moyen de carburant au retour et taux d'incidents précis.
- **Export PDF complet** — Rapport d'activité enrichi pour le partage des statistiques.

### 🔧 Changements

- **Tableaux enrichis** — Ajout de colonnes de performance dans le classement des chauffeurs.

### 🐛 Corrections

- _Aucune correction._

## [1.15.3] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Capacité de réservoir personnalisée** — Paramétrage précis pour chaque véhicule afin d'améliorer la fiabilité des calculs de consommation.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Précision du carburant** — Correction du calcul du pourcentage restant basé sur la capacité réelle.

## [1.15.2] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Calcul de consommation** — Les pleins de carburant et recharges ne faussent plus la moyenne de consommation.

## [1.15.1] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Messages personnalisés** — Diversification des messages humoristiques selon les habitudes des chauffeurs.

### 🐛 Corrections

- _Aucune correction._

## [1.15.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Amélioration de la stabilité** — Optimisation interne du code pour une application plus fluide.

### 🐛 Corrections

- _Aucune correction._

## [1.14.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- **Signalement de bug** — Bouton direct pour signaler un problème technique aux administrateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.13.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Protection des profils** — Renforcement de l'identification des utilisateurs contre les changements d'adresse email.

### 🐛 Corrections

- _Aucune correction._

## [1.12.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Saisie prédictive** — Pré-remplissage automatique du nom de la mission basé sur la réservation en cours.
- **Rapports PDF officiels** — Intégration du logo et mise en page professionnelle pour les exports.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Filtres de dates** — Correction de l'inclusion du dernier jour dans les statistiques.
- **Affichage des faits marquants** — Ajustement du seuil d'apparition des anecdotes sur les chauffeurs.

## [1.11.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Tableau de bord Statistiques** — Analyse visuelle de l'activité sur les 60 derniers jours (emprunts, kilomètres, incidents).
- **Anecdotes chauffeurs** — Section humoristique mettant en avant les habitudes marquantes des utilisateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.10.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Véhicules connectés** — Récupération automatique et en temps réel du kilométrage et de l'énergie.
- **Badge de vérification** — Indicateur visuel lorsque les données sont en cours de mise à jour.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.9.2] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- **Contrôle de propreté** — Nouveau critère d'état du véhicule lors du départ et du retour.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.9.1] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Accessibilité améliorée** — Interface optimisée pour la navigation au clavier et les lecteurs d'écran.

### 🐛 Corrections

- _Aucune correction._

## [1.9.0] — 7 mars 2026

### ✨ Nouvelles fonctionnalités

- **Jauge d'énergie visuelle** — Indicateur graphique interactif avec code couleur pour le carburant et la batterie.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.8.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des notifications push** — Contrôle simplifié de l'activation des alertes en temps réel.

### 🔧 Changements

- **Sécurité des alertes** — Notifications push réservées aux administrateurs et responsables.

### 🐛 Corrections

- **Navigation de secours** — Correction des redirections et du fonctionnement du tour guidé.

## [1.7.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Correction de données** — Possibilité de signaler une erreur de kilométrage ou de carburant lors de la prise d'un véhicule.
- **Historique paginé** — Navigation fluide dans les sorties passées du véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Fuseau horaire** — Toutes les heures sont désormais calées sur l'heure de Paris.

## [1.6.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Protection renforcée** — Mise en place de mesures anti-piratage et validation stricte des documents uploadés.

### 🐛 Corrections

- **Validation des formulaires** — Amélioration de la fiabilité des fenêtres de saisie.

## [1.5.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation des réservations** — Nouveau flux de demande d'emprunt avec approbation par les responsables.

### 🔧 Changements

- **Optimisation mobile** — Amélioration de l'affichage sur les petits écrans.

### 🐛 Corrections

- _Aucune correction._

## [1.4.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Checklists personnalisées** — Listes de contrôle sur-mesure obligatoires au départ et au retour de chaque véhicule.
- **Gestion simplifiée des comptes** — Création directe d'utilisateurs par les administrateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Installation mobile** — Correction de l'affichage du bouton d'installation sur smartphone.

## [1.3.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Système de réservation** — Calendrier complet pour planifier les utilisations futures.
- **Fluidité d'affichage** — Mise en place de structures animées pendant le chargement des pages.
- **Application mobile (PWA)** — Possibilité d'installer l'outil comme une application native sur Android et iPhone.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.2.3] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **QR Codes véhicules** — Génération de codes à flasher pour accéder directement à la fiche d'un véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.2.2] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Easter egg Konami** — ↑ ↑ ↓ ↓ ← → ← → B A 🎮

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Reprise de navigation** — Redirection automatique vers la page demandée après la connexion.

## [1.2.1] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Recherche utilisateurs** — Ajout d'une barre de recherche et d'une pagination dans la gestion des comptes.

### 🐛 Corrections

- _Aucune correction._

## [1.2.0] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Guide de bienvenue** — Tutoriel interactif pour faciliter la première prise en main de l'application.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.1.0] — 2 mars 2026

### ✨ Nouvelles fonctionnalités

- **Détection de mouvements suspects** — Alertes automatiques en cas d'utilisation inhabituelle hors planning.

### 🔧 Changements

- **Notifications push** — Abandon des e-mails au profit des alertes directes sur smartphone.

### 🐛 Corrections

- _Aucune correction._

## [1.0.0] — 2 mars 2026

### 🚀 Lancement

- Connexion sécurisée avec les adresses Croix-Rouge française.
- Gestion complète du parc automobile et fiches d'état.
- Cycle d'emprunt et de retour guidé (photos, énergie, commentaires).
- Historique complet des sorties et gestion des conducteurs secondaires.
- Synchronisation automatique avec les données constructeur.
- Interface moderne avec mode sombre et design mobile.
