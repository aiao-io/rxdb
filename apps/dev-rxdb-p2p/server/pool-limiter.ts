/**
 * 限流 Durable Object（POOL-US-102）：跨 Worker isolate 的窗口计数，SQLite 持久。
 *
 * @remarks
 * 路由调用方与这里共用 `server/limiter.ts` 的策略与存储实现；对外只暴露一个内部接口：
 * `POST /consume` 体 `{ scope, key, cost }`，响应 `{ allowed, retryAfterMs }`。
 * 这个 DO 只有本 Worker 的路由代码能调到（绑定不暴露公网），仍按最小信任校验输入。
 */
import type { Env } from './env';
import { json, methodNotAllowed } from './http';
import {
  checkWithStore,
  consumeWithStore,
  createSqlLimiterStore,
  parsePolicyOverrides,
  reserveWithStore,
  type LimiterPolicy,
  type LimiterStore
} from './limiter';
import type { DurableObjectStateLike } from './runtime';

/** 限流 Durable Object：静态名称，路由经 `env.LIMITER` 绑定调用。 */
export class PoolLimiter {
  readonly #store: LimiterStore;
  readonly #overrides: ReadonlyMap<string, LimiterPolicy> | undefined;

  constructor(state: DurableObjectStateLike, env: Env) {
    this.#store = createSqlLimiterStore(state.storage.sql);
    this.#overrides = env.POOL_POLICY_OVERRIDES ? parsePolicyOverrides(env.POOL_POLICY_OVERRIDES) : undefined;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const body = (await request.json().catch(() => null)) as {
      readonly scope?: unknown;
      readonly key?: unknown;
      readonly cost?: unknown;
      readonly reserve?: unknown;
    } | null;
    if (
      !body ||
      typeof body.scope !== 'string' ||
      typeof body.key !== 'string' ||
      body.key.length === 0 ||
      body.key.length > 128 ||
      (body.reserve !== undefined && typeof body.reserve !== 'boolean') ||
      (body.cost !== undefined && (typeof body.cost !== 'number' || !Number.isSafeInteger(body.cost) || body.cost < 0))
    ) {
      return json(400, { error: 'expected { scope, key, cost? }' });
    }
    // cost 为 0 时只查不记：下载前的流量预检
    const consume = body.reserve ? reserveWithStore : consumeWithStore;
    const result =
      body.cost === 0 ?
        checkWithStore(this.#store, body.scope, body.key, Date.now(), this.#overrides)
      : consume(this.#store, body.scope, body.key, Date.now(), body.cost ?? 1, this.#overrides);
    return json(200, result);
  }
}
