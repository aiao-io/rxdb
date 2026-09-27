import { RxDBBackupError } from '@aiao/rxdb';
import type { EmscriptenFS } from './pglite-data-dir.js';

/**
 * 一致快照依赖的 PGlite 运行时内部件：两把互斥锁与 Emscripten 文件系统。
 *
 * @remarks
 * 这些成员存在于运行时，但 d.ts 没有声明，也不受 semver 约束——`^0.5.x` 的补丁版本就可能改名或删掉。
 */
export interface PGliteExclusiveInternals {
  _runExclusiveQuery<T>(fn: () => Promise<T>): Promise<T>;
  _runExclusiveTransaction<T>(fn: () => Promise<T>): Promise<T>;
  readonly Module: { readonly FS: EmscriptenFS };
}

/**
 * 确认运行时仍提供快照所需的内部件，缺了任何一个都明确拒绝，而不是在快照做到一半时抛 `TypeError`。
 *
 * @param runtime - PGlite 实例
 * @returns 带内部件类型的同一实例
 * @throws RxDBBackupError `unsupported_combination` 当前 PGlite 版本缺少所需内部件
 */
export const requirePGliteExclusiveInternals = <T extends object>(runtime: T): T & PGliteExclusiveInternals => {
  const candidate = runtime as Partial<Record<keyof PGliteExclusiveInternals, unknown>>;
  const module = candidate.Module as { FS?: unknown } | undefined;
  const missing = [
    typeof candidate._runExclusiveTransaction === 'function' ? undefined : '_runExclusiveTransaction',
    typeof candidate._runExclusiveQuery === 'function' ? undefined : '_runExclusiveQuery',
    module?.FS ? undefined : 'Module.FS'
  ].filter((name): name is string => name !== undefined);
  if (missing.length === 0) return runtime as T & PGliteExclusiveInternals;
  throw new RxDBBackupError(
    'unsupported_combination',
    `PGlite backup needs runtime internals this PGlite release lacks`,
    {
      details: { field: 'pglite', actual: missing.join(', ') }
    }
  );
};
