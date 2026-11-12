import { InjectionToken } from '@angular/core';
import { TriggerChatTransport, type ChatSessionPersistedState } from '@trigger.dev/sdk/chat';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

/** 设计器用到的会话传输能力：AI SDK 的 `ChatTransport` 加上 Trigger.dev 会话的几项操作。 */
export interface AgentTransport extends ChatTransport<UIMessage> {
  /** 下一次发送（含提问回填后的自动续轮）随元数据带上的数据 */
  setClientData(data: Record<string, unknown> | undefined): void;
  stopGeneration(chatId: string): Promise<boolean>;
  /** 当前会话流游标，每轮结束时与消息一起保存 */
  getSession(chatId: string): ChatSessionPersistedState | undefined;
}

/** 创建一个会话传输所需的参数。 */
export interface AgentTransportOptions {
  apiUrl: string;
  task: string;
  chatId: string;
  /** 上一轮结束时保存的游标；刷新页面后据此续流 */
  cursor: ChatSessionPersistedState | null;
  /** 为会话创建或刷新令牌（经 Worker 签发） */
  token: (chatId: string) => Promise<string>;
  /** 会话状态变化时回调；会话结束时为 `null` */
  onSession: (state: ChatSessionPersistedState | null) => void;
}

/** 会话传输的工厂。 */
export type AgentTransportFactory = (options: AgentTransportOptions) => AgentTransport;

/** 默认用 Trigger.dev 的浏览器传输直连实例的会话流；测试注入假的传输。 */
export const AGENT_TRANSPORT_FACTORY = new InjectionToken<AgentTransportFactory>('AGENT_TRANSPORT_FACTORY', {
  providedIn: 'root',
  factory: () => options =>
    new TriggerChatTransport({
      task: options.task,
      baseURL: options.apiUrl,
      accessToken: ({ chatId }) => options.token(chatId),
      startSession: async ({ chatId }) => ({ publicAccessToken: await options.token(chatId) }),
      sessions: options.cursor ? { [options.chatId]: options.cursor } : undefined,
      onSessionChange: (_chatId, state) => options.onSession(state)
    })
});

/** 传输上观察到的事件。 */
export interface TransportWatcher {
  /** 一次发送即将发出，`messages` 已包含本轮的用户消息或回填的工具结果 */
  sent(messages: UIMessage[]): void;
  /** 一个工具输出片段经过 */
  toolOutput(toolCallId: string, output: unknown): void;
}

function tap(stream: ReadableStream<UIMessageChunk>, watcher: TransportWatcher) {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === 'tool-output-available') watcher.toolOutput(chunk.toolCallId, chunk.output);
        controller.enqueue(chunk);
      }
    })
  );
}

/**
 * 包一层传输，观察发送与工具输出。
 *
 * 新发送与刷新后的续流都经过这里，所以写入 AI 分支不必监听消息信号。
 */
export function watchTransport(transport: AgentTransport, watcher: TransportWatcher): AgentTransport {
  return {
    sendMessages: async options => {
      watcher.sent(options.messages);
      return tap(await transport.sendMessages(options), watcher);
    },
    reconnectToStream: async options => {
      const stream = await transport.reconnectToStream(options);
      return stream ? tap(stream, watcher) : null;
    },
    setClientData: data => transport.setClientData(data),
    stopGeneration: chatId => transport.stopGeneration(chatId),
    getSession: chatId => transport.getSession(chatId)
  };
}
