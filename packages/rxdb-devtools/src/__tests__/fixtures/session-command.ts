import { vi } from 'vitest';

/** 与连接器 `SESSION_REQUIRED_COMMAND` 对齐：这些命令必须回显握手令牌。 */
export const SESSION_REQUIRED_COMMANDS = new Set([
  'INSPECT_DB',
  'QUERY_ENTITY',
  'GET_BRANCHES',
  'SWITCH_BRANCH',
  'CREATE_BRANCH',
  'DELETE_BRANCH',
  'DISCONNECT_RXDB'
]);

let lastSessionToken: string | undefined;
let autoAttachSession = true;

/** 每个用例开始前清掉令牌缓存，避免跨用例串扰。 */
export function resetSessionFixture(): void {
  lastSessionToken = undefined;
  autoAttachSession = true;
}

/**
 * 监听 `postMessage` 的同时缓存 HANDSHAKE.payload.sessionToken。
 *
 * `mockClear()` 只清调用记录，不丢令牌。
 */
export function createPostMessageSpy(): ReturnType<typeof vi.fn> {
  return vi.fn((message: { type?: string; payload?: { sessionToken?: unknown } }) => {
    if (message?.type === 'HANDSHAKE' && typeof message.payload?.sessionToken === 'string') {
      lastSessionToken = message.payload.sessionToken;
    }
  });
}

/** 给已注册的 message listener 补上握手令牌，调用点不用逐条改。 */
export function wrapMessageListener(listener: EventListener): EventListener {
  return (event: Event) => {
    const messageEvent = event as MessageEvent;
    const data = messageEvent.data;
    if (!autoAttachSession || !isRecord(data) || !SESSION_REQUIRED_COMMANDS.has(String(data['type']))) {
      listener.call(window, messageEvent);
      return;
    }
    if (Object.hasOwn(data, 'session') || !lastSessionToken) {
      listener.call(window, messageEvent);
      return;
    }
    listener.call(window, {
      source: messageEvent.source,
      origin: messageEvent.origin,
      data: { ...data, session: lastSessionToken }
    } as MessageEvent);
  };
}

/** 临时关闭自动贴令牌，用来测「缺 session 静默丢弃」。 */
export function withoutSession(run: () => void): void {
  autoAttachSession = false;
  try {
    run();
  } finally {
    autoAttachSession = true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
