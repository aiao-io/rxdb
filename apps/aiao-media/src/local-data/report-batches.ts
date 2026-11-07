/** 按服务端 RPC 的最大批次拆分待上报记录，保留原顺序。 */
export function splitReportBatches<T>(rows: readonly T[], size = 100): T[][] {
  const batches: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) batches.push(rows.slice(offset, offset + size));
  return batches;
}
