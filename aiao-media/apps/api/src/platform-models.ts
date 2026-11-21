import {
  imageGenerationRequest,
  imageMetadata,
  isMiniMaxImageProvider,
  validatePlatformModels,
  type ImageResponseProtocol,
  type PlatformModel
} from '@aiao-media/api-contracts';
import { officialImagePresets } from './image-presets.ts';
import { runtimePolicy } from './product-content.ts';
import { body, fields, reject } from './product-http.ts';
import { base, providerAllowlist } from './relay-input.ts';
import type { WorkerEnv } from './worker-env.ts';

/** 部署配置只在服务端解析，目录只返回公开模型及能力。 */
export interface PlatformImageModel extends PlatformModel {
  sizes: string[];
  aspectRatios: string[];
  resolutions: string[];
  qualities: string[];
  complexities: string[];
  thinkingLevels: string[];
  counts: number[];
  supportsImageEditing: boolean;
  baseUrl: string;
  model: string;
  secret: string;
}
const privateKeys = [
  'id',
  'name',
  'baseUrl',
  'model',
  'secret',
  'credits',
  'costMicros',
  'protocol',
  'preset',
  'sizes',
  'aspectRatios',
  'resolutions',
  'imageOptions',
  'qualities',
  'complexities',
  'thinkingLevels',
  'counts',
  'supportsImageEditing'
];

/** 校验服务端模型和部署允许列表，凭据缺失时明确停用。 */
export function platformModels(env: WorkerEnv): PlatformImageModel[] {
  let values: unknown;
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
  return values.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) reject(503, '平台模型配置无效。');
    const value = raw as Record<string, unknown>;
    if (
      Object.keys(value).some(key => !privateKeys.includes(key)) ||
      typeof value.id !== 'string' ||
      typeof value.baseUrl !== 'string' ||
      typeof value.model !== 'string' ||
      typeof value.secret !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,80}$/.test(value.id) ||
      ids.has(value.id) ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.model) ||
      !/^[A-Z][A-Z0-9_]{0,79}$/.test(value.secret)
    )
      reject(503, '平台模型配置无效。');
    let upstream: string;
    try {
      upstream = base(value.baseUrl);
    } catch {
      return reject(503, '平台模型配置无效。');
    }
    const preset = value.preset === 'official' ? officialImagePresets.get(value.model) : undefined;
    if (value.preset !== undefined && !preset) reject(503, '未知的官方模型预设。');
    const protocol =
      preset?.protocol ??
      (value.protocol === undefined ?
        isMiniMaxImageProvider(upstream) ? 'minimax'
        : 'openai'
      : (value.protocol as ImageResponseProtocol));
    let model: PlatformModel;
    try {
      model = validatePlatformModels({
        models: [
          {
            ...preset,
            id: value.id,
            name: value.name ?? '平台生图',
            credits: value.credits,
            protocol,
            ...(value.sizes !== undefined ? { sizes: value.sizes } : {}),
            ...(value.aspectRatios !== undefined ? { aspectRatios: value.aspectRatios } : {}),
            ...(value.resolutions !== undefined ? { resolutions: value.resolutions } : {}),
            ...(value.imageOptions !== undefined ? { imageOptions: value.imageOptions } : {}),
            ...(value.qualities !== undefined ? { qualities: value.qualities } : {}),
            ...(value.complexities !== undefined ? { complexities: value.complexities } : {}),
            ...(value.thinkingLevels !== undefined ? { thinkingLevels: value.thinkingLevels } : {}),
            ...(value.counts !== undefined ? { counts: value.counts } : {}),
            supportsImageEditing: value.supportsImageEditing ?? preset?.supportsImageEditing ?? false
          }
        ]
      })[0];
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
    return {
      ...model,
      sizes: model.sizes ?? [],
      aspectRatios: model.aspectRatios ?? [],
      resolutions: model.resolutions ?? [],
      qualities: model.qualities ?? [],
      complexities: model.complexities ?? [],
      thinkingLevels: model.thinkingLevels ?? [],
      counts: model.counts ?? [1],
      supportsImageEditing: model.supportsImageEditing ?? false,
      baseUrl: upstream,
      model: value.model,
      secret: value.secret
    };
  });
}

/** 目录不包含供应商地址、上游模型或凭据名称。 */
export async function platformCatalog(env: WorkerEnv) {
  const models = platformModels(env),
    policy = await runtimePolicy(env);
  const enabled = models.flatMap(model => {
    if (!policy) return [model];
    const provider = policy.providers.find(
      p => p.baseUrl === model.baseUrl && p.enabled && p.proxy && p.models.includes(model.model)
    );
    if (!provider) return [];
    const sizes = model.sizes.filter(size => provider.sizes.includes(size));
    const imageOptions = model.imageOptions?.filter(o => provider.sizes.includes(o.outputSize));
    if (imageOptions?.length)
      return [
        {
          ...model,
          imageOptions,
          aspectRatios: [...new Set(imageOptions.map(o => o.aspectRatio))],
          resolutions: [...new Set(imageOptions.map(o => o.resolution))]
        }
      ];
    return sizes.length ?
        [{ ...model, sizes, aspectRatios: model.aspectRatios.filter(r => sizes.some(s => ratioForSize(s) === r)) }]
      : [];
  });
  return {
    models: enabled.map(
      ({
        id,
        name,
        credits,
        protocol,
        sizes,
        aspectRatios,
        resolutions,
        imageOptions,
        qualities,
        complexities,
        thinkingLevels,
        counts,
        supportsImageEditing
      }) => ({
        id,
        name,
        credits,
        protocol,
        sizes,
        aspectRatios,
        resolutions,
        ...(imageOptions ? { imageOptions } : {}),
        qualities,
        complexities,
        thinkingLevels,
        counts,
        supportsImageEditing
      })
    )
  };
}

