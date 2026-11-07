/**
 * 服务端速率限制（POOL-US-102）：四组接口的窗口与上限集中在这里，M3 定价时只改策略表。
 *
 * @remarks
 * 决策逻辑与存储解耦：Durable Object 用 SQLite（`createSqlLimiterStore`），信令房间的
 * 每账号连接限速用内存版（房间是单例，洪泛期间不休眠，同 `UpgradeLimiter` 的取舍）。
 * 计数只按「scope + 账号/设备或 IP」记，不含文件内容、密钥或举报正文（AC#9）。
 */
import type { SqlStorageLike } from './runtime';

/** 限流策略。 */
export interface LimiterPolicy {
  /** 窗口长度（毫秒）。 */
  readonly windowMs: number;
  /** 窗口内至多多少次。 */
  readonly maxCount: number;
  /** 窗口内至多多少权重（字节）；Infinity 表示不限。 */
  readonly maxWeight: number;
}

/** 四组接口的默认策略（免费档假设值，M3 定价校准）。 */
const DEFAULT_POLICIES: Readonly<Record<string, LimiterPolicy>> = {
  /** 每账号每分钟的信令 hello：断线重连每 2 秒一次（30/分钟），被激活门禁挡住的设备同样按这个节奏重试，
   *  60 的预算给正常重连与等待激活的设备留一倍余量，只挡洪泛借 Worker 打认证宿主。 */
  'signal-hello': { windowMs: 60_000, maxCount: 60, maxWeight: Infinity },
  /** 每账号每日回退上传次数。 */
  'fallback-upload': { windowMs: 86_400_000, maxCount: 20, maxWeight: Infinity },
  /** 每账号每日回退下载次数。 */
  'fallback-download-count': { windowMs: 86_400_000, maxCount: 100, maxWeight: Infinity },
  /** 每账号每日回退下载流量（1 GiB）。 */
  'fallback-download-bytes': { windowMs: 86_400_000, maxCount: Infinity, maxWeight: 1024 ** 3 },
  /** 每来源地址 5 分钟内管理接口的失败认证次数（防爆破）。 */
  'admin-failed-auth': { windowMs: 300_000, maxCount: 10, maxWeight: Infinity }
};

/** 查询一个 scope 的策略（覆盖优先）；未知 scope 为 null。 */
export const poolPolicyOf = (scope: string, overrides?: ReadonlyMap<string, LimiterPolicy>): LimiterPolicy | null => {
  const base = DEFAULT_POLICIES[scope];
  if (!base) return null;
  const policy = overrides?.get(scope) ?? base;
  return { ...policy, maxWeight: policy.maxWeight === Number.POSITIVE_INFINITY ? Infinity : policy.maxWeight };
};

/**
 * 解析策略覆盖（`POOL_POLICY_OVERRIDES`，JSON：`{"scope": {"windowMs": n, "maxCount": n, "maxWeight": n}}`）。
 * e2e 用短窗口验证限流与窗口重置；未知 scope 报错而不是被忽略，防覆盖静默失效。
 */
export const parsePolicyOverrides = (json: string): Map<string, LimiterPolicy> => {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('POOL_POLICY_OVERRIDES must be a JSON object');
  }
  const overrides = new Map<string, LimiterPolicy>();
  for (const [scope, value] of Object.entries(parsed)) {
    if (!(scope in DEFAULT_POLICIES)) throw new Error(`POOL_POLICY_OVERRIDES: unknown scope ${scope}`);
    if (typeof value !== 'object' || value === null)
      throw new Error(`POOL_POLICY_OVERRIDES: ${scope} must be an object`);
    const { windowMs, maxCount, maxWeight } = value as Record<string, unknown>;
    overrides.set(scope, {
      windowMs: typeof windowMs === 'number' ? windowMs : DEFAULT_POLICIES[scope]!.windowMs,
      maxCount: typeof maxCount === 'number' ? maxCount : DEFAULT_POLICIES[scope]!.maxCount,
      maxWeight: typeof maxWeight === 'number' ? maxWeight : DEFAULT_POLICIES[scope]!.maxWeight
    });
  }
  return overrides;
};

/** 一次记账后的窗口状态。 */
export interface LimiterWindow {
  readonly count: number;
  readonly weight: number;
  readonly windowStart: number;
}

/** 限流存储：只记窗口计数，不记任何内容。 */
export interface LimiterStore {
  /** 记一次消费并读回窗口；窗口长度由调用方按策略传入。 */
  consume(scope: string, key: string, now: number, cost: number, windowMs: number): LimiterWindow;
  /** 只读当前窗口，不计数（放行前预检用）。 */
  check(scope: string, key: string, now: number, windowMs: number): LimiterWindow;
  /** 只读列出全部条目（测试与审计用）。 */
  keys(): IterableIterator<string>;
}

