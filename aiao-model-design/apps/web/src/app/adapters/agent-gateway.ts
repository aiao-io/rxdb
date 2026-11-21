import type { AgentConfig, AgentGateway } from '../model-designer/interfaces/designer.interface';

/** 网关请求失败，保留 HTTP 状态码与 Worker 返回的说明。 */
export class AgentGatewayError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function failure(response: Response): Promise<AgentGatewayError> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string' ?
      body.message
    : `Agent gateway request failed (${response.status})`;
  return new AgentGatewayError(response.status, message);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

/** 通过同源 Worker 的 `/api/agent/*` 与 `/bff/auth/session` 实现的智能体网关。 */
export class HttpAgentGateway implements AgentGateway {
  readonly #fetch: typeof fetch;

  constructor(fetcher: typeof fetch = fetch.bind(globalThis)) {
    this.#fetch = fetcher;
  }

  async config(): Promise<AgentConfig> {
    return readJson<AgentConfig>(await this.#fetch('/api/agent/config', { credentials: 'include' }));
  }

  async currentUserId(): Promise<string | null> {
    const body = await readJson<{ user: { id: string } | null }>(
      await this.#fetch('/bff/auth/session', { credentials: 'include' })
    );
    return body.user?.id ?? null;
  }

  async session(chatId: string): Promise<{ publicAccessToken: string }> {
    const response = await this.#fetch('/api/agent/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chatId })
    });
    const body = await readJson<{ publicAccessToken?: unknown }>(response);
    if (typeof body.publicAccessToken !== 'string') throw new AgentGatewayError(502, 'Agent session token is missing');
    return { publicAccessToken: body.publicAccessToken };
  }
}
