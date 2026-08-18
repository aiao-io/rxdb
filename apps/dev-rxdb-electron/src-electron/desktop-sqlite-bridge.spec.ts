/**
 * @fileoverview US-207：主进程桌面 SQLite host 与窗口之间的绑定关系。
 *
 * @remarks
 * 这里跑的是真的 `node:sqlite` 与真的临时文件，只有 `webContents` 被换成了假对象——
 * 它在测试里唯一的作用就是「记下收到过什么」，而 Electron 那份需要一个完整的窗口才能构造。
 *
 * 另一半是 `main.ts` / `preload.ts` 的静态门禁：那两个文件 import `electron`，
 * 在 vitest 里根本加载不了，但它们承载的两条约束（发起方校验、全局键一致）
 * 一旦破掉就是安全问题或「适配器永远找不到 host」，值得用源码断言先拦一道。
 */

import { DESKTOP_HOST_TRANSPORT_KEY } from '@aiao/rxdb-adapter-electron';
import { RxDBAdapterDesktopError, type DesktopHostResponse } from '@aiao/rxdb-adapter-electron/host';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_STORAGE_DIRECTORY } from './desktop-file-bridge';
import {
  createDatabasePathResolver,
  createDesktopSqliteBridge,
  DESKTOP_DATABASE_DIRECTORY,
  type DesktopChangeEventTarget,
  type DesktopSqliteBridge
} from './desktop-sqlite-bridge';
import { DESKTOP_HOST_BRIDGE_KEY, DESKTOP_HOST_CHANGE_CHANNEL, DESKTOP_HOST_REQUEST_CHANNEL } from './ipc-contract';

const appDir = resolve(import.meta.dirname, '..');
const read = (relative: string): string => readFileSync(resolve(appDir, relative), 'utf8');

/** 变更事件只在受监听的系统表上产生，因此用例必须写这张表而不是随便建一张。 */
const CHANGE_TABLE = 'rxdb$rxdb_change';

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-bridge-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('createDatabasePathResolver', () => {
  it('把逻辑库名解析到应用数据目录下的库子目录，并按需建目录', () => {
    const resolvePath = createDatabasePathResolver(workspace);
    const file = resolvePath('app.sqlite3');
    expect(file).toBe(join(workspace, DESKTOP_DATABASE_DIRECTORY, 'app.sqlite3'));
    // 首次连接时目录多半还不存在；不建的话 node:sqlite 直接以「打不开文件」失败。
    expect(existsSync(join(workspace, DESKTOP_DATABASE_DIRECTORY))).toBe(true);
  });

  // AC#3：库名来自 renderer。host 已经校验过一遍，这里是落盘前的最后一道 ——
  // 漏一个 `../` 进 join()，写入位置就由调用方而不是应用决定了。
  it('拒绝越出应用作用域的库名，且不为它建任何目录', () => {
    const resolvePath = createDatabasePathResolver(workspace);
    expect(() => resolvePath('../../escape.sqlite3')).toThrowError(RxDBAdapterDesktopError);
    expect(existsSync(join(workspace, DESKTOP_DATABASE_DIRECTORY))).toBe(false);
  });

  // AC#1：目录名撞车 = 静默丢数据。Chromium 自己也在 userData 下开目录，
  // 而且会在启动时清掉它不认识的文件 —— 我们的库文件在它眼里正是「不认识的文件」。
  // 实测（见下方常量注释）：`databases/` 里的内容每次启动都被整体删掉，进程不报一个字，
  // 应用照常连上、照常写入，只是上一次的数据没了。
  //
  // 这条断言没法从行为上验（要真跑一个 Electron 才看得到），因此退而守住名字本身：
  // 名单里的任何一个都不许用。改名字改到名单里去，这里当场红。
  //
  // US-504 起文件根也落在同一个 userData 下，同一条失败对它一字不差地成立，
  // 因此名单在这里一处维护、两个目录名一起过。
  it.each([DESKTOP_DATABASE_DIRECTORY, DESKTOP_STORAGE_DIRECTORY])(
    '%s 不与 Chromium 在 userData 下自用的目录重名',
    directory => {
      // 取自 Chromium profile 布局中会被其存储层主动清理或接管的目录名，小写比较。
      const chromiumOwned = [
        'databases',
        'blob_storage',
        'cache',
        'code cache',
        'file system',
        'gpucache',
        'indexeddb',
        'local storage',
        'network',
        'service worker',
        'session storage',
        'shared proto db',
        'webstorage'
      ];
      expect(chromiumOwned).not.toContain(directory.toLowerCase());
    }
  );

  // 合并成一个目录就没法分别回答「库多大」「文件多大」，库整体重建也会连着删掉用户文件。
  it('库目录与文件目录分开', () => {
    expect(DESKTOP_DATABASE_DIRECTORY).not.toBe(DESKTOP_STORAGE_DIRECTORY);
  });
});

