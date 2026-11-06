// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  consumeWithStore,
  createMemoryLimiterStore,
  parsePolicyOverrides,
  poolPolicyOf,
  reserveWithStore,
  type LimiterStore
} from './limiter';

const NOW = 1_000_000;
let clock = NOW;
const advance = (ms: number) => {
  clock += ms;
};
const consume = (store: LimiterStore, scope: string, key: string, cost = 1) =>
  consumeWithStore(store, scope, key, clock, cost);

describe('poolPolicyOf', () => {
  it('内置策略覆盖四组接口，未知 scope 返回 null', () => {
    expect(poolPolicyOf('signal-hello')).toMatchObject({ windowMs: 60_000, maxCount: 60 });
    expect(poolPolicyOf('fallback-upload')).toMatchObject({ windowMs: 86_400_000, maxCount: 20 });
    expect(poolPolicyOf('fallback-download-bytes')).toMatchObject({ maxWeight: 1024 ** 3 });
    expect(poolPolicyOf('admin-failed-auth')).toMatchObject({ maxCount: 10 });
    expect(poolPolicyOf('made-up-scope')).toBeNull();
  });

  it('策略覆盖：e2e 用短窗口；未知 scope 报错而不是被忽略', () => {
    const overrides = parsePolicyOverrides(JSON.stringify({ 'signal-hello': { windowMs: 1000, maxCount: 3 } }));
    expect(overrides.get('signal-hello')).toEqual({ windowMs: 1000, maxCount: 3, maxWeight: Infinity });
    expect(() => parsePolicyOverrides('{"not-a-scope": {"windowMs": 1}}')).toThrow();
    expect(() => parsePolicyOverrides('not json')).toThrow();
  });
});

describe('createMemoryLimiterStore + consumeWithStore', () => {
  beforeEach(() => {
    clock = NOW;
  });

  it('窗口内超过次数上限被拒，带 Retry-After；窗口重置后恢复', () => {
    const store = createMemoryLimiterStore();
    const policy = poolPolicyOf('fallback-upload')!;
    for (let attempt = 0; attempt < policy.maxCount; attempt += 1) {
      expect(consume(store, 'fallback-upload', 'user-1').allowed).toBe(true);
    }
    const rejected = consume(store, 'fallback-upload', 'user-1');
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBeGreaterThan(0);
    advance(policy.windowMs + 1);
    expect(consume(store, 'fallback-upload', 'user-1').allowed).toBe(true);
  });

  it('不同账号互不影响', () => {
    const store = createMemoryLimiterStore();
    const policy = poolPolicyOf('signal-hello')!;
    for (let attempt = 0; attempt < policy.maxCount; attempt += 1) consume(store, 'signal-hello', 'user-1');
    expect(consume(store, 'signal-hello', 'user-1').allowed).toBe(false);
    expect(consume(store, 'signal-hello', 'user-2').allowed).toBe(true);
  });

  it('按字节计费：回退下载流量按 cost 累计，超限被拒', () => {
    const store = createMemoryLimiterStore();
    const policy = poolPolicyOf('fallback-download-bytes')!;
    const half = policy.maxWeight / 2;
    expect(consume(store, 'fallback-download-bytes', 'user-1', half).allowed).toBe(true);
    expect(consume(store, 'fallback-download-bytes', 'user-1', half).allowed).toBe(true);
    expect(consume(store, 'fallback-download-bytes', 'user-1', 1).allowed).toBe(false);
  });

  it('计数键隔离：不同 scope 各自独立', () => {
    const store = createMemoryLimiterStore();
    const policy = poolPolicyOf('signal-hello')!;
    for (let attempt = 0; attempt < policy.maxCount; attempt += 1) consume(store, 'signal-hello', 'user-1');
    expect(consume(store, 'fallback-upload', 'user-1').allowed).toBe(true);
  });

  it('记账不含文件内容：键与 scope 之外什么也不存', () => {
    const store = createMemoryLimiterStore();
    consume(store, 'fallback-upload', 'user-1');
    expect([...store.keys()].join(' ')).not.toContain('contentHash');
  });
});

describe('atomic byte reservations', () => {
  it('never spends more than the shared quota and does not debit rejected chunks', async () => {
    const store = createMemoryLimiterStore();
    const overrides = parsePolicyOverrides(JSON.stringify({ 'fallback-download-bytes': { maxWeight: 6 } }));
    const reserve = () => reserveWithStore(store, 'fallback-download-bytes', 'user', NOW, 4, overrides);
    const results = await Promise.all([Promise.resolve().then(reserve), Promise.resolve().then(reserve)]);
    expect(results.map(result => result.allowed)).toEqual([true, false]);
    expect(store.check('fallback-download-bytes', 'user', NOW, 86_400_000).weight).toBe(4);
    expect(reserveWithStore(store, 'fallback-download-bytes', 'user', NOW, 2, overrides).allowed).toBe(true);
  });
});
