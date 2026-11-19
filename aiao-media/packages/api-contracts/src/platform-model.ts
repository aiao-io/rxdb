/** 平台任务原始响应和请求协议，不暴露上游地址或型号。 */
export type ImageResponseProtocol = 'openai' | 'minimax' | 'gemini';
/** 用户可见的平台模型及每次单张生成预占的积分。 */
export interface PlatformModel {
  id: string;
  name: string;
  credits: number;
  protocol: ImageResponseProtocol;
  sizes?: string[];
  aspectRatios?: string[];
  resolutions?: string[];
  imageOptions?: { aspectRatio: string; resolution: string; outputSize: string }[];
  qualities?: string[];
  complexities?: string[];
  thinkingLevels?: string[];
  counts?: number[];
  supportsImageEditing?: boolean;
}
const defaultSizes = ['1024x1024', '1536x1024', '1024x1536'];
const geminiRatios = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '5:4', '4:5', '21:9', '1:4', '4:1', '1:8', '8:1'];
const allowedResolutions = ['512', '1K', '2K', '4K'];
const allowedQualities = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];
const allowedComplexities = ['low', 'medium', 'high'];
const allowedThinkingLevels = ['minimal', 'low', 'medium', 'high'];
/** 严格读取公开目录；未知字段和重复模型不能进入界面或本机记录。 */
export function validatePlatformModels(value: unknown): PlatformModel[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join() !== 'models')
    throw new Error('平台模型目录无效。');
  const models: unknown = Reflect.get(value, 'models');
  if (!Array.isArray(models) || models.length > 20) throw new Error('平台模型目录无效。');
  const ids = new Set<string>();
  return models.map((item: unknown) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some(
        key =>
          ![
            'credits',
            'id',
            'name',
            'protocol',
            'sizes',
            'aspectRatios',
            'resolutions',
            'imageOptions',
            'qualities',
            'complexities',
            'thinkingLevels',
            'counts',
            'supportsImageEditing'
          ].includes(key)
      )
    )
      throw new Error('平台模型目录无效。');
    const model = item as PlatformModel;
    if (
      typeof model.id !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,80}$/.test(model.id) ||
      ids.has(model.id) ||
      typeof model.name !== 'string' ||
      !model.name.trim() ||
      model.name.length > 80 ||
      !Number.isSafeInteger(model.credits) ||
      model.credits < 1 ||
      model.credits > 100000 ||
      !['openai', 'minimax', 'gemini'].includes(model.protocol)
    )
      throw new Error('平台模型目录无效。');
    if (
      (model.sizes !== undefined && !validSizes(model.sizes)) ||
      (model.aspectRatios !== undefined && !validAspectRatios(model.aspectRatios, model.protocol)) ||
      (model.resolutions !== undefined && !validStringOptions(model.resolutions, allowedResolutions)) ||
      (model.imageOptions !== undefined && !validImageOptions(model.imageOptions)) ||
      (model.qualities !== undefined && !validStringOptions(model.qualities, allowedQualities)) ||
      (model.complexities !== undefined && !validStringOptions(model.complexities, allowedComplexities)) ||
      (model.thinkingLevels !== undefined && !validStringOptions(model.thinkingLevels, allowedThinkingLevels))
    )
      throw new Error('平台模型目录无效。');
    const sizes = model.sizes ?? (model.protocol === 'gemini' ? [] : defaultSizes);
    const aspectRatios = model.aspectRatios ??
      (model.protocol === 'gemini' && model.imageOptions ? unique(model.imageOptions.map(option => option.aspectRatio)) :
        unique(sizes.map(size => ratio(size))));
    const resolutions = model.resolutions ??
      (model.protocol === 'gemini' && model.imageOptions ? unique(model.imageOptions.map(option => option.resolution)) : []);
    const optionRatios = model.imageOptions ? unique(model.imageOptions.map(option => option.aspectRatio)) : [];
    const optionResolutions = model.imageOptions ? unique(model.imageOptions.map(option => option.resolution)) : [];
    const qualities = model.qualities ?? (model.protocol === 'openai' ? ['low'] : []);
    const complexities = model.complexities ?? [];
    const thinkingLevels = model.thinkingLevels ?? [];
    const counts = model.counts ?? [1];
    if (
      !validSizes(sizes) ||
      (model.protocol !== 'gemini' && !sizes.length) ||
      !validAspectRatios(aspectRatios, model.protocol) ||
      !validStringOptions(resolutions, allowedResolutions) ||
      !validStringOptions(qualities, allowedQualities) ||
      !validStringOptions(complexities, allowedComplexities) ||
      !validStringOptions(thinkingLevels, allowedThinkingLevels) ||
      !Array.isArray(counts) ||
      !counts.length ||
      counts.length > 10 ||
      counts.some(count => !Number.isSafeInteger(count) || count < 1 || count > 10) ||
      new Set(counts).size !== counts.length ||
      (model.supportsImageEditing !== undefined && typeof model.supportsImageEditing !== 'boolean') ||
      (model.protocol === 'gemini' &&
        (!aspectRatios.length ||
          !resolutions.length ||
          sizes.length ||
          qualities.length ||
          complexities.length ||
          !model.imageOptions?.length ||
          !sameValues(aspectRatios, optionRatios) ||
          !sameValues(resolutions, optionResolutions))) ||
      (model.protocol !== 'gemini' && (resolutions.length > 0 || model.imageOptions !== undefined || !sameValues(aspectRatios, unique(sizes.map(ratio))))) ||
      (model.protocol !== 'gemini' && thinkingLevels.length > 0) ||
      (model.protocol === 'gemini' && complexities.length > 0) ||
      (model.protocol === 'minimax' &&
        (model.supportsImageEditing === true || qualities.length > 0 || complexities.length > 0))
    )
      throw new Error('平台模型目录无效。');
    ids.add(model.id);
    return {
      ...structuredClone(model),
      sizes: [...sizes],
      aspectRatios: [...aspectRatios],
      resolutions: [...resolutions],
      ...(model.imageOptions ? { imageOptions: structuredClone(model.imageOptions) } : {}),
      qualities: [...qualities],
      complexities: [...complexities],
      thinkingLevels: [...thinkingLevels],
      counts: [...counts],
      supportsImageEditing: model.supportsImageEditing ?? false
    };
  });
}
function validSizes(sizes: unknown, alignment = 16): sizes is string[] {
  return Array.isArray(sizes) && sizes.length <= 40 && sizes.every(size => {
    if (typeof size !== 'string' || !/^\d{1,4}x\d{1,4}$/.test(size)) return false;
    const [width, height] = size.split('x').map(Number);
    return (
      width > 0 &&
      height > 0 &&
      width <= 4096 &&
      height <= 4096 &&
      width * height <= 16_777_216 &&
      width % alignment === 0 &&
      height % alignment === 0
    );
  }) && new Set(sizes).size === sizes.length;
}
function validAspectRatios(value: unknown, protocol: ImageResponseProtocol): value is string[] {
  if (!Array.isArray(value) || value.length > 24 || value.some(ratio => typeof ratio !== 'string')) return false;
  const allowed = protocol === 'gemini' ? geminiRatios : null;
  return (
    value.every(ratio => {
      if (!/^(\d{1,2}):(\d{1,2})$/.test(ratio)) return false;
      const [width, height] = ratio.split(':').map(Number);
      const divisor = (a: number, b: number): number => (b ? divisor(b, a % b) : a);
      if (!width || !height) return false;
      return allowed ? allowed.includes(ratio) : divisor(width, height) === 1 && width * 3 >= height && height * 3 >= width;
    }) && new Set(value).size === value.length
  );
}
function validImageOptions(value: unknown): value is { aspectRatio: string; resolution: string; outputSize: string }[] {
  if (!Array.isArray(value) || !value.length || value.length > 60) return false;
  const seen = new Set<string>();
  return value.every(option => {
    if (
      !option ||
      typeof option !== 'object' ||
      Array.isArray(option) ||
      Object.keys(option).sort().join() !== 'aspectRatio,outputSize,resolution' ||
      !validAspectRatios([option.aspectRatio], 'gemini') ||
      !allowedResolutions.includes(option.resolution) ||
      typeof option.outputSize !== 'string' ||
      !validSizes([option.outputSize], 1) ||
      aspectCategory(ratio(option.outputSize)) !== aspectCategory(option.aspectRatio)
    )
      return false;
    const key = `${option.aspectRatio}:${option.resolution}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every(value => right.includes(value));
}
function validStringOptions(value: unknown, allowed: string[]): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= (allowed === allowedResolutions ? 4 : 6) &&
    value.every(option => typeof option === 'string' && allowed.includes(option)) &&
    new Set(value).size === value.length
  );
}
function ratio(size: string): string {
  const [width, height] = size.split('x').map(Number);
  const divisor = (a: number, b: number): number => (b ? divisor(b, a % b) : a);
  const common = divisor(width, height);
  const value = `${width / common}:${height / common}`;
  return value;
}
function aspectCategory(value: string): 'square' | 'landscape' | 'portrait' {
  const [width, height] = value.split(':').map(Number);
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
}
