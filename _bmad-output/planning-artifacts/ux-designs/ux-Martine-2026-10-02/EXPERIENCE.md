---
name: Martine — Vue DT, filtres de disponibilité et de type
status: draft
updated: 2026-10-02
design: ./DESIGN.md
sources:
  - src/app/vehicles/page.tsx
  - src/app/globals.css
scope: Incrément sur la Vue DT de /vehicles uniquement. Ce n'est pas une refonte.
---

# EXPERIENCE — Filtres de la Vue DT

> Le besoin, en une phrase : « Pour la Vue DT, je veux filtrer la liste selon la disponibilité et le type de véhicule, à l'instant T ou sur une période donnée. La page doit servir de tableau de bord d'aide à la logistique. »

Les règles métier inférées sont marquées **[ASSUMPTION]**. Les décisions qui reviennent à un humain sont regroupées dans la section **Questions ouvertes**, en fin de document. En cas de conflit avec une maquette, ce document et DESIGN.md priment.

## Foundation

- **Surface** : web responsive (Next.js App Router, client component `src/app/vehicles/page.tsx`). Usage surtout sur ordinateur, possible sur téléphone.
- **Système d'interface** : celui de Martine (CSS Modules + variables de `globals.css`), sans bibliothèque de composants tierce. Les spécifications visuelles se trouvent dans [DESIGN.md](./DESIGN.md).
- **Qui voit quoi** : la bascule « Vue UL / Vue DT » n'apparaît qu'aux porteurs du rôle DT (`hasDTRole`), et seulement si l'UL active a un `dtCode`. La Vue DT reste **en lecture seule** : aucune réservation ni action sur le véhicule depuis cette vue.
- **Ce qui ne change pas** : la Vue UL, la bascule, le badge « UL xxx » des cartes, le calendrier mensuel (`VehicleCalendar`).

## Information Architecture

Ordre vertical de la Vue DT, après l'incrément :

