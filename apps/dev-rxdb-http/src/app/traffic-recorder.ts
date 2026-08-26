/**
 * 协议流量记录器：包一层 `fetch`，把每一次协议请求记成一条可展示的条目。
 *
 * @remarks
 * 为什么是 monkey-patch 而不是配置项：`HttpAdapterOptions` **没有** transport / fetch 覆盖点，
 * 这是 `@aiao/rxdb-adapter-http` 的明确设计（「适配器持有 transport」，见 `http.interface.ts`
 * 的开头注释）。而本故事不允许改那个包的 `src/`。于是观测点只能落在浏览器这一层。
 *
 * 记的是**客户端视角**的现象：状态码、耗时、是否 304。服务端视角（预检有没有真发生）
 * 记在后端的 `__control/log` 里——`OPTIONS` 由浏览器自己发自己收，`fetch` 上看不见它。
 */

/** 一条流量记录。字段与 AC#8 的面板列一一对应。 */
export interface TrafficEntry {
  /** 递增序号，用于「按顺序列出」以及模板的 track 键 */
  readonly seq: number;
  readonly method: string;
  /** 只留 path + query，去掉 origin——面板要看的是打到哪个端点，不是重复 250 遍的主机名 */
  readonly path: string;
  /** 传输失败记 `0`：它根本没有状态码，记 `-1` 或 `null` 会在模板里退化成空白 */
  readonly status: number;
  readonly durationMs: number;
  readonly notModified: boolean;
}

/** 被包的宿主对象。抽成参数是为了让测试拿一个普通对象来验，而不是动全局。 */
export interface FetchScope {
  fetch: typeof fetch;
}

/** 取请求的 method / url，兼容 `fetch` 三种入参形态。 */
const describeRequest = (input: RequestInfo | URL, init: RequestInit | undefined): { method: string; url: string } => {
  if (input instanceof Request) {
    return { method: (init?.method ?? input.method).toUpperCase(), url: input.url };
  }
  return { method: (init?.method ?? 'GET').toUpperCase(), url: String(input) };
};

/** 把绝对 URL 压成 path + query；解析不了就原样返回（不能因为记日志把请求搞挂）。 */
const toDisplayPath = (url: string): string => {
  try {
    const parsed = new URL(url, 'http://localhost');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

/**
 * 包一个 `fetch`。
 *
 * @param original - 被包的 `fetch`
 * @param record - 每次请求结束后收到一条记录（成功与失败都会调用）
 * @param shouldRecord - 只有返回 `true` 的 URL 才记；用来把协议请求与 `__control` 分开
 * @param now - 计时源，默认 `performance.now()`
 * @returns 与 `fetch` 同签名的函数
 *
 * @remarks
 * 三条不变量：
 *
 * 1. **不改变行为**。返回原样的 `Response`，失败原样抛出。记录失败也绝不影响请求——
 *    面板是观测工具，观测工具挂了不能把被观测的东西一起带走。
 * 2. **不读 body**。`response.clone()` 也不做：条件请求缓存的正是响应体，
 *    多一次读会让 304 复原路径上的流被消费掉。
 * 3. **304 直接可见**。适配器自己挂 `if-none-match`，浏览器把 304 原样交给 JS，
 *    因此 `response.status === 304` 就是判据，不需要旁路。
 */
export const wrapFetch = (
  original: typeof fetch,
  record: (entry: Omit<TrafficEntry, 'seq'>) => void,
  shouldRecord: (url: string) => boolean,
  now: () => number = () => performance.now()
): typeof fetch => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { method, url } = describeRequest(input, init);
    if (!shouldRecord(url)) return await original(input, init);

    const startedAt = now();
    try {
      const response = await original(input, init);
      record({
        method,
        path: toDisplayPath(url),
        status: response.status,
        durationMs: Math.round(now() - startedAt),
        notModified: response.status === 304
      });
      return response;
    } catch (cause) {
      // 传输失败（离线开关掐断 socket 就是这条路径）也要留痕：
      // 面板上「有一条 status 0」与「什么都没有」表达的是完全不同的两件事。
      record({ method, path: toDisplayPath(url), status: 0, durationMs: Math.round(now() - startedAt), notModified: false });
      throw cause;
    }
  };
};

/** 面板容量。够放下一次冷启动（1 次 metadata + 3 次 by-ids）加上几十次交互。 */
const CAPACITY = 200;

let sequence = 0;
let entries: TrafficEntry[] = [];
const listeners = new Set<(entries: readonly TrafficEntry[]) => void>();

const emit = (): void => {
  for (const listener of listeners) listener(entries);
};

/** 当前记录，最新的在最后。 */
export const trafficEntries = (): readonly TrafficEntry[] => entries;

/** 订阅变更，返回退订函数。 */
export const onTraffic = (listener: (entries: readonly TrafficEntry[]) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 清空面板。序号**不重置**——清空之后新来的请求仍然接着往下数，便于对照后端日志。 */
export const clearTraffic = (): void => {
  entries = [];
  emit();
};

/**
 * 把记录器装到宿主上。
 *
 * @param scope - 通常是 `globalThis`
 * @param shouldRecord - 默认记录所有走 `/v1/` 且不含 `__control` 的请求
 * @returns 卸载函数，还原原来的 `fetch`
 *
 * @remarks
 * 默认的判据是路径特征而不是 `baseUrl` 相等：`baseUrl` 要到 Angular 起来之后才解析得出，
 * 而本函数必须在 bootstrap 之前调用（否则冷启动那几次请求录不到）。
 */
export const installTrafficRecorder = (
  scope: FetchScope,
  shouldRecord: (url: string) => boolean = url => url.includes('/v1/') && !url.includes('/__control/')
): (() => void) => {
  const original = scope.fetch.bind(scope) as typeof fetch;
  scope.fetch = wrapFetch(
    original,
    entry => {
      sequence += 1;
      entries = [...entries, { ...entry, seq: sequence }].slice(-CAPACITY);
      emit();
    },
    shouldRecord
  );
  return () => {
    scope.fetch = original;
  };
};
