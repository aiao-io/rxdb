import { validateTaskReport, type TaskReport } from '@aiao-media/api-contracts';
import type { MediaConfigCommitEnvelope, MediaConfigCommitStatus } from '@aiao-media/domain';
import type { AdminSupabaseClient } from './admin-auth';
import { normalizeDisplayName, parseAccountIdentity, parseAdminProfile, type AdminAccountIdentity, type AdminProfile } from './admin-profile';

export interface ProductAuthorization {
  config: { url: string; anonKey: string };
  session: { access_token: string };
  userId: string;
  supabase?: SupabaseFunctionClient;
}

export type SupabaseFunctionClient = Pick<AdminSupabaseClient, 'functions'>;

export interface RemoteWorkspace {
  id: string;
  owner_id: string;
  request_id?: string;
  created?: boolean;
}
export interface RemoteConfigCommitStatus {
  id: string;
  workspaceId: string;
  branchId: string;
  parentIds: string[];
  authorId: string;
  operationId: string;
  status: MediaConfigCommitStatus;
  createdAt: string;
  appliedAt: string | null;
  releasedAt: string | null;
  rejectionCode: string | null;
}
export type ProductAuthorizer = () => Promise<ProductAuthorization>;

/** 携带 HTTP 状态的公开错误，允许界面区分撤权与可安全重试的失败。 */
export class ProductRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ReportRow {
  payload?: TaskReport;
}

interface UsageBucket {
  records: number;
  requestCount: number | null;
  providerUnits: number | null;
  verifiedCost: number | null;
  currencies: Record<string, number>;
  unknown: { requestCount: number; providerUnits: number; verifiedCost: number };
}

/** 只携带经验证的当前会话，产品数据与管理调用使用各自固定入口。 */
export class ProductClient {
  constructor(private readonly authorize: ProductAuthorizer) {}

  authorization(): Promise<ProductAuthorization> {
    return this.authorize();
  }

  /** 普通产品资料使用当前 JWT 调用受保护 RPC。 */
  async adminProfile(): Promise<AdminProfile> {
    const access = await this.authorize();
    return parseAdminProfile(await this.remote(access, '/rpc/media_admin_profile', {}), access.userId);
  }

  /** 修改自己的名称，版本和请求标识由数据库原子校验。 */
  async saveAdminProfile(name: string, revision: number, requestId: string): Promise<AdminProfile> {
    const displayName = normalizeDisplayName(name);
    const access = await this.authorize();
    const value = await this.remote(access, '/rpc/media_admin_update_profile', {
      p_display_name: displayName, p_expected_revision: revision, p_request_id: requestId
    });
    const confirmed = parseAdminProfile(value, access.userId);
    if (confirmed.displayName !== displayName || confirmed.revision !== revision + 1)
      throw new Error('账户资料保存回执不匹配。');
    return confirmed;
  }

