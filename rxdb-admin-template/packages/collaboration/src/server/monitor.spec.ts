import { describe, expect, it, vi } from 'vitest';
import { combineReporters, consoleReporter, errorReport, httpReporter, redact, type ErrorReport } from './monitor.js';

/**
 * 错误监控（ADMIN-US-217 AC#7）：未处理错误交给可插拔的上报器，上报内容先脱敏——不含 access / refresh token、
 * API key、连接串口令、验证码与（受邀）邮箱；保留排障需要的错误名、SQLSTATE、标识与堆栈位置。
 */
const accessToken =
  'eyJhbGciOiJFUzI1NiIsImtpZCI6ImxvY2FsIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
const secrets = {
  accessToken,
  bearer: 'opaque-refresh-like-token',
  apiKey: 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz',
  password: 'pa55-w0rd',
  email: 'invitee.person+team@example.com',
  otp: '493817',
  rawToken: 'raw-invitation-token',
  hash: 'a3f1c2d4e5b6a7980123456789abcdef0123456789abcdef0123456789abcdef'
};
const leaks = (text: string) => Object.entries(secrets).filter(([, value]) => text.includes(value));

describe('脱敏', () => {
  it('去掉令牌、API key、连接串口令、邮箱、验证码与长摘要', () => {
    const text = [
      `jwt ${secrets.accessToken}`,
      `Authorization: Bearer ${secrets.bearer}`,
      `apikey ${secrets.apiKey}`,
      `postgres://admin_collaboration:${secrets.password}@pooler:6432/postgres`,
      `Key (email)=(${secrets.email}) already exists`,
      `otp ${secrets.otp} for user`,
      `{"tokenHash":"${secrets.rawToken}"}`,
      `token_hash=${secrets.hash}`
    ].join('\n');
    const clean = redact(text);
    expect(leaks(clean)).toEqual([]);
    expect(clean).toContain('[jwt]');
    expect(clean).toContain('Bearer [token]');
    expect(clean).toContain('postgres://admin_collaboration:[password]@pooler:6432/postgres');
    expect(clean).toContain('Key (email)=([email]) already exists');
    expect(clean).toContain('otp [digits] for user');
  });
  it('保留排障需要的内容：UUID 标识、SQLSTATE、短数字与压缩产物里的堆栈行列号', () => {
    const text =
      'team 0b4f8a8e-5c6f-4b44-9d43-97e34cbb6c21 failed with 23505 after 3 retries\n' +
      '    at file:///home/deno/functions/admin-collaboration/dist/collaboration.js:1:345678';
    expect(redact(text)).toBe(text);
  });
});

describe('错误报告', () => {
  it('只取错误名、消息、SQLSTATE、详情与堆栈，全部脱敏；请求只带方法与路径，不带查询串', () => {
    const failure = Object.assign(
      new Error(`insert failed for ${secrets.email} with token ${secrets.accessToken}`),
      {
        code: '23505',
        detail: `Key (email)=(${secrets.email}) already exists`,
        query: `INSERT … '${secrets.rawToken}'`,
        parameters: [secrets.password]
      }
    );
    const report = errorReport(failure, {
      entry: 'edge',
      release: 'r-20261118-1',
      source: 'request',
      request: { method: 'POST', path: `/workspaces/team/assets/commands?otp=${secrets.otp}` },
      now: new Date('2026-11-18T08:00:00Z')
    });
    expect(report).toMatchObject({
      at: '2026-11-18T08:00:00.000Z',
      entry: 'edge',
      release: 'r-20261118-1',
      source: 'request',
      request: { method: 'POST', path: '/workspaces/team/assets/commands' },
      error: { name: 'Error', code: '23505', detail: 'Key (email)=([email]) already exists' }
    });
    expect(report.error.message).toBe('insert failed for [email] with token [jwt]');
    expect(leaks(JSON.stringify(report))).toEqual([]);
    // 查询文本与绑定参数从不进入报告
    expect(JSON.stringify(report)).not.toContain('INSERT');
  });
  it('非 Error 的值按文本脱敏；错误名与代码不合规时不原样带出', () => {
    const report = errorReport(`thrown ${secrets.email}`, { entry: 'node', release: null, source: 'pool' });
    expect(report.error).toEqual({
      name: 'NonError',
      message: 'thrown [email]',
      code: null,
      detail: null,
      stack: null
    });
    expect(report.request).toBeNull();
    const odd = Object.assign(new Error('x'), { code: `bad code ${secrets.otp}` });
    odd.name = `Name ${secrets.email}`;
    expect(errorReport(odd, { entry: 'node', release: null, source: 'request' }).error).toMatchObject({
      name: 'Error',
      code: null
    });
  });
  it('超长的消息与堆栈截断', () => {
    const report = errorReport(new Error('x'.repeat(5000)), { entry: 'node', release: null, source: 'request' });
    expect(report.error.message.length).toBeLessThanOrEqual(1000);
    expect(report.error.message.endsWith('…')).toBe(true);
  });
});

