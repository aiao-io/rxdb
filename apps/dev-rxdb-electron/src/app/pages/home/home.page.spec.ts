// 页面引用了只做过部分编译的 @angular/common（JsonPipe），node 环境里要靠 JIT 编译器补全。
import '@angular/compiler';
import { runInInjectionContext, signal, type Injector, type OnDestroy } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './home.page';

// 两个服务只作 DI 令牌：真实模块会把整条连接链（适配器、备份探针）拉进 node 环境。
vi.mock('../../services/local-database.service', () => ({ LocalDatabaseService: class LocalDatabaseService {} }));
vi.mock('../../services/electron.service', () => ({ ElectronService: class ElectronService {} }));
vi.mock('../../devtools-event-probe', () => ({ dispatchEveryRxDBEvent: () => [] }));

type Listener = (event: unknown) => void;

/** 只实现首页用到的那几个成员的 RxDB 替身；监听按类型记账，便于数出还挂着几个。 */
const createFakeRxDB = () => {
  const listeners = new Map<string, Set<Listener>>();
  const getCurrentBranch = vi.fn(async () => ({ id: 'main' }));
  const rxdb = {
    versionManager: { getCurrentBranch },
    addEventListener: (type: string, listener: Listener): void => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: Listener): void => {
      listeners.get(type)?.delete(listener);
    }
  };
  return {
    rxdb,
    getCurrentBranch,
    /** 页面登记过的事件类型；首页只该登记分支切换这一种。 */
    types: (): string[] => [...listeners.keys()],
    liveListeners: (): number => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    emitAll: (): void => [...listeners.values()].flatMap(set => [...set]).forEach(listener => listener({}))
  };
};

/**
 * 按类名取替身的注入器。
 *
 * @remarks
 * 页面的 `@aiao/rxdb` 经应用 tsconfig 的 paths 落到源码，本 spec 不在任何 tsconfig 的 include 里，
 * 同一个包名会被解析到 dist —— 两份 `RxDB` 类不是同一个令牌。按类名取就与解析路径无关。
 */
const createInjector = (fakes: Record<string, unknown>): Injector =>
  ({
    get: (token: { readonly name?: string }) => {
      const name = token.name ?? '';
      if (!(name in fakes)) throw new Error(`no fake for ${name}`);
      return fakes[name];
    }
  }) as unknown as Injector;

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('HomePage', () => {
  it('离开首页后不再替已销毁的页面重读分支', async () => {
    const fake = createFakeRxDB();
    const injector = createInjector({
      RxDB: fake.rxdb,
      ElectronService: { isElectron: false },
      LocalDatabaseService: {
        backend: signal('wa-sqlite'),
        dbName: signal('demo'),
        status: signal('connected'),
        launchCount: signal(1),
        errorMessage: signal(null)
      }
    });
    // 路由每进一次首页就是一个新实例；Angular 离开路由时调用它的销毁钩子。
    const enter = (): HomePage => {
      const page = runInInjectionContext(injector, () => new HomePage());
      page.ngOnInit();
      return page;
    };
    const leave = (page: HomePage): void => (page as HomePage & Partial<OnDestroy>).ngOnDestroy?.();

    leave(enter());
    const current = enter();
    await flush();
    fake.getCurrentBranch.mockClear();

    fake.emitAll();
    await flush();

    expect(fake.types()).toHaveLength(1);
    expect(fake.liveListeners()).toBe(1);
    expect(fake.getCurrentBranch).toHaveBeenCalledTimes(1);
    expect(current.currentBranch()).toBe('main');
  });
});
