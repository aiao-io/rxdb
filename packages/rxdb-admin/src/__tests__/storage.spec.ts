import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createWebStorage } from '../storage.js';

describe('createMemoryStorage', () => {
  it('读写删除与初始内容', () => {
    const storage = createMemoryStorage({ a: '1' });
    expect(storage.getItem('a')).toBe('1');
    expect(storage.getItem('missing')).toBeNull();
    storage.setItem('b', '2');
    expect(storage.getItem('b')).toBe('2');
    storage.removeItem('a');
    expect(storage.getItem('a')).toBeNull();
  });
});

describe('createWebStorage', () => {
  it('宿主提供对应存储时直接代理', () => {
    const local = createMemoryStorage();
    const storage = createWebStorage('local', { localStorage: local as unknown as Storage });
    storage.setItem('k', 'v');
    expect(local.getItem('k')).toBe('v');
    expect(storage.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(local.getItem('k')).toBeNull();
  });

  it('按种类取 localStorage / sessionStorage', () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const host = { localStorage: local as unknown as Storage, sessionStorage: session as unknown as Storage };
    createWebStorage('session', host).setItem('k', 'v');
    expect(session.getItem('k')).toBe('v');
    expect(local.getItem('k')).toBeNull();
  });

  it('宿主没有该存储（SSR / Node）时退化为内存存储，本次会话内可读写', () => {
    const storage = createWebStorage('local', {});
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });

  it('访问存储抛错（隐私模式 / 配额）时读返回 null、写入被吞掉，不破坏调用方', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      }
    } as unknown as Storage;
    const storage = createWebStorage('local', { localStorage: throwing });
    expect(storage.getItem('k')).toBeNull();
    expect(() => storage.setItem('k', 'v')).not.toThrow();
    expect(() => storage.removeItem('k')).not.toThrow();
  });

  it('宿主的 localStorage getter 本身抛错时同样退化为内存存储', () => {
    const host = {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      }
    };
    const storage = createWebStorage('local', host);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });
});
