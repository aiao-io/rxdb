import type { PlatformModel } from '@aiao-media/api-contracts';

type Capabilities = Omit<PlatformModel, 'id' | 'name' | 'credits'>;
const counts = [1, 2, 3, 4];
const sizes = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '2048x1152', '1152x2048', '3840x2160', '2160x3840'];
const gpt: Capabilities = {
  protocol: 'openai', counts, sizes, supportsImageEditing: true,
  qualities: ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
};
const gpt26 = { ...gpt, complexities: ['high', 'medium', 'low'] };
const oneK: Record<string, [number, number]> = {
  '1:1': [1024,1024], '3:2': [1264,848], '2:3': [848,1264], '4:3': [1200,896], '3:4': [896,1200],
  '5:4': [1152,928], '4:5': [928,1152], '16:9': [1376,768], '9:16': [768,1376], '21:9': [1584,672]
};
const wide = { ...oneK, '1:4': [512,2048], '4:1': [2048,512], '1:8': [384,3072], '8:1': [3072,384] };
const original = { '1:1': [1024,1024], '3:2': [1248,832], '2:3': [832,1248], '4:3': [1184,864], '3:4': [864,1184],
  '5:4': [1152,896], '4:5': [896,1152], '16:9': [1344,768], '9:16': [768,1344], '21:9': [1536,672] };
const scales: Record<string, number> = { '1K': 1, '2K': 2, '4K': 4, '512': 0.5 };
function gemini(dimensions: Record<string, number[]>, levels: string[], thinkingLevels: string[] = []): Capabilities {
  const imageOptions = Object.entries(dimensions).flatMap(([aspectRatio, [w,h]]) => levels.flatMap(resolution => {
    const width = w * scales[resolution], height = h * scales[resolution];
    return Math.max(width,height) <= 4096 ? [{ aspectRatio, resolution, outputSize: `${width}x${height}` }] : [];
  }));
  return { protocol: 'gemini', counts, imageOptions, thinkingLevels, supportsImageEditing: true };
}

/** 部署显式选择的静态图片能力；未知上游必须自行声明，不按名称猜测。 */
export const officialImagePresets = new Map<string, Capabilities>([
  ['gpt-image-2.6-flare', gpt26], ['gpt-image-2.6-sunburst', gpt26],
  ['gpt-image-2.5-flare', gpt], ['gpt-image-2.5-sunburst', gpt],
  ['gemini-nano-banana-2.1', gemini(wide, ['1K','2K','4K'], ['medium','minimal','high'])],
  ['gemini-3.1-flash-image', gemini(wide, ['1K','2K','4K','512'], ['minimal','high'])],
  ['gemini-3.1-flash-lite-image', gemini(oneK, ['1K'], ['minimal','high'])],
  ['gemini-3-pro-image', gemini(oneK, ['1K','2K','4K'])],
  ['gemini-2.5-flash-image', gemini(original, ['1K'])]
]);
