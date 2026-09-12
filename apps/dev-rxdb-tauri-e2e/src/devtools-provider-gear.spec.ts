import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveFrontend } from './frontend-server';
import { runSelfCheck, type DevToolsNativeProbe, type SelfCheckRun } from './packaged-app';

/**
 * US-905 阶段 1 收尾：provider 档位与 VFS 三态在**打包产物**上的走查（AC#2 / #6 / #7）。
 *
 * @remarks
 * # 三个档位面从哪来
 *
 * 一次 e2e 进程 = 一档：`DEV_RXDB_DEVTOOLS_PROVIDER_SOURCE`（real|fake）、
 * `DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO`（ok|busy|expired|too_large，fake 档专属）、
 * `DEV_RXDB_DEVTOOLS_FORCE_VFS`（opfs|idb|unavailable，real 档专属）。三者由 Rust 的
 * `devtools_config` 校验后，以**两把全局键**分别在主窗口与调试窗口注入：
 * 主窗口的 connector 定档，调试窗口里的 wire 驱动按档走查（`devtools_driver.js` 的
 * `runReal()` / `runFake()` 分叉）。
 *
 * # AC#2 的判据为什么是「fake 在真实双窗口上走」
 *
 * fake 档的 provider 集合装在调试窗口的**真实** `invoke` / `emit_to` 链路后面：五类操作
 * （查询 / 事件 / 授权 / transfer / snapshot）全部走真实 Rust 中继与真实 wire 校验，
 * 换掉的只是 connector 背后的 provider。这证明档位注入、面板协商、能力镜像是一条
 * 整链，而不是进程内 conformance 的翻版。
 *
 * # 为什么只报码与计数
 *
 * AC#13 的回显禁令：报告不带路径、记录、快照 ID 或字节内容。本文件全部断言都是
 * 结果码与计数，具体文件内容由 fake 集合播种的固定数字（3 个条目、700 字节）钉住。
 *
 * # VFS 三态的判据（AC#6）
 *
 * - `opfs`：应用库走 wa-sqlite 的 OPFSCoopSyncVFS → 面板 descriptors 报 `files: opfs` +
 *   `settings: opfs`；
 * - `idb`：走 IDBBatchAtomicVFS → `settings: idb`，`files` 不宣告（没有文件根，是现状行为）；
 * - `unavailable`：应用库**诚实失败**——打开即抛，`startLocalDatabase` 报 failed + 退出码 1，
 *   devtools 探针根本没跑（连接器排在失败点之后）。
 *
 * 真实档（不强制）的那一半由 `devtools-window-transport.spec.ts` 覆盖，本文件不重复。
 *
 * # 平台事实表
 *
 * 三个 webview 引擎的 OPFS/IDB 能力并不必然一致。opfs / idb 两个 describe 各冻结一张
 * 每平台预期表：`darwin` 是本机核对的真值，`win32` / `linux` 按引擎事实推的假设，
 * 由 CI 三 OS 矩阵的首次真实输出回填——缺一列时查表会**红**并打印可粘贴的字面量
 * （手法同 `desktop-webview-capability.spec.ts` 的 `EXPECTED_BY_PLATFORM`）。
 *
 * ⚠️ 依赖 dev 产物。跑之前：
 *   pnpm nx run dev-rxdb-tauri:tauri-package-dev
 *   （devtools-smoke target 的 dependsOn 本应替你跑掉这一步。）
 */

/** fake 档底子：开关 + 能力档 + 源档；各 describe 在上面叠场景或写入开关。 */
const FAKE_ENV: Readonly<Record<string, string>> = Object.freeze({
  DEV_RXDB_DEVTOOLS: '1',
  DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
  DEV_RXDB_DEVTOOLS_PROVIDER_SOURCE: 'fake'
});

/** VFS 强制档底子：开关 + 能力档 + 后端；源档省略即真实宿主。 */
const vfsEnv = (vfs: 'opfs' | 'idb' | 'unavailable'): Readonly<Record<string, string>> =>
  Object.freeze({
    DEV_RXDB_DEVTOOLS: '1',
    DEV_RXDB_DEVTOOLS_CAPABILITY: 'full',
    DEV_RXDB_DEVTOOLS_FORCE_VFS: vfs
  });

/** 一次自检启动的全部可观察结果与它的清理手柄。 */
interface Booted {
  readonly run: SelfCheckRun;
  readonly frontend: { close: () => Promise<void> };
  readonly workspace: string;
}

