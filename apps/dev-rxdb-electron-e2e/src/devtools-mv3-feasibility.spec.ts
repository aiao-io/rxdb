import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { launchEnv } from './packaged-app';

/**
 * US-904 阶段 A：Electron 43 MV3 扩展可行性门禁（AC#1～#4）。
 *
 * @remarks
 * 这是一道 **stop/go 门禁**，不是回归用例：它回答的是「阶段 D（Electron 原生存储契约）
 * 到底能不能建在 MV3 扩展面板上」。红了就意味着 `decision: unsupported`，阶段 D 转 `Blocked`，
 * 改走 US-905 阶段 1 的窗口模型。所以这里**不允许**任何形式的降级兜底：
 * 探针拿不到证据就必须红，不能 skip、不能 mock、不能"理论可行"。
 *
 * 被测对象是真实的 Electron 主进程（`apps/dev-rxdb-electron/tools/devtools-mv3-probe.mjs`）
 * 加载真实的扩展构建产物，开真实 DevTools。不用 Playwright 的 `_electron.launch()`：
 * 那会把 CDP 挂到主进程上，而本探针要自己开 DevTools 窗口并在 DevTools 的 webContents 里
 * 执行脚本 —— 两套调试通道并存只会互相干扰。这里只负责拉起进程、读结果、逐条判定。
 *
 * 与本目录其余套件的关系：其余套件测 `electron-builder --dir` 的打包产物，本套件不需要打包，
 * 只需要 `rxdb-devtools-extension:build` 的 `dist/`（已写进 `project.json` 的 `dependsOn`）。
 */

/** 探针脚本。删掉它与本文件，生产主进程一行都不用改 —— 阶段 A 要求 fixture 可整体删除。 */
const PROBE = join(__dirname, '../../dev-rxdb-electron/tools/devtools-mv3-probe.mjs');

/** 扩展构建产物目录，与 `apps/rxdb-devtools-extension/vite.config.ts` 的 `outDir` 一致。 */
const EXTENSION_DIST = join(__dirname, '../../rxdb-devtools-extension/dist');

/**
 * Linux 上的沙箱前置检查：确认 `chrome-sandbox` 已配成 setuid root，否则带修复命令直接红。
 *
 * @remarks
 * **这道门禁不能带 `--no-sandbox` 跑，那个开关会让被测能力本身失效。** Electron 44 上，
 * 非沙箱渲染进程走 `renderer_init`，它同步向主进程要 preload 列表；扩展的 `devtools_page`
 * 拿回的是 `null`，于是整个 bundle 在
 *   Electron renderer.bundle.js script failed to run
 *   TypeError: object null is not iterable (cannot read property Symbol(Symbol.iterator))
 * 处中断 —— 页面自己的脚本一行都没执行，`chrome.devtools.panels.create` 从未被调用，
 * RxDB 面板压根不会进 tab 条。表征极具误导性：`chrome.devtools` / `panels.create` 在那个帧里
 * 探起来一切正常，只有 `devtoolsPageState.readyState` 停在 `loading`、`document.scripts` 为空
 * 露了馅。macOS 上加 `--no-sandbox` 能一比一复现同一组红（AC#2/#3 注入/#4 全灭），
 * 去掉就全绿 —— 与平台无关，就是这个开关。
 *
 * 而 npm/pnpm 解包置不了 setuid 位（只有 root 能置），`dist/chrome-sandbox` 落地是 0755。
 * Chromium 见到「文件在但没配好」不会降级，直接 FATAL 中止：
 *   FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper
 *   binary was found, but is not configured correctly.
 * 那条只在 stderr，探针会以 `null` 退出、一条 finding 都不产出，看上去像扩展加载失败。
 * 所以在这里先自查：缺就带着修复命令红，**不退回 `--no-sandbox`** —— 那正是能力失效的原因，
 * 兜过去只会让门禁报绿而什么都没验（AGENTS.md：无 fallback 兜底）。
 *
 * 本目录另外三套用例不受影响：它们走 `_electron.launch()`，Playwright 在 Linux 上会默认插
 * `--no-sandbox`，而它们测的是打包产物的窗口行为，不涉及扩展渲染进程。
 *
 * @param executable - `require('electron')` 返回的可执行文件绝对路径
 */
