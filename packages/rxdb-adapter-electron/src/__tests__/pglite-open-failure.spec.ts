/**
 * 打不开的数据目录必须失败得干净（US-208 AC#6）。
 *
 * @remarks
 * AC#6 有三个半句，缺一条都不算过：**错误码可判别**、**不留同名空库**、
 * **不回退到 memory/OPFS/IndexedDB**。第三条在桌面档位下尤其容易违反——
 * `RxDBAdapterElectronPGlite` 继承的 `RxDBAdapterPGlite` 本身是有内存档位的，
 * 一旦某处补了「打不开就退回 memory」的兜底，用户会拿到一个空库并以为数据丢了。
 *
 * 与 `electron-pglite-host.spec.ts` 分文件是因为那边的 harness 造的是**能起来**的
 * runtime；这里要的恰好相反，混在一起会让两种 harness 在同一个 `afterEach` 上打架。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import type { DesktopHostTransport, DesktopPgliteResponse } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { afterEach, describe, expect, it } from 'vitest';
import { createElectronPgliteHost, type ElectronPgliteHost } from '../pglite-host.js';
import { ADAPTER_NAME } from '../pglite/pglite-adapter.interface.js';
import { RxDBAdapterElectronPGlite } from '../pglite/RxDBAdapterElectronPGlite.js';

const OWNER = 7;
const DATA_DIRECTORY = 'broken-pgdata';

let active: ElectronPgliteHost | undefined;

afterEach(async () => {
  await active?.closeAll();
  active = undefined;
});

describe('打不开的 PGlite 数据目录（AC#6）', () => {
  it('回可判别的 open_failed，不建会话，也不换一个目录悄悄开成功', async () => {
    let attempts = 0;
    const host = createElectronPgliteHost({
      createRuntime: async () => {
        attempts++;
        throw new Error('EACCES: permission denied');
      },
      postNotify: () => undefined
    });
    active = host;

    const response = await host.handle(
      { kind: 'pg.open', storage: { engine: 'pglite', dataDirectoryName: DATA_DIRECTORY } },
      OWNER
    );

    expect(response.kind).toBe('error');
    expect((response as Extract<DesktopPgliteResponse, { kind: 'error' }>).code).toBe('open_failed');
    // 失败就是失败：没有会话被发出去，renderer 拿不到任何可以继续写入的句柄。
    expect(host.openSessionCount).toBe(0);
    expect(attempts).toBe(1);
  });

  it('原因修好后重开同一目录能成功——失败的实例不留在表里', async () => {
    let broken = true;
    const host = createElectronPgliteHost({
      createRuntime: async () => {
        if (broken) throw new Error('EACCES: permission denied');
        const { PGlite } = await import('@electric-sql/pglite');
        const runtime = new PGlite();
        await runtime.waitReady;
        return runtime;
      },
      postNotify: () => undefined
    });
    active = host;

    const request = { kind: 'pg.open', storage: { engine: 'pglite', dataDirectoryName: DATA_DIRECTORY } } as const;
    expect((await host.handle(request, OWNER)).kind).toBe('error');

    broken = false;
    const retry = await host.handle(request, OWNER);

    // 缓存住那条已 reject 的 promise 的话，「修好配置再试一次」会永远失败。
    expect(retry.kind).toBe('pg.open');
    expect(host.openSessionCount).toBe(1);
  });

  it('renderer 侧连接失败时不回退到内存库', async () => {
    const host = createElectronPgliteHost({
      createRuntime: async () => {
        throw new Error('EACCES: permission denied');
      },
      postNotify: () => undefined
    });
    active = host;
    const transport: DesktopHostTransport = {
      request: payload => host.handle(payload, OWNER),
      subscribe: () => () => undefined
    };

    const rxdb = new RxDB({
      dbName: 'broken',
      context: { userId: 'userId' },
      entities: [],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });
    rxdb.adapter(ADAPTER_NAME, async db => new RxDBAdapterElectronPGlite(db, { transport }));
    const adapter = await rxdb.getAdapter(ADAPTER_NAME);

    await expect(adapter.connect()).rejects.toThrowError(/open_failed/);
    expect(host.openSessionCount).toBe(0);
    await rxdb.disconnectAll().catch(() => undefined);
  });

  it('越出应用作用域的目录名在构造期就被拒，一条请求都不发', async () => {
    let requests = 0;
    const transport: DesktopHostTransport = {
      request: async () => {
        requests++;
        throw new Error('should not be reached');
      },
      subscribe: () => () => undefined
    };
    const rxdb = new RxDB({
      dbName: 'escape',
      context: { userId: 'userId' },
      entities: [],
      sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
    });

    expect(() => new RxDBAdapterElectronPGlite(rxdb, { dataDirectoryName: '../escape', transport })).toThrowError(
      /invalid_database_name/
    );
    expect(requests).toBe(0);
  });
});
