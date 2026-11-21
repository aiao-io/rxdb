import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceFeed, type FeedEvents } from './workspace-feed.js';

type Handler = (message: Record<string, unknown>) => void;
/** 假的 Realtime 客户端：记下每个频道的配置、各事件的回调与上报的在线状态，测试直接驱动这些回调。 */
function setup() {
  const channels: {
    topic: string;
    options: unknown;
    broadcast: Record<string, Handler>;
    sync: () => void;
    status: (value: string) => void;
    state: Record<string, Record<string, unknown>[]>;
    tracked: unknown[];
  }[] = [];
  const auth = {
    channel: vi.fn((topic: string, options: unknown) => {
      const record = {
        topic,
        options,
        broadcast: {} as Record<string, Handler>,
        sync: (() => undefined) as () => void,
        status: (() => undefined) as (value: string) => void,
        state: {} as Record<string, Record<string, unknown>[]>,
        tracked: [] as unknown[]
      };
      channels.push(record);
      const channel = {
        on: vi.fn((type: string, filter: { event: string }, callback: Handler & (() => void)) => {
          if (type === 'broadcast') record.broadcast[filter.event] = callback;
          if (type === 'presence' && filter.event === 'sync') record.sync = callback;
          return channel;
        }),
        subscribe: vi.fn((callback: (value: string) => void) => {
          record.status = callback;
          return channel;
        }),
        presenceState: () => record.state,
        track: vi.fn(async (payload: unknown) => {
          record.tracked.push(payload);
          return 'ok';
        })
      };
      return channel;
    }),
    removeChannel: vi.fn().mockResolvedValue('ok')
  };
  const events = {
    changed: vi.fn(),
    revoked: vi.fn(),
    presence: vi.fn(),
    status: vi.fn()
  } satisfies FeedEvents;
  const feed = new WorkspaceFeed(auth as unknown as SupabaseClient, events);
  return { channels, auth, events, feed };
}
const session = { userId: 'alice', sessionId: 'session-1' };
const signal = { id: 'message-id', revision: 7, kinds: ['details', 'audit'], prIds: ['pr'], noticeUserIds: ['bob'] };

describe('私有频道上的失效通知、撤权与在线状态', () => {
  it('加入工作区的私有频道，在线状态以会话为键；每次订阅成功（含断线重连）都重新上报当前查看位置', () => {
    const { channels, auth, events, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets' }, session);
    expect(auth.channel).toHaveBeenCalledWith('collab:team:assets', {
      config: { private: true, presence: { key: 'session-1' } }
    });
    feed.view('pr', null);
    expect(channels[0].tracked).toEqual([]);
    channels[0].status('SUBSCRIBED');
    expect(channels[0].tracked).toEqual([{ userId: 'alice', prId: 'pr', recordId: null }]);
    feed.view('pr', null);
    expect(channels[0].tracked).toHaveLength(1);
    feed.view('pr', 'record-1');
    expect(channels[0].tracked).toEqual([
      { userId: 'alice', prId: 'pr', recordId: null },
      { userId: 'alice', prId: 'pr', recordId: 'record-1' }
    ]);
    channels[0].status('CHANNEL_ERROR');
    feed.view(null, null);
    expect(channels[0].tracked).toHaveLength(2);
    channels[0].status('SUBSCRIBED');
    expect(channels[0].tracked.at(-1)).toEqual({ userId: 'alice', prId: null, recordId: null });
    expect(events.status.mock.calls.map(call => call[0])).toEqual(['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED']);
  });
  it('只转交白名单形状的失效通知与撤权事件，载荷里多出的字段（如消息 ID）不进入结果', () => {
    const { channels, events, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets' }, session);
    channels[0].broadcast['changed']({ event: 'changed', payload: signal });
    expect(events.changed).toHaveBeenCalledWith({
      revision: 7,
      kinds: ['details', 'audit'],
      prIds: ['pr'],
      noticeUserIds: ['bob']
    });
    for (const payload of [
      { ...signal, revision: 0 },
      { ...signal, revision: '7' },
      { ...signal, kinds: ['comments'] },
      { ...signal, prIds: [1] },
      { revision: 8 }
    ])
      channels[0].broadcast['changed']({ event: 'changed', payload });
    expect(events.changed).toHaveBeenCalledTimes(1);
    channels[0].broadcast['revoked']({ event: 'revoked', payload: { id: 'x', revision: 9, userIds: ['bob'] } });
    channels[0].broadcast['revoked']({ event: 'revoked', payload: { revision: 9 } });
    expect(events.revoked.mock.calls).toEqual([[{ revision: 9, userIds: ['bob'] }]]);
  });
  it('在线会话按 Presence 全集展开，只保留形状合规的会话与查看位置', () => {
    const { channels, events, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets' }, session);
    channels[0].state = {
      'session-1': [{ userId: 'alice', prId: null, recordId: null, presence_ref: 'a' }],
      'session-2': [{ userId: 'bob', prId: 'pr', recordId: 'record-1', presence_ref: 'b' }],
      'session-3': [{ userId: 'carol', prId: '<script>', recordId: null, presence_ref: 'c' }],
      'session-4': [{ prId: null, recordId: null, presence_ref: 'd' }],
      'bad key!': [{ userId: 'dave', prId: null, recordId: null, presence_ref: 'e' }]
    };
    channels[0].sync();
    expect(events.presence).toHaveBeenCalledWith([
      { userId: 'alice', sessionId: 'session-1', prId: null, recordId: null },
      { userId: 'bob', sessionId: 'session-2', prId: 'pr', recordId: 'record-1' }
    ]);
  });
  it('切换团队或停止后撤销旧频道，旧频道迟到的消息、在线状态与状态变化一律丢弃', () => {
    const { channels, auth, events, feed } = setup();
    feed.start({ teamId: 'team', appId: 'assets' }, session);
    feed.start({ teamId: 'other', appId: 'assets' }, session);
    expect(auth.removeChannel).toHaveBeenCalledTimes(1);
    expect(channels[1].topic).toBe('collab:other:assets');
    channels[0].broadcast['changed']({ event: 'changed', payload: signal });
    channels[0].broadcast['revoked']({ event: 'revoked', payload: { revision: 9, userIds: ['alice'] } });
    channels[0].sync();
    channels[0].status('CLOSED');
    expect(events.changed).not.toHaveBeenCalled();
    expect(events.revoked).not.toHaveBeenCalled();
    expect(events.presence).not.toHaveBeenCalled();
    expect(events.status).not.toHaveBeenCalled();
    feed.stop();
    expect(auth.removeChannel).toHaveBeenCalledTimes(2);
    channels[1].status('SUBSCRIBED');
    feed.view('pr', null);
    expect(channels[1].tracked).toEqual([]);
    expect(events.status).not.toHaveBeenCalled();
  });
});
