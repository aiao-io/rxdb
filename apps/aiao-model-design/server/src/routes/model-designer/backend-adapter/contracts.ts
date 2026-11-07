import type { RemoteSqlSchema } from '../schema-reader';
import type { SqlSchema } from '../sql-diff';
import type { SqlExecOptions, SqlExecResult } from '../sql-executor';

/** 后端适配器可声明的最小能力。 */
export type BackendCapability = 'schema.read' | 'schema.diff' | 'ddl.dry-run' | 'ddl.execute';

/** 面向维护者和客户端的稳定适配器描述。 */
export interface BackendAdapterDescriptor {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly BackendCapability[];
}

/** schema diff 的后端无关结果。 */
export interface BackendDiffResult {
  readonly sql: string;
}

/**
 * ModelDesign 到后端 schema/DDL 的最小可替换契约。
 *
 * 可选方法必须与 descriptor capabilities 严格一致，registry 会在注册时校验。
 */
export interface BackendAdapter {
  readonly descriptor: BackendAdapterDescriptor;
  readSchema?(): Promise<RemoteSqlSchema>;
  diffSchema?(desired: SqlSchema, remote?: RemoteSqlSchema): Promise<BackendDiffResult>;
  executeDdl?(sql: string, options: SqlExecOptions): Promise<SqlExecResult>;
}

/** 适配器边界的稳定错误码。 */
export type BackendAdapterErrorCode =
  | 'unknown_adapter'
  | 'invalid_adapter'
  | 'capability_unavailable'
  | 'adapter_not_configured'
  | 'adapter_operation_failed';

/** 不泄露连接信息或驱动对象的适配器错误。 */
export class BackendAdapterError extends Error {
  readonly code: BackendAdapterErrorCode;
  readonly status: 400 | 500 | 501 | 502 | 503;

  /** 创建带稳定 HTTP 语义的安全错误。 */
  constructor(code: BackendAdapterErrorCode, status: 400 | 500 | 501 | 502 | 503, message: string) {
    super(message);
    this.name = 'BackendAdapterError';
    this.code = code;
    this.status = status;
  }
}
