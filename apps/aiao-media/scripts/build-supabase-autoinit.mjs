import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { productionSources, schemaMarker, schemaVersion } from './build-production-supabase-bundle.mjs';

const outputDefault = resolve(import.meta.dirname, '../tmp/supabase-autoinit.sql');
const boundary = /^\s*(?:BEGIN|COMMIT)\s*;\s*$/gm;

/** 初始化包在 public 下建的全部关系（含序列）；改迁移后由 build-production-supabase-bundle.test.mjs 核对。 */
export const applicationRelations = [
  'media_accounts',
  'media_admin_audit',
  'media_admin_audit_id_seq',
  'media_admin_memberships',
  'media_binding_requests',
  'media_content_drafts',
  'media_file_records',
  'media_public_content',
  'media_sync_records',
  'media_task_reports',
  'media_workspaces',
  'rxdb_branch',
  'rxdb_change',
  'rxdb_change_id_seq'
];

/** 初始化包在 public 下建的全部函数名，核对方式同上。 */
export const applicationFunctions = [
  'media_admin_auth_applied',
  'media_admin_authorized',
  'media_admin_content',
  'media_admin_set_account',
  'media_delete_remote_metadata',
  'media_ensure_workspace',
  'media_export_sync',
  'media_file_capabilities',
  'media_submit_task_reports',
  'media_sync_capabilities',
  'media_sync_status',
  'media_trusted_membership',
  'rxdb_assert_push_integrity',
  'rxdb_batch_delete',
  'rxdb_batch_update',
  'rxdb_batch_update_rows',
  'rxdb_batch_upsert',
  'rxdb_check_rls',
  'rxdb_enable_sync_for_branch',
  'rxdb_enable_sync_for_table',
  'rxdb_execute_batch_update',
  'rxdb_existing_ids',
  'rxdb_id_array_type',
  'rxdb_insert_changes',
  'rxdb_jsonb_matches_filter',
  'rxdb_jsonb_matches_rule',
  'rxdb_log_change_trigger',
  'rxdb_mutations',
  'rxdb_mutations_apply_group',
  'rxdb_mutations_depends_on',
  'rxdb_mutations_replay_group',
  'rxdb_pull_changes',
  'rxdb_server_version',
  'rxdb_update_timestamp_trigger',
  'update_updated_at_column'
];

const sqlList = names => `ARRAY[${names.map(name => `'${name}'`).join(', ')}]::text[]`;
const extensionMember = (catalog, oid) =>
  `NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = '${catalog}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;

/**
 * 自动接入只写独立空项目，或由本应用初始化、版本不高于本包的专用项目。守卫与迁移同一事务、先于任何 DDL：
 * 没有 media_private 时 public 必须为空（同名的 update_updated_at_column 也算冲突）；已初始化时 public 只能有
 * 本应用的对象。扩展自带的对象不算。拒绝即整个事务回滚，项目没有任何写入。
 */
export const dedicatedProjectGuard = `
DO $aiao_media_autoinit_guard$
DECLARE
  installed boolean;
  marker text;
  foreign_objects text;
BEGIN
  -- 先拿锁再读现状：并发初始化的后来者要看到先到者提交后的对象。
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aiao-media-production-bootstrap', 0));
  installed := pg_catalog.to_regnamespace('media_private') IS NOT NULL;
  marker := pg_catalog.obj_description(pg_catalog.to_regnamespace('media_private')::oid, 'pg_namespace');

  IF coalesce(pg_catalog.substring(marker, '^aiao-media schema ([0-9]+)$')::bigint, 0) > ${schemaVersion} THEN
    RAISE EXCEPTION USING
      ERRCODE = '55006',
      MESSAGE = 'Refusing automatic onboarding: project schema is newer than this application',
      DETAIL = marker;
  END IF;

  SELECT pg_catalog.string_agg(object_name, ', ' ORDER BY object_name)
  INTO foreign_objects
  FROM (
    SELECT pg_catalog.format('%I.%I', n.nspname, c.relname) AS object_name
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT (installed AND c.relname = ANY (${sqlList(applicationRelations)}))
      AND ${extensionMember('pg_catalog.pg_class', 'c.oid')}
    UNION ALL
    SELECT pg_catalog.format('%I.%I', n.nspname, t.typname)
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('c', 'e', 'd')
      -- 表的行类型随关系判定，这里只看独立定义的类型。
      AND (t.typrelid = 0 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class r WHERE r.oid = t.typrelid AND r.relkind = 'c'))
      AND ${extensionMember('pg_catalog.pg_type', 't.oid')}
    UNION ALL
    SELECT pg_catalog.format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid))
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p', 'a')
      AND NOT (installed AND p.proname = ANY (${sqlList(applicationFunctions)}))
      AND ${extensionMember('pg_catalog.pg_proc', 'p.oid')}
  ) objects;

  IF foreign_objects IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55006',
      MESSAGE = CASE WHEN installed
        THEN 'Refusing automatic onboarding: project has objects outside this application'
        ELSE 'Refusing automatic onboarding: project is not empty and was not initialized by this application'
      END,
      DETAIL = foreign_objects;
  END IF;
END
$aiao_media_autoinit_guard$;
`;

/** 生成 OAuth 自动初始化 SQL；输出目录不存在时先创建，干净检出也能直接运行。 */
export async function buildAutoinitBundle(output = outputDefault) {
  const sources = await Promise.all(
    productionSources.map(async path => ({
      path,
      sql: (await readFile(resolve(import.meta.dirname, '../../../', path), 'utf8')).replace(boundary, '').trim()
    }))
  );
  const sql = [
    '-- Aiao Media automatic Supabase onboarding bundle.',
    '-- Review before injecting as MEDIA_SUPABASE_AUTOINIT_SQL.',
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    dedicatedProjectGuard.trim(),
    ...sources.map(source => `-- BEGIN ${source.path}\n${source.sql}\n-- END ${source.path}`),
    schemaMarker,
    'COMMIT;',
    ''
  ].join('\n');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, sql, { mode: 0o600 });
  return { output, sql };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { output } = await buildAutoinitBundle();
  console.log(`Generated reviewed-input bundle: ${output}`);
}
