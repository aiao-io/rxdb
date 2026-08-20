/**
 * 依赖调度器的纪元语义（US-015 AC#6 / AC#7～#9 与强制并发测试 5、6）。
 *
 * 为什么在这一层测而不是经 `RxDB`：
 * - **AC#6**（适配器换成同名新实例、中途从未变为空）没有任何公开 API 能驱动 ——
 *   `RxDB.connect()` 走的是「断开 → 重连」，中途一定为空，恰好绕开了这条不变量。
 *   只有喂一个假宿主，才能把「名字没变、引用变了」这一种纪元变化单独摆出来。
 * - **扫描趟数**（强制测试 5）要数的是 `resolveDependency` 的调用次数；宿主侧还有
 *   引导链、迁移、建表在同一条路径上，数出来的东西不再是调度器的行为。
 */
import { LifecycleScope } from '@aiao/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IRxDBPlugin, RxDBPluginDependency } from '../../rxdb-plugin.js';
import { PluginDependencyScheduler, type PluginSchedulerHost } from '../dependency-scheduler.js';

/** 一个可外部结算的 Promise，用来把「安装挂起」这一刻钉住。 */
interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 假宿主：依赖表可任意替换实例，全部动作记进 `log`。 */
interface FakeHost extends PluginSchedulerHost {
  /** 依赖键 → 当前实例引用。直接改这张表即可制造纪元变化 */
  readonly instances: Map<RxDBPluginDependency, object>;
  /** `install` / `release` 的时序流水 */
  readonly log: string[];
  /** 每次安装拿到的作用域，按发生序 */
  readonly scopes: LifecycleScope[];
  /** `resolveDependency` 的累计调用次数 —— 扫描趟数的观测口 */
  resolveCalls: number;
}

function createHost(): FakeHost {
  const instances = new Map<RxDBPluginDependency, object>();
  const log: string[] = [];
  const scopes: LifecycleScope[] = [];
  const host: FakeHost = {
    instances,
    log,
    scopes,
    resolveCalls: 0,
    resolveDependency(dependency) {
      host.resolveCalls += 1;
      return instances.get(dependency);
    },
    createScope(plugin) {
      const scope = new LifecycleScope(`plugin:${plugin.name}`);
      scopes.push(scope);
      return scope;
    },
    async releaseScope(plugin, scope) {
      log.push(`release:${plugin.name}`);
      await scope.dispose();
    },
    async runInstall(plugin, scope) {
      log.push(`install:${plugin.name}`);
      await plugin.install(scope);
    }
  };
  return host;
}

/** 测试插件：记录每次 `install()` 看到的作用域，安装体可注入。 */
class TestPlugin implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name: Uncapitalize<string>;
  readonly inject?: readonly RxDBPluginDependency[];
  /** 历次安装拿到的作用域 */
  readonly seenScopes: LifecycleScope[] = [];
  #body?: (scope: LifecycleScope) => void | Promise<void>;

  constructor(
    name: Uncapitalize<string>,
    inject?: readonly RxDBPluginDependency[],
    body?: (scope: LifecycleScope) => void | Promise<void>
  ) {
    this.name = name;
    this.inject = inject;
    this.#body = body;
  }

  install(scope: LifecycleScope): void | Promise<void> {
    this.seenScopes.push(scope);
    return this.#body?.(scope);
  }

  /** 换掉安装体，用于「第二次安装换个行为」的用例。 */
  setBody(body?: (scope: LifecycleScope) => void | Promise<void>): void {
    this.#body = body;
  }
}

const LOCAL = 'adapter:local';
const REMOTE = 'adapter:remote';

let host: FakeHost;
let scheduler: PluginDependencyScheduler;

beforeEach(() => {
  host = createHost();
  scheduler = new PluginDependencyScheduler(host);
  vi.restoreAllMocks();
});

/** 登记 + 对齐 + 等静止，测试里最常用的三连。 */
async function settleWith(...plugins: IRxDBPlugin[]): Promise<void> {
  for (const plugin of plugins) scheduler.register(plugin);
  scheduler.reconcile();
  await scheduler.settle();
}

describe('纪元身份（INV-3 / AC#6）', () => {
  it('AC#6 同名适配器换成新实例、中途从未变为空，仍算一次纪元变化', async () => {
    const first = { id: 'adapter-1' };
    const second = { id: 'adapter-2' };
    host.instances.set(LOCAL, first);
    const plugin = new TestPlugin('epochPlugin', [LOCAL]);

    await settleWith(plugin);
    expect(scheduler.activationState(plugin)).toBe('active');
    const firstScope = plugin.seenScopes[0];

    // 关键：直接换引用，中间一刻都没有 undefined —— 只看名字或布尔位的实现在这里完全静止
    host.instances.set(LOCAL, second);
    scheduler.reconcile();
    await scheduler.settle();

    expect(scheduler.activationState(plugin)).toBe('active');
    expect(host.log).toEqual(['install:epochPlugin', 'release:epochPlugin', 'install:epochPlugin']);
    // 全新的子作用域，旧的已释放：重装不能复用上一纪元的作用域
    expect(plugin.seenScopes).toHaveLength(2);
    expect(plugin.seenScopes[1]).not.toBe(firstScope);
    expect(firstScope.state).toBe('disposed');
    expect(plugin.seenScopes[1].state).toBe('active');
  });

  it('实例引用不变时反复 reconcile 不重装', async () => {
    host.instances.set(LOCAL, { id: 'adapter-1' });
    const plugin = new TestPlugin('stablePlugin', [LOCAL]);

    await settleWith(plugin);
    scheduler.reconcile();
    scheduler.reconcile();
    await scheduler.settle();

    expect(host.log).toEqual(['install:stablePlugin']);
  });
});

