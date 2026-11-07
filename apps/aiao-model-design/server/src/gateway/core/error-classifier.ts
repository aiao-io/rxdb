import { ModelNotFoundError, TimeoutError, UnauthorizedError, UpstreamHttpError, ValidationError } from './errors';
import type { GatewayError, RequestContext } from './types';

const isAbortError = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

const isFetchTypeError = (e: unknown): boolean =>
  e instanceof TypeError && /fetch|network|enotfound|econnrefused|econnreset/i.test(e.message);

const mapUpstreamHttp = (err: UpstreamHttpError): GatewayError => {
  const { status, upstreamCode } = err;
  if (status === 400 || status === 422) {
    return {
      type: 'validation',
      message: err.message,
      httpStatus: status,
      upstreamCode,
      cause: err
    };
  }
  if (status === 401 || status === 403) {
    // 上游 401/403 表示 gateway 自己跟上游的鉴权出错（API key 失效 / 缺失），
    // 与终端用户的 JWT 状态无关；归到 server 502 让 dashboard 显示"服务不可用"
    // 而非"认证已过期"，避免误导用户去刷 token。
    // 终端用户 JWT 失败由 auth-middleware 抛 UnauthorizedError 走 401 路径。
    return {
      type: 'server',
      message: err.message,
      httpStatus: 502,
      upstreamCode,
      cause: err
    };
  }
  if (status === 429) {
    return {
      type: 'rate-limit',
      message: err.message,
      httpStatus: 429,
      upstreamCode,
      cause: err
    };
  }
  if (status >= 500) {
    return {
      type: 'server',
      message: err.message,
      httpStatus: 502,
      upstreamCode,
      cause: err
    };
  }
  return {
    type: 'server',
    message: err.message,
    httpStatus: 502,
    upstreamCode,
    cause: err
  };
};

/**
 * 把 provider 抛出的 Error 映射到内核 GatewayError（FR-005）
 *
 * - 客户端主动 abort（clientSignal.aborted 且非 timeout）返回 `null`：caller 视为正常关闭，不写错误体
 * - 其他场景按 [provider-interfaces.md §6](specs/006-model-gateway/contracts/provider-interfaces.md) 表映射
 *
 * @returns GatewayError 或 null（客户端 cancel）
 */
export function classifyError(err: unknown, ctx: RequestContext): GatewayError | null {
  if (ctx.clientSignal.aborted && !ctx.timeoutSignal.aborted) {
    return null;
  }

  if (err instanceof TimeoutError) {
    return {
      type: 'timeout',
      message: `Gateway timeout: ${err.kind}`,
      httpStatus: 504,
      cause: err
    };
  }
  if (isAbortError(err) && ctx.timeoutSignal.aborted) {
    return {
      type: 'timeout',
      message: 'Gateway timeout',
      httpStatus: 504
    };
  }

  if (err instanceof ValidationError) {
    return {
      type: 'validation',
      message: err.message,
      httpStatus: 422,
      code: err.code,
      param: err.param,
      cause: err
    };
  }
  if (err instanceof ModelNotFoundError) {
    return {
      type: 'validation',
      message: err.message,
      httpStatus: 404,
      code: 'model_not_found',
      cause: err
    };
  }

  if (err instanceof UnauthorizedError) {
    return {
      type: 'unauthorized',
      message: err.message,
      httpStatus: 401,
      code: err.code,
      cause: err
    };
  }

  if (err instanceof UpstreamHttpError) {
    return mapUpstreamHttp(err);
  }

  if (isFetchTypeError(err)) {
    const e = err as Error;
    return {
      type: 'network',
      message: e.message,
      httpStatus: 502,
      cause: e
    };
  }

  const fallback = err instanceof Error ? err : new Error(String(err));
  return {
    type: 'server',
    message: fallback.message || 'Internal gateway error',
    httpStatus: 500,
    cause: fallback
  };
}
