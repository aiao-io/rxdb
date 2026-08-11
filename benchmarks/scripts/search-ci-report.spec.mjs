import { describe, expect, it } from 'vitest';
import { aggregateBenchmarkReports } from './search-ci-report.mjs';

const createReport = (insertRequeryP90Ms, batch100RequeryP95Ms) => ({
  status: 'completed',
  datasetSize: 10_000,
  articleCount: 10_000,
  commentCount: 10_000,
  vfs: 'memory',
  sections: [
    {
      id: 'write-path',
      title: 'Write path requery latency',
      metrics: [
        {
          id: 'insert-requery-p90-ms',
          label: 'INSERT 后再查 P90',
          unit: 'ms',
          value: insertRequeryP90Ms,
          extra: 'single run'
        },
        {
          id: 'batch100-requery-p95-ms',
          label: '100 次写入后复测 P95',
          unit: 'ms',
          value: batch100RequeryP95Ms,
          extra: 'single run'
        }
      ]
    }
  ],
  metrics: {
    backfillMs: insertRequeryP90Ms + 100,
    queryP50Ms: insertRequeryP90Ms - 10,
    queryP90Ms: insertRequeryP90Ms - 5,
    insertRequeryP90Ms,
    batch100RequeryP95Ms
  },
  thresholds: {
    insertRequeryP90Ms: 100,
    batch100RequeryP95Ms: 5_000
  }
});

describe('aggregateBenchmarkReports', () => {
  it('uses the median of three independent runs for the CI gate and report sections', () => {
    const reports = [createReport(90, 120), createReport(105, 100), createReport(95, 110)];

    const result = aggregateBenchmarkReports(reports);

    expect(result.aggregation).toBe('median');
    expect(result.attemptCount).toBe(3);
    expect(result.metrics).toEqual({
      backfillMs: 195,
      queryP50Ms: 85,
      queryP90Ms: 90,
      insertRequeryP90Ms: 95,
      batch100RequeryP95Ms: 110
    });
    expect(result.sections[0].metrics.map(metric => metric.value)).toEqual([95, 110]);
    expect(result.sections[0].metrics[0].extra).toBe('attempts=90.00ms, 105.00ms, 95.00ms');
    expect(result.attempts).toEqual(reports.map(report => report.metrics));
  });

  it('rejects reports whose section layout differs between runs', () => {
    const reports = [createReport(90, 120), createReport(95, 110), createReport(100, 100)];
    reports[1].sections[0].metrics[0].id = 'different-id';

    expect(() => aggregateBenchmarkReports(reports)).toThrow('benchmark report layout changed between attempts');
  });
});
