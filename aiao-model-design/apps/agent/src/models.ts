import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { locals } from '@trigger.dev/sdk';
import type { LanguageModel } from 'ai';

/** 模型解析读取的环境变量，只配置在 Trigger.dev 实例上。 */
export interface ModelEnvironment {
  AGENT_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
}

type ProviderFactory = (modelId: string, env: ModelEnvironment) => LanguageModel;

function required(env: ModelEnvironment, key: 'DEEPSEEK_API_KEY' | 'ANTHROPIC_API_KEY'): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`缺少环境变量 ${key}`);
  return value;
}

/**
 * 总是显式传入 base URL：provider 在缺省时会自己去读 `process.env`，
 * 那样 `env` 参数就不再是唯一的配置来源。
 */
function baseURL(value: string | undefined, standard: string): string {
  return value?.trim().replace(/\/+$/, '') || standard;
}

const PROVIDERS: Readonly<Record<string, ProviderFactory>> = {
  deepseek: (modelId, env) =>
    createDeepSeek({
      apiKey: required(env, 'DEEPSEEK_API_KEY'),
      baseURL: baseURL(env.DEEPSEEK_BASE_URL, 'https://api.deepseek.com')
    })(modelId),
  anthropic: (modelId, env) =>
    createAnthropic({
      apiKey: required(env, 'ANTHROPIC_API_KEY'),
      baseURL: baseURL(env.ANTHROPIC_BASE_URL, 'https://api.anthropic.com/v1')
    })(modelId)
};

/**
 * 按 `provider:model` 规格创建语言模型。
 *
 * 未知供应商、规格不完整或缺少对应密钥时直接抛错，不静默换成别的模型。
 */
export function resolveModel(spec: string, env: ModelEnvironment): LanguageModel {
  const separator = spec.indexOf(':');
  const provider = spec.slice(0, Math.max(separator, 0));
  const modelId = spec.slice(separator + 1);
  if (separator <= 0 || !modelId) throw new Error(`模型规格 ${spec} 应写成 provider:model`);
  const create = PROVIDERS[provider];
  if (!create) throw new Error(`未知的模型供应商 ${provider}，支持：${Object.keys(PROVIDERS).join('、')}`);
  return create(modelId, env);
}

/** 本次 run 使用的语言模型；测试经 `setupLocals` 预先放入模拟模型。 */
export const languageModelKey = locals.create<LanguageModel>('model-designer.language-model');

/** 取本次 run 的语言模型：`AGENT_MODEL` 优先，否则用智能体定义里的默认模型。 */
export function agentModel(defaultSpec: string, env: ModelEnvironment = process.env): LanguageModel {
  return (
    locals.get(languageModelKey) ?? locals.set(languageModelKey, resolveModel(env.AGENT_MODEL ?? defaultSpec, env))
  );
}