/**
 * 起前端服务 + 跑一次自检。
 *
 * @param env - 本次运行的档位面
 * @param tag - 工作目录前缀，方便失败时定位是哪一档
 * @throws 自检跑不起来（比如 schema 门）时，**先关掉自己起的服务**再抛——1420 上不能留尸体，
 *   否则同文件的其余 describe 全会撞上 EADDRINUSE，把第一处真因淹没掉
 */
const boot = async (env: Readonly<Record<string, string>>, tag: string): Promise<Booted> => {
  const frontend = await serveFrontend();
  const workspace = mkdtempSync(join(realpathSync(tmpdir()), `rxdb-tauri-${tag}-`));
  const dataDir = join(workspace, 'app-data');
  mkdirSync(dataDir);

  try {
    return {
      frontend,
      workspace,
      run: await runSelfCheck({
        dataDir,
        reportPath: join(workspace, 'selfcheck.json'),
        devtoolsProbe: true,
        profile: 'debug',
        env
      })
    };
  } catch (error) {
    await frontend.close();
    rmSync(workspace, { force: true, recursive: true });
    throw error;
  }
};

/**
 * 给一个 describe 装上 boot / 清理钩子。
 *
 * @returns 当前 run 的取用器；只有 beforeAll 成功过才会被 it 调到
 */
const describeBoot = (env: Readonly<Record<string, string>>, tag: string): (() => Booted) => {
  let state: Booted | undefined;
  beforeAll(async () => {
    state = await boot(env, tag);
  }, 180_000);
  afterAll(async () => {
    // boot 抛了（比如 schema 门）时 state 没填上；boot 已经清理过它自己起的东西。
    if (state !== undefined) {
      await state.frontend.close();
      rmSync(state.workspace, { force: true, recursive: true });
    }
  });
  return () => {
    if (state === undefined) throw new Error(`boot(${tag}) 没完成——beforeAll 该把它填上`);
    return state;
  };
};

/** 把失败报告里的原因带进断言消息。 */
const because = (run: SelfCheckRun): string => run.report.message ?? '(报告里没有原因)';

/** 把整份 DevTools 探针结果带进断言消息（理由见 devtools-window-transport.spec.ts 的 `wire`）。 */
const wire = (run: SelfCheckRun): string => `devtools=${JSON.stringify(run.report.devtools)}\n${because(run)}`;

/** 读出 wire 结论并当场钉死它存在——后面每条断言都建立在它上面。 */
const nativeOf = (run: SelfCheckRun): DevToolsNativeProbe => {
  const native = run.report.devtools?.native;
  expect(native, `这一跑的调试窗口里没有 wire 结论：${wire(run)}`).toBeDefined();
  return native as DevToolsNativeProbe;
};

describe('fake 档全授权 + ok 场景：五类操作在真实双窗口上走查（US-905 AC#2）', () => {
  const run = describeBoot(
    { ...FAKE_ENV, DEV_RXDB_DEVTOOLS_MUTATION: 'allow', DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO: 'ok' },
    'gear-full'
  );
  beforeAll(() => {
    expect(run().report.status, because(run())).toBe('ok');
  }, 180_000);

  it('握手帧里的 descriptors 镜像真实档：三个域、三个 kind、runtime 全是 tauri', () => {
    // 镜像的判据以真实档为凭：真实档那份在 devtools-window-transport.spec.ts 里钉着。
    expect(nativeOf(run()).descriptorKinds).toEqual({ database: 'rxdb', files: 'native-files', settings: 'sqlite' });
    expect(nativeOf(run()).descriptorRuntimes).toEqual({ database: 'tauri', files: 'tauri', settings: 'tauri' });
  });

  it('查询类：query 答 ok，inspect 的平台失败映射成 provider_unavailable', () => {
    const native = nativeOf(run());
    expect(native.databaseQuery, wire(run())).toBe('ok');
    // 注入的是 Rust 侧 `NotConnected`。fake 集合上的错误走**共享映射**——码本身证明
    // 这条错误路径不是为 fake 档新编的。
    expect(native.databaseInspect).toBe('provider_unavailable');
  });

  it('事件类：订阅答 ok，事件确实经 EVENT 帧送到了面板', () => {
    const native = nativeOf(run());
    expect(native.eventsSubscribe, wire(run())).toBe('ok');
    expect(native.eventFrames ?? -1, 'EVENT 帧计数缺席或为负').toBeGreaterThanOrEqual(0);
  });

  it('授权类：声明的 clear 成立、export 被 provider 拒、伪造 session 与越界路径被拒', () => {
    const native = nativeOf(run());
    // 全授权档下 clear 必须成立——fake 的 settings 声明了 clear，拒绝只能来自授权层。
    expect(native.settingsClear, wire(run())).toBe('ok');
    expect(native.settingsExport).toBe('export_unsupported');
    expect(native.forgedSession).toBe('session_invalid');
    expect(native.escapedUpload).toBe('invalid_path');
  });

  it('transfer 类：700 字节三块上传、按 requestId 原样下载', () => {
    const native = nativeOf(run());
    expect(native.uploadBytes, wire(run())).toBe('ok');
    expect(native.uploadChunks, '载荷没被切成多帧——流式那一半没验到').toBe(3);
    expect(native.downloadBytes).toBe('ok');
    expect(native.downloadByteCount).toBe(700);
  });

  it('snapshot 类：120 条记录走完全套分页，双开、越界 pageSize 各得各码', () => {
    const native = nativeOf(run());
    expect(native.snapshotFirstPage, wire(run())).toBe('ok');
    expect(native.snapshotComplete).toBe('ok');
    expect(native.snapshotRecords).toBe(120);
    expect(native.snapshotExpired).toBe('snapshot_expired');
    expect(native.snapshotInvalidPageSize).toBe('invalid_message');
  });
});

