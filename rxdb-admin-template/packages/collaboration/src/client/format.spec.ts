import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateTime, personName, relativeTime, shortId, timeElement } from './format.js';

beforeEach(() => {
  const window = new Window();
  window.document.documentElement.lang = 'zh-CN';
  vi.stubGlobal('document', window.document);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('界面上的短标识', () => {
  it('UUID 取末 8 位（UUIDv7 的前段是时间戳，同一分钟内的提交前缀相同）；其他长标识截断，短的原样', () => {
    expect(shortId('01970a3b-1c2d-7e3f-8a9b-0123456789ab')).toBe('456789ab');
    expect(shortId('commit-permission-long')).toBe('commit-permi…');
    expect(shortId('root')).toBe('root');
  });
});

describe('成员的名字', () => {
  const members = [{ id: 'alice', email: 'alice@example.test' }];
  it('成员列表里有就用邮箱；不在列表里时回落到给定的身份，再不然显示短标识；没有标识时为空', () => {
    expect(personName(members, 'alice')).toBe('alice@example.test');
    expect(personName([], 'bob', { id: 'bob', email: 'bob@example.test' })).toBe('bob@example.test');
    expect(personName([], '01970a3b-1c2d-7e3f-8a9b-0123456789ab')).toBe('456789ab');
    expect(personName(members, null)).toBe('');
  });
});

describe('时间', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  it('一周以内用相对时间，更早的用完整写法；按界面语言（<html lang>）格式化', () => {
    expect(relativeTime(now - 3 * 60_000, now)).toBe('3分钟前');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2小时前');
    expect(relativeTime(now - 8 * 86_400_000, now)).toBe(dateTime(now - 8 * 86_400_000));
  });
  it('时间元素显示相对时间，datetime 与悬停提示给出完整时刻', () => {
    const at = Date.now() - 60_000;
    const node = timeElement(at);
    expect(node.dateTime).toBe(new Date(at).toISOString());
    expect(node.title).toBe(dateTime(at));
    expect(node.textContent).toBe(relativeTime(at));
  });
});
