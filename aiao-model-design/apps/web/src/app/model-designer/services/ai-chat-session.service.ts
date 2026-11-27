import { type UUID } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { Injectable, type Signal, computed } from '@angular/core';
import type { ChatMessageItem } from '../components/ai/ai-message.component';
import type { ChatSessionItem } from '../components/ai/ai-session-list.component';
import { ChatMessage, ChatSession } from '../models/index.js';

/**
 * AI 对话会话管理服务
 *
 * 基于 RxDB 持久化 ChatSession 与 ChatMessage，
 * 通过 useFindAll 提供响应式列表，支持完整的 CRUD 操作。
 */
@Injectable()
export class AiChatSessionService {
  readonly #allSessions = useFindAll(ChatSession, { where: { combinator: 'and', rules: [] } }).value;
  readonly #allMessages = useFindAll(ChatMessage, { where: { combinator: 'and', rules: [] } }).value;
  readonly #sessionsCache = new Map<string, Signal<ChatSessionItem[]>>();
  readonly #messagesCache = new Map<string, Signal<ChatMessageItem[]>>();

  /**
   * 获取指定模型设计下的会话列表（响应式，按最近使用时间降序）
   */
  sessionsOf(modelDesignId: string): Signal<ChatSessionItem[]> {
    const cached = this.#sessionsCache.get(modelDesignId);
    if (cached) return cached;
    const sessions = computed(() =>
      this.#allSessions()
        .filter(s => s.modelDesignId === modelDesignId)
        .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
        .map(s => ({ id: s.id, name: s.name, lastUsedAt: s.lastUsedAt.toISOString() }))
    );
    this.#sessionsCache.set(modelDesignId, sessions);
    return sessions;
  }

  /**
   * 获取指定会话的消息列表（响应式，按创建时间升序）
   */
  messagesOf(sessionId: string): Signal<ChatMessageItem[]> {
    const cached = this.#messagesCache.get(sessionId);
    if (cached) return cached;
    const messages = computed(() =>
      this.#allMessages()
        .filter(m => m.chatSessionId === sessionId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(m => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() }))
    );
    this.#messagesCache.set(sessionId, messages);
    return messages;
  }

  /**
   * 创建新会话
   */
  async createSession(modelDesignId: string, name: string): Promise<ChatSession> {
    const now = new Date();
    const session = new ChatSession({ name, lastUsedAt: now, createdAt: now });
    session.modelDesignId = modelDesignId as UUID;
    await session.save();
    return session;
  }

  /**
   * 重命名会话
   */
  async renameSession(id: string, name: string): Promise<void> {
    const session = this.#allSessions().find(s => s.id === id);
    if (!session) return;
    session.name = name;
    await session.save();
  }

  /**
   * 更新会话最近使用时间
   */
  async touchSession(id: string): Promise<void> {
    const session = this.#allSessions().find(s => s.id === id);
    if (!session) return;
    session.lastUsedAt = new Date();
    await session.save();
  }

  /**
   * 删除会话（关联消息由 RxDB 级联删除）
   */
  async deleteSession(id: string): Promise<void> {
    const session = this.#allSessions().find(s => s.id === id);
    if (!session) return;
    await session.remove();
  }

  /**
   * 向会话添加消息
   */
  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<ChatMessage> {
    const msg = new ChatMessage({ role, content, createdAt: new Date() });
    msg.chatSessionId = sessionId as UUID;
    await msg.save();
    return msg;
  }
}