describe('fake 档只读（US-905 AC#2 的授权半边）', () => {
  const run = describeBoot({ ...FAKE_ENV, DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO: 'ok' }, 'gear-ro');
  beforeAll(() => {
    expect(run().report.status, because(run())).toBe('ok');
  }, 180_000);

  it('声明的 clear 与上传都被授权层拒掉，读操作不受影响', () => {
    const native = nativeOf(run());
    // fake 的 settings **声明了** clear：拒绝只可能来自授权层——真实档下「未声明」与
    // 「未授权」同码，fake 档这份才分得出是哪一层在拒。
    expect(native.settingsClear, wire(run())).toBe('provider_unsupported');
    expect(native.uploadBytes).toBe('provider_unsupported');
    // 读操作与档位无关：快照走查首页照常成立。
    expect(native.snapshotFirstPage).toBe('ok');
  });

  it('与授权无关的结论在这一跑同样成立', () => {
    const native = nativeOf(run());
    expect(native.databaseInspect).toBe('provider_unavailable');
    expect(native.forgedSession).toBe('session_invalid');
  });
});

describe('fake 档 busy 场景：epoch 重试耗尽后答 snapshot_busy', () => {
  const run = describeBoot({ ...FAKE_ENV, DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO: 'busy' }, 'gear-busy');
  beforeAll(() => {
    expect(run().report.status, because(run())).toBe('ok');
  }, 180_000);

  it('快照首页以 snapshot_busy 收敛', () => {
    expect(nativeOf(run()).snapshotFirstPage, wire(run())).toBe('snapshot_busy');
  });
});

describe('fake 档 too_large 场景：超记录上限答 snapshot_too_large', () => {
  const run = describeBoot({ ...FAKE_ENV, DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO: 'too_large' }, 'gear-large');
  beforeAll(() => {
    expect(run().report.status, because(run())).toBe('ok');
  }, 180_000);

  it('快照首页以 snapshot_too_large 被拒', () => {
    expect(nativeOf(run()).snapshotFirstPage, wire(run())).toBe('snapshot_too_large');
  });
});

describe('fake 档 expired 场景：双开后旧 cursor 翻页答 snapshot_expired', () => {
  const run = describeBoot({ ...FAKE_ENV, DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO: 'expired' }, 'gear-expired');
  beforeAll(() => {
    expect(run().report.status, because(run())).toBe('ok');
  }, 180_000);

  it('首页成立、旧 cursor 被按 snapshot_expired 拒掉', () => {
    const native = nativeOf(run());
    expect(native.snapshotFirstPage, wire(run())).toBe('ok');
    expect(native.snapshotExpired).toBe('snapshot_expired');
  });
});

/**
 * VFS 每平台预期：`status` 为应用库的启动结论，`ok` 时才有 descriptors 可断言。
 *
 * @remarks
 * `darwin` 是本机核对的真值；`win32` / `linux` 是按引擎事实推的**假设**，由 CI 三 OS
 * 矩阵的首次真实输出回填。缺一列时查表会红并打印可粘贴的字面量，而不是悄悄放行。
 */
interface VfsExpectation {
  /** 应用库的启动结论。 */
  readonly status: 'ok' | 'failed';
}

