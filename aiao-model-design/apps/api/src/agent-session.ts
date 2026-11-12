/** Worker 签发 Trigger.dev 会话所需的配置，只由 Worker 环境提供。 */
export interface AgentEnvironment {
  TRIGGER_SECRET_KEY?: string;
  TRIGGER_API_URL?: string;
}

/** 智能体任务 ID，与 `agent/model-designer.md` 的 `name` 一致。 */
export const AGENT_TASK = 'model-designer';

const CHAT_ID_PATTERN = /^md-[A-Za-z0-9_-]+$/;
const NO_STORE = { 'cache-control': 'no-store' };

interface AgentConfig {
  apiUrl: string;
  secret: string;
}

function configOf(env: AgentEnvironment): AgentConfig | null {
  const secret = env.TRIGGER_SECRET_KEY?.trim();
  const apiUrl = env.TRIGGER_API_URL?.trim().replace(/\/+$/, '');
  return secret && apiUrl ? { secret, apiUrl } : null;
}

function failure(type: string, message: string, status: number): Response {
  return Response.json({ type, message, status }, { status, headers: NO_STORE });
}

/** 设计器据此决定是否启用 AI 入口，以及会话流连接哪个实例。 */
export function agentConfig(env: AgentEnvironment): Response {
  const config = configOf(env);
  const body = config ? { enabled: true, apiUrl: config.apiUrl, task: AGENT_TASK } : { enabled: false };
  return Response.json(body, { headers: NO_STORE });
}

async function readChatId(request: Request): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null);
  const chatId = typeof body === 'object' && body !== null && 'chatId' in body ? body.chatId : null;
  return typeof chatId === 'string' && CHAT_ID_PATTERN.test(chatId) ? chatId : null;
}

function sessionBody(chatId: string) {
  return {
    type: 'chat.agent',
    externalId: chatId,
    taskIdentifier: AGENT_TASK,
    triggerConfig: { basePayload: { chatId, trigger: 'preload', messages: [] }, tags: [`chat:${chatId}`] }
  };
}

async function createSession(config: AgentConfig, chatId: string): Promise<Response | null> {
  return fetch(`${config.apiUrl}/api/v1/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(sessionBody(chatId)),
    signal: AbortSignal.timeout(10000)
  }).catch(() => null);
}

async function tokenResponse(upstream: Response): Promise<Response> {
  const data: unknown = await upstream.json().catch(() => null);
  const token =
    typeof data === 'object' && data !== null && 'publicAccessToken' in data ? data.publicAccessToken : null;
  if (typeof token !== 'string') return failure('server', 'Agent session service returned no token', 502);
  const pending = typeof data === 'object' && data !== null && 'pendingVersion' in data && data.pendingVersion === true;
  return Response.json(
    { publicAccessToken: token, ...(pending ? { pendingVersion: true } : {}) },
    { headers: NO_STORE }
  );
}

/**
 * 为已登录用户创建或刷新会话令牌。
 *
 * `chatId` 必须以 `md-<用户 ID>-` 开头；同一 `chatId` 重复调用是幂等的，每次都返回新令牌，
 * 所以创建会话与刷新令牌共用这一个入口。浏览器的 `clientData` 不写进会话行，每轮快照走消息元数据。
 */
export async function startAgentSession(request: Request, env: AgentEnvironment, userId: string): Promise<Response> {
  const chatId = await readChatId(request);
  const prefix = `md-${userId}-`;
  if (!chatId || chatId === prefix) return failure('validation', 'Invalid chat id', 400);
  if (!chatId.startsWith(prefix)) return failure('unauthorized', 'Chat belongs to another user', 403);
  const config = configOf(env);
  if (!config) return failure('server', 'Model agent is not configured', 503);
  const upstream = await createSession(config, chatId);
  if (upstream?.status === 409) return failure('conflict', 'Agent session is closed', 409);
  if (!upstream?.ok) return failure('server', 'Agent session service is unavailable', 502);
  return tokenResponse(upstream);
}
