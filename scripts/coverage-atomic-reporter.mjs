/**
 * Vitest 覆盖率原子报告器：在测试结束后一次性写入 JSON/summary 文件，
 * 避免部分写入导致下游误读不完整数据。
 */

import { writeValidatedCoveragePair } from './coverage-artifacts.mjs';

export default class AtomicCoverageReporter {
  #coverage;
  #summary;

  constructor(options) {
    if (typeof options?.outputDir !== 'string' || options.outputDir.length === 0) {
      throw new TypeError('AtomicCoverageReporter requires a non-empty outputDir');
    }
    this.outputDir = options.outputDir;
  }

  onCoverage(coverage) {
    if (typeof coverage?.toJSON !== 'function' || typeof coverage?.getCoverageSummary !== 'function') {
      throw new TypeError('AtomicCoverageReporter requires an Istanbul coverage map');
    }

    const summary = coverage.getCoverageSummary();
    if (typeof summary?.toJSON !== 'function') {
      throw new TypeError('AtomicCoverageReporter requires an Istanbul coverage summary');
    }

    this.#coverage = coverage.toJSON();
    this.#summary = { total: summary.toJSON() };
  }

  async onFinishedReportCoverage() {
    await this.#publishCoverage();
  }

  async #publishCoverage() {
    if (!this.#coverage || !this.#summary) {
      throw new Error('AtomicCoverageReporter received no coverage before report finalization');
    }
    await writeValidatedCoveragePair(this.outputDir, this.#coverage, this.#summary);
  }
}
