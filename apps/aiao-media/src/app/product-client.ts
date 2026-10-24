import { validateTaskReport, type TaskReport } from '../contracts/product-data.mjs';
import type { ProductAuthorization } from './supabase-auth';

export interface RemoteWorkspace {
  id: string;
  owner_id: string;
  request_id?: string;
  created?: boolean;
}
export type ProductAuthorizer = () => Promise<ProductAuthorization>;

/** 只携带经验证的当前会话，产品数据与管理调用使用各自固定入口。 */
export class ProductClient {
  constructor(private readonly authorize: ProductAuthorizer) {}

  authorization(): Promise<ProductAuthorization> {
    return this.authorize();
  }

  async ownWorkspace(access: ProductAuthorization): Promise<RemoteWorkspace | null> {
    const rows = await this.remote(
      access,
      `/media_workspaces?select=id,owner_id,request_id&owner_id=eq.${encodeURIComponent(access.userId)}`
    );
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('远程工作区目录不可读。');
    return rows.length ? this.workspace(rows[0], access.userId) : null;
  }

  async ensureWorkspace(access: ProductAuthorization, requestId: string): Promise<RemoteWorkspace> {
    return this.workspace(
      await this.remote(access, '/rpc/media_ensure_workspace', { p_request_id: requestId }),
      access.userId
    );
  }

  async submitReports(access: ProductAuthorization, reports: TaskReport[]): Promise<string[]> {
    const result = await this.remote(access, '/rpc/media_submit_task_reports', {
      p_reports: reports.map(validateTaskReport)
    });
    if (!Array.isArray(result) || result.some(id => typeof id !== 'string')) throw new Error('任务上报回执无效。');
    return result as string[];
  }

  async admin(path: string, method = 'GET', payload?: unknown): Promise<unknown> {
    if (!/^[a-z0-9/?=&,._%:-]+$/i.test(path) || path.startsWith('/')) throw new Error('管理请求路径无效。');
    const access = await this.authorize();
    return this.request(`/api/admin/${path}`, {
      method,
      headers: { authorization: `Bearer ${access.session.access_token}`, 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  }

  private workspace(value: unknown, userId: string): RemoteWorkspace {
    if (!value || typeof value !== 'object') throw new Error('工作区回执无效。');
    const row = value as Record<string, unknown>;
    if (typeof row['id'] !== 'string' || row['owner_id'] !== userId) throw new Error('工作区账号回执不匹配。');
    return {
      id: row['id'],
      owner_id: userId,
      ...(typeof row['request_id'] === 'string' ? { request_id: row['request_id'] } : {}),
      ...(typeof row['created'] === 'boolean' ? { created: row['created'] } : {})
    };
  }

  private remote(access: ProductAuthorization, path: string, payload?: unknown): Promise<unknown> {
    return this.request(`${access.config.url}/rest/v1${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        apikey: access.config.anonKey,
        authorization: `Bearer ${access.session.access_token}`,
        'content-type': 'application/json'
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
  }

  private async request(url: string, options: RequestInit): Promise<unknown> {
    const result = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15000)
    });
    if (!result.ok)
      throw new Error(
        result.status === 401 || result.status === 403 ? '账号或权限已失效，远程操作已暂停。'
        : result.status === 409 ? '数据版本已变化，请重新载入。'
        : '产品服务暂不可用，原数据保留。'
      );
    return result.json() as Promise<unknown>;
  }
}
