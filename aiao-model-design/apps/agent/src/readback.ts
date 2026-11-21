import { outlineModel } from '@aiao-model-design/model-ops';
import type { ModelMessage } from 'ai';
import type { AgentClientData } from './client-data';

/** 本轮的回读块：模型此刻的概要，以及上一轮之后用户手动做的修改。 */
export function readbackBlock({ model, edits }: AgentClientData): string {
  const state = `<model_state>\n${outlineModel(model)}\n</model_state>`;
  if (!edits.length) return state;
  return `${state}\n<since_your_last_turn>\n${edits.map(edit => `- ${edit}`).join('\n')}\n</since_your_last_turn>`;
}

/**
 * 把回读块插在最后一条用户消息之前。
 *
 * 之前各轮的消息逐字节不变，提示缓存的前缀因此保持有效；插在用户消息之前也不会拆开
 * 助手的工具调用与其结果。
 */
export function injectBeforeLastUser(messages: ModelMessage[], block: string): ModelMessage[] {
  const index = messages.findLastIndex(message => message.role === 'user');
  if (index < 0) return messages;
  return [...messages.slice(0, index), { role: 'user', content: block }, ...messages.slice(index)];
}
