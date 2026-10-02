/**
 * US-211 阶段 B：抖音 host。能力名、存储布局与 wasm 路径都取实验 v9（开发者工具模拟器 + iOS 真机）的实测结论，
 * 错误原文与 errNo 见 {@link QuotaFileSystem}。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWaSqliteMiniProgramClient, type WaSqliteMiniProgramClient } from '../create-client.js';
import { createWechatMiniProgramHost, resolveMiniProgramHost } from '../host.js';
import { createDouyinMiniProgramHost } from '../hosts/douyin.js';
import type { MiniProgramDouyinApi, MiniProgramWasmRuntime } from '../mini-program.interface.js';
import { MINI_PROGRAM_PLATFORM_IDS } from '../mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { prepareMiniProgramHostRuntime } from '../runtime-polyfills.js';
import { createFakeDouyin, FAKE_TT_USER_DATA_PATH } from './fake-douyin.js';
import { QuotaFileSystem } from './quota-file-system.js';
import { moduleFactory, wasmRuntime } from './subframe-wasm-factory.js';

/** 记下 `instantiate` 收到的路径，其余委托真实 wasm。 */
function recordingWasmRuntime(paths: string[]): MiniProgramWasmRuntime {
  return {
    instantiate(path, imports) {
      paths.push(path);
      return wasmRuntime.instantiate(path, imports);
    }
  };
}

const clients: WaSqliteMiniProgramClient[] = [];

async function track(client: Promise<WaSqliteMiniProgramClient>): Promise<WaSqliteMiniProgramClient> {
  const opened = await client;
  clients.push(opened);
  return opened;
}

afterEach(async () => {
  for (const client of clients.splice(0)) await client.disconnect();
  vi.unstubAllGlobals();
});

describe('createDouyinMiniProgramHost', () => {
  it('登记为 douyin，能力名带 tt. 前缀', () => {
    const { tt } = createFakeDouyin();
    const host = createDouyinMiniProgramHost(tt);

    expect(MINI_PROGRAM_PLATFORM_IDS).toContain('douyin');
    expect(host).toMatchObject({
      platform: 'douyin',
      displayName: '抖音小程序',
      shortName: '抖音',
      wasmRuntimeName: 'TTWebAssembly',
      capabilityNames: {
        fileSystem: 'tt.getFileSystemManager',
        userDataPath: 'tt.getEnvInfoSync().common.USER_DATA_PATH'
      },
      userDataPath: FAKE_TT_USER_DATA_PATH
    });
    expect(host.getFileSystemManager()).toBe(tt.getFileSystemManager());
    expect(resolveMiniProgramHost({ host })).toBe(host);
  });

  it('声明 64 KiB 分块布局与代码包根的绝对 wasm 路径', () => {
    const host = createDouyinMiniProgramHost(createFakeDouyin().tt);

    expect(host.fileLayout).toEqual({ kind: 'chunked', chunkBytes: 65_536 });
    expect(host.defaultWasmPath).toBe('/wa-sqlite/wa-sqlite.wasm');
  });

  it('runtimeGlobal 原样交给 adapter；不传时不设该字段', () => {
    expect(createDouyinMiniProgramHost(createFakeDouyin().tt)).not.toHaveProperty('runtimeGlobal');
    expect(createDouyinMiniProgramHost(createFakeDouyin().tt, { runtimeGlobal: globalThis }).runtimeGlobal).toBe(
      globalThis
    );
  });

  it('用户目录为空串时视为缺失', () => {
    const host = createDouyinMiniProgramHost({
      ...createFakeDouyin().tt,
      getEnvInfoSync: () => ({ common: { USER_DATA_PATH: '' } })
    });

    expect(host.userDataPath).toBeUndefined();
  });

  it('用户目录取自 tt.getEnvInfoSync，不碰已弃用的 tt.env', () => {
    const { tt } = createFakeDouyin();
    // 开发者工具在 tt.env.USER_DATA_PATH 的 getter 里打「即将弃用，请使用 tt.getEnvInfoSync」；这里连 tt.env 都不让碰
    Object.defineProperty(tt, 'env', {
      get: () => {
        throw new Error('读了已弃用的 tt.env');
      }
    });

    expect(createDouyinMiniProgramHost(tt).userDataPath).toBe(FAKE_TT_USER_DATA_PATH);
  });

  it('运行时没有 tt.getEnvInfoSync 时用户目录视为缺失', () => {
    const tt: Partial<MiniProgramDouyinApi> = { ...createFakeDouyin().tt };
    delete tt.getEnvInfoSync;

    expect(createDouyinMiniProgramHost(tt as MiniProgramDouyinApi).userDataPath).toBeUndefined();
  });
});

