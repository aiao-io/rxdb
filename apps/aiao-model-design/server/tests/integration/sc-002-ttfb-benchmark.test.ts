// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';
import { writeValidationReport } from './validation-report';

/**
 * SC-002 — Chat 流首字节延迟 ≤ 3s baseline benchmark
 *
 * 对应：[validation/sc-002-first-byte-latency.md](../../../specs/006-model-gateway/validation/sc-002-first-byte-latency.md)
 *
 * **Scope**：测量"网关层"自身从受理请求到吐出第一个 SSE chunk 的耗时（mock-echo 上游，无网络）。
 * 真实 DeepSeek API 上游耗时由 QA 用 oha / wrk 在 staging 重测，本 baseline 仅证明
 * 网关本体处理开销 << 3s 阈值。
 *
 * **方法**：N 次并发 `/v1/chat/completions stream:true`，记录 TTFB = `app.handle()` 完成到 reader.read() 第一次 resolve 之间的耗时。
 *
 * ⚠️ **只断言 AC 上写着的 3000ms，不再额外压一条 `P95 < 500ms`**（2026-07-28 删）。
 * 那条阈值没有任何 AC 背书，而 50 并发下的 P95 由机器负载主导、不由网关代码主导：
 * 单跑 P95≈66ms、10 个 CPU 占用进程下 P95≈74ms，但跟 `test-all` 全量门禁
 * （12 个项目并行 + v8 覆盖率插桩，单次 `import` 就吃掉 180s CPU）同跑时实测 **985ms**。
 * 也就是说它拦不住性能回归（信号距阈值 7 倍），只会随机把门禁染红——而
 * 「红了也正常」正是门禁失效的方式。真实数字每轮写进 validation 报告，回归看 diff。
 */

const SAMPLES = 100;
const CONCURRENCY = 50;
const THRESHOLD_MS = 3000;

let ts: TestServer;
const samplesMs: number[] = [];

beforeAll(async () => {
  ts = await bootTestServer();
});

afterAll(() => {
  writeBenchmarkReport(samplesMs);
});

async function measureTtfb(): Promise<number> {
  const t0 = performance.now();
  const res = await ts.app.handle(
    new Request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ts.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'hi from baseline benchmark' }],
        stream: true
      })
    })
  );
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  await reader.read(); // 第一次 read 解析时即收到首字节
  reader.cancel().catch(() => {
    // ignore cancel rejection
  });
  return performance.now() - t0;
}

describe('SC-002 baseline TTFB (mock-echo)', () => {
  it(`network-free baseline: ${SAMPLES} samples, ${CONCURRENCY} concurrent, P95 must << ${THRESHOLD_MS}ms`, async () => {
    const batches = Math.ceil(SAMPLES / CONCURRENCY);
    for (let b = 0; b < batches; b++) {
      const remaining = Math.min(CONCURRENCY, SAMPLES - samplesMs.length);
      const batch = await Promise.all(Array.from({ length: remaining }, () => measureTtfb()));
      samplesMs.push(...batch);
    }

    const sorted = [...samplesMs].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)]!;

    expect(samplesMs.length).toBe(SAMPLES);
    expect(p95).toBeLessThan(THRESHOLD_MS);
  });
});

function pct(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)]!;
}

function writeBenchmarkReport(samples: number[]): void {
  if (samples.length === 0) return;
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = pct(samples, 0.5);
  const p95 = pct(samples, 0.95);
  const p99 = pct(samples, 0.99);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

  const lines: string[] = [
    '# SC-002 自动化 baseline 测量（mock-echo，无网络）',
    '',
    `**执行人**：Claude Code (auto mode, ${new Date().toISOString()})`,
    `**样本数**：${samples.length}（${CONCURRENCY} 并发）`,
    '**上游**：mock-echo（in-process，无真实网络 / 无 DeepSeek）',
    '**用途**：证明网关本体处理开销 << 3s 阈值；真实 DeepSeek 延迟由 QA 再测',
    '',
    '| 指标 | 值 (ms) |',
    '| --- | --- |',
    `| min | ${min.toFixed(3)} |`,
    `| mean | ${mean.toFixed(3)} |`,
    `| P50 | ${p50.toFixed(3)} |`,
    `| P95 | ${p95.toFixed(3)} |`,
    `| P99 | ${p99.toFixed(3)} |`,
    `| max | ${max.toFixed(3)} |`,
    '',
    `**SC-002 网关本体开销**：${p95 < THRESHOLD_MS ? '✅' : '❌'} P95 < 3000ms（实际 ${p95.toFixed(2)}ms）`,
    '',
    '> **注**：此 baseline 排除了上游 DeepSeek 的网络往返与生成耗时。',
    '> 真实端到端 TTFB 必须由 QA 在 staging 环境用 `oha` / `wrk` + 真 DeepSeek API key',
    '> 跑 50 并发 100 次得出 P50 / P95，并对比 3s 阈值。本 baseline 表明：',
    '> 即使上游瞬秒响应，网关本体引入的开销也只有几毫秒，留给上游 ≈ 3000ms 的预算。',
    ''
  ];
  writeValidationReport('sc-002-first-byte-latency.md', lines.join('\n'));
}