const sample = (): ErrorReport =>
  errorReport(new Error(`boom ${secrets.email}`), { entry: 'node', release: 'r1', source: 'request' });

describe('上报器', () => {
  it('控制台上报器写一行可解析的 JSON，前缀固定，便于日志汇按行收集', async () => {
    const lines: string[] = [];
    await consoleReporter(line => lines.push(line)).report(sample());
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('ADMIN_ERROR ')).toBe(true);
    expect(JSON.parse(lines[0].slice('ADMIN_ERROR '.length))).toMatchObject({ release: 'r1', error: { name: 'Error' } });
    expect(leaks(lines[0])).toEqual([]);
  });
  it('HTTP 上报器以 JSON POST 给收集器；投递失败只记一行，不抛错、不带收集器地址', async () => {
    const posted: Request[] = [];
    const ok = httpReporter({
      url: 'https://collector.example/ingest?key=collector-secret',
      fetch: async (input, init) => {
        posted.push(new Request(input, init));
        return new Response(null, { status: 202 });
      }
    });
    await ok.report(sample());
    expect(posted).toHaveLength(1);
    expect(posted[0].method).toBe('POST');
    expect(posted[0].headers.get('content-type')).toBe('application/json');
    expect(await posted[0].json()).toMatchObject({ release: 'r1' });
    const failures: string[] = [];
    const down = httpReporter({
      url: 'https://collector.example/ingest?key=collector-secret',
      fetch: async () => new Response('nope', { status: 500 }),
      onFailure: line => failures.push(line)
    });
    await expect(down.report(sample())).resolves.toBeUndefined();
    const unreachable = httpReporter({
      url: 'https://collector.example/ingest?key=collector-secret',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
      onFailure: line => failures.push(line)
    });
    await expect(unreachable.report(sample())).resolves.toBeUndefined();
    expect(failures).toEqual(['ADMIN_ERROR_DELIVERY_FAILED status 500', 'ADMIN_ERROR_DELIVERY_FAILED TypeError']);
    expect(failures.join('\n')).not.toContain('collector-secret');
  });
  it('HTTP 上报器有超时：收集器不应答时按时放弃', async () => {
    vi.useFakeTimers();
    try {
      const failures: string[] = [];
      const hanging = httpReporter({
        url: 'https://collector.example/ingest',
        timeoutMs: 50,
        fetch: (_input, init) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')))
          ),
        onFailure: line => failures.push(line)
      });
      const pending = hanging.report(sample());
      await vi.advanceTimersByTimeAsync(60);
      await pending;
      expect(failures).toEqual(['ADMIN_ERROR_DELIVERY_FAILED TimeoutError']);
    } finally {
      vi.useRealTimers();
    }
  });
  it('组合上报器依次交给每一个', async () => {
    const seen: string[] = [];
    await combineReporters([
      { report: async () => void seen.push('a') },
      { report: async () => void seen.push('b') }
    ]).report(sample());
    expect(seen).toEqual(['a', 'b']);
  });
});
