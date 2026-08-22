import { RxdbAdapterPGliteError } from './pglite.utils.js';

/** NOTIFY 变更管道冲刷超时（毫秒）。 */
export const CHANGE_PIPELINE_TIMEOUT_MS = 2_000;

/** 变更管道超时诊断快照。 */
export interface RxDBChangePipelineTimeoutDiagnostics {
  readonly pendingEvents: number;
  readonly pendingHandlers: number;
  readonly attempts: number;
  readonly generation: number;
  readonly timeoutMs: number;
}

/**
 * PGlite 变更管道在时限内未空闲。
 *
 * 分支切换 / 建表后的冲刷必须等 NOTIFY 处理完，否则后续读会看到陈旧视图。
 */
export class RxDBChangePipelineTimeoutError extends RxdbAdapterPGliteError {
  readonly diagnostics: RxDBChangePipelineTimeoutDiagnostics;

  constructor(diagnostics: RxDBChangePipelineTimeoutDiagnostics, cause: Error) {
    super(
      `PGlite change pipeline did not become idle within ${diagnostics.timeoutMs}ms`,
      'CHANGE_PIPELINE_TIMEOUT',
      cause
    );
    this.name = 'RxDBChangePipelineTimeoutError';
    this.diagnostics = diagnostics;
    Object.setPrototypeOf(this, RxDBChangePipelineTimeoutError.prototype);
  }
}
