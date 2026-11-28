import { afterEach, describe, expect, it, vi } from 'vitest';
import { authProbe, databaseProbe, healthCheck, type HealthProbe } from './health.js';

/**
 * 健康检查（ADMIN-US-217 AC#7）：Node 与 Edge 两个入口的 `GET /health` 都由它给出——数据库与 Auth 各探一次，
 * 全部可用为 ok（200），任一不可用为 unavailable（503）；只报状态、耗时与可公开的原因，不带任何连接串、密钥或错误原文。
 */
const ok: HealthProbe = async () => undefined;
/** 耗时取 `now()` 的差：两个探针并行，各自的起止时刻交错，这里只断言它是数字。 */
const latency = expect.any(Number) as number;
afterEach(() => {
  vi.useRealTimers();
});

describe('健康检查', () => {
  it('数据库与 Auth 都可用时为 ok，带入口与发布标识', async () => {
    let now = 1000;
    const check = healthCheck({
      entry: 'edge',
      release: 'r-1',
      probes: { database: ok, auth: ok },
      now: () => (now += 5)
    });
    const report = await check();
    expect(report).toEqual({
      status: 'ok',
      entry: 'edge',
      release: 'r-1',
      checks: { database: { status: 'ok', latencyMs: latency }, auth: { status: 'ok', latencyMs: latency } }
    });
    expect(report.checks.database.latencyMs).toBeGreaterThan(0);
  });
  it('任一组件失败即 unavailable；只给出可公开的原因（SQLSTATE、HTTP 状态），不带错误原文', async () => {
    // 错误原文里带着连接串与口令（运行时拼出，仓库的密钥扫描不会把测试数据当成泄露）
    const password = 'secret';
    const leaking = Object.assign(new Error(`password authentication failed: postgres://u:${password}@db/postgres`), {
      code: '28P01'
    });
    const check = healthCheck({
      entry: 'node',
      release: null,
      probes: {
        database: async () => {
          throw leaking;
        },
        auth: authProbe({
          url: 'http://kong:8000',
          key: 'anon-key',
          fetch: async () => new Response('{"msg":"down"}', { status: 503 })
        })
      }
    });
    const report = await check();
    expect(report).toEqual({
      status: 'unavailable',
      entry: 'node',
      release: null,
      checks: {
        database: { status: 'unavailable', latencyMs: latency, reason: 'error', code: '28P01' },
        auth: { status: 'unavailable', latencyMs: latency, reason: 'status', code: '503' }
      }
    });
    expect(JSON.stringify(report)).not.toContain('secret');
  });
  it('探针超时按不可用处理，不等它返回', async () => {
    vi.useFakeTimers();
    const hanging: HealthProbe = signal =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const pending = healthCheck({
      entry: 'edge',
      release: null,
      probes: { database: hanging, auth: ok },
      timeoutMs: 100
    })();
    await vi.advanceTimersByTimeAsync(150);
    const report = await pending;
    expect(report.status).toBe('unavailable');
    expect(report.checks.database).toMatchObject({ status: 'unavailable', reason: 'timeout' });
    expect(report.checks.auth.status).toBe('ok');
  });
  it('数据库探针以专用角色读一行治理表：连接、认证与授权都在其中', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await databaseProbe({ query })(new AbortController().signal);
    expect(query).toHaveBeenCalledWith('SELECT team_id FROM admin_private.workspaces LIMIT 1');
  });
  it('Auth 探针带公开 key 访问 GoTrue 的健康接口，2xx 即可用', async () => {
    const requests: Request[] = [];
    const probe = authProbe({
      url: 'http://kong:8000/',
      key: 'anon-key',
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response('{}', { status: 200 });
      }
    });
    await probe(new AbortController().signal);
    expect(requests.map(request => [request.url, request.headers.get('apikey')])).toEqual([
      ['http://kong:8000/auth/v1/health', 'anon-key']
    ]);
    const unreachable = authProbe({
      url: 'http://kong:8000',
      key: 'anon-key',
      fetch: async () => {
        throw new TypeError('fetch failed');
      }
    });
    const report = await healthCheck({ entry: 'edge', release: null, probes: { database: ok, auth: unreachable } })();
    expect(report.checks.auth).toMatchObject({ status: 'unavailable', reason: 'error' });
    expect(report.checks.auth).not.toHaveProperty('code');
  });
});
