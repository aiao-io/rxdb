import { InjectionToken } from '@angular/core';
import type { SqlSchema } from './types';

/**
 * 远程 schema 数据源适配器
 *
 * 由宿主应用实现（dashboard 走 `GET /api/model-designer/sql/remote-schema`）。
 * 设计器包本身保持 local-first、零 HTTP 依赖。
 */
export interface RemoteSchemaSource {
  /** 拉取远端 public schema 快照；远端无表时返回 `null` */
  fetchRemoteSchema(): Promise<SqlSchema | null>;
}

/** 远程 schema 数据源注入令牌（可选，未提供时对比退化为与空 schema 对比） */
export const REMOTE_SCHEMA_SOURCE = new InjectionToken<RemoteSchemaSource>('REMOTE_SCHEMA_SOURCE');

/** 对比用远程 schema 的解析结果 */
export type CompareRemoteResolution =
  | { status: 'ok'; remote: SqlSchema }
  | { status: 'stale'; remote: SqlSchema; message: string }
  | { status: 'unavailable'; remote: SqlSchema }
  | { status: 'error'; message: string };

/** 解析入参 */
export interface ResolveCompareRemoteOptions {
  /** 外部直接注入的快照，优先级最高 */
  override?: SqlSchema | null;
  /** 远程拉取函数；未提供表示宿主未接线 */
  fetchRemoteSchema?: () => Promise<SqlSchema | null>;
  /** 上一次成功拉取的缓存 */
  cached?: SqlSchema | null;
}

const EMPTY_SCHEMA: SqlSchema = { tables: [] };

/**
 * 解析对比用的远程 schema。
 *
 * 优先级：override → 远程拉取 → 缓存 → 空 schema。
 * 拉取失败时不静默退化为空 schema（那会把「远端已有表」误报成全量 CREATE），
 * 有缓存则标 `stale`，无缓存则返回 `error`。
 */
export async function resolveCompareRemoteSchema(
  options: ResolveCompareRemoteOptions
): Promise<CompareRemoteResolution> {
  const { override, fetchRemoteSchema, cached } = options;

  if (override) return { status: 'ok', remote: override };

  if (!fetchRemoteSchema) {
    return cached ? { status: 'ok', remote: cached } : { status: 'unavailable', remote: EMPTY_SCHEMA };
  }

  try {
    const remote = await fetchRemoteSchema();
    return { status: 'ok', remote: remote ?? EMPTY_SCHEMA };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cached ? { status: 'stale', remote: cached, message } : { status: 'error', message };
  }
}
