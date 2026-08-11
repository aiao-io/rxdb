import { describe, expect, it } from 'vitest';
import type { BenchmarkResult } from '../constants';
import type { BenchmarkSection } from '../hooks/useBenchmark';
import { computeScoreReport } from './score-engine';

function section(results: BenchmarkResult[]): BenchmarkSection {
  return { title: 't', icon: 'throughput', results };
}

function reportFor(sections: BenchmarkSection[]) {
  const report = computeScoreReport(sections);
  if (!report) throw new Error('expected a non-null score report');
  return report;
}

describe('computeScoreReport', () => {
  it('returns null when there are no scorable results', () => {
    expect(computeScoreReport([])).toBeNull();
    expect(computeScoreReport([section([{ name: 'x', duration: 1 }])])).toBeNull();
    // results with unknown testId are ignored
    expect(computeScoreReport([section([{ name: 'x', duration: 1, testId: 'nope', rawValue: 1 }])])).toBeNull();
  });

  it('scores a perfect throughput result as 100 / grade S', () => {
    const report = reportFor([
      section([{ name: 'sw', duration: 1, testId: 'single-write-throughput', rawValue: 2000 }])
    ]);
    expect(report.total).toBe(100);
    expect(report.grade).toBe('S');
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0]).toMatchObject({ key: 'throughput', score: 100 });
  });

  it('includes the previously-unscored batch-2000/5000 throughput metrics', () => {
    const report = reportFor([
      section([
        { name: 'b2', duration: 1, testId: 'batch-write-2000-throughput', rawValue: 25000 },
        { name: 'b5', duration: 1, testId: 'batch-write-5000-throughput', rawValue: 30000 }
      ])
    ]);
    expect(report.categories[0]).toMatchObject({ key: 'throughput', score: 100, itemCount: 2 });
  });

  it('scores a far-beyond-budget latency result as 0 / grade D', () => {
    // full-scan-p95: good=500 → score hits 0 at 2*good (1000ms)
    const report = reportFor([section([{ name: 'fs', duration: 1000, testId: 'full-scan-p95', rawValue: 1000 }])]);
    expect(report.total).toBe(0);
    expect(report.grade).toBe('D');
  });

  it('weights categories by their declared weight', () => {
    const report = reportFor([
      section([
        { name: 'sw', duration: 1, testId: 'single-write-throughput', rawValue: 2000 }, // throughput=100 (w30)
        { name: 'fs', duration: 1, testId: 'full-scan-p95', rawValue: 1000 } // latency=0 (w35)
      ])
    ]);
    // total = (100*30 + 0*35) / (30+35) = 46.2
    expect(report.total).toBeCloseTo(46.2, 1);
    expect(report.grade).toBe('C');
  });
});
