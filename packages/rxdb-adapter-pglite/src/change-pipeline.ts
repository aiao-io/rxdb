import { Subject } from 'rxjs';
import { handle_rxdb_change } from './handle_rxdb_change.js';
import {
  CHANGE_PIPELINE_TIMEOUT_MS,
  RxDBChangePipelineTimeoutError
} from './change-pipeline.types.js';
import type { PGliteChangeEvent } from './pglite.interface.js';
import { IPGliteClient, PGliteClient } from './PGliteClient.js';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';

/**
 * 变更管道宿主：只暴露冲刷所需的可变状态，不把 `#` 字段泄漏出适配器类。
 */
export interface ChangePipelineHost {
  readonly adapter: RxDBAdapterPGlite;
  readonly suppressedChangeTables: Set<string>;
  readonly pendingChangeHandlers: Set<Promise<void>>;
  readonly pendingChangeQueues: Map<string, Promise<void>>;
  readonly changeErrors: Subject<Error>;
  changePipelineGeneration: number;
  readonly cachedClient: IPGliteClient | undefined;
  readonly clientPromise: Promise<IPGliteClient> | undefined;
}

/** 登记一条 NOTIFY 事件，同表串行、异表可并行。 */
export function trackChangeHandler(host: ChangePipelineHost, event: PGliteChangeEvent): Promise<void> {
  if (host.suppressedChangeTables.has(event.tableName)) return Promise.resolve();
  host.changePipelineGeneration += 1;
  const queueKey = event.tableName;
  const previousTask = host.pendingChangeQueues.get(queueKey) ?? Promise.resolve();

  // 合并 task 与 queuedTask 链式声明；.finally 回调内部引用 queuedTask 依赖
  // JavaScript 的 TDZ 规则：回调在赋值之后才会执行，所以下方自引用安全。
  const queuedTask: Promise<void> = previousTask
    .catch(() => undefined)
    .then(() => handle_rxdb_change(host.adapter, event))
    .catch((error: unknown) => {
      host.changeErrors.next(error instanceof Error ? error : new Error(String(error)));
    })
    .finally(() => {
      if (host.pendingChangeQueues.get(queueKey) === queuedTask) {
        host.pendingChangeQueues.delete(queueKey);
      }
      host.pendingChangeHandlers.delete(queuedTask);
    });

  host.pendingChangeQueues.set(queueKey, queuedTask);
  host.pendingChangeHandlers.add(queuedTask);

  return queuedTask;
}

/** 等到当前已登记的 handler 全部 settle。 */
export async function drainPendingChangeHandlers(
  host: ChangePipelineHost,
  deadline?: number,
  createTimeoutError?: () => Error
): Promise<void> {
  while (host.pendingChangeHandlers.size > 0) {
    const settlement = Promise.allSettled(Array.from(host.pendingChangeHandlers));
    if (deadline === undefined || !createTimeoutError) {
      await settlement;
      continue;
    }
    await awaitChangePipelineOperation(settlement, deadline, createTimeoutError);
  }
}

/** 冲刷驱动侧未分发的 NOTIFY，再排空 handler，直到空闲或超时。 */
export async function flushPendingChangePipeline(host: ChangePipelineHost): Promise<void> {
  const client = host.cachedClient ?? (await host.clientPromise?.catch(() => undefined));

  const deadline = Date.now() + CHANGE_PIPELINE_TIMEOUT_MS;
  let attempts = 0;
  const createTimeoutError = (): RxDBChangePipelineTimeoutError =>
    createChangePipelineTimeoutError(host, client, attempts);

  while (true) {
    attempts += 1;
    const generation = host.changePipelineGeneration;
    const flushed =
      client instanceof PGliteClient ?
        await awaitChangePipelineOperation(client.flushPendingNotifications(), deadline, createTimeoutError)
      : false;
    await drainPendingChangeHandlers(host, deadline, createTimeoutError);

    const idle =
      !flushed && host.pendingChangeHandlers.size === 0 && generation === host.changePipelineGeneration;
    if (Date.now() >= deadline) throw createTimeoutError();
    if (idle) return;
  }
}

async function awaitChangePipelineOperation<T>(
  operation: Promise<T>,
  deadline: number,
  createTimeoutError: () => Error
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw createTimeoutError();

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(createTimeoutError()), remaining);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createChangePipelineTimeoutError(
  host: ChangePipelineHost,
  client: IPGliteClient | undefined,
  attempts: number
): RxDBChangePipelineTimeoutError {
  const cause = new Error(`Change pipeline deadline exceeded after ${CHANGE_PIPELINE_TIMEOUT_MS}ms`);
  cause.name = 'TimeoutError';
  return new RxDBChangePipelineTimeoutError(
    {
      pendingEvents: client?.pendingNotificationCount ?? 0,
      pendingHandlers: host.pendingChangeHandlers.size,
      attempts,
      generation: host.changePipelineGeneration,
      timeoutMs: CHANGE_PIPELINE_TIMEOUT_MS
    },
    cause
  );
}