/** 内存版：窗口从 `now` 对齐，键多了先清过期的（有界）。 */
export const createMemoryLimiterStore = (): LimiterStore => {
  const rows = new Map<string, LimiterWindow>();
  return {
    consume(scope, key, now, cost, windowMs) {
      const id = `${scope}:${key}`;
      const known = rows.get(id);
      const windowStart = known && now - known.windowStart < windowMs ? known.windowStart : now;
      const window = {
        count: (known && windowStart === known.windowStart ? known.count : 0) + 1,
        weight: (known && windowStart === known.windowStart ? known.weight : 0) + cost,
        windowStart
      };
      rows.set(id, window);
      return window;
    },
    check(scope, key, now, windowMs) {
      const known = rows.get(`${scope}:${key}`);
      if (!known || now - known.windowStart >= windowMs) return { count: 0, weight: 0, windowStart: now };
      return known;
    },
    *keys() {
      for (const key of rows.keys()) yield key;
    }
  };
};

/** SQLite 版：Durable Object 的存储，跨 Worker isolate 持久。 */
export const createSqlLimiterStore = (sql: SqlStorageLike): LimiterStore => {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS quota (
      id TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL,
      weight INTEGER NOT NULL
    )`
  );
  return {
    consume(scope, key, now, cost, windowMs) {
      const id = `${scope}:${key}`;
      sql.exec(
        `INSERT INTO quota(id, window_start, count, weight) VALUES(?1, ?2, 1, ?3)
         ON CONFLICT(id) DO UPDATE SET
           window_start = CASE WHEN window_start + ?4 > ?2 THEN window_start ELSE ?2 END,
           count = CASE WHEN window_start + ?4 > ?2 THEN count + 1 ELSE 1 END,
           weight = CASE WHEN window_start + ?4 > ?2 THEN weight + ?3 ELSE ?3 END`,
        id,
        now,
        cost,
        windowMs
      );
      const rows = sql.exec(`SELECT window_start, count, weight FROM quota WHERE id = ?1`, id).toArray();
      const row = rows[0];
      if (!row) throw new Error('limiter: quota row disappeared after upsert');
      return {
        windowStart: Number(row['window_start']),
        count: Number(row['count']),
        weight: Number(row['weight'])
      };
    },
    check(scope, key, now, windowMs) {
      const rows = sql.exec(`SELECT window_start, count, weight FROM quota WHERE id = ?1`, `${scope}:${key}`).toArray();
      const row = rows[0];
      if (!row) return { count: 0, weight: 0, windowStart: now };
      const windowStart = Number(row['window_start']);
      if (now - windowStart >= windowMs) return { count: 0, weight: 0, windowStart: now };
      return { windowStart, count: Number(row['count']), weight: Number(row['weight']) };
    },
    *keys() {
      for (const row of sql.exec(`SELECT id FROM quota`).toArray()) yield String(row['id']);
    }
  };
};

/** 记一次消费并判定：返回是否放行与 Retry-After。 */
export const consumeWithStore = (
  store: LimiterStore,
  scope: string,
  key: string,
  now: number,
  cost = 1,
  overrides?: ReadonlyMap<string, LimiterPolicy>
): { readonly allowed: boolean; readonly retryAfterMs: number } => {
  const policy = poolPolicyOf(scope, overrides);
  if (!policy) throw new Error(`limiter: unknown scope ${scope}`);
  const window = store.consume(scope, key, now, cost, policy.windowMs);
  return judge(policy, window, now);
};

/** 发送前原子预留额度；超限不扣减，单次同步调用内完成检查与记账。 */
export const reserveWithStore = (
  store: LimiterStore,
  scope: string,
  key: string,
  now: number,
  cost: number,
  overrides?: ReadonlyMap<string, LimiterPolicy>
): { readonly allowed: boolean; readonly retryAfterMs: number } => {
  const policy = poolPolicyOf(scope, overrides);
  if (!policy) throw new Error(`limiter: unknown scope ${scope}`);
  const current = store.check(scope, key, now, policy.windowMs);
  const result = judge(policy, { ...current, count: current.count + 1, weight: current.weight + cost }, now);
  if (result.allowed) store.consume(scope, key, now, cost, policy.windowMs);
  return result;
};

/** 只看当前窗口是否已超限，不计数（下载前按流量预检用）。 */
export const checkWithStore = (
  store: LimiterStore,
  scope: string,
  key: string,
  now: number,
  overrides?: ReadonlyMap<string, LimiterPolicy>
): { readonly allowed: boolean; readonly retryAfterMs: number } => {
  const policy = poolPolicyOf(scope, overrides);
  if (!policy) throw new Error(`limiter: unknown scope ${scope}`);
  return judge(policy, store.check(scope, key, now, policy.windowMs), now);
};

const judge = (
  policy: LimiterPolicy,
  window: LimiterWindow,
  now: number
): { readonly allowed: boolean; readonly retryAfterMs: number } => ({
  allowed: window.count <= policy.maxCount && window.weight <= policy.maxWeight,
  retryAfterMs: Math.max(window.windowStart + policy.windowMs - now, 0)
});
