import { CollaborationError, demand, type Command } from '../model.js';
import type { WorkspaceSnapshot } from '../server/engine.js';
export type WorkspaceEntry = { teamId: string; appId: string; name: string };
export class CollaborationApi {
  constructor(
    readonly base: string,
    private readonly token: () => Promise<string>,
    private readonly context: () => unknown = () => undefined
  ) {}
  async config() {
    return this.request<{ supabaseUrl: string; supabaseKey: string }>('/config', false);
  }
  async workspaces() {
    return this.request<WorkspaceEntry[]>('/workspaces');
  }
  async snapshot(context: WorkspaceEntry) {
    return this.request<WorkspaceSnapshot>(this.path(context));
  }
  async command(context: WorkspaceEntry, command: Command) {
    return this.request<Record<string, unknown>>(`${this.path(context)}/commands`, true, command);
  }
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
      throw new CollaborationError('configuration', '团队协作服务尚未配置或响应格式不正确');
    const result = (await response.json()) as { error?: string; message?: string; details?: Record<string, unknown> };
    if (!response.ok)
      throw new CollaborationError(result.error ?? 'http', result.message ?? '请求失败', result.details);
    return result as T;
  }
}
