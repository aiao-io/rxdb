/**
 * US-211 支付宝 host。能力名、存储布局、文件系统包装与运行时修补都取支付宝探针 v2–v7
 * （开发者工具模拟器 + iOS 真机）的实测结论，平台形态见 {@link createFakeAlipay}。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWaSqliteMiniProgramClient, type WaSqliteMiniProgramClient } from '../create-client.js';
import { createWechatMiniProgramHost } from '../host.js';
import type { MiniProgramAlipayApi } from '../hosts/alipay-api.js';
import { ALIPAY_FRAME_HEADER } from '../hosts/alipay-file-system.js';
import { createAlipayWasmRuntime } from '../hosts/alipay-wasm.js';
import { createAlipayMiniProgramHost } from '../hosts/alipay.js';
import { createDouyinMiniProgramHost } from '../hosts/douyin.js';
import type { MiniProgramHost, MiniProgramWasmRuntime } from '../mini-program.interface.js';
import { MINI_PROGRAM_PLATFORM_IDS } from '../mini-program.interface.js';
import { assertMiniProgramRuntimeCapabilities } from '../runtime-capabilities.js';
import { prepareMiniProgramHostRuntime } from '../runtime-polyfills.js';
import {
  createFakeAlipay,
  createFakeRandomWorker,
  FAKE_ALIPAY_USER_DATA_PATH,
  type FakeAlipay
} from './fake-alipay.js';
import { createFakeDouyin } from './fake-douyin.js';
import { QuotaFileSystem } from './quota-file-system.js';
import { moduleFactory, wasmRuntime } from './subframe-wasm-factory.js';

function alipayHost(my: MiniProgramAlipayApi, worker = createFakeRandomWorker()): MiniProgramHost {
  return createAlipayMiniProgramHost(my, { randomWorker: worker, webAssembly: WebAssembly });
}

function clientOptions(fake: FakeAlipay) {
  return {
    host: alipayHost(fake.my),
    moduleFactory,
    wasmRuntime: createAlipayWasmRuntime(fake.my, WebAssembly)
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

describe('createAlipayMiniProgramHost', () => {
  it('平台 id 为已登记的 alipay，能力名带 my. 前缀', () => {
    const host = alipayHost(createFakeAlipay().my);

    expect(MINI_PROGRAM_PLATFORM_IDS).toContain('alipay');
    expect(host).toMatchObject({
      platform: 'alipay',
      displayName: '支付宝小程序',
      shortName: '支付宝',
      wasmRuntimeName: 'WebAssembly',
      capabilityNames: { fileSystem: 'my.getFileSystemManager', userDataPath: 'my.env.USER_DATA_PATH' },
      userDataPath: FAKE_ALIPAY_USER_DATA_PATH
    });
  });

  it('声明 64 KiB 分块布局，wasm 用默认的代码包相对路径', () => {
    const host = alipayHost(createFakeAlipay().my);

    expect(host.fileLayout).toEqual({ kind: 'chunked', chunkBytes: 65_536 });
    expect(host).not.toHaveProperty('defaultWasmPath');
  });

  it('文件系统交出包装层，my.getFileSystemManager 缺失时为 undefined', () => {
    const { my } = createFakeAlipay();
    const missing: Partial<MiniProgramAlipayApi> = { ...my };
    delete missing.getFileSystemManager;

    expect(alipayHost(my).getFileSystemManager()).toMatchObject({
      accessSync: expect.any(Function) as unknown,
      readFileSync: expect.any(Function) as unknown,
      writeFileSync: expect.any(Function) as unknown
    });
    expect(alipayHost(missing as MiniProgramAlipayApi).getFileSystemManager()).toBeUndefined();
  });

  it('用户目录为空串或 my.env 缺失时视为缺失', () => {
    const { my } = createFakeAlipay();

    expect(alipayHost({ ...my, env: { USER_DATA_PATH: '' } }).userDataPath).toBeUndefined();
    expect(alipayHost({ ...my, env: undefined }).userDataPath).toBeUndefined();
  });

  it('注入的 runtimeGlobal 原样交出；不注入且环境有 globalThis 时为 undefined，交给通用解析', () => {
    const { my } = createFakeAlipay();
    const worker = createFakeRandomWorker();

    expect(
      createAlipayMiniProgramHost(my, { randomWorker: worker, webAssembly: WebAssembly, runtimeGlobal: globalThis })
        .runtimeGlobal
    ).toBe(globalThis);
    expect(alipayHost(my).runtimeGlobal).toBeUndefined();
  });
});

describe('支付宝随机源与运行时引导', () => {
  it('随机数经 Worker 取，按要求长度返回新分配的缓冲区', async () => {
    const worker = createFakeRandomWorker();
    const host = alipayHost(createFakeAlipay().my, worker);
    const first = await host.requestRandomValues(16);
    const second = await host.requestRandomValues(16);

    expect(first.byteLength).toBe(16);
    expect(first.buffer).not.toBe(second.buffer);
    expect(worker.requests).toHaveLength(2);
  });

  it('引导运行时：没有原生随机源时经 Worker 装随机池', async () => {
    vi.stubGlobal('crypto', undefined);
    const worker = createFakeRandomWorker();

    await prepareMiniProgramHostRuntime(alipayHost(createFakeAlipay().my, worker), {
      randomPoolSize: 16
    });

    expect(worker.requests).toEqual([{ type: 'random', id: 0, length: 16 }]);
    expect(globalThis.crypto.getRandomValues(new Uint8Array(4))).toHaveLength(4);
  });

  it('引导运行时：Worker 里没有 crypto 时以 worker-crypto-random 缺失失败', async () => {
    vi.stubGlobal('crypto', undefined);
    const host = alipayHost(createFakeAlipay().my, createFakeRandomWorker({ crypto: null }));

    await expect(prepareMiniProgramHostRuntime(host, { randomPoolSize: 16 })).rejects.toMatchObject({
      capability: 'worker-crypto-random'
    });
  });

  it('引导运行时：逻辑层没有 WebAssembly 时以 logic-layer-webassembly 缺失失败，不申请随机数', async () => {
    const worker = createFakeRandomWorker();
    const host = createAlipayMiniProgramHost(createFakeAlipay().my, { randomWorker: worker, webAssembly: undefined });

    await expect(prepareMiniProgramHostRuntime(host)).rejects.toMatchObject({
      capability: 'logic-layer-webassembly'
    });
    expect(worker.requests).toEqual([]);
  });
});

describe('支付宝 host 接入客户端', () => {
  it.each(['ios', 'simulator'] as const)(
    '%s：写入后关闭重开读回，数据库按 64 KiB 分块落盘，每个文件都带帧头',
    async mode => {
      const fake = createFakeAlipay({ mode });
      const open = () => track(createWaSqliteMiniProgramClient('alipay-reconnect', clientOptions(fake)));

      const first = await open();
      await first.execute('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);');
      await first.execute("INSERT INTO notes (body) VALUES ('支付宝 💙');");
      await first.disconnect();
      clients.splice(0);
      const second = await open();
      const rows = await second.execute('SELECT body FROM notes;');

      expect(rows.results[0].rows).toEqual([['支付宝 💙']]);
      expect([...fake.files.keys()]).toContain(
        `${FAKE_ALIPAY_USER_DATA_PATH}/rxdb-wa-sqlite/rxdb-alipay-reconnect.sqlite.0`
      );
      expect([...fake.files.values()].every(bytes => bytes[0] === ALIPAY_FRAME_HEADER)).toBe(true);
    }
  );

  it('空库也能建出并重开（模拟器拒绝空写入，靠帧头）', async () => {
    const fake = createFakeAlipay({ mode: 'simulator' });
    await (await createWaSqliteMiniProgramClient('alipay-empty', clientOptions(fake))).disconnect();
    const reopened = await track(createWaSqliteMiniProgramClient('alipay-empty', clientOptions(fake)));

    expect((await reopened.execute('SELECT count(*) FROM sqlite_master;')).results[0].rows).toEqual([[0]]);
  });

  it('缺失能力全部列出，名称带 my. 前缀', () => {
    const host = alipayHost({ env: { USER_DATA_PATH: '' } } as MiniProgramAlipayApi);

    expect(() =>
      assertMiniProgramRuntimeCapabilities({
        moduleFactory,
        wasmRuntime: {} as MiniProgramWasmRuntime,
        host: host
      })
    ).toThrow(
      '支付宝小程序运行时缺少 RxDB 必需能力: WebAssembly.instantiate, my.getFileSystemManager, my.env.USER_DATA_PATH'
    );
  });

  it('同一数据库的第二个连接被拒绝', async () => {
    const fake = createFakeAlipay();
    await track(createWaSqliteMiniProgramClient('alipay-single', clientOptions(fake)));

    await expect(createWaSqliteMiniProgramClient('alipay-single', clientOptions(fake))).rejects.toThrow(
      '支付宝文件 VFS 不支持同一数据库的并发连接'
    );
  });

  it('撞配额以 SQLITE_FULL 失败，平台原文与错误码在 cause 链上，已提交数据重开仍在', async () => {
    const fake = createFakeAlipay({ folderLimitBytes: 1024 * 1024 });
    const client = await track(createWaSqliteMiniProgramClient('alipay-quota', clientOptions(fake)));
    await client.execute('CREATE TABLE blobs (id INTEGER PRIMARY KEY, payload BLOB NOT NULL);');
    await client.execute('INSERT INTO blobs (payload) VALUES (randomblob(1024));');

    const failure: unknown = await client.execute('INSERT INTO blobs (payload) VALUES (randomblob(2097152));').then(
      () => undefined,
      (error: unknown) => error
    );
    await client.disconnect();
    clients.splice(0);
    const reopened = await track(createWaSqliteMiniProgramClient('alipay-quota', clientOptions(fake)));
    const count = await reopened.execute('SELECT count(*) FROM blobs;');

    expect(String(failure)).toContain('database or disk is full');
    expect(
      causeMessages(failure).some(message => message.includes('写入文件单个超过 10M 或者写入文件夹超过 50M'))
    ).toBe(true);
    expect(causeMessages(failure).some(message => message.includes('error 10028'))).toBe(true);
    expect(count.results[0].rows).toEqual([[1]]);
  });
});

describe('微信、抖音与支付宝同进程', () => {
  it('三个宿主各写各的文件系统，布局互不影响', async () => {
    const wechatFiles = new QuotaFileSystem();
    const wechat = createWechatMiniProgramHost({
      env: { USER_DATA_PATH: '/wx' },
      getFileSystemManager: () => wechatFiles
    });
    const { tt, fileSystem: douyinFiles } = createFakeDouyin();
    const alipay = createFakeAlipay();

    const [onWechat, onDouyin, onAlipay] = await Promise.all([
      track(createWaSqliteMiniProgramClient('shared-name', { host: wechat, moduleFactory, wasmRuntime })),
      track(
        createWaSqliteMiniProgramClient('shared-name', {
          host: createDouyinMiniProgramHost(tt),
          moduleFactory,
          wasmRuntime
        })
      ),
      track(createWaSqliteMiniProgramClient('shared-name', clientOptions(alipay)))
    ]);
    await onWechat.execute("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('wx');");
    await onDouyin.execute("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('tt');");
    await onAlipay.execute("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('my');");

    expect((await onWechat.execute('SELECT v FROM t;')).results[0].rows).toEqual([['wx']]);
    expect((await onDouyin.execute('SELECT v FROM t;')).results[0].rows).toEqual([['tt']]);
    expect((await onAlipay.execute('SELECT v FROM t;')).results[0].rows).toEqual([['my']]);
    expect([...wechatFiles.files.keys()].every(path => path.startsWith('/wx/'))).toBe(true);
    expect([...douyinFiles.files.keys()].some(path => path.startsWith('/wx/'))).toBe(false);
    expect([...alipay.files.keys()].every(path => path.startsWith(`${FAKE_ALIPAY_USER_DATA_PATH}/`))).toBe(true);
  });
});

function causeMessages(error: unknown): string[] {
  const messages: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) messages.push(current.message);
  return messages;
}

describe('支付宝 host 的导出', () => {
  it('主入口与轻量 /runtime 入口都导出宿主与 wasm 运行时，是同一个函数', async () => {
    const [main, runtime] = await Promise.all([import('../index.js'), import('../runtime.js')]);

    expect(main.createAlipayMiniProgramHost).toBe(createAlipayMiniProgramHost);
    expect(main.createAlipayWasmRuntime).toBe(createAlipayWasmRuntime);
    expect(runtime.createAlipayMiniProgramHost).toBe(createAlipayMiniProgramHost);
    // 预检要在引导前同步建 wasm 运行时，应用不必为它提前加载重的主入口
    expect(runtime.createAlipayWasmRuntime).toBe(createAlipayWasmRuntime);
    expect(runtime.ALIPAY_WASM_TEXT_COPY_SUFFIX).toBe('.base64.txt');
  });
});
