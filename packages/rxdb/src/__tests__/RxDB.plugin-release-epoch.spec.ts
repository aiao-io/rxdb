/**
 * 插件释放任务不跨停机纪元（RV-01a1ba7549407bf48eb698893c5e4596）。
 *
 * 调度器的 `reset()` 就地复用激活记录与插件实例：新纪元里 provider 还是同一个对象。
 * 旧纪元的释放任务若在 `await` 之后仍按引用反查依赖方，就会把新纪元刚装好的 consumer
 * 当成待拆对象，拆完又被立即重装，无限占住微任务队列。这里经公开生命周期入口复现：
 * `disconnect()` 的释放还在等 consumer 的旧安装时，`disconnectAll()` 停机并重连。
 *
 * 纯调度器层的同类断言在 `plugin/__tests__/dependency-scheduler.spec.ts` 的「复位」一节。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
});

/** 让出一个宏任务。 */
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('插件释放任务不跨停机纪元', () => {
  it('disconnect 的释放等待期间 disconnectAll 并重连，旧安装迟到结算后不再拆装新纪元的插件', async () => {
    const database = new RxDB({
      dbName: `rxdb-plugin-release-epoch-${Date.now()}`,
      entities: [],
      sync: { local: { adapter: 'local' }, remote: { adapter: 'remote' }, type: SyncType.None }
    });
    databases.add(database);
    database.adapter('local', db => createMockAdapter(db));
    database.adapter('remote', db => createMockAdapter(db));

    let releaseFirstInstall!: () => void;
    const firstInstall = new Promise<void>(resolve => {
      releaseFirstInstall = resolve;
    });
    let providerInstalls = 0;
    let consumerInstalls = 0;
    const provider: IRxDBPlugin = {
      name: 'epochProvider',
      lifecycle: 'scoped',
      inject: ['adapter:local'],
      install: () => {
        providerInstalls += 1;
      }
    };
    const consumer: IRxDBPlugin = {
      name: 'epochConsumer',
      lifecycle: 'scoped',
      inject: ['plugin:epochProvider'],
      install: () => {
        consumerInstalls += 1;
        if (consumerInstalls === 1) return firstInstall;
        // 有界：拆装循环全在微任务里，计时器打断不了它；超过上限就让安装挂起，循环停住、断言报红
        if (consumerInstalls > 4) return new Promise<void>(() => undefined);
        return undefined;
      }
    };

    await database.connect('local');
    await database.connect('remote');
    database.use(() => provider);
    database.use(() => consumer);
    await tick();
    expect(consumerInstalls).toBe(1);

    // provider 的依赖断开：释放流程等着仍在安装的 consumer；不等这次 disconnect，直接停机
    const staleDisconnect = database.disconnect('local').catch((error: unknown) => error);
    await tick();
    await database.disconnectAll();

    await database.connect('local');
    await database.connect('remote');
    expect(providerInstalls).toBe(2);
    expect(consumerInstalls).toBe(2);

    releaseFirstInstall();
    for (let round = 0; round < 5; round += 1) await tick();

    expect(providerInstalls).toBe(2);
    expect(consumerInstalls).toBe(2);
    // 旧 disconnect 等的是旧纪元的转移，作废后它照样能结算，不会挂住
    await staleDisconnect;
  });
});
