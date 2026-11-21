const miniMaxBases = new Set(['https://api.minimax.cn/v1', 'https://api.minimax.io/v1', 'https://api.minimaxi.com/v1']);

/** 判断是否使用已适配的 MiniMax 官方图片接口。 */
export function isMiniMaxImageProvider(baseUrl: string): boolean {
  return miniMaxBases.has(baseUrl);
}

export interface ImageGenerationInput {
  protocol: 'openai' | 'minimax' | 'gemini';
  baseUrl: string;
  model: string;
  prompt: string;
  size?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  complexity?: string;
  thinkingLevel?: string;
  referenceImage?: { mimeType: 'image/png' | 'image/jpeg'; data: string };
}

/** 按模型协议构造单张生图或图生图请求。 */
export function imageGenerationRequest(input: ImageGenerationInput) {
  if (input.protocol === 'gemini') {
    const contents = [
      { type: 'text', text: input.prompt },
      ...(input.referenceImage ?
        [{ type: 'image', mime_type: input.referenceImage.mimeType, data: input.referenceImage.data }]
      : [])
    ];
    return {
      url: `${input.baseUrl}/interactions`,
      body: {
        model: input.model,
        store: false,
        input: contents,
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          delivery: 'inline',
          aspect_ratio: input.aspectRatio,
          ...(input.model === 'gemini-2.5-flash-image' ? {} : { image_size: input.resolution })
        },
        ...(input.thinkingLevel ? { generation_config: { thinking_level: input.thinkingLevel } } : {})
      },
      authHeader: 'x-goog-api-key' as const
    };
  }
  const common = { model: input.model, prompt: input.prompt, n: 1 };
  if (input.protocol === 'openai') {
    if (input.referenceImage)
      return {
        url: `${input.baseUrl}/images/edits`,
        body: {
          _format: 'multipart',
          fields: {
            ...common,
            size: input.size!,
            quality: input.quality ?? 'auto',
            ...(input.complexity ? { complexity: input.complexity } : {}),
            output_format: 'png'
          },
          image: input.referenceImage
        },
        authHeader: 'authorization' as const
      };
    return {
      url: `${input.baseUrl}/images/generations`,
      body: {
        ...common,
        size: input.size,
        quality: input.quality ?? 'auto',
        ...(input.complexity ? { complexity: input.complexity } : {}),
        output_format: 'png'
      },
      authHeader: 'authorization' as const
    };
  }
  if (input.referenceImage || input.model !== 'image-01' || input.prompt.length > 1500 || !input.size) return null;
  const [width, height] = input.size.split('x').map(Number);
  return {
    url: `${input.baseUrl}/image_generation`,
    body: { ...common, width, height, response_format: 'url', prompt_optimizer: false },
    authHeader: 'authorization' as const
  };
}