describe('抖音随机源', () => {
  it('按要求长度返回新分配的缓冲区', async () => {
    const host = createDouyinMiniProgramHost(createFakeDouyin().tt);
    const first = await host.requestRandomValues(65_536);
    const second = await host.requestRandomValues(65_536);

    expect(first.byteLength).toBe(65_536);
    expect(first.buffer).not.toBe(second.buffer);
  });

  it('缺 tt.getRandomValues 时 reject，不降级', async () => {
    const host = createDouyinMiniProgramHost(createFakeDouyin({ withoutRandomValues: true }).tt);

    await expect(host.requestRandomValues(16)).rejects.toThrow('抖音运行时缺少 tt.getRandomValues');
  });

  it('超过平台上限时 reject，原文挂在 cause 上', async () => {
    const host = createDouyinMiniProgramHost(createFakeDouyin().tt);

    await expect(host.requestRandomValues(1_048_577)).rejects.toMatchObject({
      message: expect.stringMatching(/^tt\.getRandomValues 失败: getRandomValues:fail The value of 'length'/),
      cause: { errMsg: expect.stringContaining('out of range') }
    });
  });

  it('长度不符时 reject，而不是在回调里吞掉', async () => {
    const host = createDouyinMiniProgramHost({
      ...createFakeDouyin().tt,
      getRandomValues: ({ success }) => setTimeout(() => success?.({ randomValues: new ArrayBuffer(8) }), 0)
    });

    await expect(host.requestRandomValues(16)).rejects.toThrow('tt.getRandomValues 返回 8 bytes，期望 16 bytes');
  });

  it('引导运行时后随机来源标记为 douyin', async () => {
    vi.stubGlobal('crypto', undefined);

    const sources = await prepareMiniProgramHostRuntime(createDouyinMiniProgramHost(createFakeDouyin().tt), {
      randomPoolSize: 16
    });

    expect(sources.random).toBe('douyin');
  });
});

