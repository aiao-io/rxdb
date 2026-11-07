import { describe, expect, it } from 'vitest';

import { aggregateWorkingTreeReports } from './working-tree-ci-report.ts';
import { decideRelativeGate } from './working-tree-gate.ts';
import type { WorkingTreeBenchReport } from './working-tree-report.ts';
import { SAMPLES, SCHEMA_VERSION, WARMUP } from './working-tree-report.ts';

const ratios = { status: 2, diff: 2, restore: 12, commit: 14 };
const profile = 'Linux linux x64 / AMD EPYC 9V74 / node 26';

const createReport = (overrides: Partial<typeof ratios> = {}): WorkingTreeBenchReport => ({
  schemaVersion: SCHEMA_VERSION,
  fixture: { entities: 10_000, commits: 100, unitsPerCommit: 100, uncommittedUnits: 100, contentHash: 'fixture' },
  environment: {
    runtime: 'node 26.13.0',
    os: 'Linux linux x64',
    cpuModel: 'AMD EPYC 9V74',
    logicalCores: 4,
    memoryBytes: 16_000_000_000,
    runnerId: 'runner',
    concurrency: 1,
    runnerProfileHash: 'runner-hash',
    ratioProfile: profile
  },
  sampling: { warmup: WARMUP, samples: SAMPLES },
  measurements: Object.entries({ ...ratios, ...overrides }).map(([id, ratio]) => ({
    id,
    ratio,
    p50: ratio / 2,
    p95: ratio,
    max: ratio * 2,
    controlId: id === 'status' || id === 'diff' ? 'read' : 'write',
    controlP95: 1
  })),
  reference: {
    commit: 'baseline',
    runs: 10,
    medianRatios: ratios,
    frozenAbsolute: { commit: 500 },
    runnerProfileHash: 'reference-hash',
    ratioProfile: profile
  }
});

const judge = (report: WorkingTreeBenchReport) => {
  const reference = createReport().reference;
  if (reference === null) throw new Error('测试 fixture 缺少 reference');
  return decideRelativeGate([reference], profile, report.measurements);
};

describe('aggregateWorkingTreeReports', () => {
  it('逐项取三次独立运行的中位数，隔离单次测量尖峰并保留原始报告', () => {
    const reports = [
      createReport({ status: 3 }),
      createReport({ commit: 16 }),
      createReport({ status: 2.2, commit: 14.6 })
    ];
    const result = aggregateWorkingTreeReports(reports);

    expect(result.aggregation).toBe('median');
    expect(result.attemptCount).toBe(3);
    expect(result.attempts).toEqual(reports);
    expect(result.measurements.find(item => item.id === 'status')?.ratio).toBe(2.2);
    expect(result.measurements.find(item => item.id === 'commit')?.ratio).toBe(14.6);
    expect(judge(result)).toMatchObject({ kind: 'evaluated', passed: true });
  });

  it('持续回退仍按原有 110% 阈值失败', () => {
    const result = aggregateWorkingTreeReports([
      createReport({ commit: 16 }),
      createReport({ commit: 16.2 }),
      createReport({ commit: 16.4 })
    ]);

    expect(judge(result)).toMatchObject({
      kind: 'evaluated',
      passed: false,
      verdicts: expect.arrayContaining([expect.objectContaining({ id: 'commit', budget: 14 * 1.1, passed: false })])
    });
  });

  it('两次回退不能被一次较快的运行掩盖', () => {
    const result = aggregateWorkingTreeReports([
      createReport({ commit: 16 }),
      createReport(),
      createReport({ commit: 16.4 })
    ]);

    expect(judge(result)).toMatchObject({ kind: 'evaluated', passed: false });
  });

  it('三次运行缺一不可', () => {
    expect(() => aggregateWorkingTreeReports([createReport(), createReport()])).toThrow(/三次/);
  });

  it.each(['fixture', 'environment', 'sampling', 'reference'] as const)('拒绝混合不同的 %s', field => {
    const report = createReport();
    const changed = { ...report, [field]: { ...report[field], changed: true } };

    expect(() => aggregateWorkingTreeReports([report, changed, report])).toThrow(/不一致/);
  });

  it('没有同画像 reference 时仍然失败', () => {
    expect(() =>
      aggregateWorkingTreeReports(Array.from({ length: 3 }, () => ({ ...createReport(), reference: null })))
    ).toThrow(/benchmark_environment_mismatch/);
  });

  it('测点缺失时失败', () => {
    const report = createReport();
    const changed = { ...report, measurements: report.measurements.slice(1) };

    expect(() => aggregateWorkingTreeReports([report, changed, report])).toThrow(/测点/);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('拒绝无效比值 %s', ratio => {
    expect(() =>
      aggregateWorkingTreeReports([createReport(), createReport({ commit: ratio }), createReport()])
    ).toThrow(/无效/);
  });
});
