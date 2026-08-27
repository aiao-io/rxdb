/**
 * @packageDocumentation
 * 变更通知通道（US-023 阶段 B）。
 *
 * @remarks
 * 通道只搬运**一个实体名**，不搬运行数据（D8）：广播的对象是所有订阅者，推行数据在多租户
 * 后端上直接是越权泄露；而且「这一行属不属于我的 `where`」只有服务端答得出。所以本模块的
 * 出口就一个 —— 调用宿主给的失效上报口，剩下的（重跑哪些查询、要不要回远端）全归 core。
 *
 * 结构上它也必须是这样：本包按 US-212 AC#19 不实现也不调用 `upsertMany` 一族、不持有本地
 * 存储句柄，通知通道自然更不能开第二条写本地行的路径。
 */

import { HttpConfigError } from './errors.js';
import type { HttpChangeFeedOptions, HttpChangeFeedUnavailableReport } from './http.interface.js';

/** `EventSource.readyState`：浏览器正在（重）连 */
const CONNECTING = 0;

/** 通知不带 `namespace` 时的取值，与 core `invalidateRemoteEntity` 的缺省一致 */
const DEFAULT_NAMESPACE = 'public';

/** 退避重连的起步延迟（毫秒） */
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;

/** 退避重连的延迟上限（毫秒） */
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30000;

/**
 * 本模块真正用到的 `EventSource` 子集。
 *
 * @remarks
 * 写成结构类型而不是直接用 DOM 的 `EventSource`，是因为**运行时未必有它**：`lib.dom` 让它
 * 在类型上恒存在，而 Node 里 `globalThis.EventSource` 是 `undefined`。用最小子集描述依赖，
 * 「我们只用这 5 个成员」这件事就写在类型里，而不是散在实现中靠读代码归纳。
 */
interface EventSourceLike {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

/** 从 `globalThis` 取到的 `EventSource` 构造器形态 */
type EventSourceCtor = new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;

/** 一条解析成功的变更通知 */
interface ChangeNotification {
  entity: string;
  namespace: string;
  /** 发起这次变更的客户端；缺省表示服务端没报，此时不做自回声抑制 */
  clientId: string | undefined;
}

/** 参与 D7 全量失效的实体标识 */
export interface ChangeFeedEntity {
  name: string;
  namespace: string;
}

/**
 * {@link HttpChangeFeed} 与适配器之间的全部接触面。
 *
 * @remarks
 * 三个函数而不是一个适配器引用：通道拿不到适配器，也就无从调用它的读写口——
 * 结构隔离用类型钉死，比在评审里叮嘱可靠。
 */
export interface ChangeFeedHost {
  /** 已解析好的绝对 URL */
  url: string;
  options: HttpChangeFeedOptions;
  /** 本机 clientId，用于自回声抑制（D6）；每次现读，登录后被替换也跟得上 */
  clientId: () => string | undefined;
  /** 当前走本适配器 remote 槽位的实体（D7 的「已订阅实体」） */
  entities: () => readonly ChangeFeedEntity[];
  /** 失效上报口；签名里没有任何参数能承载行数据（D8） */
  invalidate: (entity: string, namespace: string) => void;
}

/**
 * SSE 变更通知通道。
 *
 * @remarks
 * **连接成功 = 全量失效。** `onopen` 不区分首次连接与重连（D7）：两者对客户端的含义完全一样
 * ——「从这一刻起我能收到变更了，而这一刻之前的事我一无所知」。
 *
 * **失败绝不外泄到查询路径。** 本类不抛错、不产生 `NetworkOfflineError`：一条断掉的通知连接
 * 不代表离线（可能只是后端没实现该端点），把它算进 `offlineFallback` 的判定，会让一次
 * 查询在网络完好时被降级成读缓存。唯一的出口是
 * {@link HttpChangeFeedOptions.onUnavailable} 这个诊断回调。
 */
export class HttpChangeFeed {
  readonly #host: ChangeFeedHost;
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;
  #source: EventSourceLike | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #attempt = 0;
  #stopped = true;

