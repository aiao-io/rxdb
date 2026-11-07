import { Elysia, t } from 'elysia';
import { modelDesignerSqlAuthGuard } from './auth';
import { BackendAdapterError, type BackendAdapter } from './backend-adapter/contracts';
import { createModelDesignerBackendAdapterRegistry, runBackendAdapterCapability } from './backend-adapter/registry';
import { createClientPackageRoutes } from './client-package/routes';
import { createClientPackageService, type ClientPackageService } from './client-package/service';
import { createPgSchemaReader, type SchemaReader } from './schema-reader';
import {
  createPgSqlExecutor,
  extractAffectedTables,
  isDestructiveSql,
  type SqlExecResult,
  type SqlExecutor
} from './sql-executor';

const SqlColumnSchema = t.Object({
  name: t.String(),
  type: t.String(),
  nullable: t.Boolean(),
  primaryKey: t.Optional(t.Boolean()),
  unique: t.Optional(t.Boolean()),
  defaultValue: t.Optional(t.Union([t.String(), t.Null()])),
  check: t.Optional(t.Union([t.String(), t.Null()]))
});

const SqlForeignKeySchema = t.Object({
  name: t.String(),
  column: t.String(),
  refTable: t.String(),
  refColumn: t.String(),
  onDelete: t.Optional(t.Union([t.String(), t.Null()])),
  onUpdate: t.Optional(t.Union([t.String(), t.Null()]))
});

const SqlIndexSchema = t.Object({
  name: t.String(),
  columns: t.Array(t.String()),
  unique: t.Boolean()
});

const SqlTableSchema = t.Object({
  name: t.String(),
  columns: t.Array(SqlColumnSchema),
  foreignKeys: t.Array(SqlForeignKeySchema),
  indexes: t.Array(SqlIndexSchema)
});

const SqlSchemaBody = t.Object({
  tables: t.Array(SqlTableSchema)
});

const SqlRunBody = t.Object({
  sql: t.String(),
  confirmDestructive: t.Optional(t.Boolean())
});

export interface ModelDesignerRouteOptions {
  /** 可注入 executor；未注入时必须配置 DATABASE_URL。 */
  executor?: SqlExecutor;
  /**
   * 可注入远程 schema reader。
   * - 省略：有 DATABASE_URL 时用 PG information_schema
   * - null：显式禁用（单测无 DB）
   */
  schemaReader?: SchemaReader | null;
  /** 服务端启动时选择的 adapter ID；默认读取环境变量后回退 supabase。 */
  backendAdapterId?: string;
  /** 可选扩展 adapter；不得与内置 ID 重复。 */
  backendAdapters?: readonly BackendAdapter[];
  /** 可注入客户端 npm 包服务。 */
  clientPackages?: Partial<Pick<ClientPackageService, 'archive' | 'publish'>>;
}

const unavailableExecutor: SqlExecutor = () =>
  Promise.reject(new BackendAdapterError('adapter_not_configured', 503, 'No SQL executor or DATABASE_URL configured'));

function resolveExecutor(opts: ModelDesignerRouteOptions): SqlExecutor {
  if (opts.executor) return opts.executor;
  return createPgSqlExecutor(process.env.DATABASE_URL) ?? unavailableExecutor;
}

function resolveSchemaReader(opts: ModelDesignerRouteOptions): SchemaReader | null {
  if (opts.schemaReader !== undefined) return opts.schemaReader;
  return createPgSchemaReader(process.env.DATABASE_URL);
}

function backendError(error: unknown, set: { status?: number | string }) {
  if (!(error instanceof BackendAdapterError)) throw error;
  set.status = error.status;
  return { ok: false, error: error.code, message: error.message };
}

function hasValidCommitState(result: SqlExecResult, requestedCommit: boolean): boolean {
  return result.committed === (result.ok && requestedCommit);
}

function executorContractViolation(sql: string, committed: boolean, set: { status?: number | string }) {
  set.status = 502;
  return {
    ok: false,
    error: 'executor_contract_violation',
    message: 'DDL executor returned an invalid commit state',
    sql,
    committed
  };
}

/**
 * Model designer SQL sync routes (US-110 / specs/020)
 *
 * - POST /sql/diff
 * - GET /sql/remote-schema
 * - POST /sql/dry-run
 * - POST /sql/execute
 */
