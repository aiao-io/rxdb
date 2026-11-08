const miniMaxBases = new Set(['https://api.minimax.cn/v1', 'https://api.minimax.io/v1', 'https://api.minimaxi.com/v1']);

/** 判断是否使用已适配的 MiniMax 官方图片接口。 */
export function isMiniMaxImageProvider(baseUrl: string): boolean {
  return miniMaxBases.has(baseUrl);
}

/** 将单张图片参数映射为供应商的固定请求契约。 */
export function imageGenerationRequest(baseUrl: string, input: { model: string; prompt: string; size: string }) {
  const common = { model: input.model, prompt: input.prompt, n: 1 };
  if (!isMiniMaxImageProvider(baseUrl))
    return {
      url: `${baseUrl}/images/generations`,
      body: { ...common, size: input.size, quality: 'low', output_format: 'png' }
    };
  if (input.model !== 'image-01' || input.prompt.length > 1500) return null;
  const [width, height] = input.size.split('x').map(Number);
  return {
    url: `${baseUrl}/image_generation`,
    body: { ...common, width, height, response_format: 'url', prompt_optimizer: false }
  };
}