/** 浏览器只提交平台模型标识、模型选项和可选的短暂参考图片。 */
export async function platformImageInput(request: Request, env: WorkerEnv) {
  const input = fields<{
    model: string;
    prompt: string;
    size?: string;
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    complexity?: string;
    thinkingLevel?: string;
    n: number;
    referenceImage?: { mimeType: string; data: string };
  }>(await body(request, 5_700_000), [
    'model',
    'prompt',
    'size',
    'aspectRatio',
    'resolution',
    'quality',
    'complexity',
    'thinkingLevel',
    'n',
    'referenceImage'
  ]);
  if (
    typeof input.model !== 'string' ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 2000 ||
    input.n !== 1
  )
    reject(400, '图片生成参数无效。');
  const model = platformModels(env).find(value => value.id === input.model);
  if (!model) reject(400, '平台模型不存在。');
  const aspectRatio =
    input.aspectRatio === undefined && typeof input.size === 'string' ? ratioForSize(input.size) : input.aspectRatio;
  if (typeof aspectRatio !== 'string' || !model.aspectRatios.includes(aspectRatio)) reject(400, '模型不支持此宽高比。');
  const combo = model.imageOptions?.find(o => o.aspectRatio === aspectRatio && o.resolution === input.resolution);
  if (model.protocol === 'gemini') {
    if (
      input.size !== undefined ||
      !combo ||
      input.quality !== undefined ||
      input.complexity !== undefined ||
      (input.thinkingLevel !== undefined && !model.thinkingLevels.includes(input.thinkingLevel))
    )
      reject(400, '模型不支持此分辨率或质量。');
  } else if (
    !model.sizes.includes(input.size ?? '') ||
    ratioForSize(input.size ?? '') !== aspectRatio ||
    input.resolution !== undefined ||
    (input.quality !== undefined && !model.qualities.includes(input.quality)) ||
    (input.complexity !== undefined && !model.complexities.includes(input.complexity)) ||
    input.thinkingLevel !== undefined
  ) {
    reject(400, '模型不支持此分辨率或质量。');
  }
  let referenceImage: { mimeType: 'image/png' | 'image/jpeg'; data: string } | undefined;
  if (input.referenceImage !== undefined) {
    if (!model.supportsImageEditing) reject(400, '当前模型不支持图生图。');
    if (
      !input.referenceImage ||
      Object.keys(input.referenceImage).sort().join() !== 'data,mimeType' ||
      !['image/png', 'image/jpeg'].includes(input.referenceImage.mimeType) ||
      typeof input.referenceImage.data !== 'string' ||
      !input.referenceImage.data.length ||
      input.referenceImage.data.length > 5_600_000 ||
      input.referenceImage.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.referenceImage.data)
    )
      reject(400, '参考图片无效或超出大小限制。');
    try {
      const bytes = Uint8Array.from(atob(input.referenceImage.data), char => char.charCodeAt(0));
      const metadata = imageMetadata(bytes);
      if (
        metadata.mimeType !== input.referenceImage.mimeType ||
        metadata.width > 2048 ||
        metadata.height > 2048 ||
        bytes.length > 4 * 1024 * 1024
      )
        reject(400, '参考图片无效或超出大小限制。');
      referenceImage = { mimeType: metadata.mimeType, data: input.referenceImage.data };
    } catch {
      return reject(400, '参考图片无效或超出大小限制。');
    }
  }
  const policy = await runtimePolicy(env);
  const provider = policy?.providers.find(value => value.baseUrl === model.baseUrl);
  if (
    policy &&
    (!provider?.enabled ||
      !provider.proxy ||
      !provider.models.includes(model.model) ||
      !provider.sizes.includes(combo?.outputSize ?? input.size ?? ''))
  )
    reject(403, '平台模型或画幅已停用。');
  const prepared = imageGenerationRequest({
    protocol: model.protocol,
    baseUrl: model.baseUrl,
    model: model.model,
    prompt: input.prompt,
    size: input.size,
    aspectRatio,
    resolution: input.resolution,
    quality: input.quality ?? model.qualities[0],
    complexity: input.complexity,
    thinkingLevel: input.thinkingLevel,
    referenceImage
  });
  if (!prepared) reject(400, '当前平台模型不支持此参数或提示词长度。');
  const upstreamBody = model.protocol === 'minimax' ? { ...prepared.body, response_format: 'base64' } : prepared.body;
  return {
    url: prepared.url,
    body: upstreamBody,
    protocol: model.protocol,
    authHeader: prepared.authHeader,
    authorization: model.protocol === 'gemini' ? (env[model.secret] as string) : `Bearer ${env[model.secret]}`,
    cost: model.credits
  };
}

function ratioForSize(size: string): string | undefined {
  const [width, height] = size.split('x').map(Number);
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) return undefined;
  const divisor = (a: number, b: number): number => (b ? divisor(b, a % b) : a);
  const common = divisor(width, height);
  return `${width / common}:${height / common}`;
}