describe('createDesktopSqliteBridge', () => {
  let bridge: DesktopSqliteBridge;
  let deliveryErrors: unknown[];

  /** 假窗口：`alive` 可写，用来模拟「事件在途时窗口被销毁」。 */
  const createTarget = (): DesktopChangeEventTarget & { alive: boolean; send: ReturnType<typeof vi.fn> } => {
    const target = {
      alive: true,
      isDestroyed: (): boolean => !target.alive,
      send: vi.fn()
    };
    return target;
  };

  /** `batchTimeout: 0` 把 host 的防抖窗口压到「下一个宏任务」，用例不必等真实毫秒。 */
  const openOn = async (target: DesktopChangeEventTarget, databaseName = 'app.sqlite3'): Promise<string> => {
    const response = await bridge.handle(target, {
      kind: 'open',
      storage: { engine: 'sqlite', databaseName },
      batchTimeout: 0
    });
    if (response.kind !== 'open') throw new Error(`expected an open response, got ${response.kind}`);
    return response.result.sessionId;
  };

  const execute = (target: DesktopChangeEventTarget, sessionId: string, sql: string): Promise<DesktopHostResponse> =>
    bridge.handle(target, { kind: 'execute', sessionId, sql });

  /** 让「没收到事件」这类否定断言有意义：先把该派发的都派发完，再断言确实没有。 */
  const settleChanges = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10));

  beforeEach(() => {
    deliveryErrors = [];
    bridge = createDesktopSqliteBridge({
      resolveDatabasePath: createDatabasePathResolver(workspace),
      onDeliveryError: error => deliveryErrors.push(error)
    });
  });

  afterEach(() => {
    bridge.closeAll();
  });

  // 事件按会话定向。广播给所有窗口的话，别的窗口会把远端写入当成自己的本地变更回灌缓存。
  it('变更事件只送到开这条会话的那个窗口', async () => {
    const owner = createTarget();
    const bystander = createTarget();
    const sessionId = await openOn(owner);
    await openOn(bystander);

    await execute(owner, sessionId, `CREATE TABLE "${CHANGE_TABLE}" (id INTEGER PRIMARY KEY, payload TEXT)`);
    await execute(owner, sessionId, `INSERT INTO "${CHANGE_TABLE}" (payload) VALUES ('x')`);

    await vi.waitFor(() => {
      expect(owner.send).toHaveBeenCalledOnce();
    });
    expect(owner.send).toHaveBeenCalledWith(
      DESKTOP_HOST_CHANGE_CHANNEL,
      expect.objectContaining({ kind: 'change', sessionId })
    );
    expect(bystander.send).not.toHaveBeenCalled();
  });

  // sessionId 随每条变更事件发到 renderer，它是公开标识而不是凭证。
  // 不验主的话，任一窗口都能对另一个窗口的连接执行 SQL、提交、回滚，或者直接把它关掉。
  it('拒绝另一个窗口的会话，且不在 host 上留下任何痕迹', async () => {
    const owner = createTarget();
    const intruder = createTarget();
    const sessionId = await openOn(owner);
    await openOn(intruder, 'other.sqlite3');

    for (const request of [
      { kind: 'execute', sessionId, sql: 'SELECT 1' },
      { kind: 'version', sessionId },
      { kind: 'close', sessionId }
    ]) {
      const response = await bridge.handle(intruder, request);
      expect(response, `for ${request.kind}`).toMatchObject({ kind: 'error', code: 'permission_denied' });
    }

    expect(bridge.openSessionCount).toBe(2);
    await expect(bridge.handle(owner, { kind: 'version', sessionId })).resolves.toMatchObject({ kind: 'version' });
  });

  // 「不存在」与「不是你的」处理方式相反：前者该重连，后者该放弃。
  it('未知会话仍然报 session_closed 而不是越权', async () => {
    const target = createTarget();
    await expect(
      bridge.handle(target, { kind: 'version', sessionId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })
    ).resolves.toMatchObject({ kind: 'error', code: 'session_closed' });
  });

  // 写入落库与事件派发之间隔着一个防抖窗口，窗口正好在这中间关掉是常规竞态。
  // 往已销毁的 webContents 上 send 会抛，而此刻数据其实已经写进去了。
  it('窗口销毁后丢弃事件而不是往死的 webContents 上发', async () => {
    const target = createTarget();
    const sessionId = await openOn(target);
    await execute(target, sessionId, `CREATE TABLE "${CHANGE_TABLE}" (id INTEGER PRIMARY KEY, payload TEXT)`);

    target.alive = false;
    const write = await execute(target, sessionId, `INSERT INTO "${CHANGE_TABLE}" (payload) VALUES ('x')`);

    expect(write.kind).toBe('execute');
    await settleChanges();
    expect(target.send).not.toHaveBeenCalled();
    // 这是预期内的竞态，不是缺陷，不该冒充成送达失败去污染日志
    expect(deliveryErrors).toEqual([]);
  });

  // AC#7：窗口关掉时它开的库句柄必须跟着放。留着的话文件一直被占，
  // 用户重开窗口会撞上另一份连接的 WAL 锁，而症状看着像「数据库坏了」。
  it('窗口销毁时只回收该窗口的会话', async () => {
    const closing = createTarget();
    const surviving = createTarget();
    await openOn(closing, 'first.sqlite3');
    await openOn(closing, 'second.sqlite3');
    const survivingSession = await openOn(surviving, 'third.sqlite3');
    expect(bridge.openSessionCount).toBe(3);

    expect(bridge.releaseTarget(closing)).toBe(2);
    expect(bridge.openSessionCount).toBe(1);
    await expect(bridge.handle(surviving, { kind: 'version', sessionId: survivingSession })).resolves.toMatchObject({
      kind: 'version'
    });
  });

  // 正常 disconnect 后窗口才关是最常见的顺序；映射不清就是每开一次库泄漏一个条目，
  // 长跑的应用最终会拿着一堆早已作废的 sessionId。
  it('会话显式关闭后不再挂在窗口名下', async () => {
    const target = createTarget();
    const sessionId = await openOn(target);
    await bridge.handle(target, { kind: 'close', sessionId });

    expect(bridge.openSessionCount).toBe(0);
    expect(bridge.releaseTarget(target)).toBe(0);
  });

  // 数据落在真实文件里、且重开一条会话能读回来 —— AC#1 在打包 e2e 之前的第一道验证。
  it('数据写进真实文件，重新连接后仍读得到', async () => {
    const target = createTarget();
    const first = await openOn(target, 'persist.sqlite3');
    await execute(target, first, 'CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT)');
    await execute(target, first, `INSERT INTO note (body) VALUES ('survives a restart')`);
    await bridge.handle(target, { kind: 'close', sessionId: first });

    expect(existsSync(join(workspace, DESKTOP_DATABASE_DIRECTORY, 'persist.sqlite3'))).toBe(true);

    const second = await openOn(target, 'persist.sqlite3');
    await expect(execute(target, second, 'SELECT body FROM note')).resolves.toMatchObject({
      kind: 'execute',
      result: { results: [{ rows: [['survives a restart']] }] }
    });
  });
});

