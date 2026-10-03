/**
 * @fileoverview 标记事件的解析与字节计量（`specs/005-us-909-session-replay/data-model.md` §1.2、§2）。
 *
 * @remarks
 * 标记与普通事件同表、同样计字节，所以 `eventBytes` 是上限判定的唯一口径：它一旦与落库的 `bytes` 列算法分家，
 * `usage()` 与截断时机就会对不上。`parseReplayMarker` 对「tag 是我们的、payload 却不对」直接抛错而不是返回 `null`：
 * 库里不会自然出现这种行，出现就说明数据被外部改过，悄悄当成普通事件会让回放少一个标记而没人知道。
 */

import { EventType, type eventWithTime } from '@rrweb/types';
import { describe, expect, it } from 'vitest';
import { RxDBReplayError } from '../errors.js';
import {
  createReplayMarkerEvent,
  eventBytes,
  parseReplayMarker,
  REPLAY_CUSTOM_EVENT_TYPE,
  REPLAY_MARKER_TAGS
} from '../markers.js';

const custom = (tag: string, payload: unknown): eventWithTime =>
  ({ type: EventType.Custom, data: { tag, payload }, timestamp: 1000 }) as eventWithTime;

describe('REPLAY_CUSTOM_EVENT_TYPE', () => {
  it('与 rrweb 的 EventType.Custom 同值（本包运行时不静态引入 rrweb）', () => {
    expect(REPLAY_CUSTOM_EVENT_TYPE).toBe(EventType.Custom);
  });
});

describe('parseReplayMarker', () => {
  it('三种标记各自解析出 { tag, payload }', () => {
    expect(parseReplayMarker(custom(REPLAY_MARKER_TAGS.commit, { commitId: 'c1', branchId: 'main' }))).toEqual({
      tag: 'rxdb-replay:commit',
      payload: { commitId: 'c1', branchId: 'main' }
    });
    expect(
      parseReplayMarker(custom(REPLAY_MARKER_TAGS.truncated, { code: 'session_limit', limitBytes: 1024 }))
    ).toEqual({
      tag: 'rxdb-replay:truncated',
      payload: { code: 'session_limit', limitBytes: 1024 }
    });
    expect(parseReplayMarker(custom(REPLAY_MARKER_TAGS.gap, { reason: 'stash_unavailable' }))).toEqual({
      tag: 'rxdb-replay:gap',
      payload: { reason: 'stash_unavailable' }
    });
  });

  it('不是 Custom 事件 → null', () => {
    const meta = { type: EventType.Meta, data: { href: 'x', width: 1, height: 1 }, timestamp: 1 } as eventWithTime;

    expect(parseReplayMarker(meta)).toBeNull();
  });

  it('Custom 事件但 tag 不是本插件的 → null', () => {
    expect(parseReplayMarker(custom('app:click', { anything: true }))).toBeNull();
  });

  it.each([
    ['commit 缺 branchId', REPLAY_MARKER_TAGS.commit, { commitId: 'c1' }],
    ['commit 的 commitId 不是字符串', REPLAY_MARKER_TAGS.commit, { commitId: 1, branchId: 'main' }],
    ['commit 的 commitId 是空串', REPLAY_MARKER_TAGS.commit, { commitId: '', branchId: 'main' }],
    ['truncated 的 code 不认识', REPLAY_MARKER_TAGS.truncated, { code: 'quota', limitBytes: 1 }],
    ['truncated 的 limitBytes 不是正整数', REPLAY_MARKER_TAGS.truncated, { code: 'store_limit', limitBytes: 0 }],
    ['gap 的 reason 不认识', REPLAY_MARKER_TAGS.gap, { reason: 'other' }],
    ['payload 不是对象', REPLAY_MARKER_TAGS.gap, 'stash_unavailable'],
    ['payload 是 null', REPLAY_MARKER_TAGS.commit, null]
  ])('tag 对、payload 错（%s）→ 抛 invalid_marker', (_label, tag, payload) => {
    expect(() => parseReplayMarker(custom(tag, payload))).toThrow(
      expect.objectContaining({ name: 'RxDBReplayError', code: 'invalid_marker' })
    );
  });

  it('抛出的是 RxDBReplayError 实例', () => {
    expect(() => parseReplayMarker(custom(REPLAY_MARKER_TAGS.gap, {}))).toThrow(RxDBReplayError);
  });
});

describe('createReplayMarkerEvent', () => {
  it('造出 Custom 事件，能被 parseReplayMarker 原样解析回来', () => {
    const event = createReplayMarkerEvent(REPLAY_MARKER_TAGS.truncated, { code: 'store_limit', limitBytes: 2048 }, 42);

    expect(event).toEqual({
      type: EventType.Custom,
      data: { tag: 'rxdb-replay:truncated', payload: { code: 'store_limit', limitBytes: 2048 } },
      timestamp: 42
    });
    expect(parseReplayMarker(event)).toEqual({
      tag: 'rxdb-replay:truncated',
      payload: { code: 'store_limit', limitBytes: 2048 }
    });
  });
});

describe('eventBytes', () => {
  it('= JSON.stringify 后的 UTF-8 字节数（多字节字符按字节计）', () => {
    const event = custom('app:note', { text: '中文' });

    expect(eventBytes(event)).toBe(new TextEncoder().encode(JSON.stringify(event)).length);
    expect(eventBytes(event)).toBe(JSON.stringify(event).length + 4);
  });
});
