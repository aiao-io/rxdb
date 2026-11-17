import {
  CollaborationError,
  demand,
  type AuditPage,
  type AuditQuery,
  type Candidate,
  type Command,
  type CommitContent,
  type CommitPage,
  type HistoryQuery,
  type SchemaManifest,
  type SharedRecords,
  type WorkspaceSummary
} from '../model.js';
import { parseSchemaManifest } from '../schema.js';
/** 一个可访问的团队与应用；`name` 是展示名。 */
export type WorkspaceEntry = { teamId: string; appId: string; name: string };
/** 把查询条件里已设置的参数拼成查询串（含前导 `?`）；没有参数时为空串。 */
function search(query: AuditQuery | HistoryQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
}
/**
 * 协作 HTTP 接口的客户端。除公开配置外，每次请求都先向 `token` 取一次最新会话令牌；
 * 取令牌期间 `context` 的返回值变化（账号或团队已切换）则放弃请求，避免用旧上下文发出新请求。
 */
export class CollaborationApi {
  /**
   * @param base 接口路径前缀。
   * @param token 返回当前会话的访问令牌；会话失效时应抛出。
   * @param context 返回当前上下文的标识，用于发现取令牌期间账号或团队已切换。
   */
  constructor(
    readonly base: string,
    private readonly token: () => Promise<string>,
    private readonly context: () => unknown = () => undefined
  ) {}
  /** 读取公开配置（Supabase 地址与公开密钥），无需登录。 */
  async config() {
    return this.request<{ supabaseUrl: string; supabaseKey: string }>('/config', false);
  }
  /** 列出当前账号可访问的团队与应用。 */
  async workspaces() {
    return this.request<WorkspaceEntry[]>('/workspaces');
  }
  /** 读取工作区摘要，只包含当前用户可见的元数据；提交与候选的记录、共享数据和更早的审计需按需读取。 */
  async snapshot(context: WorkspaceEntry) {
    return this.request<WorkspaceSummary>(this.path(context));
  }
  /** 读取共享分支当前的全部记录；返回的 `head` 与摘要的 `head` 一致时才与摘要匹配。 */
  async records(context: WorkspaceEntry) {
    return this.request<SharedRecords>(`${this.path(context)}/records`);
  }
  /** 读取一个提交的完整内容；提交不可变，可按 ID 长期缓存。 */
  async commit(context: WorkspaceEntry, id: string) {
    return this.request<CommitContent>(`${this.path(context)}/commits/${encodeURIComponent(id)}`);
  }
  /** 读取一个合并候选的完整内容；候选不可变，可按 ID 长期缓存。 */
  async candidate(context: WorkspaceEntry, id: string) {
    return this.request<Candidate>(`${this.path(context)}/candidates/${encodeURIComponent(id)}`);
  }
  /** 按版本读取工作区登记过的数据模式清单并严格解析；清单只追加、不可修改，可按版本长期缓存。 */
  async schema(context: WorkspaceEntry, version: number): Promise<SchemaManifest> {
    return parseSchemaManifest(await this.request<unknown>(`${this.path(context)}/schemas/${version}`));
  }
  /** 读取审计事件的一页，按时间从新到旧；只带已设置的筛选与分页参数。 */
  async audit(context: WorkspaceEntry, query: AuditQuery = {}) {
    return this.request<AuditPage>(`${this.path(context)}/audit${search(query)}`);
  }
  /**
   * 读取提交历史的一页（从新到旧，只含元数据）：共享分支、某个任务分支或某个 PR 的来源任务三者取一；
   * 接着上一页读时把它的 `nextBefore` 作为 `before`。只带已设置的参数。
   */
  async history(context: WorkspaceEntry, query: HistoryQuery) {
    return this.request<CommitPage>(`${this.path(context)}/history${search(query)}`);
  }
  /** 提交一条命令。响应不是 JSON 时按「结果不确定」报错，调用方可用原幂等键查询回执或重试。 */
  async command(context: WorkspaceEntry, command: Command) {
    return this.request<Record<string, unknown>>(`${this.path(context)}/commands`, true, command);
  }
  /** 查询某个幂等键是否已被服务端接受，用于确认结果不确定的请求。 */
  async receipt(context: WorkspaceEntry, operationId: string) {
    return this.request<{ status: 'accepted' | 'unknown'; value?: Record<string, unknown> }>(
      `${this.path(context)}/receipts/${encodeURIComponent(operationId)}`
    );
  }
  private path(context: WorkspaceEntry) {
    return `/workspaces/${encodeURIComponent(context.teamId)}/${encodeURIComponent(context.appId)}`;
  }
  private async request<T>(path: string, authenticated = true, command?: Command): Promise<T> {
    const context = this.context();
    const headers: Record<string, string> = {};
    if (authenticated) headers['Authorization'] = `Bearer ${await this.token()}`;
    demand(context === this.context(), 'cancelled', '上下文已切换');
    if (command) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${this.base}${path}`, {
      method: command ? 'POST' : 'GET',
      headers,
      body: command ? JSON.stringify(command) : undefined,
      cache: 'no-store'
    });
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new CollaborationError(
        command ? 'uncertain' : 'configuration',
        command ? '请求结果不确定，请确认或重试原请求' : '团队协作服务尚未配置或响应格式不正确'
      );
    const result = (await response.json()) as { error?: string; message?: string; details?: Record<string, unknown> };
    if (!response.ok)
      throw new CollaborationError(result.error ?? 'http', result.message ?? '请求失败', result.details);
    return result as T;
  }
}
