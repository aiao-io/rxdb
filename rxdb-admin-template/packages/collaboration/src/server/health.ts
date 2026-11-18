/**
 * 命令入口的健康检查（ADMIN-US-217 AC#7）：`GET /health` 并行探测数据库与 Auth，两项都可用为 ok（200），任一不可用为
 * unavailable（503）。报告只带状态、耗时与可公开的原因（超时、出错及其 SQLSTATE / 系统错误码、HTTP 状态），不带连接串、密钥、
 * 令牌或错误原文。Node 入口与 Edge Function 共用（只用 fetch 与 `pg` 的查询接口）。
 */

/** 一个组件的状态。 */
export type HealthState = 'ok' | 'unavailable';
/** 一个组件的检查结果。 */
export interface ComponentHealth {
  status: HealthState;
  /** 探测耗时（毫秒）。 */
  latencyMs: number;
  /** 不可用的原因：超时、出错，或对端以非 2xx 状态应答。 */
  reason?: 'timeout' | 'error' | 'status';
  /** 可公开的代码：数据库的 SQLSTATE、系统错误码（如 `ECONNREFUSED`）或 HTTP 状态；没有时不出现。 */
  code?: string;
}
/** `GET /health` 的响应体。 */
export interface HealthReport {
  status: HealthState;
  /** 入口：`node` 或 `edge`。 */
  entry: string;
  /** 发布标识（`ADMIN_RELEASE`），流水线据此确认在线的是哪一次发布；没有配置时为 null。 */
  release: string | null;
  checks: { database: ComponentHealth; auth: ComponentHealth };
}
/** 一个组件探针：正常返回即可用；抛错即不可用。超时由 {@link healthCheck} 经 `signal` 通知探针放弃。 */
export type HealthProbe = (signal: AbortSignal) => Promise<void>;
/** 健康检查的装配项。 */
export interface HealthOptions {
  entry: string;
  release: string | null;
  probes: { database: HealthProbe; auth: HealthProbe };
  /** 每个探针的时限，默认 3000 毫秒。 */
  timeoutMs?: number;
  /** 取当前毫秒数，测试注入。 */
  now?: () => number;
}

/** 探针以非 2xx 应答时抛出：只带 HTTP 状态，作为可公开的原因。 */
export class ProbeStatusError extends Error {
  constructor(readonly status: number) {
    super(`probe answered ${status}`);
    this.name = 'ProbeStatusError';
  }
}
/** 探针超时：带着它中止探针，并据此判为 timeout。 */
const timedOut = () => new DOMException('health probe timed out', 'TimeoutError');
/** 可公开的错误码：SQLSTATE（5 位）或系统错误码，其余不带出。 */
const publicCode = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^(?:[0-9A-Z]{5}|[A-Z][A-Z0-9_]{1,40})$/.test(code) ? code : undefined;
};

/** 失败的原因与代码：只取可公开的部分。 */
function failure(error: unknown, signal: AbortSignal): Pick<ComponentHealth, 'reason' | 'code'> {
  if (signal.aborted) return { reason: 'timeout' };
  if (error instanceof ProbeStatusError) return { reason: 'status', code: String(error.status) };
  const code = publicCode(error);
  return code ? { reason: 'error', code } : { reason: 'error' };
}

/** 在时限内运行一个探针：超时即中止并判为不可用，不等探针自己返回。 */
async function measure(probe: HealthProbe, timeoutMs: number, now: () => number): Promise<ComponentHealth> {
  const controller = new AbortController();
  const started = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort(timedOut());
      reject(timedOut());
    }, timeoutMs);
  });
  try {
    await Promise.race([probe(controller.signal), deadline]);
    return { status: 'ok', latencyMs: now() - started };
  } catch (error) {
    return { status: 'unavailable', latencyMs: now() - started, ...failure(error, controller.signal) };
  } finally {
    clearTimeout(timer);
  }
}

/** 建出健康检查：每次调用并行探测数据库与 Auth，返回 {@link HealthReport}。 */
export function healthCheck(options: HealthOptions): () => Promise<HealthReport> {
  const timeoutMs = options.timeoutMs ?? 3000;
  const now = options.now ?? (() => Date.now());
  return async () => {
    const [database, auth] = await Promise.all([
      measure(options.probes.database, timeoutMs, now),
      measure(options.probes.auth, timeoutMs, now)
    ]);
    return {
      status: database.status === 'ok' && auth.status === 'ok' ? 'ok' : 'unavailable',
      entry: options.entry,
      release: options.release,
      checks: { database, auth }
    };
  };
}

/**
 * 数据库探针：以命令入口自己的连接池（协作专用角色，生产经 Supavisor）读一行治理表，连通、认证与授权都在其中——
 * 迁移把授权弄坏、口令不对或连接池不可达，都会在这里显出来。
 */
export function databaseProbe(pool: { query(sql: string): Promise<unknown> }): HealthProbe {
  return async () => {
    await pool.query('SELECT team_id FROM admin_private.workspaces LIMIT 1');
  };
}

/** Auth 探针：带公开 key 访问 GoTrue 的健康接口（`<SUPABASE_URL>/auth/v1/health`），2xx 即可用。 */
export function authProbe(options: { url: string; key: string; fetch?: typeof globalThis.fetch }): HealthProbe {
  const request = options.fetch ?? fetch;
  const endpoint = `${options.url.replace(/\/+$/, '')}/auth/v1/health`;
  return async signal => {
    const response = await request(endpoint, { headers: { apikey: options.key, accept: 'application/json' }, signal });
    await response.body?.cancel();
    if (!response.ok) throw new ProbeStatusError(response.status);
  };
}
