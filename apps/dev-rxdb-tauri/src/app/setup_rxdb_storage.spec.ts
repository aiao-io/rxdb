import {
  DESKTOP_ADAPTER_NAME,
  DESKTOP_HOST_PROTOCOL_VERSION,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-desktop';
import { StorageBackendError } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageOptions, DESKTOP_STORAGE_ROOT_DIR } from './setup_rxdb_desktop';

/**
 * 记录请求种类的假传输层。
 *
 * @remarks
 * 只答 `file.open` 与 `file.mkdir` 两种——`ensureRoot()` 恰好只走这两步，
 * 多答一种就等于在测试里描述了一份没人验证过的协议。
 */
const createRecordingTransport = (): { kinds: string[]; transport: DesktopHostTransport } => {
  const kinds: string[] = [];
  return {
    kinds,
    transport: {
      request: payload => {
        kinds.push(payload.kind);
        if (payload.kind !== 'file.open') return Promise.resolve({ kind: payload.kind });
        return Promise.resolve({
          kind: 'file.open',
          result: { sessionId: 'session-1', protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION }
        });
      },
      subscribe: () => () => undefined
    }
  };
};

describe('createDesktopStorageOptions', () => {
  /**
   * US-505 AC#4：Tauri 侧**必须**显式注入 transport。
   *
   * @remarks
   * 照抄 Electron 那句无参的 `createDesktopStorageFilesystem()` 会编译通过、类型也对，
   * 但它去读的是 preload 注入的全局桥接——Tauri 根本没有 preload 这一层。故障要等到
   * 用户第一次点上传才以 `host_unavailable` 的形式冒出来，而那时线索离病因已经很远。
   */
  it('sends file requests through the injected transport', async () => {
    const { kinds, transport } = createRecordingTransport();
    const options = createDesktopStorageOptions(transport);

    const filesystem = options.filesystem!(DESKTOP_STORAGE_ROOT_DIR, { localAdapterName: DESKTOP_ADAPTER_NAME });
    await filesystem.ensureRoot();

    expect(kinds).toEqual(['file.open', 'file.mkdir']);
  });

  /**
   * 与 Electron demo 同名（`DESKTOP_STORAGE_ROOT_DIR = 'files'`）。
   *
   * @remarks
   * 显式写出而不吃插件默认值：两个 demo 的物理布局一致，才谈得上「换的只是宿主」。
   */
  it('keeps the same root directory name as the Electron demo', () => {
    expect(DESKTOP_STORAGE_ROOT_DIR).toBe('files');
    expect(createDesktopStorageOptions(createRecordingTransport().transport).rootDir).toBe('files');
  });

  /**
   * US-505 AC#11：本 options 只配桌面适配器用。
   *
   * @remarks
   * 浏览器预览走的是 wa-sqlite，那条路径上必须落回 OPFS 后端。桌面后端若在那里被静默
   * 接受，文件会写去一个根本没有 host 的通道，症状同样是「上传时才炸」。
   */
  it('refuses to build on a non-desktop adapter', () => {
    const options = createDesktopStorageOptions(createRecordingTransport().transport);

    // 连 `code` 一起断言：AC#11 要的是「稳定**可判别**错误」，只认类型的话，
    // 换成任意别的 `StorageBackendErrorCode` 这条测试照样绿，判别就无从谈起。
    let thrown: unknown;
    try {
      options.filesystem!(DESKTOP_STORAGE_ROOT_DIR, { localAdapterName: 'wa-sqlite' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StorageBackendError);
    expect(thrown).toMatchObject({ code: 'adapter_mismatch' });
  });
});
