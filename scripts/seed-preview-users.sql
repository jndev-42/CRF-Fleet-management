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

INSERT OR IGNORE INTO "User" (id, email, name, papiers_valides, last_validation, validated_by)
VALUES
    ('preview-user-admin',       'preview-admin@preview.local',       'Admin Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-respo',       'preview-respo@preview.local',       'Responsable Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-chvl',        'preview-chvl@preview.local',        'Chauffeur Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-ci',          'preview-ci@preview.local',          'CI/RPAPS Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-secouriste',  'preview-secouriste@preview.local',  'Secouriste Preview', 1, '2026-07-10', 'System Preview'),
    ('preview-user-inactif',     'preview-inactif@preview.local',     'Inactif Preview', 1, '2026-07-10', 'System Preview');

-- ── Rattachement à l'UL principale ──────────────────────────────────────────
-- Adapter l'ulId selon l'UL présente dans la base preview
-- (ici on suppose que l'UL paris-18 existe, comme en dev/prod)

INSERT OR IGNORE INTO "UserUL" (userId, ulId, is_home, roles)
VALUES
    ('preview-user-admin',      'ul-paris-18', 1, 'ADMIN,CHVL'),
    ('preview-user-respo',      'ul-paris-18', 1, 'RESPO,CHVL'),
    ('preview-user-chvl',       'ul-paris-18', 1, 'CHVL'),
    ('preview-user-ci',         'ul-paris-18', 1, 'CI/RPAPS'),
    ('preview-user-secouriste', 'ul-paris-18', 1, ''),
    ('preview-user-inactif',    'ul-paris-18', 1, 'INACTIF');
