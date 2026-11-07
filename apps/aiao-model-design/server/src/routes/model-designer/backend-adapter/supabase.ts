import type { SchemaReader } from '../schema-reader';
import { diffSqlSchema } from '../sql-diff';
import type { SqlExecutor } from '../sql-executor';
import { BackendAdapterError, type BackendAdapter } from './contracts';

/** Supabase/PostgreSQL adapter 的现有能力依赖。 */
export interface SupabaseBackendAdapterOptions {
  readonly schemaReader: SchemaReader | null;
  readonly executor: SqlExecutor;
}

/** 用现有 reader/diff/executor 组合生产 Supabase adapter。 */
export function createSupabaseBackendAdapter(options: SupabaseBackendAdapterOptions): BackendAdapter {
  const readSchema = async () => {
    if (!options.schemaReader) {
      throw new BackendAdapterError('adapter_not_configured', 503, 'No SchemaReader or DATABASE_URL configured');
    }
    return options.schemaReader();
  };

  return {
    descriptor: {
      id: 'supabase',
      label: 'Supabase (PostgreSQL)',
      capabilities: ['schema.read', 'schema.diff', 'ddl.dry-run', 'ddl.execute']
    },
    readSchema,
    async diffSchema(desired, remote) {
      return { sql: diffSqlSchema(desired, remote ?? (await readSchema())) };
    },
    executeDdl: options.executor
  };
}