function assertSandboxUsable(executable: string): void {
  if (process.platform !== 'linux') return;

  const helper = join(dirname(executable), 'chrome-sandbox');
  const stats = existsSync(helper) ? statSync(helper) : null;
  // setuid 位 + root 属主，两者缺一不可：只 chmod 不 chown 一样过不了 Chromium 的检查。
  const usable = stats !== null && stats.uid === 0 && (stats.mode & 0o4000) !== 0;

  expect(
    usable,
    `Electron 的 SUID 沙箱助手未配置好：${helper}\n` +
      `请先执行：sudo chown root:root ${helper} && sudo chmod 4755 ${helper}\n` +
      '（本门禁必须在真沙箱下跑：--no-sandbox 会让扩展 devtools_page 渲染进程初始化失败，' +
      '面板永远不会注册。详见本函数的 @remarks。）'
  ).toBe(true);
}

/** 单条 finding 的形状，与探针的 `record()` 一致。 */
interface Finding {
  readonly step: string;
  readonly ok: boolean;
  readonly detail: Record<string, unknown>;
}

let findings: Map<string, Finding>;
let outputDir: string;

/**
 * 取一条 finding，缺失即失败。
 *
 * @remarks
 * 探针可能在中途 `finish(1)` 提前退出，后续步骤就没有记录。缺失必须是红，
 * 不能当成"没跑到"而放过 —— 那正是门禁最该拦的情况。
 */
function finding(step: string): Finding {
  const value = findings.get(step);
  expect(value, `探针未记录 ${step}（可能提前退出）；已有：${[...findings.keys()].join(', ')}`).toBeDefined();
  return value as Finding;
}

/** 断言某条 finding 为真，失败时把该条的完整 detail 打出来。 */
function expectOk(step: string): Finding {
  const value = finding(step);
  expect(value.ok, `${step} 失败：\n${JSON.stringify(value.detail, null, 2)}`).toBe(true);
  return value;
}