describe('扫描趟数（强制并发测试 5、6）', () => {
  it('多依赖同时就绪时只扫一趟：resolveDependency 恰好每个依赖一次', async () => {
    host.instances.set(LOCAL, { id: 'local' });
    host.instances.set(REMOTE, { id: 'remote' });
    const plugin = new TestPlugin('multiDep', [LOCAL, REMOTE]);
    scheduler.register(plugin);

    host.resolveCalls = 0;
    scheduler.reconcile();

    // 一趟扫描 = 每个依赖解析一次。退化成「每个依赖各触发一趟」时这里会是 4
    expect(host.resolveCalls).toBe(2);
    await scheduler.settle();
    expect(scheduler.activationState(plugin)).toBe('active');
  });

  it('非 active 的状态转移不触发额外扫描', async () => {
    host.instances.set(LOCAL, { id: 'local' });
    const gate = deferred();
    const slow = new TestPlugin('slowPlugin', [LOCAL], () => gate.promise);
    // 依赖永不满足的旁观者：它每被扫一次就多一次 resolveDependency
    const bystander = new TestPlugin('bystander', [REMOTE]);
    scheduler.register(slow);
    scheduler.register(bystander);

    scheduler.reconcile();
    expect(scheduler.activationState(slow)).toBe('installing');
    const afterFirstScan = host.resolveCalls;

    // slow 停在 installing（非 active）。让微任务充分推进，期间不该有任何新扫描
    await Promise.resolve();
    await Promise.resolve();
    expect(host.resolveCalls).toBe(afterFirstScan);
    expect(scheduler.activationState(bystander)).toBe('waiting');

    gate.resolve();
    await scheduler.settle();
    expect(scheduler.activationState(slow)).toBe('active');
  });
});

describe('依赖未满足（INV-4 / INV-5）', () => {
  it('AC#3 未满足的插件不进入 startedInstalls，不产生作用域', async () => {
    const ready = new TestPlugin('readyPlugin');
    const blocked = new TestPlugin('blockedPlugin', [REMOTE]);

    await settleWith(ready, blocked);

    expect(scheduler.activationState(ready)).toBe('active');
    expect(scheduler.activationState(blocked)).toBe('waiting');
    expect(scheduler.startedInstalls()).toHaveLength(1);
    expect(host.scopes).toHaveLength(1);
    expect(blocked.seenScopes).toHaveLength(0);
  });

  it('AC#11 未满足只告警一次，且列出缺失项', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const blocked = new TestPlugin('blockedPlugin', [LOCAL, REMOTE]);

    await settleWith(blocked);
    scheduler.reconcile();
    await scheduler.settle();
    // 只满足其中一个，仍然不满足整体：也不该再喊第二遍
    host.instances.set(LOCAL, { id: 'local' });
    scheduler.reconcile();
    await scheduler.settle();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('blockedPlugin');
    expect(warn.mock.calls[0][0]).toContain('adapter:local');
    expect(warn.mock.calls[0][0]).toContain('adapter:remote');
  });

  it('AC#4 依赖消失时释放作用域并回到等待，插件记录保留', async () => {
    host.instances.set(REMOTE, { id: 'remote' });
    const plugin = new TestPlugin('remoteDep', [REMOTE]);

    await settleWith(plugin);
    const scope = plugin.seenScopes[0];

    host.instances.delete(REMOTE);
    scheduler.reconcile();
    await scheduler.settle();

    expect(scheduler.activationState(plugin)).toBe('waiting');
    expect(scope.state).toBe('disposed');
    expect(host.log).toEqual(['install:remoteDep', 'release:remoteDep']);
    expect(scheduler.startedInstalls()).toHaveLength(0);
  });
});