describe('桌面 host 的 IPC 接线', () => {
  // ELEC-08：demo 通道当初留这道校验是「将来加副作用时的防线」，桌面 host 就是那个将来 ——
  // 它能读写真实库文件，缺这道校验等于把数据库开放给任意被嵌入的 frame。
  it('main 只受理来自主 frame 的桌面 host 请求', () => {
    const source = read('src-electron/main.ts');
    expect(source).toContain(`ipcMain.handle(DESKTOP_HOST_REQUEST_CHANNEL`);
    const handler = source.slice(source.indexOf('ipcMain.handle(DESKTOP_HOST_REQUEST_CHANNEL'));
    expect(handler.slice(0, handler.indexOf('});'))).toContain('event.senderFrame !== win?.webContents.mainFrame');
  });

  // preload 里这三个字面量是手抄的（ELEC-15：sandbox 下不能值导入兄弟文件），
  // 抄错的后果分别是：请求发到没人监听的通道、事件永远收不到、适配器找不到桥接。
  it.each([DESKTOP_HOST_REQUEST_CHANNEL, DESKTOP_HOST_CHANGE_CHANNEL, DESKTOP_HOST_BRIDGE_KEY])(
    'preload 里的 %s 与 ipc-contract 一致',
    literal => {
      expect(read('src-electron/preload.ts')).toContain(`'${literal}'`);
    }
  );

  // 全局键是适配器与 preload 之间唯一的约定，两边各写一份字符串，改一处不会让另一处变红。
  // 静态 import 而不是 `await import()`：Nx 只要在某个文件里看见一次动态 import，
  // 就把整个库判为 lazy-loaded，于是**所有**静态引用它的文件一起报
  // 「Static imports of lazy-loaded libraries are forbidden」——警告落在被牵连的文件上，
  // 根因却在这一行。
  it('全局键与适配器包的 DESKTOP_HOST_TRANSPORT_KEY 一致', () => {
    expect(DESKTOP_HOST_BRIDGE_KEY).toBe(DESKTOP_HOST_TRANSPORT_KEY);
  });

  // 退出时序的行为用例在 main.utils.spec.ts（createWillQuitHandler），但那套管不到
  // main.ts 有没有真的用它 —— 手写一遍「preventDefault + 收尾 + app.quit()」照样能跑通
  // 全部单测，然后在真实产物上永远退不掉（见 createWillQuitHandler 的注释）。
  // 这条把接线本身钉住：will-quit 里除了委托给 handler，不得再出现裸的 app.quit()。
  it('main 的 will-quit 委托给 createWillQuitHandler，不自己 quit', () => {
    const source = read('src-electron/main.ts');
    expect(source).toContain('createWillQuitHandler(');

    const start = source.indexOf(`app.on('will-quit'`);
    expect(start, 'main.ts 里找不到 will-quit 监听器').toBeGreaterThan(-1);
    const listener = source.slice(start, source.indexOf('});', start));
    expect(listener).toContain('handleWillQuit(event)');
    expect(listener, 'will-quit 里直接 app.quit() 会被 Electron 静默吞掉').not.toContain('app.quit()');
  });
});