  /**
   * @param host - 通道与适配器之间的接触面
   * @throws HttpConfigError 退避配置不是 finite 正整数，或上限小于起步值
   */
  constructor(host: ChangeFeedHost) {
    this.#host = host;
    this.#baseDelayMs = readDelay(host.options.reconnectBaseDelayMs, 'reconnectBaseDelayMs');
    this.#maxDelayMs = readDelay(
      host.options.reconnectMaxDelayMs,
      'reconnectMaxDelayMs',
      DEFAULT_RECONNECT_MAX_DELAY_MS
    );
    if (this.#maxDelayMs < this.#baseDelayMs) {
      // 不报错也不会崩，只会让「指数退避」静默退化成定长重试——那是配置写错了，
      // 而不是一种可用的配置
      throw new HttpConfigError(
        `HTTP adapter config "changeFeed.reconnectMaxDelayMs" must be >= "changeFeed.reconnectBaseDelayMs" (${this.#baseDelayMs}), received ${this.#maxDelayMs}`,
        'changeFeed.reconnectMaxDelayMs',
        this.#maxDelayMs
      );
    }
  }

  /**
   * 建立连接。
   *
   * @remarks
   * 可重复调用：先收口上一条连接再新建，与适配器 `connect()` 的「重连隐含断开」同一口径。
   * 少了这一步，重复 `connect()` 会让旧连接失去最后一个引用却仍在收消息。
   */
  start(): void {
    this.#stopped = false;
    this.#attempt = 0;
    this.#connect();
  }

  /** 关闭连接并取消待执行的重连。 */
  stop(): void {
    this.#stopped = true;
    this.#clearTimer();
    this.#close();
  }

  #connect(): void {
    this.#close();
    const ctor = (globalThis as { EventSource?: EventSourceCtor }).EventSource;
    if (typeof ctor !== 'function') {
      // 不排重连：重试再多次也变不出一个全局构造器，那只是让日志滚起来
      this.#report({
        reason: 'unsupported-runtime',
        attempt: 0,
        message: `change feed is enabled but this runtime has no global "EventSource"; no connection will be attempted for ${this.#host.url}`
      });
      return;
    }
    try {
      const source = new ctor(this.#host.url, { withCredentials: this.#host.options.withCredentials === true });
      source.onopen = this.#handleOpen;
      source.onmessage = this.#handleMessage;
      source.onerror = this.#handleError;
      this.#source = source;
    } catch (error) {
      // 非法 URL 会让构造器同步抛 SyntaxError。让它冒到 connect() 就成了
      // 「通知配错 → 整个适配器连不上」，而通道按 AC#17 不该有这种权力
      this.#fail(undefined, error instanceof Error ? error.message : String(error));
    }
  }

  /** 对每个已订阅实体各上报一次失效（D7） */
  #invalidateAll(): void {
    for (const entity of this.#host.entities()) {
      this.#host.invalidate(entity.name, entity.namespace);
    }
  }

  #fail(readyState: number | undefined, detail: string): void {
    this.#attempt++;
    // CONNECTING 表示浏览器自己的重连正在路上，此时再建一条是两条连接收同一份广播
    const retryInMs = readyState === CONNECTING ? undefined : this.#nextDelay();
    this.#report({
      reason: 'connection-error',
      attempt: this.#attempt,
      readyState,
      retryInMs,
      message: `change feed connection to ${this.#host.url} failed (${detail}); EventSource does not expose the status code, so the cause may be an unimplemented endpoint, an authentication failure, or a network error`
    });
    if (retryInMs !== undefined) {
      this.#schedule(retryInMs);
    }
  }

  #nextDelay(): number {
    return Math.min(this.#baseDelayMs * 2 ** (this.#attempt - 1), this.#maxDelayMs);
  }

  #schedule(delayMs: number): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#connect();
    }, delayMs);
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  /**
   * 关闭当前连接。
   *
   * @remarks
   * 先摘回调再 `close()`：`close()` 之后到 GC 之前，这条连接仍可能把最后一个事件送进来，
   * 而那个事件属于上一代连接。摘干净了「断开后不再上报」才是结构保证。
   */
  #close(): void {
    const source = this.#source;
    if (source === undefined) {
      return;
    }
    this.#source = undefined;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    source.close();
  }

  #report(facts: Omit<HttpChangeFeedUnavailableReport, 'url'>): void {
    const hook = this.#host.options.onUnavailable;
    if (!hook) {
      return;
    }
    try {
      hook({ ...facts, url: this.#host.url });
    } catch {
      /* 此刻正在报告的就是「本通道没有输出通道」，诊断自己失败时没有第二条路可走 */
    }
  }

  readonly #handleOpen = (): void => {
    this.#attempt = 0;
    this.#invalidateAll();
  };

  readonly #handleMessage = (event: { data: unknown }): void => {
    if (this.#stopped) {
      return;
    }
    const notification = parseNotification(event.data);
    if (notification === undefined) {
      this.#report({
        reason: 'malformed-message',
        attempt: this.#attempt,
        data: typeof event.data === 'string' ? event.data : undefined,
        message: `change feed message from ${this.#host.url} carries no usable entity name; expected JSON like {"entity":"Recipe"}`
      });
      return;
    }
    // 两边都没有 clientId 时**不算**自回声：`context.clientId` 由 `RxDB.init()` 生成，
    // 没跑过 init() 的实例上它是 undefined，拿 undefined === undefined 当命中，
    // 会让这类场景一条通知都收不到
    if (notification.clientId !== undefined && notification.clientId === this.#host.clientId()) {
      return;
    }
    this.#host.invalidate(notification.entity, notification.namespace);
  };

  readonly #handleError = (): void => {
    if (this.#stopped) {
      return;
    }
    const readyState = this.#source?.readyState;
    this.#fail(readyState, `readyState=${String(readyState)}`);
  };
}