  /** Auth 系统字段只通过服务端白名单返回。 */
  async adminAccountIdentity(): Promise<AdminAccountIdentity> {
    const access = await this.authorize();
    return parseAccountIdentity(await this.admin('account'), access.userId);
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

  /** 同步管理只访问当前已验证项目，不通过其他目标转存。 */
  async manageSync(operation: 'status' | 'export' | 'delete', requestId?: string): Promise<unknown> {
    const access = await this.authorize();
    const path =
      operation === 'delete' ? 'media_delete_remote_metadata'
      : operation === 'export' ? 'media_export_sync'
      : 'media_sync_status';
    return this.remote(access, `/rpc/${path}`, operation === 'delete' ? { p_request_id: requestId } : {});
  }

  async pushConfigCommit(envelope: MediaConfigCommitEnvelope): Promise<void> {
    const access = await this.authorize();
    const commit = {
      id: envelope.commit.id,
      workspace_id: envelope.commit.workspaceId,
      branch_id: envelope.commit.branchId,
      parent_ids: envelope.commit.parentIds,
      author_id: envelope.commit.authorId,
      message: envelope.commit.message,
      operation_id: envelope.commit.operationId,
      content_fingerprint: envelope.commit.contentFingerprint,
      status: envelope.commit.status
    };
    await this.remote(access, '/media_config_commits?on_conflict=workspace_id%2Coperation_id', commit, {
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }
    });
    await this.remote(access, '/media_config_commit_changes?on_conflict=commit_id%2Csequence', envelope.changes.map(change => ({
      id: change.id,
      commit_id: envelope.commit.id,
      sequence: change.sequence,
      entity: change.entity,
      entity_id: change.entityId,
      operation: change.operation,
      patch: change.patch,
      inverse_patch: change.inversePatch,
      expected_revision: change.expectedRevision,
      content_fingerprint: change.contentFingerprint
    })), {
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }
    });
    await this.remote(
      access,
      `/media_config_commits?id=eq.${encodeURIComponent(envelope.commit.id)}&status=eq.prepared`,
      { status: 'synced' },
      { method: 'PATCH', headers: { Prefer: 'return=minimal' } }
    );
  }

  async applyConfigCommit(commitId: string, operationId: string): Promise<unknown> {
    const access = await this.authorize();
    return this.remote(access, '/rpc/apply_media_config_commit', {
      p_commit_id: commitId,
      p_operation_id: operationId
    });
  }

  async rollbackConfigCommit(commitId: string, operationId: string): Promise<unknown> {
    const access = await this.authorize();
    return this.remote(access, '/rpc/rollback_media_config_commit', {
      p_commit_id: commitId,
      p_operation_id: operationId
    });
  }

  async latestConfigCommit(workspaceId: string): Promise<RemoteConfigCommitStatus | null> {
    const access = await this.authorize();
    const rows = await this.remote(
      access,
      `/media_config_commits?select=id,workspace_id,branch_id,parent_ids,author_id,operation_id,status,created_at,applied_at,released_at,rejection_code&workspace_id=eq.${encodeURIComponent(workspaceId)}&order=created_at.desc&limit=1`
    );
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('配置提交状态不可读。');
    if (!rows.length) return null;
    return parseConfigCommitStatus(rows[0]);
  }

  async admin(path: string, method = 'GET', payload?: unknown): Promise<unknown> {
    if (!/^[a-z0-9/?=&,._%:+-]+$/i.test(path) || path.startsWith('/')) throw new Error('管理请求路径无效。');
    const access = await this.authorize();
    const direct = await this.directAdmin(access, path, method, payload);
    if (direct !== undefined) return direct;
    if (access.supabase) {
      const result = await access.supabase.functions.invoke('admin-api', {
        body: { path, method, ...(payload === undefined ? {} : { payload }) },
        headers: { authorization: `Bearer ${access.session.access_token}` }
      });
      if (result.error) {
        const status = result.error.context?.status ?? 502;
        throw new ProductRequestError(status, this.errorMessage(status));
      }
      return result.data;
    }
    return this.request(`${access.config.url}/functions/v1/admin-api`, {
      method: 'POST',
      headers: {
        apikey: access.config.anonKey,
        authorization: `Bearer ${access.session.access_token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ path, method, ...(payload === undefined ? {} : { payload }) })
    });
  }

  private async directAdmin(access: ProductAuthorization, path: string, method: string, payload: unknown): Promise<unknown | undefined> {
    const url = new URL(`https://admin.local/${path}`);
    const route = url.pathname.replace(/^\//, '');
    if (route === 'session' && method === 'GET') {
      const allowed = await this.remote(access, '/rpc/media_admin_authorized', {});
      if (allowed !== true) throw new ProductRequestError(403, this.errorMessage(403));
      return { actorId: access.userId };
    }
    if (route === 'content' && method === 'GET') {
      const [drafts, published] = await Promise.all([
        this.remote(access, '/media_content_drafts?select=kind,key,payload,revision,updated_at&order=kind,key&limit=200'),
        this.remote(access, '/media_public_content?select=kind,key,revision&order=kind,key&limit=200')
      ]);
      return { drafts, published };
    }
    if (route.startsWith('content/')) return this.directContent(access, route, method, payload);
    if (route === 'tasks' && method === 'GET') return this.directReports(access, path, false);
    if (route === 'usage' && method === 'GET') return this.directReports(access, path, true);
    return undefined;
  }

  private async directContent(access: ProductAuthorization, route: string, method: string, payload: unknown): Promise<unknown> {
    const match = /^content\/(template|provider-policy)\/([a-z][a-z0-9-]{0,59})(?:\/(publish|withdraw))?$/.exec(route);
    if (!match) throw new ProductRequestError(404, this.errorMessage(404));
    const [, kind, key, operation] = match;
    const action = operation ?? 'save';
    if ((action === 'save' ? method : 'POST') !== method) throw new ProductRequestError(405, this.errorMessage(405));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ProductRequestError(400, '内容参数无效。');
    const value = payload as Record<string, unknown>;
    if (!Number.isSafeInteger(value['revision']) || typeof value['requestId'] !== 'string')
      throw new ProductRequestError(400, '内容版本无效。');
    const result = await this.remote(access, '/rpc/media_admin_content_self', {
      p_kind: kind,
      p_key: key,
      p_action: action,
      p_revision: value['revision'],
      p_request_id: value['requestId'],
      p_payload: action === 'save' ? value['payload'] : null
    });
    return { content: result, state: action === 'publish' ? 'active' : action === 'withdraw' ? 'withdrawn' : 'draft' };
  }

  private async directReports(access: ProductAuthorization, path: string, usage: boolean): Promise<unknown> {
    const url = new URL(`https://admin.local/${path}`);
    const query = new URLSearchParams({
      select: 'id,owner_id,workspace_id,task_id,model,channel,status,started_at,payload,received_at',
      order: 'started_at.desc,id',
      limit: '100'
    });
    for (const [name, column] of Object.entries({
      userId: 'owner_id',
      model: 'model',
      channel: 'channel',
      status: 'status'
    })) {
      const value = url.searchParams.get(name);
      if (value) query.set(column, `eq.${value}`);
    }
    const from = reportDate(url.searchParams.get('from'));
    const to = reportDate(url.searchParams.get('to'));
    if (from && to && from >= to) throw new ProductRequestError(400, '起始时间必须早于结束时间。');
    if (from) query.append('started_at', `gte.${from}`);
    if (to) query.append('started_at', `lt.${to}`);
    const page = Number(url.searchParams.get('page') ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * 100))
      throw new ProductRequestError(400, '任务页码无效。');
    if (usage) return this.readUsage(access, query);
    query.set('offset', String((page - 1) * 100));
    return { reports: await this.reportRows(access, query), limit: 100 };
  }

  private async reportRows(access: ProductAuthorization, query: URLSearchParams): Promise<ReportRow[]> {
    const rows = await this.remote(access, `/media_task_reports?${query}`);
    if (!Array.isArray(rows)) throw new Error('任务报表不可读。');
    return rows as ReportRow[];
  }

  private async readUsage(access: ProductAuthorization, query: URLSearchParams): Promise<unknown> {
    const rows: ReportRow[] = [];
    while (rows.length < 10000) {
      query.set('offset', String(rows.length));
      const batch = await this.reportRows(access, query);
      rows.push(...batch);
      if (batch.length < 100) return this.usage(rows, false);
    }
    query.set('offset', '10000');
    query.set('limit', '1');
    const extra = await this.reportRows(access, query);
    return this.usage(rows, extra.length > 0);
  }

  private usage(rows: ReportRow[], partial: boolean): unknown {
    const sources: Record<string, UsageBucket> = Object.fromEntries(
      ['application', 'provider', 'verified'].map(source => [source, {
        records: 0,
        requestCount: null,
        providerUnits: null,
        verifiedCost: null,
        currencies: {},
        unknown: { requestCount: 0, providerUnits: 0, verifiedCost: 0 }
      }])
    );
    for (const row of rows) {
      if (!row.payload || typeof row.payload.source !== 'string' || !sources[row.payload.source]) throw new Error('用量来源不可识别。');
      const bucket = sources[row.payload.source];
      bucket.records++;
      for (const key of ['requestCount', 'providerUnits'] as const) {
        const value = row.payload[key];
        if (value === null) bucket.unknown[key]++;
        else if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
        else throw new Error('用量数据无效。');
      }
      if (row.payload.verifiedCost === null) bucket.unknown.verifiedCost++;
      else if (typeof row.payload.verifiedCost === 'number' && Number.isFinite(row.payload.verifiedCost) && row.payload.currency) {
        bucket.currencies[row.payload.currency] = (bucket.currencies[row.payload.currency] ?? 0) + row.payload.verifiedCost;
      } else throw new Error('用量数据无效。');
    }
    for (const bucket of Object.values(sources))
      if (Object.keys(bucket.currencies).length === 1) bucket.verifiedCost = Object.values(bucket.currencies)[0];
    return { sources, partial, receivedRecords: rows.length };
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

  private remote(
    access: ProductAuthorization,
    path: string,
    payload?: unknown,
    options: { method?: 'GET' | 'POST' | 'PATCH'; headers?: Record<string, string> } = {}
  ): Promise<unknown> {
    return this.request(`${access.config.url}/rest/v1${path}`, {
      method: options.method ?? (payload === undefined ? 'GET' : 'POST'),
      headers: {
        apikey: access.config.anonKey,
        authorization: `Bearer ${access.session.access_token}`,
        'content-type': 'application/json',
        ...options.headers
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
    if (!result.ok) throw new ProductRequestError(result.status, this.errorMessage(result.status));
    const body = await result.text();
    return body ? JSON.parse(body) as unknown : null;

  }

  private errorMessage(status: number): string {
    return status === 401 || status === 403 ? '账号或权限已失效，远程操作已暂停。'
      : status === 402 ? '可用积分不足，请查看当前余额。'
      : status === 409 ? '数据版本已变化，请重试。'
      : status === 405 ? '当前操作不被支持。'
      : '产品服务暂不可用，原数据保留。';
  }
}

function parseConfigCommitStatus(value: unknown): RemoteConfigCommitStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置提交状态回执无效。');
  const row = value as Record<string, unknown>;
  const strings = ['id', 'workspace_id', 'branch_id', 'author_id', 'operation_id', 'created_at'] as const;
  for (const key of strings) if (typeof row[key] !== 'string' || row[key].length === 0) throw new Error('配置提交状态回执无效。');
  if (!Array.isArray(row['parent_ids']) || row['parent_ids'].some(parent => typeof parent !== 'string')) throw new Error('配置提交父提交无效。');
  if (!['prepared', 'synced', 'validated', 'applied', 'released', 'rejected'].includes(String(row['status']))) throw new Error('配置提交状态无效。');
  const nullableString = (key: 'applied_at' | 'released_at' | 'rejection_code'): string | null => {
    const value = row[key];
    if (value !== null && value !== undefined && typeof value !== 'string') throw new Error('配置提交状态回执无效。');
    return value ?? null;
  };
  return {
    id: row['id'] as string,
    workspaceId: row['workspace_id'] as string,
    branchId: row['branch_id'] as string,
    parentIds: [...(row['parent_ids'] as string[])],
    authorId: row['author_id'] as string,
    operationId: row['operation_id'] as string,
    status: row['status'] as MediaConfigCommitStatus,
    createdAt: row['created_at'] as string,
    appliedAt: nullableString('applied_at'),
    releasedAt: nullableString('released_at'),
    rejectionCode: nullableString('rejection_code')
  };
}

function reportDate(value: string | null): string | null {
  if (!value) return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match) throw new ProductRequestError(400, '请选择有效的带时区时间。');
  const [, year, month, day, hour, minute, second = '0'] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    throw new ProductRequestError(400, '日期或时间无效。');
  return new Date(value).toISOString();
}
