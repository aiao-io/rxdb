import { ValidationError } from '../../../gateway/core/errors';
import type { ChatMessage } from '../../../gateway/providers/types';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicSystemTextPart {
  type: 'text';
  text: string;
  cache_control?: unknown;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<AnthropicTextBlock | { type: string; [k: string]: unknown }>;
}

export interface AnthropicMessagesRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicSystemTextPart[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

export interface NormalizedChatPayload {
  modelId: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  stream: boolean;
}

const flattenContent = (content: AnthropicMessage['content']): string => {
  if (typeof content === 'string') return content;
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      texts.push((block as AnthropicTextBlock).text);
      continue;
    }
    if (block.type === 'image') {
      throw new ValidationError('this gateway does not support image content blocks yet', {
        code: 'unsupported_field',
        param: 'messages[].content[].type'
      });
    }
    if (block.type === 'tool_use' || block.type === 'tool_result') {
      throw new ValidationError(`this gateway does not support ${block.type} content blocks yet`, {
        code: 'unsupported_field',
        param: 'messages[].content[].type'
      });
    }
    // 未知 type → 静默忽略（FR-055 SDK 演进兼容）
  }
  return texts.join('');
};

const flattenSystem = (system: AnthropicMessagesRequest['system']): string | null => {
  if (system === undefined) return null;
  if (typeof system === 'string') return system;
  const parts: string[] = [];
  for (const p of system) {
    if (p.cache_control !== undefined) {
      throw new ValidationError('this gateway does not support system[].cache_control yet', {
        code: 'unsupported_field',
        param: 'system[].cache_control'
      });
    }
    if (p.type === 'text') parts.push(p.text);
  }
  return parts.join('');
};

/**
 * Anthropic `/v1/messages` 请求体 → 内核 ChatRequest 风格规范化
 *
 * - 顶层 `system: string` 注入到 messages 头部为 `role: 'system'`
 * - 顶层 `system: TextBlock[]` 拼接所有 text 后注入
 * - 单条 message `content: string` 透传
 * - 单条 message `content: ContentBlock[]` 仅保留 text；image / tool_use 抛 ValidationError
 * - 顶层 system 与 messages 内的 system role 不会同时出现（Anthropic 协议规定）
 */
export function normalizeAnthropicRequest(req: AnthropicMessagesRequest): NormalizedChatPayload {
  const messages: ChatMessage[] = [];
  const systemText = flattenSystem(req.system);
  if (systemText) {
    messages.push({ role: 'system', content: systemText });
  }
  for (const m of req.messages) {
    const content = flattenContent(m.content);
    messages.push({ role: m.role, content });
  }
  return {
    modelId: req.model,
    messages,
    temperature: req.temperature,
    topP: req.top_p,
    maxTokens: req.max_tokens,
    stop: req.stop_sequences,
    stream: Boolean(req.stream)
  };
}