/**
 * 解析一条通知。
 *
 * @param data - `MessageEvent.data`
 * @returns 解析结果；读不出实体名时为 `undefined`
 *
 * @remarks
 * 读不懂就整条丢弃，不做任何补救：这条通知唯一的信息就是实体名，名字都没有的话，
 * 「猜一个」等于随机刷新一张表。
 */
const parseNotification = (data: unknown): ChangeNotification | undefined => {
  if (typeof data !== 'string') {
    return undefined;
  }
  const parsed = parseJson(data);
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const entity = record['entity'];
  if (typeof entity !== 'string' || entity.length === 0) {
    return undefined;
  }
  const namespace = record['namespace'];
  const clientId = record['clientId'];
  return {
    entity,
    namespace: typeof namespace === 'string' && namespace.length > 0 ? namespace : DEFAULT_NAMESPACE,
    clientId: typeof clientId === 'string' ? clientId : undefined
  };
};

/** `JSON.parse` 的非抛错版本：读不懂的载荷是服务端的事，不该变成客户端异常 */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * 读一个退避延迟配置。
 *
 * @param value - 用户传入值，`undefined` 取默认
 * @param field - 出错时写进错误的字段名（不带 `changeFeed.` 前缀）
 * @param fallback - 该字段的默认值
 * @returns 已校验的毫秒数
 * @throws HttpConfigError 不是 finite 正整数
 *
 * @remarks
 * 判据与 {@link resolveHttpConfig} 里那份逐字一致：`1.5` 会让退避延迟落在半毫秒上，
 * `Infinity` 则等于「第一次失败之后永不重连」——那正是退避配置存在的反面。
 */
const readDelay = (
  value: number | undefined,
  field: 'reconnectBaseDelayMs' | 'reconnectMaxDelayMs',
  fallback: number = DEFAULT_RECONNECT_BASE_DELAY_MS
): number => {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || !Number.isFinite(resolved) || resolved < 1) {
    throw new HttpConfigError(
      `HTTP adapter config "changeFeed.${field}" must be a finite integer >= 1, received ${String(resolved)}`,
      `changeFeed.${field}`,
      resolved
    );
  }
  return resolved;
};

/**
 * 校验通知端点。
 *
 * @param url - 用户配置的 `changeFeed.url`
 * @throws HttpConfigError 不是非空字符串
 *
 * @remarks
 * 空串会被拼成 `baseUrl/`，于是通知连接打到 API 根路径上——那里多半返回 HTML，
 * 表现为一条永远在退避重连的连接，而不是一句配置错误。
 */
export const assertChangeFeedUrl = (url: string): void => {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new HttpConfigError('HTTP adapter config "changeFeed.url" must be a non-empty string', 'changeFeed.url', url);
  }
};
