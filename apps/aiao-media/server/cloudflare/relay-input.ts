import type { WorkerEnv } from './worker-env.ts';

type ImageInput = { model: string; prompt: string; size: string; n: number };

import { imageGenerationRequest } from '../../src/contracts/image-provider-protocol.ts';
import { runtimePolicy } from './product-content.ts';
import { originAllowed } from './product-http.ts';

/** 代理接口的错误响应：不缓存、不带 referrer。 */
export const json = (status: number, error: string) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      }
    }
  );

/** 规范化供应商 API 前缀，只接受不含凭据、查询和片段的 HTTPS 地址。 */
export function base(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid base');
  return url.href.replace(/\/+$/, '');
}

// Bound reads before JSON parsing; null means the body exceeded the limit.
async function readBody(reader: ReadableStreamDefaultReader<Uint8Array>, limit: number) {
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const validImage = (data: ImageInput | null | undefined) =>
  data &&
  typeof data.model === 'string' &&
  data.model.trim() &&
  data.model.length <= 200 &&
  typeof data.prompt === 'string' &&
  data.prompt.trim() &&
  data.prompt.length <= 2000 &&
  data.n === 1 &&
  ['1024x1024', '1536x1024', '1024x1536'].includes(data.size);

/**
 * 校验代理请求：同源或桌面来源、允许列表与运行策略、Key 格式和单张参数。通过时返回上游请求，
 * 否则返回错误响应；读取请求体中断时抛错。只转发单张生成参数。
 */
export async function relayInput(request: Request, env: WorkerEnv) {
  if (!originAllowed(request, env)) return json(403, 'Same-origin browser request required');
  let upstream, policy;
  try {
    upstream = base(request.headers.get('x-provider-base') ?? '');
    policy = await runtimePolicy(env);
    const allowed =
      policy ?
        policy.providers.filter(provider => provider.enabled && provider.proxy).map(provider => provider.baseUrl)
      : (JSON.parse(env.ALLOWED_PROVIDER_BASE_URLS || '[]') as string[]).map(base);
    if (!allowed.includes(upstream)) return json(403, 'Provider is not enabled for this relay');
  } catch {
    return json(400, 'Invalid provider configuration');
  }
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [\x21-\x7e]{1,4096}$/.test(authorization)) return json(400, 'API Key required');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json(400, 'JSON required');
  const reader = request.body?.getReader();
  if (!reader) return json(400, 'Body required');
  const bytes = await readBody(reader, 16 * 1024);
  if (!bytes) return json(413, 'Body too large');
  let data: ImageInput;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json(400, 'Invalid JSON');
  }
  if (!validImage(data)) return json(400, 'Invalid image request');
  const activeProvider = policy?.providers.find(provider => provider.baseUrl === upstream);
  if (activeProvider && (!activeProvider.models.includes(data.model) || !activeProvider.sizes.includes(data.size)))
    return json(403, 'Model or size is disabled by the active provider policy');
  const imageRequest = imageGenerationRequest(upstream, data);
  if (!imageRequest) return json(400, 'Unsupported image model or prompt length');
  return { upstream, policy, authorization, imageRequest };
}
