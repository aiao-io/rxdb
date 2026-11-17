import { CollaborationError, demand, type Command } from '../model.js';
import type { WorkspaceEntry } from '../reader.js';

export type { WorkspaceEntry } from '../reader.js';

/**
 * 协作命令入口的 HTTP 客户端：只有公开配置与命令两个接口，读取一律经 Supabase 的只读投影（见 `reader.ts`）。
 * 命令请求先向 `token` 取一次最新会话令牌（服务端本地验签）；取令牌期间 `context` 的返回值变化（账号或团队已切换）则放弃请求，
 * 避免用旧上下文发出新请求。
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
  /** 提交一条命令。响应不是 JSON 时按「结果不确定」报错，调用方可用原幂等键查询回执或重试。 */
  async command(context: WorkspaceEntry, command: Command) {
    return this.request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(context.teamId)}/${encodeURIComponent(context.appId)}/commands`,
      true,
      command
    );
  }
  private async request<T>(path: string, authenticated: boolean, command?: Command): Promise<T> {
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
