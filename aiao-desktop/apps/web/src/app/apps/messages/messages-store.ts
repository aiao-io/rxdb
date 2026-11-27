import { Service, computed, inject } from '@angular/core';

import { I18N } from '@aiao/rxdb-i18n-angular';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { time12Plain } from '../../shared/format';
import { LocalMessage, MessageSaveError } from './message-drafts';
import { buildChats } from './messages-model';
import { ChatMessage, ChatThread } from './messages.entities';

/** 某个会话里的全部消息。 */
const inThread = (threadId: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'threadId' as const, operator: '=' as const, value: threadId }]
});

/**
 * 信息的会话与消息：读是两条活查询拼成的会话列表，写是追加消息和新建会话。
 * 不带状态，由每个信息窗口各提供一份；所有窗口读写的都是库里同一份数据。
 */
@Service({ autoProvided: false })
export class MessagesStore {
  private readonly data = inject(DesktopData);
  private readonly i18n = inject(I18N);
  private readonly threads = liveQuery(
    () => ChatThread.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    ChatThread
  );
  private readonly lines = liveQuery(
    () => ChatMessage.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    ChatMessage
  );

  /** 全部会话（最新建的在最前）连同各自的消息（按发送顺序）。 */
  readonly chats = computed(() => buildChats(this.threads(), this.lines()));

  /** 按稳定 ID 追加本地记录，重试不会重复插入，不产生任何远程发送。 */
  append(message: LocalMessage): Promise<void> {
    return this.data.transaction(async executor => {
      const threads = executor.getRepository(ChatThread);
      const [thread] = await threads.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: message.threadId }] },
        limit: 1
      });
      if (!thread) throw new MessageSaveError('missing', key => this.i18n.t(key));
      const messages = executor.getRepository(ChatMessage);
      const [existing] = await messages.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: message.id }] },
        limit: 1
      });
      if (existing) {
        if (existing.threadId !== message.threadId || existing.text !== message.text || existing.sender !== 'me')
          throw new MessageSaveError('conflict', key => this.i18n.t(key));
        return;
      }
      const [last] = await messages.find({
        where: inThread(message.threadId),
        orderBy: [{ field: 'position', sort: 'desc' }],
        limit: 1
      });
      await messages.create(
        this.data.instantiate(ChatMessage, {
          ...message,
          sender: 'me',
          position: last ? last.position + 1 : 0
        })
      );
      await threads.update(thread, { timeLabel: time12Plain(new Date()) });
    });
  }

  /** 新建一个空会话（像 ⌘N 那样），排在列表最前面；返回新会话的编号。 */
  create(): Promise<string> {
    return this.data.transaction(async executor => {
      const threads = executor.getRepository(ChatThread);
      const [first] = await threads.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 1 });
      const thread = await threads.create(
        this.data.instantiate(ChatThread, {
          name: 'Local Conversation',
          color: '#8e8e93',
          timeLabel: time12Plain(new Date()),
          isGroup: false,
          position: first ? first.position - 1 : 0
        })
      );
      return thread.id;
    });
  }

  /** 删除一段会话和它的全部消息；找不到这个会话就抛错。 */
  remove(threadId: string): Promise<void> {
    return this.data.transaction(async executor => {
      const threads = executor.getRepository(ChatThread);
      const [thread] = await threads.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: threadId }] },
        limit: 1
      });
      if (!thread) throw new Error(`Conversation not found: ${threadId}`);
      const messages = executor.getRepository(ChatMessage);
      const lines = await messages.find({ where: inThread(threadId) });
      for (const line of lines) await messages.remove(line);
      await threads.remove(thread);
    });
  }
}
