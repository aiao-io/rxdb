import { median } from '../bench-stats.ts';
import type { WorkingTreeBenchReport } from './working-tree-report.ts';
import {
  ENVIRONMENT_MISMATCH_CODE,
  RELATIVE_GATE_TOLERANCES,
  SAMPLES,
  SCHEMA_VERSION,
  WARMUP
} from './working-tree-report.ts';

/** CI 固定采集三次独立进程的报告。 */
export const WORKING_TREE_CI_ATTEMPTS = 3;

/** 三次同质采样的中位数与完整原始报告。 */
export interface WorkingTreeCIBenchReport extends WorkingTreeBenchReport {
  readonly aggregation: 'median';
  readonly attemptCount: number;
  readonly attempts: readonly WorkingTreeBenchReport[];
}

const numericFields = ['p50', 'p95', 'max', 'controlP95', 'ratio'] as const;
const metadataFields = ['schemaVersion', 'fixture', 'environment', 'sampling', 'reference'] as const;
const measurementLayout = (report: WorkingTreeBenchReport): string =>
  JSON.stringify(report.measurements.map(({ id, controlId }) => [id, controlId]));

const assertValidReport = (report: WorkingTreeBenchReport): void => {
  if (report.reference === null || report.reference.ratioProfile !== report.environment.ratioProfile) {
    throw new Error(`${ENVIRONMENT_MISMATCH_CODE}: 缺少同画像 reference`);
  }
  if (
    report.schemaVersion !== SCHEMA_VERSION ||
    report.sampling.warmup !== WARMUP ||
    report.sampling.samples !== SAMPLES
  ) {
    throw new Error('报告版本或采样口径不一致');
  }
  const ids = report.measurements.map(({ id }) => id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(Object.keys(RELATIVE_GATE_TOLERANCES).sort())) {
    throw new Error('工作树测点集合不完整或包含重复项');
  }
  for (const measurement of report.measurements) {
    const valid = numericFields.every(field => Number.isFinite(measurement[field]) && measurement[field] >= 0);
    if (!valid || measurement.controlP95 === 0) throw new Error(`测点 ${measurement.id} 包含无效测量`);
  }
};

/**
 * 核对同一总体后，逐项取三次运行的中位数。
 * @param reports - 三次独立进程产生的报告
 * @returns 保留原始报告的中位数汇总
 * @throws 报告无效或三次运行不属于同一总体时
 */
export const aggregateWorkingTreeReports = (reports: readonly WorkingTreeBenchReport[]): WorkingTreeCIBenchReport => {
  if (reports.length !== WORKING_TREE_CI_ATTEMPTS) throw new Error('CI 必须提供三次独立运行的报告');
  const first = reports[0];
  for (const report of reports) {
    assertValidReport(report);
    const compatible = metadataFields.every(field => JSON.stringify(report[field]) === JSON.stringify(first[field]));
    if (!compatible) throw new Error('三次运行的 fixture、环境、采样口径或 reference 不一致');
    if (measurementLayout(report) !== measurementLayout(first)) throw new Error('三次运行的测点布局不一致');
  }
  const measurements = first.measurements.map((measurement, index) => {
    const middle = (field: (typeof numericFields)[number]): number =>
      median(reports.map(report => report.measurements[index][field]));
    return {
      ...measurement,
      p50: middle('p50'),
      p95: middle('p95'),
      max: middle('max'),
      controlP95: middle('controlP95'),
      ratio: middle('ratio')
    };
  });
  return { ...first, aggregation: 'median', attemptCount: reports.length, attempts: [...reports], measurements };
};
