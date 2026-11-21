import { describe, expect, it } from 'vitest';

import { MessageFields, ThreadFields, buildChats } from './messages-model';

const thread = (id: string, name: string, isGroup = false): ThreadFields => ({
  id,
  name,
  color: '#fff',
  timeLabel: '4:28 PM',
  isGroup
});
const message = (threadId: string, sender: 'me' | 'them', text: string): MessageFields => ({ threadId, sender, text });

describe('buildChats', () => {
  it('会话保持传入的顺序，消息按传入的顺序归到各自的会话', () => {
    const chats = buildChats(
      [thread('a', 'Kate'), thread('b', 'John', true)],
      [message('b', 'them', 'did the review land'), message('a', 'them', 'hi'), message('b', 'me', 'merged')]
    );
    expect(chats.map(chat => chat.name)).toEqual(['Kate', 'John']);
    expect(chats[0].messages).toEqual([{ from: 'them', text: 'hi' }]);
    expect(chats[1].messages).toEqual([
      { from: 'them', text: 'did the review land' },
      { from: 'me', text: 'merged' }
    ]);
  });

  it('把行字段换成界面字段', () => {
    const [chat] = buildChats([thread('a', 'Design Crew', true)], []);
    expect(chat).toEqual({ id: 'a', name: 'Design Crew', color: '#fff', time: '4:28 PM', group: true, messages: [] });
  });

  it('消息还没到的会话保留，找不到会话的消息被忽略', () => {
    const chats = buildChats([thread('a', 'Kate')], [message('gone', 'me', 'orphan')]);
    expect(chats).toHaveLength(1);
    expect(chats[0].messages).toEqual([]);
  });

  it('每次都返回新对象', () => {
    const threads = [thread('a', 'Kate')];
    const messages = [message('a', 'me', 'hi')];
    expect(buildChats(threads, messages)[0]).not.toBe(buildChats(threads, messages)[0]);
  });
});
