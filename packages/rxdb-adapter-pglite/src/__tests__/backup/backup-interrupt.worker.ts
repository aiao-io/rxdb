/// <reference lib="webworker" />

/**
 * US-217 AC#11 的恢复 Worker：把归档恢复到 IndexedDB 目标，走到指定位置后停住，等主线程 terminate。
 *
 * @remarks
 * terminate 等同进程被强杀：不跑 finally、不释放任何东西，Web Lock 与 IndexedDB 连接由浏览器随
 * Worker 一起回收。停在某个位置靠的是一个永不 resolve 的 Promise，而不是抛错——抛错会走正常的失败清理。
 */
import { restorePGliteDatabase, type PGliteRestoreStage } from '../../backup/restore-pglite-database.js';
import { chunkedSource, createBackupRxDB, PLAIN_ENTITIES } from './backup-test-fixture.js';

/** 强杀的位置：读流中途、各阶段回调里，或恢复已经返回之后。 */
export type RestoreInterruptPoint = 'streaming' | PGliteRestoreStage | 'returned';

/** 主线程发给 Worker 的任务。 */
export interface RestoreInterruptRequest {
  readonly archive: Uint8Array;
  readonly dbName: string;
  readonly stopAt: RestoreInterruptPoint;
}

/** Worker 回报：到达停止位置，或恢复在到达之前就失败了。 */
export type RestoreInterruptReply = { readonly reached: RestoreInterruptPoint } | { readonly failed: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

const holdAt = (point: RestoreInterruptPoint): Promise<never> => {
  scope.postMessage({ reached: point } satisfies RestoreInterruptReply);
  return new Promise<never>(() => undefined);
};

scope.onmessage = async (event: MessageEvent<RestoreInterruptRequest>) => {
  const { archive, dbName, stopAt } = event.data;
  const target = createBackupRxDB(dbName, PLAIN_ENTITIES, { store: 'idb' });
  const half = archive.byteLength / 2;
  const { stream } = chunkedSource(archive, 16 * 1024, async pulled => {
    if (stopAt === 'streaming' && pulled > half) await holdAt(stopAt);
  });
  try {
    await restorePGliteDatabase(stream, target, {
      onStage: async stage => {
        if (stage === stopAt) await holdAt(stage);
      }
    });
    await holdAt('returned');
  } catch (error) {
    scope.postMessage({ failed: String(error) } satisfies RestoreInterruptReply);
  }
};
