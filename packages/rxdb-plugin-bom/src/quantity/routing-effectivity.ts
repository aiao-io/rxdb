interface RoutingEffectivity {
  validFrom: unknown;
  disabledAt: unknown;
}

const normalizeDate = (value: unknown): string =>
  (value instanceof Date ? value : new Date(String(value))).toISOString();

/** 数量与成本共用路线有效域 [validFrom, disabledAt) 的拒绝原因。 */
export const routingUncoveredReason = (routing: RoutingEffectivity | undefined, asOfDate: Date): string | null => {
  if (routing === undefined) return '路线不存在';
  const asOf = asOfDate.toISOString();
  const validFrom = normalizeDate(routing.validFrom);
  if (validFrom > asOf) return `生效起始 ${validFrom.slice(0, 10)} 晚于评估日`;
  const disabledAt = routing.disabledAt === null ? null : normalizeDate(routing.disabledAt);
  return disabledAt !== null && disabledAt <= asOf ? `停用日 ${disabledAt.slice(0, 10)} 不晚于评估日` : null;
};

/** 声明投料工序的行：单工序 `operation_seq`，分摊行另经 `splitsOf` 按发生项取。 */
interface OperationDeclaringRow {
  occurrenceId: string;
  operationSeq: number | null;
}

/**
 * 数量与成本共用的第 5 步前提：行声明的投料工序（`operation_seq` 与分摊行的工序号）都必须在头所选路线的工序集内。
 * 工序被事后改号或删除时，从缺失工序起算的剩余工序链会静默跳过或错挂工序损耗，调用方据此拒绝整次计算。
 *
 * @returns 第一条引用了缺失工序的行与缺失的工序号；全部可解析时为 null
 */
export const findMissingOperation = <T extends OperationDeclaringRow>(
  rows: readonly T[],
  splitsOf: (occurrenceId: string) => readonly { operationSeq: number }[],
  operations: readonly { operationSeq: number }[]
): { row: T; operationSeq: number } | null => {
  const known = new Set(operations.map(operation => operation.operationSeq));
  for (const row of rows) {
    const declared = [row.operationSeq, ...splitsOf(row.occurrenceId).map(split => split.operationSeq)];
    const missing = declared.find((seq): seq is number => seq !== null && !known.has(seq));
    if (missing !== undefined) return { row, operationSeq: missing };
  }
  return null;
};
