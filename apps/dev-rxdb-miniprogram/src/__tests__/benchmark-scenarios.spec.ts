import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_SUITES,
  runBenchmarkSuites,
  type BenchmarkResult,
  type BenchmarkSuiteInfo,
  type BenchmarkWorkload
} from '../benchmark/scenarios';
import { BenchmarkCancelledError } from '../benchmark/stats';

interface FakeRow {
  readonly title: string;
  readonly completed: boolean;
}

/** 内存里的工作负载：只记账，不碰 RxDB。 */
class FakeWorkload implements BenchmarkWorkload {
  rows: FakeRow[] = [];
  operations = 0;

  async insertOne(title: string): Promise<void> {
    this.operations++;
    this.rows.push({ title, completed: false });
  }

  async insertMany(count: number, prefix: string): Promise<void> {
    this.operations++;
    for (let i = 0; i < count; i++) this.rows.push({ title: `${prefix}-${i}`, completed: i % 3 === 0 });
  }

  async countAll(): Promise<number> {
    this.operations++;
    return this.rows.length;
  }

  async countCompleted(completed: boolean): Promise<number> {
    this.operations++;
    return this.rows.filter(row => row.completed === completed).length;
  }

  async countTitleContains(term: string): Promise<number> {
    this.operations++;
    return this.rows.filter(row => row.title.includes(term)).length;
  }

  async clear(): Promise<void> {
    this.operations++;
    this.rows = [];
  }
}

function steppingClock(): () => number {
  let now = 0;
  return () => ++now;
}

describe('runBenchmarkSuites', () => {
  it('按顺序跑完四组测试，与 benchmarks/ 的分组一致', async () => {
    const started: BenchmarkSuiteInfo[] = [];

    await runBenchmarkSuites(new FakeWorkload(), {
      now: steppingClock(),
      isCancelled: () => false,
      onSuiteStart: suite => started.push(suite)
    });

    expect(started.map(suite => suite.title)).toEqual(['吞吐量测试', '延迟分布测试', '扩展性测试', '并发性能测试']);
    expect(started).toEqual(BENCHMARK_SUITES.map(({ id, title }) => ({ id, title })));
  });

  it('每组都产出结果，且结果带单位与说明', async () => {
    const results = new Map<string, BenchmarkResult[]>();

    await runBenchmarkSuites(new FakeWorkload(), {
      now: steppingClock(),
      isCancelled: () => false,
      onResult: (suiteId, result) => results.set(suiteId, [...(results.get(suiteId) ?? []), result])
    });

    expect([...results.keys()]).toEqual(BENCHMARK_SUITES.map(suite => suite.id));
    for (const suiteResults of results.values()) {
      expect(suiteResults.length).toBeGreaterThan(0);
      for (const result of suiteResults) {
        expect(result.name).not.toBe('');
        expect(result.detail).not.toBe('');
        expect(['ms', 'ops/s', 'x']).toContain(result.unit);
        expect(Number.isNaN(result.value)).toBe(false);
      }
    }
  });

  it('延迟分布组给出 P50 / P95 / P99', async () => {
    const names: string[] = [];

    await runBenchmarkSuites(new FakeWorkload(), {
      now: steppingClock(),
      isCancelled: () => false,
      onResult: (suiteId, result) => {
        if (suiteId === 'latency') names.push(result.name);
      }
    });

    for (const percentile of ['P50', 'P95', 'P99']) {
      expect(names.some(name => name.includes(percentile))).toBe(true);
    }
  });

  it('跑完后清空测试数据，不在库里留下记录', async () => {
    const workload = new FakeWorkload();

    await runBenchmarkSuites(workload, { now: steppingClock(), isCancelled: () => false });

    expect(workload.rows).toEqual([]);
  });

  it('取消后抛 BenchmarkCancelledError，后续测试组不再操作工作负载', async () => {
    const workload = new FakeWorkload();
    let cancelled = false;
    let operationsAtCancel = -1;
    const promise = runBenchmarkSuites(workload, {
      now: steppingClock(),
      isCancelled: () => cancelled,
      onSuiteStart: suite => {
        if (suite.id !== 'latency') return;
        cancelled = true;
        operationsAtCancel = workload.operations;
      }
    });

    await expect(promise).rejects.toBeInstanceOf(BenchmarkCancelledError);
    expect(operationsAtCancel).toBeGreaterThan(0);
    expect(workload.operations).toBe(operationsAtCancel);
  });
});
