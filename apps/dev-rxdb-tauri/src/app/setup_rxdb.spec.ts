import { TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
import { RxDBLocalBackendTableError, selectLocalBackend } from './local-backend';
import { localBackends, WA_SQLITE_ADAPTER_NAME } from './setup_rxdb';
import setup_rxdb_desktop from './setup_rxdb_desktop';
import setup_rxdb_wa_sqlite from './setup_rxdb_wa-sqlite';

describe('localBackends', () => {
  it('picks the Tauri host-backed SQLite file inside a Tauri window', () => {
    const backend = selectLocalBackend(localBackends({ __TAURI_INTERNALS__: {} }));
    expect(backend.adapter).toBe(TAURI_ADAPTER_NAME);
    expect(backend.create).toBe(setup_rxdb_desktop);
  });

  it('falls back to wa-sqlite in a plain browser preview', () => {
    const backend = selectLocalBackend(localBackends({}));
    expect(backend.adapter).toBe(WA_SQLITE_ADAPTER_NAME);
    expect(backend.create).toBe(setup_rxdb_wa_sqlite);
  });

  /**
   * 适配器名与工厂必须来自**同一次**判定。分开算的话，
   * `provideRxDB` 注册了 desktop 而 initializer 去连 wa-sqlite，
   * 症状是「连接一个不存在的适配器」——错误信息指不到真正的原因。
   */
  it('keeps the adapter name and the factory in the same branch', () => {
    for (const runtime of [{ __TAURI_INTERNALS__: {} }, {}, null, undefined]) {
      const backend = selectLocalBackend(localBackends(runtime));
      const expected = backend.create === setup_rxdb_desktop ? TAURI_ADAPTER_NAME : WA_SQLITE_ADAPTER_NAME;
      expect(backend.adapter).toBe(expected);
    }
  });

  /**
   * US-207 E9：两个后端写的是两份永不互通的数据（Rust 宿主的原生文件 vs WebView 的 OPFS）。
   * 同名意味着「当前连的是哪个库」没有答案，所以这条由 `selectLocalBackend` 的表校验兜住 ——
   * 这个用例守的是本 demo 真的没有踩上去。
   */
  it('gives each backend its own dbName', () => {
    const dbNames = localBackends({}).map(({ dbName }) => dbName);

    expect(new Set(dbNames).size).toBe(dbNames.length);
    expect(() => selectLocalBackend(localBackends({}))).not.toThrow(RxDBLocalBackendTableError);
  });
});
