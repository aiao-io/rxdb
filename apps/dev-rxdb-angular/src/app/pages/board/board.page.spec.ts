import { RxDB } from '@aiao/rxdb';
import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BoardPage from './board.page';

const connection = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  disconnectAll: vi.fn<() => Promise<void>>()
}));
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  RxDB: class {
    use = vi.fn();
    adapter = vi.fn();
    connect = connection.connect;
    disconnectAll = connection.disconnectAll;
  }
}));

describe('看板宿主连接生命周期', () => {
  beforeEach(() => {
    connection.connect.mockReset().mockResolvedValue(undefined);
    connection.disconnectAll.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: APP_BASE_HREF, useValue: '/' }] });
  });

  afterEach(() => TestBed.resetTestingModule());

  const open = () => {
    const page = TestBed.runInInjectionContext(() => new BoardPage());
    page.ngOnInit();
    return page;
  };

  it('宿主销毁后断开连接', async () => {
    const page = open();
    await vi.waitFor(() => expect(page['rxdb']()).toBeInstanceOf(RxDB));
    TestBed.resetTestingModule();
    expect(connection.disconnectAll).toHaveBeenCalledOnce();
  });

  it('连接尚未完成就离开，不把迟到实例发布给已销毁页面', async () => {
    let resolve!: () => void;
    connection.connect.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const page = open();
    TestBed.resetTestingModule();
    expect(connection.disconnectAll).toHaveBeenCalledOnce();
    resolve();
    await Promise.resolve();
    expect(page['rxdb']()).toBeNull();
  });

  it('连接失败释放新实例并显示错误', async () => {
    connection.connect.mockRejectedValueOnce(new Error('连接失败'));
    const page = open();
    await vi.waitFor(() => expect(page['pageError']()).toContain('连接失败'));
    expect(page['rxdb']()).toBeNull();
    expect(connection.disconnectAll).toHaveBeenCalledOnce();
  });
});
