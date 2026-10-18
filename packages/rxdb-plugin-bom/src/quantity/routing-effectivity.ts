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
