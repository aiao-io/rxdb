/** 临时复现：RV-009 #9 —— 在飞的 #track_plugin_install 跨过停机窗口。用完即删。 */
import type { LifecycleScope } from '@aiao/utils';
import { describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

function createDatabase(name: string): RxDB {
  const database = new RxDB({
    dbName: name,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'remote' }, type: SyncType.Full }
  });
  database.adapter('sqlite', () => createMockAdapter());
  database.adapter('remote', () => createMockAdapter());
  return database;
}

describe('RV-009 #9 复现', () => {
  it('init 失败 → 同步重试 → 停机：在飞的 install() 拿到已释放的作用域', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(a => (a instanceof Error ? a.message : String(a))).join(' '));
    });
    const database = createDatabase('rv009-a');
    const seen: { round: number; state: string }[] = [];
    let openGate: (() => void) | undefined;
    let installs = 0;

    database.use((): IRxDBPlugin => ({
      name: 'straggler',
      lifecycle: 'scoped',
      install: (scope: LifecycleScope) => {
        installs += 1;
        const round = installs;
        seen.push({ round, state: scope.state });
        scope.acquire(
          () => () =>
            round === 1 ?
              new Promise<void>(resolve => {
                openGate = resolve;
              })
            : undefined,
          `entry${round}`
        );
      }
    }));

    const schemaInit = vi.spyOn(database.schemaManager, 'init').mockImplementationOnce(() => {
      throw new Error('schema boom');
    });

    // 1. init() 失败 → catch 里 void #release_connection_scope()，第 1 纪元的释放卡在闸门上
    expect(() => database.init()).toThrow('schema boom');
    schemaInit.mockRestore();

    // 2. 同步重试：建出第 2 纪元的插件作用域，install() 被推迟到第 1 纪元释放之后
    database.init();
    await tick();
    expect(installs).toBe(1); // 第 2 轮 install() 还没跑

    // 3. 停机：把第 2 纪元（空的）插件作用域连同连接作用域一起释放
    await database.disconnectAll();
    await tick();
    expect(installs).toBe(1);

    // 4. 第 1 纪元释放落地 → 在飞的 install() 恢复，撞上已释放的作用域
    openGate?.();
    await tick();
    await tick();

    console.log('>>> installs:', installs);
    console.log('>>> seen:', JSON.stringify(seen));
    console.log('>>> console.error:', JSON.stringify(errors, null, 2));

    expect(installs).toBe(2);
    expect(seen[1].state).toBe('disposed');
  });
});
