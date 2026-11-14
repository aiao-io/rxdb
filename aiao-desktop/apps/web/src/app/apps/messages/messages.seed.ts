import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { CHAT_SEED_DATA } from './messages-data';
import { ChatMessage, ChatThread } from './messages.entities';

/** 信息的初始数据：十段会话和各自的消息（会话顺序、消息顺序与原来一致）。 */
export const MESSAGES_SEED: DataSeed = {
  domain: 'messages',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const threads = executor.getRepository(ChatThread);
    const lines = executor.getRepository(ChatMessage);
    const { entityManager } = rxdb;
    for (const [position, chat] of CHAT_SEED_DATA.entries()) {
      const thread = await threads.create(
        entityManager.instantiate(ChatThread, {
          name: chat.name,
          color: chat.color,
          timeLabel: chat.time,
          isGroup: chat.group === true,
          position
        })
      );
      for (const [order, line] of chat.messages.entries())
        await lines.create(
          entityManager.instantiate(ChatMessage, {
            threadId: thread.id,
            sender: line.from,
            text: line.text,
            position: order
          })
        );
    }
  }
};
