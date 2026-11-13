import { hasModelOps, type ModelOp } from '@aiao-model-design/model-ops';
import type { ChatStatus, UIMessage } from 'ai';
import type { ChatMessageItem, ChatQuestion, ChatToolCard } from '../components/ai/ai-message.component';

/** 提问工具名，与智能体注册表一致。 */
export const ASK_USER_TOOL = 'ask_user';

interface ToolPart {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

function toolParts(message: UIMessage): ToolPart[] {
  return message.parts.filter((part): part is ToolPart & UIMessage['parts'][number] => part.type.startsWith('tool-'));
}

function toolName(part: ToolPart): string {
  return part.type.slice('tool-'.length);
}

function outputText(output: unknown): string {
  if (typeof output !== 'object' || output === null) return '';
  const value = output as { ok?: unknown; summary?: unknown; errors?: unknown };
  if (value.ok === true && typeof value.summary === 'string') return value.summary;
  return Array.isArray(value.errors) ? value.errors.join('\n') : '';
}

function toolCard(part: ToolPart): ChatToolCard {
  const base = { id: part.toolCallId, name: toolName(part) };
  if (part.state === 'output-error') return { ...base, state: 'failed', summary: part.errorText ?? '' };
  if (part.state !== 'output-available') return { ...base, state: 'running', summary: '' };
  const ok = (part.output as { ok?: unknown } | undefined)?.ok === true;
  return { ...base, state: ok ? 'done' : 'failed', summary: outputText(part.output) };
}

function question(part: ToolPart): ChatQuestion | undefined {
  const input = part.input as Partial<Pick<ChatQuestion, 'question' | 'options'>> | undefined;
  if (!input?.question || !Array.isArray(input.options)) return undefined;
  const answer = part.state === 'output-available' ? (part.output as { label?: string } | undefined)?.label : undefined;
  return { toolCallId: part.toolCallId, question: input.question, options: input.options, answer };
}

function toItem(message: UIMessage, isStreaming: boolean): ChatMessageItem {
  const parts = toolParts(message);
  const asking = parts.find(part => toolName(part) === ASK_USER_TOOL);
  const content = message.parts
    .flatMap(part => (part.type === 'text' ? [part.text] : []))
    .filter(text => text.trim())
    .join('\n\n');
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content,
    isStreaming,
    tools: parts.filter(part => toolName(part) !== ASK_USER_TOOL).map(toolCard),
    ...(asking ? { question: question(asking) } : {})
  };
}

/**
 * 把会话的 UI 消息映射为面板的消息项：正文合并成 Markdown，工具调用写成卡片，提问写成问题与选项。
 *
 * 生成中且助手还没开口时，补一条空的流式助手消息作为占位。
 */
export function toChatItems(messages: readonly UIMessage[], status: ChatStatus): ChatMessageItem[] {
  const busy = status === 'submitted' || status === 'streaming';
  const visible = messages.filter(message => message.role !== 'system');
  const items = visible.map((message, index) =>
    toItem(message, busy && index === visible.length - 1 && message.role === 'assistant')
  );
  if (busy && items.at(-1)?.role !== 'assistant')
    items.push({ id: 'pending-assistant', role: 'assistant', content: '', isStreaming: true, tools: [] });
  return items;
}

/** 最后一条助手消息里还没回答的提问，返回其 `toolCallId`。 */
export function pendingQuestion(messages: readonly UIMessage[]): string | undefined {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return undefined;
  return toolParts(last).find(part => toolName(part) === ASK_USER_TOOL && part.state === 'input-available')?.toolCallId;
}

/** 一次需要写入 AI 分支的工具输出。 */
export interface PendingToolOutput {
  toolCallId: string;
  ops: ModelOp[];
}

/** 按出现顺序列出带操作、且 `toolCallId` 不在已写入集合里的工具输出。 */
export function unappliedToolOutputs(
  messages: readonly UIMessage[],
  applied: ReadonlySet<string>
): PendingToolOutput[] {
  return messages.flatMap(message =>
    toolParts(message)
      .filter(part => part.state === 'output-available' && !applied.has(part.toolCallId) && hasModelOps(part.output))
      .map(part => ({ toolCallId: part.toolCallId, ops: (part.output as { ops: ModelOp[] }).ops }))
  );
}
