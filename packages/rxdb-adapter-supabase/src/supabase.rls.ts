/**
 * @fileoverview Supabase RLS 自检的纯函数
 *
 * 从 {@link RxDBAdapterSupabase} 抽出的无状态逻辑：自检选项归一化、检查表推导、错误格式化与失败处理。
 */

import { getEntityMetadata, getSyncConfig, isSystemEntity, type EntitySyncResolver, type EntityType } from '@aiao/rxdb';
import { SupabaseDataError } from './errors.js';
import { resolve_supabase_schema } from './schema.utils.js';
import { DEFAULT_RLS_CHECK_RPC_NAME } from './supabase.helpers.js';
import type { SupabaseRlsCheckOptions, SupabaseRlsCheckTable } from './supabase.interface.js';

export function getRlsCheckOptions(
  rlsCheck: boolean | SupabaseRlsCheckOptions | undefined
): Required<SupabaseRlsCheckOptions> {
  if (rlsCheck && typeof rlsCheck === 'object') {
    return {
      rpcName: rlsCheck.rpcName ?? DEFAULT_RLS_CHECK_RPC_NAME,
      failureMode: rlsCheck.failureMode ?? 'warn',
      tables: rlsCheck.tables ?? []
    };
  }

  return {
    rpcName: DEFAULT_RLS_CHECK_RPC_NAME,
    failureMode: 'warn',
    tables: []
  };
}

/**
 * 推导 RLS 自检要查的表。
 *
 * @param overrideTables - 应用显式给出的表；非空时原样检查，不看实体
 * @param entities - 库里注册的实体（含 `SchemaManager` 补进来的系统表）
 * @param entitySync - 实例的同步解析器（含 `syncOverrides`），判定实体是否经远端同步
 * @returns 去重后的表清单：日志表、分支表，以及经远端同步的业务表
 *
 * @remarks
 * 系统表（核心与插件贡献的 `rxdb_migration`、`rxdb_sync`、`rxdb_sync_bucket_progress`……）是纯本地簿记，
 * 只存本地的业务实体也没有远端表；拿它们去远端查只会被报成缺表，`failureMode: 'throw'` 时连接直接失败。
 * 日志表与分支表虽然也是系统表，远端确有其表，由清单开头显式列出。
 */
export function resolveRlsCheckTables(
  overrideTables: SupabaseRlsCheckTable[],
  entities: readonly EntityType[],
  entitySync: EntitySyncResolver
): SupabaseRlsCheckTable[] {
  const inputTables =
    overrideTables.length > 0 ?
      overrideTables
    : [
        { schema: 'public', table: 'rxdb_change' },
        { schema: 'public', table: 'rxdb_branch' },
        ...entities
          .filter(entity => !isSystemEntity(entity))
          .map(entity => getEntityMetadata(entity))
          .filter(metadata => getSyncConfig(metadata, entitySync)?.remote !== undefined)
          .map(
            metadata =>
              ({
                schema: resolve_supabase_schema(metadata.namespace),
                table: metadata.tableName
              }) satisfies SupabaseRlsCheckTable
          )
      ];

  const deduped = new Map<string, SupabaseRlsCheckTable>();
  for (const table of inputTables) {
    const schema = table.schema ?? 'public';
    const key = `${schema}:${table.table}`;
    deduped.set(key, {
      schema,
      table: table.table
    });
  }

  return [...deduped.values()];
}

export function formatRlsRpcError(rpcName: string, message?: string | null): string {
  const detail = message?.trim() || 'unknown error';
  if (/does not exist/i.test(detail)) {
    return `[RxDB Supabase] RLS self-check skipped because RPC "${rpcName}" is not installed. Apply docker/sql/04-rxdb-utils-functions.sql or set rlsCheck=false if you intentionally manage RLS verification elsewhere.`;
  }
  return `[RxDB Supabase] Failed to verify RLS via RPC "${rpcName}": ${detail}`;
}

export function formatRlsUnexpectedError(error: unknown): string {
  return `[RxDB Supabase] Failed to verify RLS: ${error instanceof Error ? error.message : String(error)}`;
}

export function handleRlsCheckFailure(message: string, mode: 'warn' | 'throw'): void {
  if (mode === 'throw') {
    throw new SupabaseDataError(message);
  }
  console.warn(message);
}
