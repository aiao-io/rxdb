/**
 * FR-040 trace id header 写入工具
 *
 * 所有网关入口在创建 RequestContext 后 MUST 立刻调用 `setTraceHeader`，
 * 让 `x-trace-id` 同步出现在成功与失败响应上，便于排障。
 */

export const X_TRACE_ID_HEADER = 'x-trace-id';

interface HeadersBag {
  headers: Record<string, string | number>;
}

/**
 * 把 traceId 写入响应 header
 *
 * @param set Elysia 的 `set` 对象（或任何含 `headers` 字段的容器）
 * @param traceId 来自 RequestContext.traceId
 */
export function setTraceHeader(set: HeadersBag, traceId: string): void {
  set.headers[X_TRACE_ID_HEADER] = traceId;
}
