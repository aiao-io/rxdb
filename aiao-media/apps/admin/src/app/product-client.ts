import { validateTaskReport, type TaskReport } from '@aiao-media/api-contracts';
import {
  MEDIA_CONFIG_COMMIT_STATUSES,
  type MediaConfigCommitEnvelope,
  type MediaConfigCommitStatus
} from '@aiao-media/domain';
import type { AdminSupabaseClient } from './admin-auth';
import {
  normalizeDisplayName,
  parseAccountIdentity,
  parseAdminProfile,
  type AdminAccountIdentity,
  type AdminProfile
} from './admin-profile';

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
  hasTemplateChanges?: boolean;
  id: string;
  workspaceId: string;
  branchId: string;
  parentIds: string[];
  authorId: string;
  message: string;
  operationId: string;
  status: MediaConfigCommitStatus;
  createdAt: string;
  appliedAt: string | null;
  releasedAt: string | null;
  rejectionCode: string | null;
}
/** 远端投影完整度：补偿扫描据此判断是否需要续写变更或标记 synced。 */
export interface RemoteConfigProjection {
  status: MediaConfigCommitStatus;
  changeCount: number;
  receivedChanges: number;
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
      p_display_name: displayName,
      p_expected_revision: revision,
      p_request_id: requestId
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

