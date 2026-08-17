import { TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
import { selectLocalBackend, WA_SQLITE_ADAPTER_NAME } from './setup_rxdb';
import setup_rxdb_desktop from './setup_rxdb_desktop';
import setup_rxdb_wa_sqlite from './setup_rxdb_wa-sqlite';

describe('selectLocalBackend', () => {
  it('picks the Tauri host-backed SQLite file inside a Tauri window', () => {
    const backend = selectLocalBackend({ __TAURI_INTERNALS__: {} });
    expect(backend.adapter).toBe(TAURI_ADAPTER_NAME);
    expect(backend.create).toBe(setup_rxdb_desktop);
  });

  it('falls back to wa-sqlite in a plain browser preview', () => {
    const backend = selectLocalBackend({});
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
      const backend = selectLocalBackend(runtime);
      const expected = backend.create === setup_rxdb_desktop ? TAURI_ADAPTER_NAME : WA_SQLITE_ADAPTER_NAME;
      expect(backend.adapter).toBe(expected);
    }
  });
});
