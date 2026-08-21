/**
 * @fileoverview Supabase RLS 自检的纯函数
 *
 * 从 {@link RxDBAdapterSupabase} 抽出的无状态逻辑：自检选项归一化、检查表推导、错误格式化与失败处理。
 */

import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
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

export function resolveRlsCheckTables(
  overrideTables: SupabaseRlsCheckTable[],
  entities: EntityType[]
): SupabaseRlsCheckTable[] {
  const inputTables =
    overrideTables.length > 0 ?
      overrideTables
    : [
        { schema: 'public', table: 'rxdb_change' },
        { schema: 'public', table: 'rxdb_branch' },
        ...entities.map(entity => {
          const metadata = getEntityMetadata(entity);
          return {
            schema: resolve_supabase_schema(metadata.namespace),
            table: metadata.tableName
          } satisfies SupabaseRlsCheckTable;
        })
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