/** opfs 档的每平台预期；linux 预填 `failed`——WebKitGTK 的真 OPFS 是假设不是事实（计划 R3）。 */
const EXPECTED_VFS_OPFS: Readonly<Partial<Record<NodeJS.Platform, VfsExpectation>>> = Object.freeze({
  darwin: { status: 'ok' },
  win32: { status: 'ok' },
  linux: { status: 'failed' }
});

/** idb 档的每平台预期；IndexedDB 是三家引擎都有的老能力，三列都预填 `ok`。 */
const EXPECTED_VFS_IDB: Readonly<Partial<Record<NodeJS.Platform, VfsExpectation>>> = Object.freeze({
  darwin: { status: 'ok' },
  win32: { status: 'ok' },
  linux: { status: 'ok' }
});

/** 把本次实测值排成一段可直接粘进 {@link EXPECTED_VFS_OPFS} / {@link EXPECTED_VFS_IDB} 的字面量。 */
const asVfsTableEntry = (run: SelfCheckRun): string =>
  [`  ${platform}: {`, `    status: ${JSON.stringify(run.report.status)},`, '  }'].join('\n');

/** 查每平台预期表；缺列时红掉并交出可粘贴的实测值。 */
const expectedVfs = (
  table: Readonly<Partial<Record<NodeJS.Platform, VfsExpectation>>>,
  run: SelfCheckRun
): VfsExpectation => {
  const expected = table[platform];
  if (expected === undefined) {
    throw new Error(
      [
        `VFS 预期表里还没有 ${platform} 这一列。`,
        '这次跑出来的真实取值如下，核对无误后粘进 devtools-provider-gear.spec.ts：',
        '',
        asVfsTableEntry(run)
      ].join('\n')
    );
  }
  return expected;
};

/** 失败档的公共断言：应用报 failed 且带着原因。 */
const expectFailedRun = (run: SelfCheckRun): void => {
  expect(run.report.status, because(run)).toBe('failed');
  expect(run.report.message ?? '', '失败档必须带着原因').not.toHaveLength(0);
};

/** ok 档的公共断言：应用起来之后，descriptors 就是强制档的那份。 */
const expectOkRunWith = (run: SelfCheckRun, kinds: Record<string, string>, runtimes: Record<string, string>): void => {
  expect(run.report.status, because(run)).toBe('ok');
  const native = nativeOf(run);
  expect(native.descriptorKinds, wire(run)).toEqual(kinds);
  expect(native.descriptorRuntimes).toEqual(runtimes);
};

describe('VFS opfs 档：面板报 opfs 后端（US-905 AC#6 第一态）', () => {
  const run = describeBoot(vfsEnv('opfs'), 'gear-opfs');

  it('应用库结论与本平台被冻结的取值一致；ok 时 descriptors 报 opfs', () => {
    const expected = expectedVfs(EXPECTED_VFS_OPFS, run());

    if (expected.status === 'failed') {
      expectFailedRun(run());
      return;
    }
    expectOkRunWith(
      run(),
      { database: 'rxdb', files: 'opfs', settings: 'opfs' },
      {
        database: 'tauri',
        files: 'tauri',
        settings: 'tauri'
      }
    );
  });
});

describe('VFS idb 档：面板报 idb 后端，files 不宣告（US-905 AC#6 第二态）', () => {
  const run = describeBoot(vfsEnv('idb'), 'gear-idb');

  it('应用库结论与本平台被冻结的取值一致；ok 时 settings 报 idb、files 缺席', () => {
    const expected = expectedVfs(EXPECTED_VFS_IDB, run());

    if (expected.status === 'failed') {
      expectFailedRun(run());
      return;
    }
    // IDB VFS 没有文件根：files 域**不宣告**是现状行为（tauri-vfs-providers 的单测钉着）。
    expectOkRunWith(run(), { database: 'rxdb', settings: 'idb' }, { database: 'tauri', settings: 'tauri' });
  });
});

describe('VFS unavailable 档：应用库诚实失败（US-905 AC#6 第三态）', () => {
  const run = describeBoot(vfsEnv('unavailable'), 'gear-none');

  it('报 failed + 退出码 1，devtools 探针根本没跑', () => {
    const current = run();
    // 打开即抛、没有兜底：`startLocalDatabase` 报 failed 后返回，连接器排在失败点之后，
    // 所以既没有握手也没有 wire 结论——`devtools: null` 是这一态的判据本身。
    expect(current.exitCode).toBe(1);
    expectFailedRun(current);
    expect(current.report.devtools, '库都开不出来，不该有 devtools 探针结果').toBeNull();
  });
});