  /**
   * 把领域投影写入 RxDB 形状的投影表：先以 prepared 幂等插入提交与变更，再把仍是 prepared 的提交标记为 synced。
   *
   * @remarks
   * 服务端触发器只接受客户端写 prepared、在变更到齐后改 synced；其余状态只由应用 / 回滚 RPC 推进。
   * 重放时已存在的行被忽略，已同步的提交不会被 PATCH 命中。
   */
  async pushConfigCommit(envelope: MediaConfigCommitEnvelope): Promise<void> {
    const access = await this.authorize();
    const author = envelope.commit.authorId;
    const commit = {
      id: envelope.commit.id,
      workspaceId: envelope.commit.workspaceId,
      branchId: envelope.commit.branchId,
      parentIds: envelope.commit.parentIds,
      authorId: author,
      message: envelope.commit.message,
      operationId: envelope.commit.operationId,
      contentFingerprint: envelope.commit.contentFingerprint,
      changeCount: envelope.commit.changeCount,
      status: 'prepared',
      createdBy: author,
      updatedBy: author
    };
    const ignoreDuplicates = { headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } };
    await this.remote(access, '/media_config_projection_commits?on_conflict=id', commit, ignoreDuplicates);
    await this.remote(
      access,
      '/media_config_projection_changes?on_conflict=id',
      envelope.changes.map(change => ({
        id: change.id,
        workspaceId: envelope.commit.workspaceId,
        commitId: envelope.commit.id,
        sequence: change.sequence,
        entity: change.entity,
        entityId: change.entityId,
        operation: change.operation,
        patch: change.patch,
        inversePatch: change.inversePatch,
        expectedRevision: change.expectedRevision,
        contentFingerprint: change.contentFingerprint,
        createdBy: author,
        updatedBy: author
      })),
      ignoreDuplicates
    );
    await this.remote(
      access,
      `/media_config_projection_commits?id=eq.${encodeURIComponent(envelope.commit.id)}&status=eq.prepared`,
      { status: 'synced' },
      { method: 'PATCH', headers: { Prefer: 'return=minimal' } }
    );
  }

  /** 读取远端投影的完整度：提交状态、声明的变更数与实际到达的变更数；提交不存在时为 null。 */
  async configProjection(commitId: string): Promise<RemoteConfigProjection | null> {
    const access = await this.authorize();
    const id = encodeURIComponent(commitId);
    const rows = await this.remote(access, `/media_config_projection_commits?select=id,status,changeCount&id=eq.${id}`);
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('配置提交投影不可读。');
    if (!rows.length) return null;
    const row = rows[0] as Record<string, unknown>;
    if (
      !MEDIA_CONFIG_COMMIT_STATUSES.includes(row['status'] as MediaConfigCommitStatus) ||
      !Number.isSafeInteger(row['changeCount'])
    )
      throw new Error('配置提交投影回执无效。');
    const changes = await this.remote(access, `/media_config_projection_changes?select=id&commitId=eq.${id}`);
    if (!Array.isArray(changes)) throw new Error('配置提交变更不可读。');
    return {
      status: row['status'] as MediaConfigCommitStatus,
      changeCount: row['changeCount'] as number,
      receivedChanges: changes.length
    };
  }

  async applyConfigCommit(commitId: string, operationId: string): Promise<unknown> {
    const access = await this.authorize();
    return this.remote(access, '/rpc/apply_media_config_commit', {
      p_commit_id: commitId,
      p_operation_id: operationId
    });
  }

  async releaseTemplateCommit(commitId: string): Promise<void> {
    const access = await this.authorize();
    await this.remote(access, '/rpc/release_media_template_commit', { p_commit_id: commitId });
  }

  async rollbackConfigCommit(commitId: string, operationId: string): Promise<unknown> {
    const access = await this.authorize();
    return this.remote(access, '/rpc/rollback_media_config_commit', {
      p_commit_id: commitId,
      p_operation_id: operationId
    });
  }

  async pendingTemplateCommits(workspaceId: string): Promise<{ id: string; message: string }[]> {
    const access = await this.authorize();
    const commits: { id: string; message: string }[] = [];
    let cursor = '';
    for (;;) {
      const rows = await this.remote(
        access,
        `/media_config_projection_commits?select=id,message,templates:media_config_projection_changes!inner(entity)&templates.entity=eq.MediaPromptTemplate&templates.limit=1&workspaceId=eq.${encodeURIComponent(workspaceId)}&branchId=eq.main&status=eq.applied&releasedAt=is.null&order=id.desc&limit=100${cursor}`
      );
      if (!Array.isArray(rows)) throw new Error('待发布模板提交不可读。');
      for (const row of rows) {
        if (typeof row?.id !== 'string' || typeof row.message !== 'string') throw new Error('待发布模板提交不可读。');
        commits.push({ id: row.id, message: row.message });
      }
      if (rows.length < 100) return commits;
      cursor = '&id=lt.' + encodeURIComponent(commits[commits.length - 1].id);
    }
  }

  async latestConfigCommit(workspaceId: string, branchId = 'main'): Promise<RemoteConfigCommitStatus | null> {
    const access = await this.authorize();
    const rows = await this.remote(
      access,
      `/media_config_projection_commits?select=id,workspaceId,branchId,parentIds,authorId,message,operationId,status,createdAt,appliedAt,releasedAt,rejectionCode,templates:media_config_projection_changes(entity)&templates.entity=eq.MediaPromptTemplate&templates.limit=1&workspaceId=eq.${encodeURIComponent(workspaceId)}&branchId=eq.${encodeURIComponent(branchId)}&order=createdAt.desc&limit=1`
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

  private async directAdmin(
    access: ProductAuthorization,
    path: string,
    method: string,
    payload: unknown
  ): Promise<unknown | undefined> {
    const url = new URL(`https://admin.local/${path}`);
    const route = url.pathname.replace(/^\//, '');
    if (route === 'session' && method === 'GET') {
      const allowed = await this.remote(access, '/rpc/media_admin_authorized', {});
      if (allowed !== true) throw new ProductRequestError(403, this.errorMessage(403));
      return { actorId: access.userId };
    }
    if (route === 'platform-config' && method === 'GET') {
      return this.remote(access, '/rpc/media_admin_platform_configuration_self_read', {});
    }
    if (route === 'platform-config' && method === 'PUT') {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new ProductRequestError(400, '平台配置请求无效。');
      const value = payload as Record<string, unknown>;
      if (
        !Number.isSafeInteger(value['revision']) ||
        typeof value['requestId'] !== 'string' ||
        !Array.isArray(value['models']) ||
        !Array.isArray(value['capabilities'])
      )
        throw new ProductRequestError(400, '平台配置版本无效。');
      return this.remote(access, '/rpc/media_admin_platform_configuration_self_write', {
        p_revision: value['revision'],
        p_request_id: value['requestId'],
        p_models: value['models'],
        p_capabilities: value['capabilities']
      });
    }
    if (route === 'content' && method === 'GET') {
      const [drafts, published] = await Promise.all([
        this.remote(
          access,
          '/media_content_drafts?select=kind,key,payload,revision,updated_at&order=kind,key&limit=200'
        ),
        this.remote(access, '/media_public_content?select=kind,key,revision&order=kind,key&limit=200')
      ]);
      return { drafts, published };
    }
    if (route.startsWith('content/')) return this.directContent(access, route, method, payload);
    if (route === 'tasks' && method === 'GET') return this.directReports(access, path, false);
    if (route === 'usage' && method === 'GET') return this.directReports(access, path, true);
    return undefined;
  }

  private async directContent(
    access: ProductAuthorization,
    route: string,
    method: string,
    payload: unknown
  ): Promise<unknown> {
    const match = /^content\/(template|provider-policy)\/([a-z][a-z0-9-]{0,59})(?:\/(publish|withdraw))?$/.exec(route);
    if (!match) throw new ProductRequestError(404, this.errorMessage(404));
    const [, kind, key, operation] = match;
    const action = operation ?? 'save';
    if ((action === 'save' ? method : 'POST') !== method) throw new ProductRequestError(405, this.errorMessage(405));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new ProductRequestError(400, '内容参数无效。');
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
    return {
      content: result,
      state:
        action === 'publish' ? 'active'
        : action === 'withdraw' ? 'withdrawn'
        : 'draft'
    };
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
      ['application', 'provider', 'verified'].map(source => [
        source,
        {
          records: 0,
          requestCount: null,
          providerUnits: null,
          verifiedCost: null,
          currencies: {},
          unknown: { requestCount: 0, providerUnits: 0, verifiedCost: 0 }
        }
      ])
    );
    for (const row of rows) {
      if (!row.payload || typeof row.payload.source !== 'string' || !sources[row.payload.source])
        throw new Error('用量来源不可识别。');
      const bucket = sources[row.payload.source];
      bucket.records++;
      for (const key of ['requestCount', 'providerUnits'] as const) {
        const value = row.payload[key];
        if (value === null) bucket.unknown[key]++;
        else if (typeof value === 'number' && Number.isFinite(value)) bucket[key] = (bucket[key] ?? 0) + value;
        else throw new Error('用量数据无效。');
      }
      if (row.payload.verifiedCost === null) bucket.unknown.verifiedCost++;
      else if (
        typeof row.payload.verifiedCost === 'number' &&
        Number.isFinite(row.payload.verifiedCost) &&
        row.payload.currency
      ) {
        bucket.currencies[row.payload.currency] =
          (bucket.currencies[row.payload.currency] ?? 0) + row.payload.verifiedCost;
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
    if (!result.ok) {
      // PostgREST 把 40001 等冲突映射成 5xx；按数据库错误码归为版本冲突，与 Worker 的 product-http 同一口径。
      const status = CONFLICT_CODES.has(await errorCode(result)) ? 409 : result.status;
      throw new ProductRequestError(status, this.errorMessage(status));
    }
    const body = await result.text();
    return body ? (JSON.parse(body) as unknown) : null;
  }

  private errorMessage(status: number): string {
    return (
      status === 401 || status === 403 ? '账号或权限已失效，远程操作已暂停。'
      : status === 402 ? '可用积分不足，请查看当前余额。'
      : status === 409 ? '数据版本已变化，请重试。'
      : status === 405 ? '当前操作不被支持。'
      : status === 400 ? '请求被拒绝：内容无效，或当前状态不允许该操作。'
      : '产品服务暂不可用，原数据保留。'
    );
  }
}

/** 数据库返回的版本冲突类错误码：序列化冲突、唯一约束、检查约束与自定义 409。 */
const CONFLICT_CODES: ReadonlySet<string | null> = new Set(['40001', '23505', '23514', 'PT409']);

/** 读取 PostgREST 错误体里的 SQLSTATE；非 JSON 或缺字段时没有错误码。 */
async function errorCode(response: Response): Promise<string | null> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as unknown;
    return isRecordValue(body) && typeof body['code'] === 'string' ? body['code'] : null;
  } catch {
    return null;
  }
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseConfigCommitStatus(value: unknown): RemoteConfigCommitStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置提交状态回执无效。');
  const row = value as Record<string, unknown>;
  const strings = ['id', 'workspaceId', 'branchId', 'authorId', 'message', 'operationId', 'createdAt'] as const;
  for (const key of strings)
    if (typeof row[key] !== 'string' || row[key].length === 0) throw new Error('配置提交状态回执无效。');
  if (!Array.isArray(row['parentIds']) || row['parentIds'].some(parent => typeof parent !== 'string'))
    throw new Error('配置提交父提交无效。');
  if (!MEDIA_CONFIG_COMMIT_STATUSES.includes(row['status'] as MediaConfigCommitStatus))
    throw new Error('配置提交状态无效。');
  const nullableString = (key: 'appliedAt' | 'releasedAt' | 'rejectionCode'): string | null => {
    const value = row[key];
    if (value !== null && value !== undefined && typeof value !== 'string') throw new Error('配置提交状态回执无效。');
    return value ?? null;
  };
  return {
    id: row['id'] as string,
    workspaceId: row['workspaceId'] as string,
    branchId: row['branchId'] as string,
    parentIds: [...(row['parentIds'] as string[])],
    authorId: row['authorId'] as string,
    message: row['message'] as string,
    operationId: row['operationId'] as string,
    hasTemplateChanges: Array.isArray(row['templates']) && row['templates'].length > 0,
    status: row['status'] as MediaConfigCommitStatus,
    createdAt: row['createdAt'] as string,
    appliedAt: nullableString('appliedAt'),
    releasedAt: nullableString('releasedAt'),
    rejectionCode: nullableString('rejectionCode')
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