/**
 * ELEC-23：本模块 import 的 `@aiao/rxdb-adapter-electron/host` 必须被打进产物。
 *
 * 与 ELEC-14（tslib）同源的失败：主进程是**逐文件 tsc 产物**，而 electron-builder 的
 * `files` 白名单写着 `!node_modules` —— tsc 原样 emit 的 `require("@aiao/rxdb-adapter-electron/host")`
 * 在打包后的应用里必然找不到模块。typecheck、单测、`--serve` 全绿，只有真实产物会炸。
 *
 * 所以由 esbuild 单独打一份自足的 CJS 出来。输出名带 `.bundle` 是**故意**的：
 * tsc 照样会往 `desktop-host-bridge.js` 写它那份未打包的产物，同名就成了两个进程抢一个
 * 文件（watch 模式下 esbuild 先完成、tsc 后覆盖，dev 模式必然拿到坏的那份）。
 * 换个名字，两边各写各的，`main.ts` 只认 `.bundle.js`。
 *
 * US-504 起入口是**合流后的** `desktop-host-bridge.ts`：SQLite 与文件两族 host 都要跟进
 * 产物，各打一份会把协议模块复制两遍，`main.ts` 也要维护两条 import 路径。
 */
describe('ELEC-23 桌面 host 依赖必须打进主进程产物', () => {
  const project = JSON.parse(read('project.json'));
  const bundleTargets = ['electron-build', 'electron-package-dir'];
  const BUNDLER_SCRIPT = 'tools/bundle-desktop-host.mjs';
  const commandsOf = (target: string): string[] =>
    (project.targets[target].options.commands as (string | { command: string })[]).map(entry =>
      typeof entry === 'string' ? entry : entry.command
    );

  // 静态 import 会让 main.js emit 出 `require("./desktop-host-bridge")` —— 那是 tsc 的未打包产物。
  it('main 从打包产物而不是 tsc 的逐文件产物加载桥接', () => {
    const source = read('src-electron/main.ts');
    expect(source).toContain("from './desktop-host-bridge.bundle.js'");
    expect(source).not.toMatch(/from '\.\/desktop-(host|sqlite|file)-bridge'/);
  });

  it.each(bundleTargets)('%s 在 tsc 之后跑打包脚本', target => {
    const commands = commandsOf(target);
    const tscAt = commands.findIndex(command => command.includes('tsc -p tsconfig.serve.json'));
    const bundleAt = commands.findIndex(command => command.includes(BUNDLER_SCRIPT));
    expect(tscAt).toBeGreaterThanOrEqual(0);
    expect(bundleAt).toBeGreaterThan(tscAt);
    expect(project.targets[target].options.parallel).toBe(false);
  });

  // 少一个开关就少打包一层依赖：没有 bundle 就只是转译，
  // 没有 format: 'cjs' 会 emit ESM 而应用 package.json 没有 "type": "module"，
  // 没有 platform: 'node' 则 `node:sqlite` 之类的内建被当成待打包的裸模块。
  // 断言的是脚本导出的配置对象本身，而不是命令行字符串——后者可能与真正生效的配置脱节。
  it('打包脚本产出自足的 node CJS', async () => {
    const { bundleOptions } = await import('../tools/bundle-desktop-host.mjs');
    expect(bundleOptions).toMatchObject({
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      external: ['electron']
    });
    expect(bundleOptions.entryPoints).toHaveLength(1);
    expect(bundleOptions.entryPoints[0]).toMatch(/src-electron\/desktop-host-bridge\.ts$/);
    expect(bundleOptions.outfile).toMatch(
      /dist\/apps\/dev-rxdb-electron\/src-electron\/desktop-host-bridge\.bundle\.js$/
    );
  });

  // main.ts 只 import 打包产物，而 esbuild 只留**本入口**的导出面 ——
  // 两个路径解析器不从合流入口转发出去，main.ts 就只能去取 tsc 的逐文件产物，
  // 又绕回 ELEC-23 要解决的那个失败。
  it('合流入口转发两族的路径解析器', async () => {
    const bridge = await import('./desktop-host-bridge');
    expect(typeof bridge.createDatabasePathResolver).toBe('function');
    expect(typeof bridge.createStorageRootResolver).toBe('function');
  });

  // 三处逐字副本正是 ELEC-23 想消灭的东西：打包路径漏改一处，
  // typecheck、单测、dev 全绿，只有真实产物启动时才 Cannot find module。
  it('三个调用点共用同一份打包定义', () => {
    const callSites = [...bundleTargets, 'watch-main'].map(target =>
      commandsOf(target).filter(command => command.includes('bundle-desktop-host'))
    );
    expect(callSites.every(commands => commands.length === 1)).toBe(true);
    expect(commandsOf('electron-build')).not.toContainEqual(expect.stringContaining('esbuild '));
  });

  // dev 模式加载的是同一份 dist 产物。watch-main 只跑 tsc 的话，
  // `.bundle.js` 根本不存在 —— 应用一启动就 `Cannot find module`。
  it('watch-main 同时监视 tsc 与打包脚本', () => {
    const commands = commandsOf('watch-main');
    expect(commands.some(command => command.includes('tsc -p apps/dev-rxdb-electron/tsconfig.serve.json'))).toBe(true);
    expect(commands.some(command => command.includes(BUNDLER_SCRIPT) && command.includes('--watch'))).toBe(true);
    expect(project.targets['watch-main'].options.parallel).not.toBe(false);
  });
});
