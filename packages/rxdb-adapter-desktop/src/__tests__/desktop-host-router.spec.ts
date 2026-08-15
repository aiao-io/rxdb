import { describe, expect, it, vi } from 'vitest';
import { createDesktopHostRouter } from '../desktop-host-router.js';
import type { DesktopHostFileResponse, DesktopHostResponse } from '../desktop-host-protocol.js';

/** 造一个只记录入参的假 host，返回值里带 tag 便于断言路由去向。 */
const createStubHost = <T>(response: T) => {
  const handle = vi.fn(async (): Promise<T> => response);
  const closeAll = vi.fn();
  return { handle, closeAll, openSessionCount: 0 };
};

const sqliteResponse: DesktopHostResponse = { kind: 'version', result: '3.0.0' };
const fileResponse: DesktopHostFileResponse = {
  kind: 'file.open',
  result: { sessionId: 'session-1', protocolVersion: 1 }
};

describe('createDesktopHostRouter', () => {
  it('把 file.* 请求交给文件 host', async () => {
    const sqlite = createStubHost(sqliteResponse);
    const file = createStubHost(fileResponse);
    const router = createDesktopHostRouter({ sqlite, file });

    const request = { kind: 'file.list', sessionId: 'session-1', path: 'docs' };
    await expect(router.handle(request)).resolves.toEqual(fileResponse);

    expect(file.handle).toHaveBeenCalledWith(request);
    expect(sqlite.handle).not.toHaveBeenCalled();
  });

  it('把其余请求交给 SQLite host', async () => {
    const sqlite = createStubHost(sqliteResponse);
    const file = createStubHost(fileResponse);
    const router = createDesktopHostRouter({ sqlite, file });

    const request = { kind: 'version' };
    await expect(router.handle(request)).resolves.toEqual(sqliteResponse);

    expect(sqlite.handle).toHaveBeenCalledWith(request);
    expect(file.handle).not.toHaveBeenCalled();
  });

  it('原样透传请求负载，不做任何改写', async () => {
    const sqlite = createStubHost(sqliteResponse);
    const file = createStubHost(fileResponse);
    const router = createDesktopHostRouter({ sqlite, file });

    // 校验是各 host 自己的职责：路由层若先解析一遍，两处校验就会出现分歧。
    const request = { kind: 'file.read', sessionId: 'not-a-uuid', path: '../escape', extra: 1 };
    await router.handle(request);

    expect(file.handle).toHaveBeenCalledWith(request);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['字符串', 'file.list'],
    ['数字', 42],
    ['无 kind 字段的对象', { sessionId: 'session-1' }],
    ['kind 不是字符串', { kind: 7 }]
  ])('形状非法的请求（%s）交给 SQLite host 去报 protocol_violation', async (_label, request) => {
    const sqlite = createStubHost(sqliteResponse);
    const file = createStubHost(fileResponse);
    const router = createDesktopHostRouter({ sqlite, file });

    // 路由层不自己造错误应答：错误消息的措辞归 host 一家管，两处生成必然漂移。
    await expect(router.handle(request)).resolves.toEqual(sqliteResponse);
    expect(file.handle).not.toHaveBeenCalled();
  });

  it('closeAll 关停两个 host', () => {
    const sqlite = createStubHost(sqliteResponse);
    const file = createStubHost(fileResponse);
    const router = createDesktopHostRouter({ sqlite, file });

    router.closeAll();

    expect(sqlite.closeAll).toHaveBeenCalledTimes(1);
    expect(file.closeAll).toHaveBeenCalledTimes(1);
  });

  it('前一个 host 关停抛错时仍关停另一个', () => {
    const sqlite = createStubHost(sqliteResponse);
    const file = createStubHost(fileResponse);
    sqlite.closeAll.mockImplementation(() => {
      throw new Error('boom');
    });
    const router = createDesktopHostRouter({ sqlite, file });

    // 关停发生在退出路径上，漏掉文件 host 会留下未删的临时文件。
    expect(() => router.closeAll()).toThrow('boom');
    expect(file.closeAll).toHaveBeenCalledTimes(1);
  });
});
