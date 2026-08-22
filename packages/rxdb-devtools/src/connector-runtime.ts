import { isRecord } from './internal/guards.js';
import { serializeDevToolsValue } from './serializer.js';
import type { DisconnectStatus } from './types.js';

/** 断开 RxDB 实例的协议结果。 */
export type DisconnectResult = { success: boolean; error: string | null; status: DisconnectStatus };

/** 强制释放本地 adapter 的探测结果。 */
export type ForceReleaseResult = { success: boolean; error: string | null };

/**
 * 取错误的可读描述，保证非空。
 *
 * @remarks
 * 非空是协议要求：`DISCONNECT_RXDB_RESULT` 的 `status: 'failed'` 必须配非空 `error`
 * （见 `isDisconnectResultPayload` 的语义矩阵）。`new Error('')` 的 `message` 是空串，
 * 直接透出去会让本包自己的 guard 拒掉自己发的消息。
 */
export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 0 ? message : String(error);
}

/** 结构性识别 `Worker`：`instanceof Worker` 在 worker / Node 宿主里会直接 ReferenceError。 */
export function isTerminable(value: unknown): value is { terminate(): void } {
  return isRecord(value) && typeof value['terminate'] === 'function';
}

/** 结构性识别 `SharedWorker`：只关心能不能关掉它的 port。 */
export function isClosablePortHolder(value: unknown): value is { port: { close(): void } } {
  if (!isRecord(value)) return false;
  const port = value['port'];
  return isRecord(port) && typeof port['close'] === 'function';
}

export function getDocumentId(document: unknown): unknown {
  try {
    return isRecord(document) ? document['id'] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 把查询结果文档转成 wire 值。
 *
 * @remarks
 * 与事件路径共用同一个 serializer，因此环引用、BigInt、Map/Set、嵌套 Date
 * 的降级语义**逐字段一致**：只有成环的那个节点变成 `'[Circular]'`，同级字段照常保留。
 *
 * 曾经这里额外做一次 `hasCircularReference` 全树预检，命中就把整条文档换成
 * `{ id, _error }` —— 一个自引用的 `parent` 字段就能让整行数据在 DevTools 里消失。
 * 现在只有 `toJSON()` 自己抛错（文档根本读不出来）才走结构化错误占位。
 */
export function serializeDocument(document: unknown, mask: (value: unknown) => unknown): unknown {
  try {
    const value =
      document && typeof document === 'object' && 'toJSON' in document ?
        (document as { toJSON(): unknown }).toJSON()
      : document;
    return serializeDevToolsValue(mask(value));
  } catch {
    return serializeDevToolsValue({ id: getDocumentId(document), _error: 'Cannot serialize' });
  }
}

/**
 * 优雅断开失败后的兜底：直接掐掉本地 adapter 持有的 worker 句柄。
 *
 * @remarks
 * `IRxDBAdapter` 接口本身没有 `options` —— worker 句柄是各 SQLite 适配器
 * 私有配置里的可选字段（`rxdb-adapter-sqlite` / `-sqlite-wasm` 的
 * `workerInstance` / `sharedWorkerInstance`）。因此这里只能在运行时结构性探测，
 * 探不到就如实回 `{ success: false }`，由调用方合成 `status: 'failed'`。
 * 不做任何"假装成功"的兜底：DevTools 报了断开成功而 worker 还活着，
 * 比报失败更糟。
 */
export async function forceReleaseLocalAdapter(getAdapter: () => Promise<unknown>): Promise<ForceReleaseResult> {
  try {
    const adapter = await getAdapter();
    const options = isRecord(adapter) ? adapter['options'] : undefined;
    if (!isRecord(options)) return { success: false, error: null };

    const workerInstance = options['workerInstance'];
    if (isTerminable(workerInstance)) {
      workerInstance.terminate();
      return { success: true, error: null };
    }

    const sharedWorker = options['sharedWorkerInstance'];
    if (isClosablePortHolder(sharedWorker)) {
      sharedWorker.port.close();
      return { success: true, error: null };
    }
    return { success: false, error: null };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function tryGracefulDisconnect(
  disconnectAll: () => Promise<unknown>,
  timeoutMs: number
): Promise<string | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('等待 RxDB 断开超时')), timeoutMs);
    });
    await Promise.race([disconnectAll(), timeout]);
    return null;
  } catch (error) {
    return getErrorMessage(error);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
