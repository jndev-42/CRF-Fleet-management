-- Script de seed pour la base de données preview
-- À exécuter une seule fois sur la base preview (TURSO_DATABASE_URL de .env.preview)
--
-- Ces utilisateurs permettent la connexion one-click sur l'écran de login preview.
-- Le domaine @preview.local est traité comme un domaine interne (pas de vérification @croix-rouge.fr).
--
-- Utilisation via Turso CLI :
--   turso db shell <nom-db-preview> < scripts/seed-preview-users.sql
--
-- Ou via le script TypeScript :
--   npx tsx scripts/seed-preview-users.ts

-- ── Utilisateurs preview ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18ème', 'paris-18');

-- Nettoyage des anciens utilisateurs preview legacy
DELETE FROM "UserRole" WHERE userId IN ('preview-user-respo', 'preview-user-secouriste');
DELETE FROM "UserUL" WHERE userId IN ('preview-user-respo', 'preview-user-secouriste');
DELETE FROM "User" WHERE id IN ('preview-user-respo', 'preview-user-secouriste');

INSERT OR IGNORE INTO "User" (id, email, name, papiers_valides, last_validation, validated_by)
VALUES
    ('preview-user-superadmin',  'preview-superadmin@preview.local',  'Super Admin Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-admin',       'preview-admin@preview.local',       'Admin Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-president',   'preview-president@preview.local',   'Président Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-cadre',       'preview-cadre@preview.local',       'Cadre Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-chvl',        'preview-chvl@preview.local',        'Chauffeur Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-ci',          'preview-ci@preview.local',          'CI/RPAPS Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-inactif',     'preview-inactif@preview.local',     'Inactif Preview', 1, '2026-07-10', 'System Preview');

-- ── Rattachement à l'UL principale ──────────────────────────────────────────
INSERT OR IGNORE INTO "UserUL" (userId, ulId, is_home, roles)
VALUES
    ('preview-user-superadmin', 'ul-paris-18', 1, 'SUPER_ADMIN,CHVL'),
    ('preview-user-admin',      'ul-paris-18', 1, 'ADMIN,CHVL'),
    ('preview-user-president',  'ul-paris-18', 1, 'PRESIDENT,CHVL'),
    ('preview-user-cadre',      'ul-paris-18', 1, 'CADRE,CHVL'),
    ('preview-user-chvl',       'ul-paris-18', 1, 'CHVL'),
    ('preview-user-ci',         'ul-paris-18', 1, 'CI/RPAPS'),
    ('preview-user-inactif',    'ul-paris-18', 1, 'INACTIF');
