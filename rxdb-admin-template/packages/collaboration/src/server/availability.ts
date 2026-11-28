import { CollaborationError } from '../model.js';

/**
 * 命令入口暂时不可用的原因：连接池耗尽（取不到连接、连接池排队超时、数据库连接数用尽）、连接中断、数据库超时
 * （语句超时、等锁超时、事务空闲超时）、并发冲突在服务端重试用尽。它们都与请求内容无关，客户端隔一会儿用同一个幂等键重发即可，
 * 服务端按回执保证同一操作只执行一次。
 */
export type UnavailableReason = 'pool' | 'connection' | 'timeout' | 'conflict';

/** 每种原因建议客户端等待的秒数（503 的 `Retry-After`）。 */
const retryAfter: Record<UnavailableReason, number> = { pool: 1, connection: 2, timeout: 2, conflict: 1 };
/** 套接字层的连接失败（Node 与 Deno 的 node 兼容层同样的错误码）。 */
const socketCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH'
]);
/** 超时类 SQLSTATE：语句超时（57014）、等锁超时（55P03）、事务空闲超时（25P03）。 */
const timeoutStates = new Set(['57014', '55P03', '25P03']);
/** 数据库正在关闭或重启：57P01 / 57P02 / 57P03。 */
const shutdownStates = new Set(['57P01', '57P02', '57P03']);
/** pg-pool 取连接超时的错误消息（pg-pool 不给错误码，只能按消息识别）。 */
const poolTimeout = 'timeout exceeded when trying to connect';
/** PgBouncer 在 transaction 模式下排队等服务端连接超时（SQLSTATE 08P01）。 */
const poolQueueTimeout = 'query_wait_timeout';
/**
 * Supavisor 的连接池错误：SQLSTATE 多为 XX000，错误消息里带括号码——取连接排队超时（ECHECKOUTTIMEOUT）与客户端连接数用尽
 * （EMAXCONN…，「max clients reached」）。本机没有 Supavisor，按 Supabase 文档里的错误消息识别。
 */
const supavisorPool = /ECHECKOUTTIMEOUT|EMAXCONN|max clients reached|unable to check out/i;

/** PostgreSQL 返回的错误（pg 的 DatabaseError）：带严重级别与五位 SQLSTATE。 */
function sqlState(error: Error): string | undefined {
  const { code, severity } = error as Error & { code?: unknown; severity?: unknown };
  return typeof severity === 'string' && typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
}
function stateReason(state: string, message: string): UnavailableReason | undefined {
  if (timeoutStates.has(state)) return 'timeout';
  if (state === '53300' || message === poolQueueTimeout || supavisorPool.test(message)) return 'pool';
  if (state.startsWith('08') || shutdownStates.has(state)) return 'connection';
  if (state === '40001' || state === '40P01') return 'conflict';
  return undefined;
}

/**
 * 数据库访问失败是否属于「暂时不可用」，是则给出原因。只认连接池、连接与超时类的错误；约束冲突、权限不足（含口令错误这类部署配置问题）、
 * 业务错误与程序缺陷一律不算，照常按内部错误或业务错误返回，不会让客户端无谓地重试。
 */
export function unavailableReason(error: unknown): UnavailableReason | undefined {
  if (!(error instanceof Error) || error instanceof CollaborationError) return undefined;
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'string' && socketCodes.has(code)) return 'connection';
  const state = sqlState(error);
  if (state) return stateReason(state, error.message);
  if (error.message === poolTimeout) return 'pool';
  if (error.message.startsWith('Connection terminated') || error.message.endsWith('is not queryable'))
    return 'connection';
  return undefined;
}

/** 可重试的明确错误：错误码 `unavailable`，详情带原因与建议等待的秒数，HTTP 层据此回 503 加 `Retry-After`。 */
export function unavailable(reason: UnavailableReason): CollaborationError {
  return new CollaborationError('unavailable', '服务暂时不可用，请稍后按原请求重试', {
    reason,
    retryAfter: retryAfter[reason]
  });
}