1. Bascule Vue UL / **Vue DT** (existante).
2. **FleetStatsRow** : ses compteurs suivent désormais la temporalité et le filtre de type (voir *Compteurs*).
3. **Panneau de filtres** (nouveau, un seul `.card`) :
   1. **Quand ?** : sélecteur segmenté `Maintenant` | `Période`.
      - En mode `Période` : champs **Début** et **Fin** (date et heure), puis les raccourcis `Aujourd'hui` · `Demain` · `Ce week-end` · `7 prochains jours`.
   2. **Disponibilité** : puces multi-sélection avec compteur. La liste des puces dépend du mode (voir *Sémantique*).
   3. **Type** : puces multi-sélection avec compteur, construites à partir des types présents dans la DT.
   4. **Affichage** : interrupteur `Regrouper par UL`, et lien `Réinitialiser les filtres` (visible dès qu'un filtre diffère des valeurs par défaut).
   5. **Phrase de synthèse** (`aria-live`), par exemple : « **4 véhicules** · VPSP, VL · disponibles du sam. 10 oct. 08:00 au sam. 10 oct. 20:00 ».
4. **Calendrier mensuel** (existant). Il se limite aux véhicules retenus par le filtre de type. En mode Période, il s'ouvre sur le mois du début et surligne la plage choisie. [ASSUMPTION]
5. **Résultats** : `.vehicle-grid`, éventuellement découpée en sections par UL.

La barre de filtres statut actuelle (Tous / 🟢 / 🟡 / 🔴) **est remplacée en Vue DT** par le groupe Disponibilité, qui la généralise. En Vue UL, elle ne change pas.

### Valeurs par défaut

| Filtre | Défaut |
|---|---|
| Quand | `Maintenant` |
| Période préremplie au premier passage en mode Période | **Demain 08:00 → 20:00** (créneau type d'un DPS) [ASSUMPTION] |
| Disponibilité | aucune puce active, ce qui revient à « tous les statuts » |
| Type | aucune puce active, ce qui revient à « tous les types » |
| Regrouper par UL | désactivé ; tri par statut, puis par UL, puis par nom [ASSUMPTION] |

Une puce active restreint la liste ; plusieurs puces du même groupe s'additionnent (OU) ; deux groupes différents se combinent (ET). Pas de puce « Tous » dans un groupe : désactiver toutes les puces suffit.

## Sémantique de disponibilité

### Sources d'indisponibilité (« bloqueurs »)

| Source | Intervalle bloquant | Règle |
|---|---|---|
| `VehicleMaintenance` | `startDate` → `endDate`. Si `endDate` est NULL, la maintenance est ouverte et bloque **sans fin**. Une date sans heure couvre toute la journée (00:00 → 23:59) | [ASSUMPTION] |
| `Reservation` `VALIDATED` | `startTime` → `endTime` | Bloque |
| `Reservation` `PENDING` | `startTime` → `endTime` | **Bloque par défaut** et porte la mention « à valider » [ASSUMPTION] → Q1 |
| `Reservation`, autres statuts (refusée, annulée, terminée…) | — | Ignorées [ASSUMPTION] |
| `Trip` en cours (`checkInAt` NULL) | `checkOutAt` → fin de la réservation liée si elle existe, sinon **sans fin connue** | [ASSUMPTION] → Q2 |

### Mode `Maintenant` (t = instant présent, recalculé à l'ouverture de la page et à chaque rafraîchissement manuel)

Un seul statut par véhicule. En cas de cumul, le premier de cette liste l'emporte :

1. **Maintenance** : une maintenance couvre t. Badge `.maintenance` 🔴.
2. **En mission** : un trajet est en cours. Badge `.inuse` 🟡.
3. **Réservé** : une réservation (VALIDATED ou PENDING) couvre t, sans trajet ouvert. Badge `.reserved`. [ASSUMPTION] Aujourd'hui ce cas apparaît comme « Disponible » ; c'est le seul changement de comportement en mode Maintenant.
4. **Disponible** : aucun bloqueur sur t. Badge `.available` 🟢.

Puces Disponibilité en mode Maintenant : `🟢 Disponibles` · `Réservés` · `🟡 En mission` · `🔴 Maintenance`.

### Mode `Période` ([début, fin[)

On calcule l'union des bloqueurs restreinte à la période, puis :

| Statut | Règle | Badge |
|---|---|---|
| **Disponible** | Aucun bloqueur ne chevauche la période : le véhicule est libre **sur toute la période** | `.available` 🟢 |
| **Partiellement disponible** | Les bloqueurs couvrent une partie de la période seulement. On affiche les créneaux libres | `.partial` (vert pointillé) |
| **Réservé** | Des réservations couvrent toute la période | `.reserved` |
| **En mission** | Un trajet en cours sans fin connue chevauche le début de la période (voir Q2) | `.inuse` 🟡 |
| **Maintenance** | Une maintenance couvre toute la période | `.maintenance` 🔴 |

- Ordre de priorité lorsque des bloqueurs de nature différente couvrent ensemble la période : Maintenance > En mission > Réservé. [ASSUMPTION]
- Les créneaux libres plus courts que **1 heure** sont ignorés : un véhicule libre seulement 20 minutes entre deux réservations est classé « Réservé » et non « Partiel ». [ASSUMPTION] → Q4
- **Sur la carte, en mode Période**, une ligne de texte placée sous le badge détaille l'occupation :
  - Partiel : « Libre 08:00–13:00 · pris 13:00–20:00 » (une période sur plusieurs jours préfixe les heures par la date courte : « sam. 08:00 »).
  - Réservé, En mission ou Maintenance : « Réservé 07:00–21:00 », « En mission depuis ven. 18:40 — retour non saisi », « Maintenance depuis le 28 sept. — sans date de fin ».
  - La mention « à valider » s'ajoute dès qu'au moins une réservation PENDING intervient.
  - On n'affiche ni le nom du réservant ni le motif. [ASSUMPTION] → Q5

Puces Disponibilité en mode Période : `🟢 Disponibles` · `Partiellement` · `Réservés` · `🟡 En mission` · `🔴 Maintenance`.

### Compteurs

- **Puces de type** : chaque compteur donne le nombre de véhicules de ce type qui passent le filtre Disponibilité courant. C'est le chiffre qui répond à « combien de VPSP libres samedi ? ».
- **Puces de disponibilité** : chaque compteur donne le nombre de véhicules de ce statut qui passent le filtre Type courant.
- Un groupe n'influe jamais sur ses propres compteurs (filtrage à facettes classique). Une puce à `0` reste affichée et cliquable, avec le compteur en `--text-muted`.
- **FleetStatsRow** suit la temporalité et le filtre Type, **mais pas le filtre Disponibilité** (sinon il ne servirait plus à rien) :
  - En mode Maintenant : `Total` · `Disponibles` · `En mission` · `Maintenance` (inchangé). Les réservés comptent dans le Total uniquement. [ASSUMPTION]
  - En mode Période : `Total` · `Libres toute la période` · `Partiellement` · `Indisponibles` (Réservé + En mission + Maintenance).
  - Une tuile cliquable sélectionne la puce Disponibilité correspondante, en raccourci. [ASSUMPTION]

## Component Patterns

| Composant | Comportement |
|---|---|
| **Sélecteur Quand** | Deux boutons exclusifs. En passant en `Période`, les champs s'ouvrent sans animation lourde et la période précédente de la session (ou le préremplissage) est restaurée. En revenant à `Maintenant`, la période est conservée pour un retour éventuel, mais n'apparaît plus dans l'URL. |
| **Champs Début / Fin** | `<input type="datetime-local">` natif, pas de 15 min. Modifier Début en lui donnant une valeur ≥ Fin décale Fin pour conserver la durée précédente, au lieu d'afficher une erreur. Fuseau : Europe/Paris, celui du navigateur. [ASSUMPTION] |
| **Raccourcis** | `Aujourd'hui` = maintenant → 23:59. `Demain` = 00:00 → 23:59. `Ce week-end` = samedi 00:00 → dimanche 23:59 (si l'on est déjà en week-end : maintenant → dimanche 23:59). `7 prochains jours` = maintenant → J+7 à la même heure. Un raccourci se contente de **remplir** les champs ; il apparaît actif tant que les champs correspondent. |
| **Puces Disponibilité / Type** | Boutons bascule. Le libellé du type est la valeur normalisée (espaces retirés, regroupement insensible à la casse). Ordre : `VPSP`, `VL`, `Utilitaire`, `Moto`, puis les autres valeurs par ordre alphabétique, puis `Sans type` si besoin. [ASSUMPTION] |
| **Regrouper par UL** | Un en-tête de section par UL, par exemple « UL Paris 15 — 3 véhicules (2 disponibles) ». Les sections sans résultat sont masquées. Ordre des sections : UL active de l'utilisateur en premier, puis par nombre de véhicules disponibles décroissant. [ASSUMPTION] |
| **Réinitialiser les filtres** | Revient aux défauts : Maintenant, aucune puce, pas de regroupement. Le focus passe ensuite sur le segment `Maintenant`. |
| **Carte véhicule (Vue DT)** | Inchangée, sauf le badge de statut, qui suit le mode, et la ligne d'occupation en mode Période. Toujours en lecture seule. |

## State Patterns

| État | Déclencheur | Rendu |
|---|---|---|
| **Chargement initial** | Arrivée en Vue DT | Squelettes de cartes dans `.vehicle-grid`, compteurs « — ». Panneau de filtres utilisable tout de suite. |
| **Recalcul (mode Période)** | Changement de début ou de fin (anti-rebond de 400 ms), ou de mode | Les résultats précédents restent affichés **atténués** (`opacity .5`, `aria-busy="true"`), avec un indicateur discret dans la phrase de synthèse : « Mise à jour… ». Les puces Type et Disponibilité filtrent sur place, sans rechargement. |
| **Vide — DT sans véhicule** | Aucun véhicule dans la DT | « Aucun véhicule n'est rattaché aux UL de cette Direction Territoriale. » Pas d'action proposée. |
| **Vide — aucun résultat** | Les filtres ne retiennent rien | « Aucun véhicule ne correspond. » Suivi de la liste des filtres actifs, chacun avec un bouton ✕ pour le retirer, puis `Réinitialiser les filtres`. **Si seul `Disponibles` est actif et que des véhicules partiellement disponibles existent** : proposer « Voir les 3 véhicules partiellement disponibles ». |
| **Erreur de chargement** | Échec de l'appel API | Bloc d'erreur à la place de la grille : « Impossible de charger les disponibilités. » + `.btn` `Réessayer`. On **n'affiche pas** de résultats périmés comme s'ils étaient à jour. Les filtres restent intacts. |
| **Période invalide — fin ≤ début** | Saisie de Fin | Message sous le champ Fin : « La fin doit être après le début. » `aria-invalid="true"`. Aucun calcul. Résultats et compteurs remplacés par « — ». |
| **Période trop longue** | Plus de 31 jours [ASSUMPTION] | « Période limitée à 31 jours. » Même traitement que ci-dessus. |
| **Période passée** | Fin < maintenant | « Cette période est terminée. Les disponibilités ne concernent que le présent et l'avenir. » + lien `Revenir à Maintenant`. Aucun calcul. [ASSUMPTION] → Q3 |
| **Période entamée** | Début < maintenant < Fin | Le calcul part de *maintenant*, avec la mention « calculé à partir de maintenant (14:32) » dans la synthèse. [ASSUMPTION] |
| **Paramètres d'URL invalides** | Lien partagé abîmé, type inconnu | Les valeurs invalides sont ignorées sans message ; un type absent de la DT est retiré en silence. |
| **Accès non-DT** | `vue=dt` dans l'URL sans le rôle DT ou sans `dtCode` | Affichage de la Vue UL ; les paramètres DT sont ignorés. |

## Persistance & partage

- **Tout l'état des filtres vit dans l'URL** (`router.replace` sans ajouter d'entrée d'historique à chaque clic sur une puce), ce qui rend un lien partageable à l'identique, par exemple « regarde ce que j'ai trouvé pour samedi » :

  `/vehicles?vue=dt&quand=periode&debut=2026-10-10T08:00&fin=2026-10-10T20:00&dispo=disponible,partiel&type=VPSP,VL&grouper=ul`

- Les dates sont stockées en **valeurs absolues**, jamais sous forme de raccourci : « samedi prochain » doit désigner le même samedi pour celui qui reçoit le lien.
- Les paramètres égaux aux valeurs par défaut sont omis.
- Pas de stockage local en plus. [ASSUMPTION] → Q6

## Voice and Tone

Le ton est factuel et opérationnel, celui d'un collègue logisticien : il donne des chiffres et des créneaux, pas d'adjectifs.

- Statuts au pluriel sur les puces (« Disponibles », « Réservés »), au singulier sur les badges (« Disponible »).
- « Libres toute la période » plutôt que « 100 % disponibles ».
- Heures au format 24 h « 08:00 ». Dates courtes « sam. 10 oct. ».
- Ne jamais écrire « erreur » seul : dire ce qui n'a pas marché, puis ce qu'on peut faire.

## Interaction Primitives

- Clic ou tap sur une puce : bascule. Effet immédiat, pas de bouton « Appliquer ».
- Saisie de date : le calcul part après 400 ms sans frappe ou à la perte du focus.
- `Échap` dans un champ date : restaure la dernière valeur valide.
- Pas de glisser-déposer, pas de survol nécessaire pour accéder à une information. La ligne d'occupation est toujours visible, jamais dans une infobulle.

## Accessibility Floor

Ces règles portent sur le comportement ; le contraste relève de DESIGN.md.

- Sélecteur Quand : `role="radiogroup"` avec `aria-label="Quand"` ; chaque option a `role="radio"` et `aria-checked`. Les flèches gauche et droite changent d'option.
- Puces : `<button aria-pressed>` regroupées dans un `<fieldset>` avec `<legend>` (« Disponibilité », « Type de véhicule »). Le nom accessible inclut le compteur : « VPSP, 4 véhicules ».
- Champs Début / Fin : `<label>` visibles, message d'erreur relié par `aria-describedby`.
- Phrase de synthèse : `aria-live="polite"`, annoncée une seule fois après la fin du calcul, pas à chaque frappe.
- Grille en recalcul : `aria-busy="true"`.
- Le statut n'est jamais porté par la couleur seule : chaque badge a un libellé texte, en plus de la pastille ou de la bordure pointillée.
- L'ordre de tabulation suit l'ordre visuel : Quand → Début → Fin → raccourcis → Disponibilité → Type → Regrouper → Réinitialiser → résultats. Le focus reste toujours visible (`--border-focus`).
- Cibles tactiles d'au moins 44 px de haut sur mobile (padding vertical des puces augmenté sous 640 px).

## Responsive & Platform

| Largeur | Comportement |
|---|---|
| ≥ 1024 px | Panneau en pleine largeur. Début et Fin côte à côte, raccourcis sur la même ligne. Grille sur plusieurs colonnes. |
| 640–1023 px | Les groupes s'empilent ; les puces passent à la ligne (`flex-wrap`). |
| < 640 px | Le panneau se replie derrière un bouton-disclosure « Filtres · 3 actifs » (`aria-expanded`), ouvert par défaut quand aucun filtre n'est actif. La phrase de synthèse reste visible même panneau replié. Début et Fin s'empilent et utilisent le sélecteur date-heure natif du téléphone. Pas de défilement horizontal : les puces passent à la ligne. FleetStatsRow passe en 2 × 2. |

## Key Flows

### Flow 1 — « Il me faut 3 VPSP et 2 VL samedi » (Karim, cadre logistique DT, bénévole, mardi 21 h, sur son portable chez lui)

Karim prépare le dispositif de secours (DPS) d'un semi-marathon, samedi de 8 h à 20 h. L'organisateur attend 3 VPSP et 2 VL. Karim veut savoir lesquels sont libres, et dans quelles UL.

1. Il ouvre `/vehicles`, bascule en **Vue DT** et voit les 38 véhicules des 9 UL.
2. Il clique sur **Période**. Les champs se préremplissent avec demain 08:00 → 20:00. Il passe le Début à samedi 07:30 (pour le temps de mise en place) et la Fin à samedi 20:30. Les résultats s'atténuent, puis se mettent à jour.
3. Il active **Type : VPSP** et **VL**. Les puces annoncent `VPSP (7)` et `VL (12)`.
4. Il active **Disponibilité : 🟢 Disponibles**. Les compteurs de type deviennent `VPSP (4)` et `VL (5)`. La synthèse indique « 9 véhicules · VPSP, VL · libres du sam. 10 oct. 07:30 au sam. 10 oct. 20:30 ».
5. Il active **Regrouper par UL** : 4 VPSP répartis entre UL Paris 15 (2), UL Boulogne (1) et UL Issy (1).
6. **Climax** : en un écran, Karim a sa réponse. Il y a assez de VPSP, avec de la marge, et il sait **précisément** quelles UL appeler, en commençant par Paris 15, qui peut en fournir deux à elle seule. Il copie l'URL et l'envoie au président de l'UL Paris 15 : « Tu peux me bloquer ces deux-là ? ». Le lien ouvre exactement la même vue.

**Variante, pas assez de véhicules** : seuls 2 VPSP sont libres toute la période. L'état vide n'a pas lieu, mais Karim active `Partiellement` et voit « VPSP 21 — Libre 12:00–20:30 · pris 07:30–12:00 ». Il sait qu'il pourra couvrir l'après-midi avec un troisième VPSP et renégocier le matin.

**Échec** : Karim saisit par erreur une Fin à 07:00. Le champ Fin indique « La fin doit être après le début. », aucun calcul ne part et rien ne s'efface. Il corrige, le calcul repart.

### Flow 2 — « Là, maintenant, quelles ambulances ? » (Sophie, cadre DT d'astreinte, samedi 15 h, sur son téléphone)

1. Une UL signale une panne de VPSP en plein poste. Sophie ouvre Martine sur son téléphone, en Vue DT. Le mode **Maintenant** est actif par défaut.
2. Elle déplie « Filtres », touche **VPSP**, puis **🟢 Disponibles**.
3. **Climax** : « 3 véhicules · VPSP · disponibles maintenant », regroupés par UL (option conservée dans le lien qu'elle avait mis en favori). Elle appelle l'UL la plus proche.

## Questions ouvertes

Voir le JSON de sortie (`open_questions`). Points clés : Q1 effet bloquant d'une réservation PENDING ; Q2 effet d'un trajet ouvert sur une période future ; Q3 consultation d'une période passée ; Q4 seuil minimal d'un créneau libre ; Q5 visibilité de l'UL ou du motif de la réservation ; Q6 mémorisation des filtres entre deux visites.
