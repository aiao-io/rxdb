import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { SyncType } from '../entity/metadata-options.interface.js';
import { RxDB } from '../RxDB.js';
import { RXDB_DB_NAME_SUFFIX, RXDB_VERSION } from '../version.js';

/**
 * 版本常量的两条漂移防线。
 *
 * 这两条断言方向相反，缺一不可：
 * - `RXDB_VERSION` **必须跟着** `package.json` 走（它是 `rxdb.version` 的返回值，漂了就是在报假版本）；
 * - `RXDB_DB_NAME_SUFFIX` **必须永不跟着走**（它进 IndexedDB/OPFS 库名，改一个字符就是让所有既有用户的数据凭空消失）。
 */
describe('version 常量', () => {
  it('RXDB_VERSION 必须与 package.json 一致', () => {
    expect(RXDB_VERSION).toBe(packageJson.version);
  });

  it('RXDB_DB_NAME_SUFFIX 永久冻结为 0_1，不得随版本号变化', () => {
    expect(RXDB_DB_NAME_SUFFIX).toBe('0_1');
  });

  it('dbName 后缀取自冻结常量，与 RXDB_VERSION 解耦', () => {
    const rxdb = new RxDB({
      dbName: 'version-spec',
      entities: [],
      sync: { local: { adapter: 'noop' }, type: SyncType.None }
    });

    expect(rxdb.config.dbName).toBe('version-spec@0_1');
    // 版本号已升到 0.0.21，若后缀仍由 version 推导，这里会变成 `@0_0_21`
    expect(rxdb.config.dbName).not.toContain(RXDB_VERSION.replace(/\./g, '_'));
  });
});
