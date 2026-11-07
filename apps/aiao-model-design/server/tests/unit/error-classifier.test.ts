import { describe, expect, it } from 'vitest';
import { classifyError } from '../../src/gateway/core/error-classifier';
import {
  ModelNotFoundError,
  TimeoutError,
  UnauthorizedError,
  UpstreamHttpError,
  ValidationError
} from '../../src/gateway/core/errors';
import type { RequestContext } from '../../src/gateway/core/types';

const makeCtx = (overrides: Partial<RequestContext> = {}): RequestContext => {
  const clientCtrl = new AbortController();
  const timeoutCtrl = new AbortController();
  return {
    traceId: 'test-trace-id',
    entry: 'openai-v1',
    modality: 'chat',
    userId: null,
    authChannel: null,
    requestedAt: Date.now(),
    clientSignal: clientCtrl.signal,
    timeoutSignal: timeoutCtrl.signal,
    combinedSignal: AbortSignal.any([clientCtrl.signal, timeoutCtrl.signal]),
    retentionFiles: [],
    ...overrides
  };
};

describe('classifyError', () => {
  it('UpstreamHttpError 400 → validation 400', () => {
    const r = classifyError(new UpstreamHttpError(400, 'bad request'), makeCtx());
    expect(r?.type).toBe('validation');
    expect(r?.httpStatus).toBe(400);
  });

  it('UpstreamHttpError 422 → validation 422', () => {
    const r = classifyError(new UpstreamHttpError(422, 'invalid field'), makeCtx());
    expect(r?.type).toBe('validation');
    expect(r?.httpStatus).toBe(422);
  });

  it('UpstreamHttpError 401 → server 502 (上游 API key 配置错，与终端用户 JWT 无关)', () => {
    const r = classifyError(new UpstreamHttpError(401, 'bad upstream key'), makeCtx());
    expect(r?.type).toBe('server');
    expect(r?.httpStatus).toBe(502);
  });

  it('UpstreamHttpError 403 → server 502 (同 401，上游问题不应误导用户刷 token)', () => {
    const r = classifyError(new UpstreamHttpError(403, 'forbidden upstream'), makeCtx());
    expect(r?.type).toBe('server');
    expect(r?.httpStatus).toBe(502);
  });

  it('UpstreamHttpError 429 → rate-limit 429', () => {
    const r = classifyError(new UpstreamHttpError(429, 'too many'), makeCtx());
    expect(r?.type).toBe('rate-limit');
    expect(r?.httpStatus).toBe(429);
  });

  it('UpstreamHttpError 500 → server 502', () => {
    const r = classifyError(new UpstreamHttpError(500, 'upstream boom'), makeCtx());
    expect(r?.type).toBe('server');
    expect(r?.httpStatus).toBe(502);
  });

  it('ValidationError → validation 422 with code/param', () => {
    const r = classifyError(
      new ValidationError('logprobs not supported', { code: 'unsupported_field', param: 'logprobs' }),
      makeCtx()
    );
    expect(r?.type).toBe('validation');
    expect(r?.httpStatus).toBe(422);
    expect(r?.code).toBe('unsupported_field');
    expect(r?.param).toBe('logprobs');
  });

  it('TimeoutError → timeout 504', () => {
    const r = classifyError(new TimeoutError('first-byte'), makeCtx());
    expect(r?.type).toBe('timeout');
    expect(r?.httpStatus).toBe(504);
  });

  it('AbortError + client aborted (no timeout) → null', () => {
    const clientCtrl = new AbortController();
    clientCtrl.abort();
    const ctx = makeCtx({ clientSignal: clientCtrl.signal });
    const r = classifyError(new DOMException('aborted', 'AbortError'), ctx);
    expect(r).toBeNull();
  });

  it('AbortError + timeoutSignal aborted → timeout', () => {
    const timeoutCtrl = new AbortController();
    timeoutCtrl.abort();
    const ctx = makeCtx({ timeoutSignal: timeoutCtrl.signal });
    const r = classifyError(new DOMException('aborted', 'AbortError'), ctx);
    expect(r?.type).toBe('timeout');
  });

  it('TypeError "fetch failed" → network 502', () => {
    const r = classifyError(new TypeError('fetch failed'), makeCtx());
    expect(r?.type).toBe('network');
    expect(r?.httpStatus).toBe(502);
  });

  it('UnauthorizedError → unauthorized 401', () => {
    const r = classifyError(new UnauthorizedError('token expired'), makeCtx());
    expect(r?.type).toBe('unauthorized');
    expect(r?.httpStatus).toBe(401);
  });

  it('ModelNotFoundError → validation 404 with code model_not_found', () => {
    const r = classifyError(new ModelNotFoundError('gpt-4o'), makeCtx());
    expect(r?.type).toBe('validation');
    expect(r?.httpStatus).toBe(404);
    expect(r?.code).toBe('model_not_found');
  });

  it('unknown Error → server 500 fallback', () => {
    const r = classifyError(new Error('boom'), makeCtx());
    expect(r?.type).toBe('server');
    expect(r?.httpStatus).toBe(500);
    expect(r?.message).toBe('boom');
  });
});
