import { Service, computed, inject } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { time12Plain } from '../../shared/format';
import { buildChats } from './messages-model';
import { ChatMessage, ChatThread } from './messages.entities';

/** 某个会话里的全部消息。 */
const inThread = (threadId: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'threadId' as const, operator: '=' as const, value: threadId }]
});

/** 新会话里自带的一句提示，由「对方」说出。 */
export const NEW_CHAT_PROMPT = 'Type a message to begin.';

/**
 * 信息的会话与消息：读是两条活查询拼成的会话列表，写是追加消息和新建会话。
 * 不带状态，由每个信息窗口各提供一份；所有窗口读写的都是库里同一份数据。
 */
@Service({ autoProvided: false })
export class MessagesStore {
  private readonly data = inject(DesktopData);
  private readonly threads = liveQuery(
    () => ChatThread.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );
  private readonly lines = liveQuery(
    () => ChatMessage.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    []
  );

  /** 全部会话（最新建的在最前）连同各自的消息（按发送顺序）。 */
  readonly chats = computed(() => buildChats(this.threads(), this.lines()));

  /** 在会话末尾追加一条消息：次序取本会话当前最大值加一。 */
  append(threadId: string, sender: 'me' | 'them', text: string): Promise<void> {
    return this.data.transaction(async executor => {
      const messages = executor.getRepository(ChatMessage);
      const [last] = await messages.find({
        where: inThread(threadId),
        orderBy: [{ field: 'position', sort: 'desc' }],
        limit: 1
      });
      await messages.create(
        this.data.instantiate(ChatMessage, { threadId, sender, text, position: last ? last.position + 1 : 0 })
      );
    });
  }

  /** 新建一个空会话（像 ⌘N 那样），排在列表最前面；返回新会话的编号。 */
  create(): Promise<string> {
    return this.data.transaction(async executor => {
      const threads = executor.getRepository(ChatThread);
      const [first] = await threads.find({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }], limit: 1 });
      const thread = await threads.create(
        this.data.instantiate(ChatThread, {
          name: 'New Message',
          color: '#8e8e93',
          timeLabel: time12Plain(new Date()),
          isGroup: false,
          position: first ? first.position - 1 : 0
        })
      );
      await executor.getRepository(ChatMessage).create(
        this.data.instantiate(ChatMessage, {
          threadId: thread.id,
          sender: 'them',
          text: NEW_CHAT_PROMPT,
          position: 0
        })
      );
      return thread.id;
    });
  }
}
