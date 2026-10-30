import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const applicationRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(applicationRoot, '../..');
const outputDefault = resolve(applicationRoot, 'tmp/production-supabase-bundle.sql');

/**
 * 生产包只消费已经评审过的 RxDB core 和产品迁移。
 * 001-local-account-checks.sql 是本地开发探针，故意不在清单中。
 */
export const productionSources = [
  'docker/sql/01-rxdb-system-tables.sql',
  'docker/sql/02-rxdb-sync-functions.sql',
  'docker/sql/04-rxdb-utils-functions.sql',
  'docker/sql/production/rxdb-change-grants.sql',
  'apps/aiao-media/infra/supabase/migrations/002-product-workspaces.sql',
  'apps/aiao-media/infra/supabase/migrations/003-rxdb-product-permissions.sql',
  'apps/aiao-media/infra/supabase/migrations/004-admin-foundation.sql',
  'apps/aiao-media/infra/supabase/migrations/005-product-content.sql',
  'apps/aiao-media/infra/supabase/migrations/006-trusted-membership.sql',
  'apps/aiao-media/infra/supabase/migrations/007-jpeg-work-metadata.sql',
  'apps/aiao-media/infra/supabase/migrations/008-sync-target-capabilities.sql',
  'apps/aiao-media/infra/supabase/migrations/009-sync-data-management.sql'
];

const transactionBoundary = /^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm;

/** 允许全新 Supabase 项目中由 PostGIS 等扩展预先创建的只读 public 关系。 */
const publicExtensionRelations = [
  'geography_columns',
  'geometry_columns',
  'raster_columns',
  'raster_overviews',
  'spatial_ref_sys'
];

export const emptyPublicGuard = `
-- Aiao Media production bootstrap guard: this bundle is for a new, dedicated product project only.
-- It must run before any source DDL and abort atomically when public already has application data.
DO $aiao_media_empty_project_guard$
DECLARE
  existing_relations text;
  existing_types text;
  existing_functions text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aiao-media-production-bootstrap', 0));

  SELECT pg_catalog.string_agg(
    pg_catalog.format('%I.%I', n.nspname, c.relname), ', ' ORDER BY n.nspname, c.relname
  )
  INTO existing_relations
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
    AND c.relname <> ALL (ARRAY['${publicExtensionRelations.join("','")}']::text[]);

  IF existing_relations IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55006',
      MESSAGE = 'Refusing production bootstrap: public schema is not empty',
      DETAIL = existing_relations;
  END IF;

  SELECT pg_catalog.string_agg(
    pg_catalog.format('%I.%I', n.nspname, t.typname), ', ' ORDER BY n.nspname, t.typname
  )
  INTO existing_types
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typtype IN ('c', 'e', 'd')
    AND t.typname NOT LIKE '\\_%' ESCAPE '\\';

  IF existing_types IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55006',
      MESSAGE = 'Refusing production bootstrap: public schema has user-defined types',
      DETAIL = existing_types;
  END IF;

  SELECT pg_catalog.string_agg(
    pg_catalog.format('%I.%I', n.nspname, p.proname), ', ' ORDER BY p.proname
  )
  INTO existing_functions
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p', 'a');

  IF existing_functions IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55006',
      MESSAGE = 'Refusing production bootstrap: public schema has user-defined functions',
      DETAIL = existing_functions;
  END IF;
END
$aiao_media_empty_project_guard$;
`;

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

function withoutTransactionBoundaries(text) {
  return text.replace(transactionBoundary, '').trim();
}

export async function buildProductionBundle(output = outputDefault) {
  const sources = await Promise.all(
    productionSources.map(async relativePath => {
      const source = await readFile(resolve(repositoryRoot, relativePath), 'utf8');
      return {
        relativePath,
        digest: digest(source),
        sql: withoutTransactionBoundaries(source)
      };
    })
  );
  const header = [
    '-- Aiao Media production Supabase bootstrap bundle.',
    '-- Generated locally; review the source digests and target project guard before execution.',
    '-- This file intentionally excludes apps/aiao-media/infra/supabase/migrations/001-local-account-checks.sql.',
    ...sources.map(source => `-- SOURCE ${source.relativePath} sha256=${source.digest}`),
    ''
  ].join('\n');
  const sql = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    emptyPublicGuard.trim(),
    ...sources.map(
      source => `\n-- BEGIN SOURCE ${source.relativePath}\n${source.sql}\n-- END SOURCE ${source.relativePath}`
    ),
    'COMMIT;',
    ''
  ].join('\n');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${header}${sql}`, { mode: 0o600 });
  await chmod(output, 0o600);
  return { output, sources, sql: `${header}${sql}` };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = await buildProductionBundle(process.argv[2] ? resolve(process.argv[2]) : outputDefault);
  console.log(`Generated production Supabase bundle: ${result.output}`);
  console.log(`Sources: ${result.sources.length}; output sha256: ${digest(result.sql)}`);
}
