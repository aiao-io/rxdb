import { CollaborationError, demand, type Command } from '../model.js';
import type { WorkspaceEntry } from '../reader.js';

export type { WorkspaceEntry } from '../reader.js';

/**
 * 命令入口暂时不可用时的自动重试：最多发送 {@link retryPolicy.attempts} 次（首次加三次重发），每次等待服务端 `Retry-After` 给出的秒数，
 * 没有给出时按 0.5、1、2 秒退避；单次等待不超过 {@link retryPolicy.maxDelayMs}。重发的是同一个请求、同一个幂等键，
 * 服务端按回执保证同一操作只执行一次。
 */
export const retryPolicy = { attempts: 4, baseDelayMs: 500, maxDelayMs: 10_000 };
/**
 * 可重试的响应：本服务的 503 `unavailable`（连接池耗尽、数据库超时等），以及 Supabase Edge Function 平台的冷启动失败
 * （503 BOOT_ERROR）、网关超时（504）与资源上限（546 WORKER_LIMIT）。其余失败（含结果不确定的 502）只发一次。
 */
const retryableStatuses = new Set([503, 504, 546]);
const unavailableMessage = '服务暂时不可用，请稍后按原请求重试';

/** 这次可重试失败之后应等待的毫秒数：优先服务端的 `Retry-After`（秒），否则指数退避。 */
function retryDelay(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'));
  const delay = Number.isFinite(header) && header > 0 ? header * 1000 : retryPolicy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(delay, retryPolicy.maxDelayMs);
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * 协作命令入口的 HTTP 客户端：只有公开配置与命令两个接口，读取一律经 Supabase 的只读投影（见 `reader.ts`）。
 * 命令请求先向 `token` 取一次最新会话令牌（服务端本地验签）；取令牌期间 `context` 的返回值变化（账号或团队已切换）则放弃请求，
 * 避免用旧上下文发出新请求。命令入口暂时不可用（冷启动失败、超时、连接池耗尽）时按 {@link retryPolicy} 用同一个请求自动重发。
 */
export class CollaborationApi {
  /**
   * @param base 接口路径前缀（同源路径，或 Edge Function 的完整地址）。
   * @param token 返回当前会话的访问令牌；会话失效时应抛出。
   * @param context 返回当前上下文的标识，用于发现取令牌或等待重试期间账号或团队已切换。
   * @param wait 重试前的等待，默认按毫秒计时；测试可注入。
   */
  constructor(
    readonly base: string,
    private readonly token: () => Promise<string>,
    private readonly context: () => unknown = () => undefined,
    private readonly wait: (ms: number) => Promise<void> = sleep
  ) {}
  /** 读取公开配置（Supabase 地址与公开密钥），无需登录。 */
  async config() {
    return this.request<{ supabaseUrl: string; supabaseKey: string }>('/config', false);
  }
  /**
   * 提交一条命令。命令入口暂时不可用时自动用同一个请求重发；重发用尽仍不可用时抛出 `unavailable`。
   * 响应不是 JSON 时按「结果不确定」报错，调用方可用原幂等键查询回执或重试。
   */
  async command(context: WorkspaceEntry, command: Command) {
    return this.request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(context.teamId)}/${encodeURIComponent(context.appId)}/commands`,
      true,
      command
    );
  }
  private async request<T>(path: string, authenticated: boolean, command?: Command): Promise<T> {
    const context = this.context();
    for (let attempt = 1; ; attempt++) {
      const response = await this.send(path, authenticated, context, command);
      const exhausted = attempt >= retryPolicy.attempts;
      if (!retryableStatuses.has(response.status)) return this.parse<T>(response, command);
      if (exhausted) return this.unavailable(response);
      await this.wait(retryDelay(response, attempt));
      demand(context === this.context(), 'cancelled', '上下文已切换');
    }
  }
  private async send(path: string, authenticated: boolean, context: unknown, command?: Command): Promise<Response> {
    const headers: Record<string, string> = {};
    if (authenticated) headers['Authorization'] = `Bearer ${await this.token()}`;
    demand(context === this.context(), 'cancelled', '上下文已切换');
    if (command) headers['Content-Type'] = 'application/json';
    return fetch(`${this.base}${path}`, {
      method: command ? 'POST' : 'GET',
      headers,
      body: command ? JSON.stringify(command) : undefined,
      cache: 'no-store'
    });
  }
  private async parse<T>(response: Response, command?: Command): Promise<T> {
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new CollaborationError(
        command ? 'uncertain' : 'configuration',
        command ? '请求结果不确定，请确认或重试原请求' : '团队协作服务尚未配置或响应格式不正确'
      );
    const result = (await response.json()) as { error?: string; message?: string; details?: Record<string, unknown> };
    // 平台层（网关、Edge Runtime）的 JSON 错误不是本服务的格式，消息不在词条表里，统一显示「请求失败」
    if (!response.ok)
      throw new CollaborationError(
        result.error ?? 'http',
        result.error ? (result.message ?? '请求失败') : '请求失败',
        result.details
      );
    return result as T;
  }
  /** 重发用尽仍不可用：本服务的 `unavailable` 原样抛出，平台层的失败统一为同一个稳定错误码。 */
  private async unavailable(response: Response): Promise<never> {
    const result =
      response.headers.get('content-type')?.includes('application/json') ?
        ((await response.json()) as { error?: unknown; message?: unknown; details?: Record<string, unknown> })
      : {};
    if (result.error === 'unavailable' && typeof result.message === 'string')
      throw new CollaborationError('unavailable', result.message, result.details);
    throw new CollaborationError('unavailable', unavailableMessage);
  }
}
