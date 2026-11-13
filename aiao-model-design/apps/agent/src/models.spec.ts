import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveModel, type ModelEnvironment } from './models';

type ModelHandle = { provider: string; modelId: string; doGenerate(options: unknown): Promise<unknown> };

function handle(spec: string, env: Record<string, string>): ModelHandle {
  return resolveModel(spec, env) as unknown as ModelHandle;
}

async function requestedUrl(model: ModelHandle): Promise<string> {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      throw new Error('stop');
    })
  );
  await model
    .doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
    .catch(() => undefined);
  return urls[0] ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('resolveModel', () => {
  it('默认的 DeepSeek 规格使用 DEEPSEEK_API_KEY，并去掉 base URL 结尾的斜杠', async () => {
    const model = handle('deepseek:deepseek-flash', {
      DEEPSEEK_API_KEY: 'key',
      DEEPSEEK_BASE_URL: 'https://llm.example.com/v1/'
    });
    expect(model).toMatchObject({ provider: 'deepseek.chat', modelId: 'deepseek-flash' });
    expect(await requestedUrl(model)).toBe('https://llm.example.com/v1/chat/completions');
  });

  it('可以切换到 Claude，配置只来自传入的环境变量', async () => {
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://process-env.example.com');
    vi.stubEnv('DEEPSEEK_API_KEY', 'process-key');
    const model = handle('anthropic:claude-sonnet-5-5', { ANTHROPIC_API_KEY: 'key' });
    expect(model).toMatchObject({ provider: 'anthropic.messages', modelId: 'claude-sonnet-5-5' });
    expect(await requestedUrl(model)).toBe('https://api.anthropic.com/v1/messages');
    expect(await requestedUrl(handle('deepseek:deepseek-flash', { DEEPSEEK_API_KEY: 'key' }))).toBe(
      'https://api.deepseek.com/chat/completions'
    );
    expect(() => resolveModel('deepseek:deepseek-flash', {})).toThrow(/DEEPSEEK_API_KEY/);
  });

  it.each<[string, string, ModelEnvironment, RegExp]>([
    ['缺少密钥', 'deepseek:deepseek-flash', {}, /DEEPSEEK_API_KEY/],
    ['密钥为空白', 'anthropic:claude-sonnet-5-5', { ANTHROPIC_API_KEY: ' ' }, /ANTHROPIC_API_KEY/],
    ['未知供应商', 'openai:gpt', { DEEPSEEK_API_KEY: 'key' }, /未知的模型供应商 openai.*deepseek、anthropic/],
    ['缺少供应商', 'deepseek-flash', {}, /provider:model/],
    ['缺少模型名', 'deepseek:', {}, /provider:model/]
  ])('%s时报错', (_name, spec, env, pattern) => {
    expect(() => resolveModel(spec, env)).toThrow(pattern);
  });
});
