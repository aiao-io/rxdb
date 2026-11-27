import type { BomLocalAdapter } from './bom-adapter.js';
import type { HistoryBatchInput } from './history-loader.js';

/** 按需装载历史写入通道；保持单事务装载与原错误合同。 */
export const loadHistory = async (adapter: BomLocalAdapter, batch: HistoryBatchInput): Promise<void> =>
  (await import('./history-loader.js')).loadHistory(adapter, batch);
