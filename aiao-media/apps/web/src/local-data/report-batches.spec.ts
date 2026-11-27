import { describe, expect, it } from 'vitest';
import { splitReportBatches } from './report-batches';

describe('任务上报批次', () => {
  it('按 100 条拆分并保留顺序，空队列不产生请求', () => {
    expect(splitReportBatches([])).toEqual([]);
    const rows = Array.from({ length: 201 }, (_, index) => index);
    expect(splitReportBatches(rows).map(batch => batch.length)).toEqual([100, 100, 1]);
    expect(splitReportBatches(rows).flat()).toEqual(rows);
  });
});
