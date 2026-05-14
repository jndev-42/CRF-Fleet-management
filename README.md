# Martine — Croix-Rouge Paris 18

Application web de gestion de la flotte de véhicules de l'Unité Locale de la Croix-Rouge Française de Paris 18. Elle centralise le suivi des emprunts de véhicules, les états des sorties/retours, les niveaux d'essence et kilométrages, ainsi que les réservations et notifications internes.

---

## Fonctionnalités

### Gestion des véhicules
- Liste de la flotte avec statut en temps réel (Disponible / En mission / Maintenance)
- Fiche détaillée par véhicule : kilométrage, niveau de carburant/batterie, emplacement de stationnement
- Jauge de carburant visuelle avec jalons (E / 1/4 / 1/2 / 3/4 / F) et code couleur dynamique
- Ajout, édition et suppression de véhicules (ADMIN)
- Notes internes par véhicule

### Sorties & retours (trips)
- **Check-out** : saisie du nom du chauffeur, type de mission, kilométrage, niveau d'essence, checklist pré-départ, deuxième conducteur optionnel
- **Check-in** : saisie du kilométrage et niveau d'essence retour, état du véhicule, checklist retour
- Signalement de données incorrectes (kilométrage/carburant erroné) lors d'un check-out sur véhicule non connecté → notification automatique aux RESPO/ADMIN
- Historique paginé des sorties par véhicule (3 par page)
- Ajout d'un dossier de déplacement (lien Google Drive)

### Réservations
- Système de réservation de véhicules par plage horaire
- Vue calendrier ou liste des réservations à venir
- Gestion des conflits de créneaux

### Véhicules connectés (Renault)
- Intégration Renault Connect : niveau de batterie/carburant, autonomie et kilométrage en temps réel
- Sessions Renault/Gigya persistées en base (résistantes aux cold-starts Vercel)

### Notifications
- **In-app** (cloche) : notifications persistées en base, visibles uniquement par les RESPO et ADMIN
- **Push** (OneSignal) : notifications push natives (bureau / mobile) pour les événements critiques
- Toggle activation/désactivation des notifications push directement depuis la cloche

### Authentification & rôles
- Authentification OAuth2 via Google (restreinte aux emails `@croix-rouge.fr`)
- Auto-inscription à la première connexion avec rôle `GUEST`
- 5 rôles : `ADMIN`, `RESPO`, `CHVL`, `CHVPSP`, `GUEST`
- Gestion des utilisateurs et rôles (ADMIN)

### Expérience utilisateur
- PWA installable (iOS / Android / desktop)
- Mode sombre / clair
- Tour guidé de première utilisation (adapté selon le rôle)
- Easter egg Konami

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend + Backend | [Next.js 16](https://nextjs.org/) — App Router, Server & Client Components |
| Base de données | [Turso](https://turso.tech/) — SQLite cloud via libSQL (`@libsql/client`) |
| Authentification | [NextAuth v5](https://authjs.dev/) — OAuth2 Google |
| Notifications push | [OneSignal](https://onesignal.com/) — SDK Web v16 |
| Hébergement | [Vercel](https://vercel.com/) |
| Icônes | [Lucide React](https://lucide.dev/) |

---

## Architecture

```
src/
├── app/                    # Pages Next.js (App Router)
│   ├── page.tsx            # Dashboard
│   ├── vehicles/           # Liste et fiches véhicules
│   ├── users/              # Gestion des utilisateurs (ADMIN)
│   ├── reservations/       # Réservations
│   ├── aide/               # Page d'aide (authentifiée)
│   └── api/                # Routes API (REST, serverless)
├── components/
│   ├── vehicle/            # Composants liés aux véhicules et modales
│   ├── Navbar.tsx
│   ├── NotificationBell.tsx
│   ├── GuidedTour.tsx
│   └── OneSignalProvider.tsx
├── lib/
│   ├── db.ts               # Client Turso/libSQL
│   ├── onesignal.ts        # Envoi de notifications (serveur)
│   └── renault.ts          # Intégration API Renault Connect
└── auth.ts                 # Configuration NextAuth
```

---

## Variables d'environnement

### Obligatoires (production)

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Secret NextAuth (généré via `npx auth secret`) |
| `GOOGLE_CLIENT_ID` | OAuth2 Google — Client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth2 Google — Client Secret |
| `TURSO_DATABASE_URL` | URL de la base Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Token d'authentification Turso |

### Optionnelles

| Variable | Description |
|---|---|
| `ONESIGNAL_ID` | App ID OneSignal (notifications push) |
| `ONESIGNAL_API_KEY` | REST API Key OneSignal |
| `RENAULT_MAIL` | Email du compte Renault Connect (véhicules connectés) |
| `RENAULT_PASS` | Mot de passe du compte Renault Connect |

> En **développement local**, seul `AUTH_SECRET` + `TURSO_DATABASE_URL=file:./dev.db` sont nécessaires. Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour le setup complet.

---

## Contribuer & déployer

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les instructions de lancement local, de test et de déploiement.