describe('抖音 host 接入客户端', () => {
  it('AC#9 写入后关闭重开读回，数据库按 64 KiB 分块落盘，wasm 走绝对路径', async () => {
    const { tt, fileSystem } = createFakeDouyin();
    const paths: string[] = [];
    const open = () =>
      track(
        createWaSqliteMiniProgramClient('douyin-reconnect', {
          host: createDouyinMiniProgramHost(tt),
          moduleFactory,
          wasmRuntime: recordingWasmRuntime(paths)
        })
      );

    const first = await open();
    await first.execute('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);');
    await first.execute("INSERT INTO notes (body) VALUES ('抖音 🎵');");
    await first.disconnect();
    clients.splice(0);
    const second = await open();
    const rows = await second.execute('SELECT body FROM notes;');

    expect(rows.results[0].rows).toEqual([['抖音 🎵']]);
    expect(paths).toEqual(['/wa-sqlite/wa-sqlite.wasm', '/wa-sqlite/wa-sqlite.wasm']);
    expect([...fileSystem.files.keys()]).toContain(
      `${FAKE_TT_USER_DATA_PATH}/rxdb-wa-sqlite/rxdb-douyin-reconnect.sqlite.0`
    );
  });

  it('AC#10 缺失能力全部列出，名称带 tt. 前缀', () => {
    const host = createDouyinMiniProgramHost({
      getEnvInfoSync: () => ({ common: { USER_DATA_PATH: '' } }),
      getFileSystemManager: () => undefined as unknown as QuotaFileSystem
    });

    expect(() =>
      assertMiniProgramRuntimeCapabilities({ moduleFactory, wasmRuntime: {} as MiniProgramWasmRuntime, host })
    ).toThrow(
      '抖音小程序运行时缺少 RxDB 必需能力: TTWebAssembly.instantiate, tt.getFileSystemManager, tt.getEnvInfoSync().common.USER_DATA_PATH'
    );
  });

  it('AC#11 同一数据库的第二个连接被拒绝', async () => {
    const { tt } = createFakeDouyin();
    const options = { host: createDouyinMiniProgramHost(tt), moduleFactory, wasmRuntime };
    await track(createWaSqliteMiniProgramClient('douyin-single', options));
    const other = createDouyinMiniProgramHost(tt);

    await expect(createWaSqliteMiniProgramClient('douyin-single', { ...options, host: other })).rejects.toThrow(
      '抖音文件 VFS 不支持同一数据库的并发连接'
    );
  });

  it('AC#12 撞配额以 SQLITE_FULL 失败，平台原文在 cause 链上，已提交数据重开仍在', async () => {
    const { tt, fileSystem } = createFakeDouyin({ quotaBytes: 512 * 1024 });
    const options = { host: createDouyinMiniProgramHost(tt), moduleFactory, wasmRuntime };
    const client = await track(createWaSqliteMiniProgramClient('douyin-quota', options));
    await client.execute('CREATE TABLE blobs (id INTEGER PRIMARY KEY, payload BLOB NOT NULL);');
    await client.execute('INSERT INTO blobs (payload) VALUES (randomblob(1024));');

    const failure: unknown = await client.execute('INSERT INTO blobs (payload) VALUES (randomblob(1048576));').then(
      () => undefined,
      (error: unknown) => error
    );
    await client.disconnect();
    clients.splice(0);
    const reopened = await track(createWaSqliteMiniProgramClient('douyin-quota', options));
    const count = await reopened.execute('SELECT count(*) FROM blobs;');

    expect(String(failure)).toContain('database or disk is full');
    expect(causeMessages(failure)).toContain('writeFileSync:fail user dir saved file size limit exceeded');
    expect(fileSystem.lastQuotaError).not.toBeNull();
    expect(count.results[0].rows).toEqual([[1]]);
  });
});

describe('AC#21 微信与抖音同进程', () => {
  it('两个宿主各写各的文件系统，布局互不影响', async () => {
    const wechatFiles = new QuotaFileSystem();
    const wechat = createWechatMiniProgramHost({
      env: { USER_DATA_PATH: '/wx' },
      getFileSystemManager: () => wechatFiles
    });
    const { tt, fileSystem: douyinFiles } = createFakeDouyin();
    const douyin = createDouyinMiniProgramHost(tt);

    const [onWechat, onDouyin] = await Promise.all([
      track(createWaSqliteMiniProgramClient('shared-name', { host: wechat, moduleFactory, wasmRuntime })),
      track(createWaSqliteMiniProgramClient('shared-name', { host: douyin, moduleFactory, wasmRuntime }))
    ]);
    await onWechat.execute("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('wx');");
    await onDouyin.execute("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('tt');");

    expect((await onWechat.execute('SELECT v FROM t;')).results[0].rows).toEqual([['wx']]);
    expect((await onDouyin.execute('SELECT v FROM t;')).results[0].rows).toEqual([['tt']]);
    expect([...wechatFiles.files.keys()].every(path => path.startsWith('/wx/') && !/\.\d+$/.test(path))).toBe(true);
    expect([...douyinFiles.files.keys()].every(path => path.startsWith(`${FAKE_TT_USER_DATA_PATH}/`))).toBe(true);
    expect([...douyinFiles.files.keys()].some(path => /\.sqlite\.0$/.test(path))).toBe(true);
  });
});

function causeMessages(error: unknown): string[] {
  const messages: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) messages.push(current.message);
  return messages;
}