describe('并发（强制测试 1～4）', () => {
  it('并发测试 1：install 挂起期间依赖断开，成功结果被丢弃且不进入 active', async () => {
    host.instances.set(LOCAL, { id: 'local' });
    const gate = deferred();
    const plugin = new TestPlugin('slowInstall', [LOCAL], scope => {
      scope.acquire(() => () => undefined, 'slow:entry');
      return gate.promise;
    });

    scheduler.register(plugin);
    scheduler.reconcile();
    expect(scheduler.activationState(plugin)).toBe('installing');

    // install 还挂着的时候依赖没了
    host.instances.delete(LOCAL);
    scheduler.reconcile();
    // 单飞：在飞的转移不被打断，此刻仍是 installing
    expect(scheduler.activationState(plugin)).toBe('installing');

    gate.resolve();
    await scheduler.settle();

    expect(scheduler.activationState(plugin)).toBe('waiting');
    expect(plugin.seenScopes[0].state).toBe('disposed');
    // 恰好释放一次
    expect(host.log.filter(entry => entry === 'release:slowInstall')).toHaveLength(1);
    expect(scheduler.startedInstalls()).toHaveLength(0);
  });

  it('并发测试 2：disposing 期间依赖以新实例回来，只装最新纪元', async () => {
    const first = { id: 'local-1' };
    const second = { id: 'local-2' };
    host.instances.set(LOCAL, first);
    const releaseGate = deferred();
    const plugin = new TestPlugin('reentrant', [LOCAL]);

    await settleWith(plugin);

    // 把释放钉住，制造一个可观察的 disposing 窗口
    const originalRelease = host.releaseScope.bind(host);
    host.releaseScope = async (target, scope) => {
      await releaseGate.promise;
      await originalRelease(target, scope);
    };

    host.instances.delete(LOCAL);
    scheduler.reconcile();
    expect(scheduler.activationState(plugin)).toBe('disposing');

    // disposing 期间依赖以**新实例**回来，中间还闪过一次别的实例
    host.instances.set(LOCAL, { id: 'local-interim' });
    scheduler.reconcile();
    host.instances.set(LOCAL, second);
    scheduler.reconcile();

    releaseGate.resolve();
    await scheduler.settle();

    expect(scheduler.activationState(plugin)).toBe('active');
    // 旧 dispose 只跑一次；中间纪元不启动，只有第一次和最新那次安装
    expect(host.log).toEqual(['install:reentrant', 'release:reentrant', 'install:reentrant']);
    expect(plugin.seenScopes).toHaveLength(2);
  });

  it('并发测试 3：同纪元内失败不自动重试，纪元变化后恰好重试一次', async () => {
    const first = { id: 'local-1' };
    host.instances.set(LOCAL, first);
    const failure = new Error('install boom');
    const plugin = new TestPlugin('flaky', [LOCAL], () => Promise.reject(failure));

    await settleWith(plugin);
    expect(scheduler.activationState(plugin)).toBe('failed');
    await expect(scheduler.startedInstalls()[0]).rejects.toBe(failure);

    // 依赖不变：反复 reconcile 都不该重装（INV-6 / D5）
    scheduler.reconcile();
    scheduler.reconcile();
    await scheduler.settle();
    expect(host.log.filter(entry => entry === 'install:flaky')).toHaveLength(1);

    // 纪元变化：恰好重试一次
    plugin.setBody(undefined);
    host.instances.set(LOCAL, { id: 'local-2' });
    scheduler.reconcile();
    await scheduler.settle();

    expect(scheduler.activationState(plugin)).toBe('active');
    expect(host.log.filter(entry => entry === 'install:flaky')).toHaveLength(2);
    expect(scheduler.startedInstalls()).toHaveLength(1);
  });

  it('并发测试 4：反复 disconnect / connect 幂等，作用域一一对应', async () => {
    const plugin = new TestPlugin('cyclic', [LOCAL]);
    scheduler.register(plugin);

    for (let round = 0; round < 3; round += 1) {
      host.instances.set(LOCAL, { id: `local-${round}` });
      scheduler.reconcile();
      await scheduler.settle();
      expect(scheduler.activationState(plugin)).toBe('active');

      host.instances.delete(LOCAL);
      scheduler.reconcile();
      await scheduler.settle();
      expect(scheduler.activationState(plugin)).toBe('waiting');
    }

    expect(host.log).toEqual(Array.from({ length: 3 }, () => ['install:cyclic', 'release:cyclic']).flat());
    // 每一轮一个全新作用域，且全部已释放
    expect(plugin.seenScopes).toHaveLength(3);
    expect(new Set(plugin.seenScopes).size).toBe(3);
    expect(plugin.seenScopes.every(scope => scope.state === 'disposed')).toBe(true);
  });
});

describe('复位', () => {
  it('reset 把状态与安装记录清空，失败插件因此重新可装', async () => {
    host.instances.set(LOCAL, { id: 'local' });
    const failure = new Error('install boom');
    const plugin = new TestPlugin('resettable', [LOCAL], () => Promise.reject(failure));

    await settleWith(plugin);
    expect(scheduler.activationState(plugin)).toBe('failed');

    scheduler.reset();
    expect(scheduler.activationState(plugin)).toBe('registered');
    expect(scheduler.startedInstalls()).toHaveLength(0);

    plugin.setBody(undefined);
    scheduler.reconcile();
    await scheduler.settle();
    expect(scheduler.activationState(plugin)).toBe('active');
  });
});