export function createModelDesignerRoutes(opts: ModelDesignerRouteOptions = {}) {
  const executor = resolveExecutor(opts);
  const schemaReader = resolveSchemaReader(opts);
  const adapter = createModelDesignerBackendAdapterRegistry({
    selectedId: opts.backendAdapterId ?? process.env.MODEL_DESIGNER_BACKEND_ADAPTER ?? 'supabase',
    schemaReader,
    executor,
    additionalAdapters: opts.backendAdapters
  }).selected;
  const clientPackages = { ...createClientPackageService(), ...opts.clientPackages };

  return new Elysia({ prefix: '/model-designer' })
    .get('/backend', () => adapter.descriptor)
    .post(
      '/sql/diff',
      async ({ body, set }) => {
        try {
          const result = await runBackendAdapterCapability(adapter, 'schema.diff', current => {
            const diff = current.diffSchema;
            if (!diff) throw new BackendAdapterError('invalid_adapter', 500, 'Selected adapter has no diff method');
            return diff(body.desired, body.remote);
          });
          return {
            ok: true,
            sql: result.sql,
            destructive: isDestructiveSql(result.sql),
            affectedTables: extractAffectedTables(result.sql),
            remoteSource: body.remote ? 'body' : 'reader'
          };
        } catch (error) {
          if (error instanceof BackendAdapterError && error.code === 'adapter_not_configured') {
            set.status = 400;
            return {
              ok: false,
              error: 'remote_schema_required',
              message: 'Provide body.remote or configure SchemaReader / DATABASE_URL'
            };
          }
          return backendError(error, set);
        }
      },
      {
        body: t.Object({
          desired: SqlSchemaBody,
          remote: t.Optional(SqlSchemaBody)
        })
      }
    )
    .get(
      '/sql/remote-schema',
      async ({ set }) => {
        try {
          const remote = await runBackendAdapterCapability(adapter, 'schema.read', current => {
            const read = current.readSchema;
            if (!read) throw new BackendAdapterError('invalid_adapter', 500, 'Selected adapter has no schema reader');
            return read();
          });
          return { ok: true, remote };
        } catch (error) {
          if (error instanceof BackendAdapterError && error.code === 'adapter_not_configured') {
            set.status = 503;
            return {
              ok: false,
              error: 'schema_reader_unavailable',
              message: 'No SchemaReader or DATABASE_URL configured'
            };
          }
          return backendError(error, set);
        }
      },
      { beforeHandle: modelDesignerSqlAuthGuard }
    )
    .post(
      '/sql/dry-run',
      async ({ body, set }) => {
        let result;
        try {
          result = await runBackendAdapterCapability(adapter, 'ddl.dry-run', current => {
            const execute = current.executeDdl;
            if (!execute) throw new BackendAdapterError('invalid_adapter', 500, 'Selected adapter has no DDL executor');
            return execute(body.sql, { commit: false });
          });
        } catch (error) {
          return backendError(error, set);
        }
        if (!hasValidCommitState(result, false)) return executorContractViolation(body.sql, result.committed, set);
        if (!result.ok) {
          set.status = 500;
          return {
            ok: false,
            error: 'execution_failed',
            message: result.error ?? 'dry-run failed',
            sql: body.sql,
            committed: false
          };
        }
        return {
          ok: true,
          committed: false,
          destructive: isDestructiveSql(body.sql),
          affectedTables: result.affectedTables,
          statementCount: result.statementCount,
          sql: body.sql
        };
      },
      { body: SqlRunBody, beforeHandle: modelDesignerSqlAuthGuard }
    )
    .post(
      '/sql/execute',
      async ({ body, set }) => {
        if (isDestructiveSql(body.sql) && body.confirmDestructive !== true) {
          set.status = 400;
          return {
            ok: false,
            error: 'destructive_confirmation_required',
            message: 'Destructive SQL detected; set confirmDestructive: true after backup',
            sql: body.sql
          };
        }
        let result;
        try {
          result = await runBackendAdapterCapability(adapter, 'ddl.execute', current => {
            const execute = current.executeDdl;
            if (!execute) throw new BackendAdapterError('invalid_adapter', 500, 'Selected adapter has no DDL executor');
            return execute(body.sql, { commit: true });
          });
        } catch (error) {
          return backendError(error, set);
        }
        if (!hasValidCommitState(result, true)) return executorContractViolation(body.sql, result.committed, set);
        if (!result.ok) {
          set.status = 500;
          return {
            ok: false,
            error: 'execution_failed',
            message: result.error ?? 'execute failed',
            sql: body.sql,
            committed: false
          };
        }
        return {
          ok: true,
          committed: true,
          affectedTables: result.affectedTables,
          statementCount: result.statementCount,
          sql: body.sql
        };
      },
      { body: SqlRunBody, beforeHandle: modelDesignerSqlAuthGuard }
    )
    .use(createClientPackageRoutes(clientPackages));
}

/** 默认路由（DDL 执行要求 DATABASE_URL）。 */
export const modelDesignerRoutes = createModelDesignerRoutes();
