import { Injectable } from '@angular/core';
import type { SqlSchema } from '../model-designer';

const REMOTE_SCHEMA_URL = '/bff/model-designer/sql/remote-schema';

type RemoteSchemaResponse = { ok: true; remote: SqlSchema } | { ok: false; error: string; message?: string };

/**
 * 读取远端 public schema 快照（US-110 AC#2）。
 *
 * 未配置 `DATABASE_URL` / SchemaReader 时 API 返回 503，此处抛错交由调用方提示，
 * 避免静默退化成「与空 schema 对比」而把远端已有表误报成全量 CREATE。
 *
 * @returns 远端 schema 快照
 * @throws Error 当请求失败或 API 未配置数据源时
 */
export async function fetchRemoteSqlSchema(signal?: AbortSignal): Promise<SqlSchema> {
  const response = await fetch(REMOTE_SCHEMA_URL, {
    signal,
    headers: { accept: 'application/json' },
    credentials: 'include'
  });
  const body = (await response.json().catch(() => null)) as RemoteSchemaResponse | null;

  if (!response.ok || !body?.ok) {
    const detail = body && !body.ok ? (body.message ?? body.error) : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return body.remote;
}

/** Injectable remote-schema boundary shared by the designer and PostgreSQL entity catalog. */
@Injectable({ providedIn: 'root' })
export class RemoteSchemaApiService {
  /** Fetches the current PostgreSQL public-schema snapshot. */
  fetch(signal?: AbortSignal): Promise<SqlSchema> {
    return fetchRemoteSqlSchema(signal);
  }
}
