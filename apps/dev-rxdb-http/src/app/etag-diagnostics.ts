/**
 * ETag 诊断信号的收集器：把 `onEtagUnreadable` 的每一次回调记成一条可展示的条目（US-215 AC#8）。
 *
 * @remarks
 * 与 `traffic-recorder.ts` 是**两类东西**，不合并：流量记录器包 `fetch`，记的是客户端能
 * 从网线上看到的现象（状态码、耗时、是否 304）；本模块记的是适配器**内部**才知道的一件事
 * ——「条件请求开着，但这次 200 里读不到 ETag，所以之后都不会带 `If-None-Match`」。
 * 后者在 `fetch` 那一层看不出来：一次读不到 ETag 的 200 和一次正常的 200，
 * 在流量面板上逐字相同，而它们对缓存的后果完全相反。
 *
 * 这也正是这条回调存在的理由：适配器知道这件事，此前只是没有嘴。
 */

import type { HttpEtagUnreadableReport } from '@aiao/rxdb-adapter-http';

/** 一条诊断记录。 */
export interface EtagDiagnosticEntry {
  /** 递增序号，用作模板的 track 键 */
  readonly seq: number;
  /** 触发的操作名（`fetchMetadata` / `findByIds`） */
  readonly operation: string;
  /** 实体名。适配器把它标成可选，两个条件操作实际恒有值——缺席时留空而不是编一个 */
  readonly entityName: string;
  /** 发出该请求的绝对 URL */
  readonly url: string;
  /** `Response.type` 原样透出：跨源为 `'cors'`，同源为 `'basic'` */
  readonly responseType: string;
  /** 适配器给的现成文案，两种成因都点到且不选边 */
  readonly message: string;
}

/** 面板容量。诊断按指纹去重，一次全表刷新至多几条，200 绰绰有余。 */
const CAPACITY = 200;

let sequence = 0;
let entries: EtagDiagnosticEntry[] = [];
const listeners = new Set<(entries: readonly EtagDiagnosticEntry[]) => void>();

/** 当前记录，最新的在最后。 */
export const etagDiagnostics = (): readonly EtagDiagnosticEntry[] => entries;

/** 订阅变更，返回退订函数。 */
export const onEtagDiagnostic = (listener: (entries: readonly EtagDiagnosticEntry[]) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 清空面板。序号**不重置**，与流量面板同一约定。 */
export const clearEtagDiagnostics = (): void => {
  entries = [];
  for (const listener of listeners) listener(entries);
};

/**
 * 收下一条诊断报告。可直接作为 `HttpAdapterOptions.onEtagUnreadable` 传入。
 *
 * @param report - 适配器给出的事实载荷
 *
 * @remarks
 * 本函数**不抛错**，所以适配器那层的 try/catch 在这里用不上——那层兜的是别人的实现，
 * 不是本 demo 的借口。
 */
export const recordEtagDiagnostic = (report: HttpEtagUnreadableReport): void => {
  sequence += 1;
  const entry: EtagDiagnosticEntry = {
    seq: sequence,
    operation: report.operation,
    entityName: report.entityName ?? '',
    url: report.url,
    responseType: report.responseType,
    message: report.message
  };
  entries = [...entries, entry].slice(-CAPACITY);
  for (const listener of listeners) listener(entries);
};
