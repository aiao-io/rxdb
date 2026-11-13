import { imageGenerationRequest, isMiniMaxImageProvider } from '@aiao-media/api-contracts';
import { runtimePolicy } from './product-content.ts';
import { body, fields, reject } from './product-http.ts';
import { base, providerAllowlist } from './relay-input.ts';
import type { WorkerEnv } from './worker-env.ts';

/** 部署配置只在服务端解析，目录只返回平台标识、展示名称与积分。 */
export interface PlatformImageModel {
  id: string;
  name?: string;
  baseUrl: string;
  model: string;
  secret: string;
  credits: number;
}
/** 校验服务端模型和部署允许列表，凭据缺失时明确停用。 */
export function platformModels(env: WorkerEnv): PlatformImageModel[] {
  let values: PlatformImageModel[];
  try {
    values = JSON.parse(env.MEDIA_PLATFORM_MODELS ?? '[]');
  } catch {
    return reject(503, '平台模型配置无效。');
  }
  if (!Array.isArray(values) || !values.length || values.length > 20) reject(503, '平台模型尚未启用。');
  let allowed: Set<string>;
  try {
    allowed = providerAllowlist(env);
  } catch {
    return reject(503, '平台模型允许列表无效。');
  }
  const ids = new Set<string>();
  return values.map(value => {
    if (
      !value ||
      typeof value.id !== 'string' ||
      typeof value.model !== 'string' ||
      typeof value.secret !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,80}$/.test(value.id) ||
      ids.has(value.id) ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.model) ||
      !/^[A-Z][A-Z0-9_]{0,79}$/.test(value.secret) ||
      (value.name !== undefined && (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80)) ||
      !Number.isSafeInteger(value.credits) ||
      value.credits < 1 ||
      value.credits > 100000
    )
      reject(503, '平台模型配置无效。');
    let upstream: string;
    try {
      upstream = base(value.baseUrl);
    } catch {
      return reject(503, '平台模型配置无效。');
    }
    if (
      !allowed.has(upstream) ||
      typeof env[value.secret] !== 'string' ||
      !/^[\x21-\x7e]{1,4096}$/.test(env[value.secret] as string)
    )
      reject(503, '平台模型或凭据尚未就绪。');
    ids.add(value.id);
    return { ...value, baseUrl: upstream };
  });
}
/** 目录不包含供应商地址、上游模型或凭据名称。 */
export async function platformCatalog(env: WorkerEnv) {
  const models = platformModels(env),
    policy = await runtimePolicy(env);
  const enabled = models.filter(
    model =>
      !policy ||
      policy.providers.some(
        provider =>
          provider.baseUrl === model.baseUrl &&
          provider.enabled &&
          provider.proxy &&
          provider.models.includes(model.model)
      )
  );
  return {
    models: enabled.map(value => ({
      id: value.id,
      name: value.name ?? '平台生图',
      credits: value.credits,
      protocol: isMiniMaxImageProvider(value.baseUrl) ? 'minimax' : 'openai'
    }))
  };
}
/** 浏览器只提交平台模型标识与单张图片参数。 */
export async function platformImageInput(request: Request, env: WorkerEnv) {
  const input = fields<{ model: string; prompt: string; size: string; n: number }>(await body(request, 16384), [
    'model',
    'prompt',
    'size',
    'n'
  ]);
  if (
    typeof input.model !== 'string' ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 2000 ||
    !['1024x1024', '1536x1024', '1024x1536'].includes(input.size) ||
    input.n !== 1
  )
    reject(400, '图片生成参数无效。');
  const model = platformModels(env).find(value => value.id === input.model);
  if (!model) reject(400, '平台模型不存在。');
  const policy = await runtimePolicy(env);
  const provider = policy?.providers.find(value => value.baseUrl === model.baseUrl);
  if (
    policy &&
    (!provider?.enabled ||
      !provider.proxy ||
      !provider.models.includes(model.model) ||
      !provider.sizes.includes(input.size))
  )
    reject(403, '平台模型或画幅已停用。');
  const prepared = imageGenerationRequest(model.baseUrl, { ...input, model: model.model });
  if (!prepared) reject(400, '当前平台模型不支持此参数或提示词长度。');
  const upstreamBody =
    isMiniMaxImageProvider(model.baseUrl) ? { ...prepared.body, response_format: 'base64' } : prepared.body;
  return { url: prepared.url, body: upstreamBody, authorization: `Bearer ${env[model.secret]}`, cost: model.credits };
}
