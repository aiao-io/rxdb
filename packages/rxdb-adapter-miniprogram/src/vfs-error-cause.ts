/** VFS 最近一次失败的原因，取自 `MiniProgramFileVFS.lastError`。 */
export interface VfsErrorSource {
  readonly lastError: Error | null;
}

const SQLITE_IOERR = 10;
const SQLITE_FULL = 13;
const SQLITE_CANTOPEN = 14;
/** 主结果码属于这些时，错误可能来自 VFS。 */
const VFS_RESULT_CODES = new Set([SQLITE_IOERR, SQLITE_FULL, SQLITE_CANTOPEN]);
/** 会驱动 VFS 读写的 wa-sqlite 方法；`statements` 是异步迭代器，单独包。 */
const VFS_BOUND_METHODS = ['open_v2', 'exec', 'step', 'reset', 'finalize', 'close'] as const;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === 'function';
}

function isVfsResultError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' && VFS_RESULT_CODES.has(code & 0xff);
}

/**
 * 只挂这次调用期间新产生的 VFS 错误：`lastError` 不会自动清空，
 * 页数上限之类 SQLite 自己报的 `SQLITE_FULL` 不能挂上之前残留的平台错误。
 */
function attachCause(error: unknown, before: Error | null, source: VfsErrorSource): void {
  const vfsError = source.lastError;
  if (vfsError === null || vfsError === before || !isVfsResultError(error) || error.cause !== undefined) return;
  Object.defineProperty(error, 'cause', { value: vfsError, configurable: true, writable: true });
}

function guardCall<T>(call: () => T, source: VfsErrorSource): T {
  const before = source.lastError;
  try {
    const result = call();
    if (!isThenable(result)) return result;
    // 不用 `instanceof Promise`：抖音页面模块里 `Promise` 被包装函数遮蔽
    return result.then(undefined, (error: unknown) => {
      attachCause(error, before, source);
      throw error;
    }) as T;
  } catch (error) {
    attachCause(error, before, source);
    throw error;
  }
}

/** 只转发 `for await` 用到的协议方法；不碰 `Symbol.asyncDispose`，老 JSC 上没有。 */
function guardIterator(
  iterator: AsyncGenerator<unknown>,
  source: VfsErrorSource
): AsyncIterableIterator<unknown> {
  const guarded: AsyncIterableIterator<unknown> = {
    next: (...args) => guardCall(() => iterator.next(...args), source),
    return: value => guardCall(() => iterator.return(value), source),
    throw: error => guardCall(() => iterator.throw(error), source),
    [Symbol.asyncIterator]: () => guarded
  };
  return guarded;
}

function guardMethod(method: (...args: unknown[]) => unknown, source: VfsErrorSource) {
  return function (this: unknown, ...args: unknown[]): unknown {
    return guardCall(() => Reflect.apply(method, this, args), source);
  };
}

/**
 * 让 SQLite 报出的 I/O / 配额错误带上 VFS 的平台原文。
 *
 * @remarks
 * wa-sqlite 的 `SQLiteError` 只有 `sqlite3_errmsg`（如 `database or disk is full`），
 * 平台原文留在 VFS 的 `lastError` 里。这里在会驱动 VFS 的方法出口，把本次调用期间新产生的
 * `lastError` 挂成 `SQLiteError.cause`；执行层再把 `SQLiteError` 包成带 `cause` 的适配器错误，
 * 调用方顺着 `cause` 链就能拿到平台错误。原地改写方法，与 `hardenWaSqliteSynchronousCallbacks` 同法。
 *
 * @param sqlite3 - `Factory(module)` 的返回值
 * @param source - VFS 句柄
 * @returns 同一个 `sqlite3`
 */
export function attachVfsErrorCauses<T extends object>(sqlite3: T, source: VfsErrorSource): T {
  const methods = sqlite3 as Record<string, unknown>;
  for (const name of VFS_BOUND_METHODS) {
    const method = methods[name];
    if (typeof method === 'function') methods[name] = guardMethod(method as (...args: unknown[]) => unknown, source);
  }
  const statements = methods['statements'];
  if (typeof statements === 'function') {
    methods['statements'] = function (this: unknown, ...args: unknown[]): AsyncIterableIterator<unknown> {
      return guardIterator(Reflect.apply(statements, this, args) as AsyncGenerator<unknown>, source);
    };
  }
  return sqlite3;
}