test.describe('Electron 43 MV3 扩展可行性（US-904 阶段 A）', () => {
  // 探针要开两次 DevTools、跑两轮四段中继，最后还要等 MV3 service worker 空闲自停（约 30 秒）。
  test.describe.configure({ timeout: 300000 });

  test.beforeAll(async () => {
    // 缺产物必须是红：skip 会让门禁"报绿但什么都没验"。
    expect(
      existsSync(EXTENSION_DIST),
      `找不到扩展构建产物：${EXTENSION_DIST}\n请先执行：pnpm nx build rxdb-devtools-extension`
    ).toBe(true);

    outputDir = mkdtempSync(join(tmpdir(), 'us904-phase-a-'));
    const outputPath = join(outputDir, 'result.json');

    // electron 包的默认导出就是可执行文件的绝对路径（以纯 Node 加载时）。
    const executable = require('electron') as unknown as string;
    assertSandboxUsable(executable);

    const exitCode = await new Promise<number>((resolve, reject) => {
      // launchEnv() 会剥掉 ELECTRON_RUN_AS_NODE：任何 Electron 宿主（VS Code 集成终端最常见）
      // 都会给子进程设这个变量，带着它启动会让二进制退化成纯 Node，连 app 对象都没有。
      const child = spawn(executable, [PROBE, EXTENSION_DIST, outputPath], {
        env: launchEnv(),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const stderr: string[] = [];
      child.stderr.on('data', chunk => stderr.push(String(chunk)));
      child.on('error', reject);
      child.on('exit', code => {
        if (code !== 0 && !existsSync(outputPath)) {
          reject(new Error(`探针以 ${code} 退出且未产出结果：\n${stderr.join('')}`));
          return;
        }
        resolve(code ?? -1);
      });
    });

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8')) as Finding[];
    findings = new Map(parsed.map(item => [item.step, item]));
    expect(exitCode, `探针退出码非 0；findings：\n${JSON.stringify(parsed, null, 2)}`).toBe(0);
  });

  test.afterAll(() => {
    if (outputDir) rmSync(outputDir, { force: true, recursive: true });
  });

  test('运行在 Electron 43+ 上', () => {
    const versions = finding('versions').detail as { electron: string; chrome: string };
    expect(Number.parseInt(versions.electron, 10)).toBeGreaterThanOrEqual(43);
  });

  // AC#3 的可容忍差异：Electron 43 没有 chrome.permissions，fixture 改用静态窄 host permission。
  // 故事要求「用到 AC#3 差异时必须同时记录 variance 与『Chrome 生产 manifest 未改动』核对」——
  // 后半句就是这里：探针读到的构建产物必须仍是 optional_host_permissions，说明它没被就地改写。
  test('可容忍差异已记录，且 Chrome 生产 manifest 未被改动', () => {
    const detail = expectOk('AC3.variance').detail as {
      builtManifestBefore: { permissions: string[]; optional_host_permissions: string[]; host_permissions: null };
      fixtureManifestAfter: { host_permissions: string[] };
    };
    expect(detail.builtManifestBefore.permissions).toEqual(['scripting']);
    expect(detail.builtManifestBefore.optional_host_permissions).toEqual(['<all_urls>']);
    expect(detail.builtManifestBefore.host_permissions).toBeNull();
    // fixture 的窄权限只能覆盖自身 origin：出现 <all_urls> 就等于把负向用例做废了。
    expect(detail.fixtureManifestAfter.host_permissions).toEqual(['http://127.0.0.1/*']);
  });

  test('AC#1 loadExtension 返回有效 MV3 扩展，service worker 启动', () => {
    const detail = expectOk('AC1').detail as {
      extension: { id: string; manifestVersion: number };
      serviceWorkers: { scriptUrl: string; scope: string }[];
    };
    expect(detail.extension.manifestVersion).toBe(3);
    expect(detail.extension.id).toMatch(/^[a-p]{32}$/);
    expect(detail.serviceWorkers.length).toBeGreaterThan(0);
    expect(detail.serviceWorkers[0].scriptUrl).toContain('service-worker');
  });

  test('AC#2 RxDB panel 真实出现并完成一次完整往返', () => {
    const detail = expectOk('AC2').detail as {
      tabs: string[];
      tabIds: string[];
      tabsBeforeActivation: string[];
      panelRegisteredBeforeSelection: boolean;
      tabSelection: { selected: string | null; presses: number; visited: string[] };
      panelHtmlFrameLoaded: boolean;
      panelPortReceived: { type: string }[];
      inspectedPage: { seen: string[] };
      devtoolsPageState: Record<string, unknown>;
      devToolsConsole: { level: string; message: string }[];
    };
    // 断言「选中的是 RxDB」而不是「tab 条里原本有 RxDB」：面板可能还没 `panels.create` 登记，
    // 也可能因 tab 条放不下被收进溢出下拉、从 DOM 里消失（那个下拉在 Electron 下是原生菜单，
    // 脚本点不到）。这两种都不影响「下一个面板」快捷键循环 —— 它遍历完整 tab 数组。
    // 选中项只能从 `.main-tabbed-pane` 那条 tab 条上读（探针的 `MAIN_TABS`）：DevTools 里有三条
    // class 同构的 tab 条，抽屉那条在 DOM 里排在主条**之前**，按 DOM 序取会恒读成抽屉的当前项。
    //
    // 失败信息带上「登记过没有」、devtools_page 的状态与 DevTools 前端 console，把两种相反的成因分开：
    // 没登记 = 扩展的 devtools_page 没跑到 `panels.create`（`readyState: loading` + `scripts: []`
    // + console 里的 `renderer.bundle.js script failed to run` 就是 `--no-sandbox` 那个坑）；
    // 登记了却没选中 = 循环或选中机制的问题。主进程 stderr 对前者一个字都不会说，所以必须带上 console。
    expect(
      detail.tabSelection.selected,
      [
        `途经面板：${detail.tabSelection.visited.join(' | ')}`,
        `激活前已登记：${detail.panelRegisteredBeforeSelection}`,
        `主 tab 条：${detail.tabIds.join(' | ')}`,
        `devtools.html 状态：${JSON.stringify(detail.devtoolsPageState)}`,
        `DevTools console：${detail.devToolsConsole.map(entry => `[${entry.level}] ${entry.message}`).join(' / ') || '（空）'}`
      ].join('\n')
    ).toMatch(/rxdb/i);
    // 选中后它必然回到可见 tab 条 —— 守住「面板真挂上了 tab 条」，而不是只在内存里注册过。
    expect(detail.tabs, `DevTools tab 条：${detail.tabs.join(' | ')}`).toContain('RxDB');
    expect(detail.panelHtmlFrameLoaded).toBe(true);
    // 四段中继逐段留痕：background 注入的 bridge 发 PING → 页面回 HANDSHAKE →
    // service worker 回 HANDSHAKE_ACK（走私有 MessagePort）→ 面板 port 收到 HANDSHAKE。
    expect(detail.inspectedPage.seen).toEqual(expect.arrayContaining(['PING', 'HANDSHAKE', 'port:HANDSHAKE_ACK']));
    expect(detail.panelPortReceived.map(message => message.type)).toContain('HANDSHAKE');
  });

  test('AC#3 chrome.scripting 注入落在已授权 origin', () => {
    const detail = expectOk('AC3.injectAuthorized').detail as { page: { seen: string[] } };
    // 注入真的发生过：PING 是 background 注入的 bridge 脚本发出的，页面自己不会凭空产生它。
    expect(detail.page.seen).toContain('PING');
  });

  test('AC#3 注入不越出窄 host permission', () => {
    const detail = expectOk('AC3.injectForeignOriginRejected').detail as {
      foreignOrigin: string;
      page: { seen: string[]; ports: number };
    };
    expect(detail.foreignOrigin).toContain('localhost'); // 与授权的 127.0.0.1 是不同主机名
    expect(detail.page.seen).toEqual([]);
    expect(detail.page.ports).toBe(0);
  });

  test('AC#4 刷新 inspected page 后旧连接不残留，重新 INIT 可恢复', () => {
    const detail = expectOk('AC4a.reloadInspectedPage').detail as {
      immediatelyAfterReload: { seen: string[]; ports: number };
      afterReInit: { seen: string[] };
    };
    expect(detail.immediatelyAfterReload.seen).toEqual([]);
    expect(detail.immediatelyAfterReload.ports).toBe(0);
    expect(detail.afterReInit.seen).toContain('port:HANDSHAKE_ACK');
  });

  test('AC#4 关闭 DevTools 后重开，新 Port 完成往返且无旧连接顶替', () => {
    const detail = expectOk('AC4b.devtoolsCloseReopen').detail as {
      afterClose: { devToolsOpened: boolean; contents: { type: string }[] };
      freshPanelPortReceived: { type: string }[];
      pageAfterReopen: { seen: string[] };
    };
    expect(detail.afterClose.devToolsOpened).toBe(false);
    expect(detail.afterClose.contents.map(item => item.type)).not.toContain('remote');
    expect(detail.freshPanelPortReceived.map(message => message.type)).toContain('HANDSHAKE');
    expect(detail.pageAfterReopen.seen).toContain('port:HANDSHAKE_ACK');
  });

  test('AC#4 销毁窗口后 webContents 清空，service worker 空闲自停', () => {
    const detail = expectOk('AC4c.teardown').detail as {
      remainingContents: unknown[];
      serviceWorkersRightAfterDestroy: string[];
      serviceWorkersAfterIdle: string[];
    };
    expect(detail.remainingContents).toEqual([]);
    // 销毁窗口的瞬间 worker 还在（MV3 的 worker 不随页面走），空闲约 30 秒后才自停。
    // 两个时刻都断言，才能区分「清理生效」与「本来就没起来」。
    expect(detail.serviceWorkersRightAfterDestroy.length).toBeGreaterThan(0);
    expect(detail.serviceWorkersAfterIdle).toEqual([]);
  });

  // 不是 AC，但是阶段 D 必须知道的事实：Electron 43 整个 chrome.permissions 命名空间缺失，
  // 面板的 InspectedPageAccessService 会抛 TypeError。阶段 D 要做显式能力探测，
  // 不能写静默 fallback（AGENTS.md：无 fallback 兜底）。这条固化现状，Electron 补上后它会变红，
  // 那正是提醒去掉阶段 D 的能力探测分支的时机。
  test('已记录 chrome.permissions 在 Electron 43 缺失', () => {
    const detail = finding('finding.chromePermissionsMissing').detail as {
      panelCapabilities: {
        permissions: string;
        permissionsContains: string;
        permissionsRequest: string;
        runtimeConnect: string;
        panelsCreate: string;
        inspectedWindowEval: string;
      } | null;
    };
    // 面板 frame 起不来时探针记的是 `null`（见 devtools-mv3-probe.mjs 的 `activation.frame ? … : null`）。
    // 不先拦住的话下面每一条都是同一个 `Cannot read properties of null`，读起来像「能力探测挂了」，
    // 而真正发生的是**根本没采到快照**——两回事，报错必须说的是后者。
    const caps = detail.panelCapabilities;
    if (caps === null) throw new Error('面板 frame 未激活，探针没采到能力快照（panelCapabilities 记的是 null）');

    expect(caps.permissions).toBe('undefined');
    expect(caps.permissionsContains).toBe('undefined');
    expect(caps.permissionsRequest).toBe('undefined');
    // 同一份能力快照里，被测能力本身必须齐全，否则上面三条只是"扩展没加载"的假象。
    expect(caps.runtimeConnect).toBe('function');
    expect(caps.panelsCreate).toBe('function');
    expect(caps.inspectedWindowEval).toBe('function');
  });
});
