/**
 * 拉起 Tauri 打包产物的自检模式，并把那份报告读回来（US-210 AC#1 / AC#9）。
 *
 * @remarks
 * Tauri 的窗口里没有 CDP，也没有可用的 WebDriver 端点（`tauri-driver` 在 macOS 上不存在），
 * 所以这套 e2e 完全走**进程级**通道：环境变量进去，退出码 + 一份 JSON 报告出来。
 * 报告由 Rust 侧写，见 `apps/dev-rxdb-tauri/src-tauri/src/selfcheck.rs`。
 *
 * @module packaged-app
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { platform, env as processEnv } from 'node:process';

/**
 * 报告路径的环境变量名，与 `selfcheck.rs` 的 `REPORT_PATH_ENV` 一致。
 *
 * @remarks
 * 写死而不 import：本文件跑在打包产物之外的纯 Node 进程里，两端本来就没有共享模块。
 * 名字漂了不会静默放行 —— Rust 侧读不到这个变量就是「没开自检」，进程于是永不退出，
 * 撞上 {@link SELFCHECK_TIMEOUT_MS} 硬超时并把 stdout/stderr 一起抛出来。
 */
export const REPORT_PATH_ENV = 'DEV_RXDB_TAURI_SELFCHECK_REPORT';

/** 应用数据根目录覆盖的环境变量名，与 `selfcheck.rs` 的 `APP_DATA_DIR_ENV` 一致。 */
export const APP_DATA_DIR_ENV = 'DEV_RXDB_TAURI_APP_DATA_DIR';

/**
 * webview 能力探针的服务根地址，与 `selfcheck.rs` 的 `PROBE_BASE_URL_ENV` 一致；**可选**。
 *
 * @remarks
 * 它不参与上面两个变量的成对铁律：不设就只是不跑 webview 探针。但反过来不成立 ——
 * 没开自检却设了它是配置错误（退出码 3），因为那意味着有人以为探针会跑而它不会。
 */
export const PROBE_BASE_URL_ENV = 'DEV_RXDB_TAURI_PROBE_BASE_URL';

/**
 * DevTools 握手探针的开关，与 `selfcheck.rs` 的 `DEVTOOLS_PROBE_ENV` 一致；**可选**。
 *
 * @remarks
 * 与 {@link PROBE_BASE_URL_ENV} 同规则：不设就是不跑那条探针，但没开自检却设了它是配置错误
 * （退出码 3）。只有 `devtools-window-transport.spec.ts` 会设它——release 产物里没有调试窗口，
 * 开了只会让每次 smoke 白等一个预算。
 */
export const DEVTOOLS_PROBE_ENV = 'DEV_RXDB_TAURI_DEVTOOLS_PROBE';

/** 本文件能读懂的报告结构版本，与 `selfcheck.rs` 的 `REPORT_SCHEMA_VERSION` 一致。 */
export const REPORT_SCHEMA_VERSION = 4;

/**
 * 自检环境变量配错时的退出码，与 `selfcheck.rs` 的 `CONFIG_EXIT_CODE` 一致。
 *
 * @remarks
 * 与 0（ok）/ 1（failed）/ 2（看门狗超时）分开，是为了让「测试根本没跑起来」与
 * 「测试跑了并且失败了」在 CI 日志里长得不一样。
 */
export const CONFIG_EXIT_CODE = 3;

/**
 * 库文件在应用数据根目录下的相对位置。
 *
 * @remarks
 * 由三段拼成，少一段就指到一个不存在的路径上：
 * - `rxdb-data/` —— Rust 宿主 `session.rs` 建库用的子目录名
 * - `desktop_demo` —— demo 传给 `RxDB` 的 `dbName`（`src/app/db-names.ts` 的 `DESKTOP_DEMO_DB_NAME`）；
 *   浏览器预览那份另叫 `test_6`，两个后端不同名是 US-207 E9 的要求
 * - `@0_1` —— `RxDB` 给物理库名加的 `RXDB_DB_NAME_SUFFIX`，**已永久冻结**（`packages/rxdb/src/version.ts`）
 * - `.sqlite3` —— 桌面适配器的 `DEFAULT_DATABASE_SUFFIX`
 *
 * 物理文件名刻意**不进报告**：那会绕开 AC#4 划下的边界（物理路径不出协议）。拼错了是本文件
 * 自己的问题，且会直接变红，不会静默通过。
 */
export const DATABASE_FILE = join('rxdb-data', 'desktop_demo@0_1.sqlite3');

/**
 * 文件内容在应用数据根目录下的子目录名（US-505）。
 *
 * @remarks
 * 只到这一层为止，**不再往下拼**：`rootDir`（`files/`）与物理文件名的编码方式都是
 * storage 插件的内部约定，写进用例就等于把实现细节钉进断言，改一次编码就红一次。
 * 用例的做法是从这里往下**递归收集普通文件**，再拿 sha256 与报告里的
 * {@link StorageProbe.digest} 对 —— 那才是「内容真的落在原生文件上」这条 AC 的判据。
 */
export const FILE_STORAGE_DIR = 'rxdb-files';

/**
 * 单次自检的硬超时。
 *
 * @remarks
 * 必须**大于** Rust 侧看门狗的 60s：这样 renderer 挂死时，先到期的是看门狗 ——
 * 拿到的是一份写着 `timedOut` 的报告加退出码 2，而不是这里一句「进程没退出」。
 * 反过来的话，两种完全不同的故障（前端挂了 / 进程压根没起来）会长得一模一样。
 */
export const SELFCHECK_TIMEOUT_MS = 90_000;

/** 自检结论，与 `selfcheck.rs` 的 `SelfCheckStatus` 一致。 */
export type SelfCheckStatus = 'ok' | 'failed' | 'timedOut';

/**
 * 文件存储探针的结果，与 `selfcheck.rs` 的 `StorageProbe` 一致。
 *
 * @remarks
 * 同样**不带物理路径**（AC#4：物理路径不出协议）。磁盘上那份文件由用例自己去
 * {@link FILE_STORAGE_DIR} 底下递归找，再拿 sha256 与 {@link digest} 对。
 */
export interface StorageProbe {
  /** 读回内容的 sha256，小写十六进制。 */
  readonly digest: string;
  /** 读回内容的字节数。 */
  readonly byteLength: number;
  /** 本次启动**之前**探针文件是否已存在。 */
  readonly existedBefore: boolean;
}

/**
 * webview 能力探针的结果，与 `selfcheck.rs` 的 `WebviewProbe` 一致（US-505 AC#6）。
 *
 * @remarks
 * 这些事实**只有真实 webview 能给**：Rust 侧看不到 `window`，一致性套件里的 Node 进程更
 * 看不到。三家引擎（WebView2 / WKWebView / WebKitGTK）在这几项上并不必然一致，所以它们
 * 不是「顺手记一笔」，而是这条 AC 的全部证据。
 */
export interface WebviewProbe {
  /** 从 UA 认出的引擎族：`chromium` / `webkit` / `gecko` / `unknown`。 */
  readonly engine: string;
  /** renderer 的 `location.origin`。 */
  readonly origin: string;
  /** `navigator.onLine`。 */
  readonly online: boolean;
  /** `window.showSaveFilePicker` 是否存在 —— `download()` 走哪条分支的唯一判据。 */
  readonly saveFilePicker: boolean;
  /** `<a download>` 是否被实现。 */
  readonly anchorDownload: boolean;
  /** `URL.createObjectURL` 是否交出一个 `blob:` URL。 */
  readonly objectUrl: boolean;
  /** 同源 `fetch()` 缓存进原生文件后读回内容的 sha256。 */
  readonly sameOriginDigest: string;
  /** 同上，字节数。 */
  readonly sameOriginByteLength: number;
  /** 跨源（服务端**带** ACAO）的判别结果：成功是 `'ok'`，否则是错误的 `name`。 */
  readonly crossOriginAllowed: string;
  /** 跨源（服务端**不带** ACAO）的同一判据。 */
  readonly crossOriginDenied: string;
}

/**
 * DevTools 双 WebView 探针的结果，与 `selfcheck.rs` 的 `DevToolsProbe` 一致（US-905 阶段 1）。
 *
 * @remarks
 * 这些事实**只有主 WebView 能给**：Rust 侧的中继按设计不解释 payload，看得见「有两个窗口」
 * 却看不见「它们握上手了」。收到 `HANDSHAKE_ACK` 一次性证明调试窗口真的建起来了、
 * 加载的是共享面板、协商到了 v2、且帧走完了真实 Rust 中继。
 */
export interface DevToolsProbe {
  /** 调试窗口发过来的 v2 帧类型，按首次出现排序、已去重。 */
  readonly panelFrameTypes: string[];
  /**
   * 每一轮握手读到的 session id，按发生顺序；没握上手时为空数组。
   *
   * @remarks
   * AC#4 的判据要看**轮换**：只报最后一个的话，「同 label 重开换了新身份」与「一直复用同一个」
   * 在报告里长得完全一样，而后者正是要抓的缺陷。
   */
  readonly sessionIds: string[];
  /** 是否在预算内看到了 `HANDSHAKE_ACK`。 */
  readonly handshakeCompleted: boolean;
}

/** Rust 侧落盘的报告。 */
export interface SelfCheckReport {
  /** 结构版本；读别的字段之前先比它。 */
  readonly schemaVersion: number;
  /** 结论本身。 */
  readonly status: SelfCheckStatus;
  /** 本次启动读回的累计启动次数；只有 `ok` 时非 null。 */
  readonly launchCount: number | null;
  /** 失败原因；只有失败方向非 null。 */
  readonly message: string | null;
  /** 文件存储探针的结果；只有 `ok` 时非 null（US-505 AC#1 / AC#3）。 */
  readonly storage: StorageProbe | null;
  /** webview 能力探针的结果；没设 {@link PROBE_BASE_URL_ENV} 时为 null（US-505 AC#6）。 */
  readonly webview: WebviewProbe | null;
  /** DevTools 握手探针的结果；没设 {@link DEVTOOLS_PROBE_ENV} 时为 null（US-905 阶段 1）。 */
  readonly devtools: DevToolsProbe | null;
  /**
   * 结算时刻实际存在的窗口 label，已排序。
   *
   * @remarks
   * 由 Rust 侧枚举而不是 renderer 上报：AC#1 要的是「dev 只创建一个 `rxdb-devtools` 窗口」
   * 「release 没有这个入口」，窗口建没建起来只有主进程说了算。
   */
  readonly windowLabels: string[];
  /** host **实际**建库所依据的根目录。 */
  readonly appDataDir: string;
  /** `tauri.conf.json` 的 `identifier`。 */
  readonly identifier: string;
}

/** 一次进程启动的全部可观察结果（报告之外的部分）。 */
export interface LaunchResult {
  /** 进程退出码：0=ok，1=failed，2=看门狗超时，3=环境变量配错。 */
  readonly exitCode: number | null;
  /** 进程写到 stdout 的全部内容。 */
  readonly stdout: string;
  /** 进程写到 stderr 的全部内容；配置错误的原因写在这里。 */
  readonly stderr: string;
}

/** 一次自检运行的全部可观察结果。 */
export interface SelfCheckRun extends LaunchResult {
  /** 报告内容。 */
  readonly report: SelfCheckReport;
}

/** {@link runSelfCheck} 的入参。 */
export interface SelfCheckOptions {
  /** 传给 {@link APP_DATA_DIR_ENV} 的绝对路径，目录必须已存在。 */
  readonly dataDir: string;
  /** 传给 {@link REPORT_PATH_ENV} 的绝对路径；**每次启动都要换一个**，理由见用例注释。 */
  readonly reportPath: string;
  /**
   * 传给 {@link PROBE_BASE_URL_ENV} 的服务根地址（末尾不带 `/`）；不给就不跑 webview 探针。
   *
   * @remarks
   * 只有 `desktop-webview-capability.spec.ts` 会给。别的用例不给不是「懒得给」——
   * 探针会往文件存储里再写三份缓存，而 `desktop-file-storage.spec.ts` 断言的是
   * 「存储根下恰好一个普通文件」，给了就直接红。
   */
  readonly probeBaseUrl?: string;
  /**
   * 开启 DevTools 握手探针（US-905 阶段 1 AC#2）。
   *
   * @remarks
   * 只有 `devtools-window-transport.spec.ts` 会给：它要的是 dev 产物里那个调试窗口。
   * release 产物上开它只会白等一个预算——那边压根没有调试窗口。
   */
  readonly devtoolsProbe?: boolean;
  /** 用哪个剖面的产物；默认 `release`。 */
  readonly profile?: CargoProfile;
}

/**
 * cargo 的构建剖面。
 *
 * @remarks
 * 两份产物**能力不同**，不是同一个东西的快慢两版：
 * - `release` 由 `tauri build --ci --no-bundle` 出，带 `custom-protocol` feature，
 *   于是 `cfg(dev)` 不成立——调试窗口、`devtools_message` 命令与 `open_devtools_window`
 *   全部不在产物里。这正是 US-905 AC#1 的 release 隔离判据。
 * - `debug` 由裸 `cargo build` 出，不带该 feature，`cfg(dev)` 成立，调试窗口在。
 *   它按 `tauri.conf.json` 的 `devUrl` 取前端，所以跑之前必须有人在 1420 上服务前端产物。
 */
export type CargoProfile = 'release' | 'debug';

/** 某个剖面下产物的候选路径（`--no-bundle` 不进 bundle 目录，就落在 cargo 的 target 下）。 */
function candidates(profile: CargoProfile): string[] {
  const targetDir = resolve(import.meta.dirname, '..', '..', 'dev-rxdb-tauri', 'src-tauri', 'target', profile);
  // 二进制名取自 Cargo.toml 的 `[package] name`（无显式 `[[bin]]`），与 productName 恰好同名。
  return [join(targetDir, `dev-rxdb-tauri${platform === 'win32' ? '.exe' : ''}`)];
}

/**
 * 解析已打包应用的可执行文件路径。
 *
 * @returns 存在的可执行文件绝对路径
 * @throws 产物不存在时抛出，并把找过的候选路径与补救命令一并列出 ——
 *   这是本套件最常见的失败原因（忘了先打包，或打包被中断）。
 */
export function resolveExecutable(profile: CargoProfile = 'release'): string {
  const tried = candidates(profile);
  const found = tried.find(path => existsSync(path));
  if (found) return found;

  const target = profile === 'release' ? 'tauri-package-release' : 'tauri-package-dev';
  const suite = profile === 'release' ? 'desktop-smoke' : 'devtools-smoke';
  throw new Error(
    [
      `找不到 Tauri ${profile} 产物。`,
      '找过的候选路径：',
      ...tried.map(path => `  - ${path}`),
      '',
      `请先执行：pnpm nx run dev-rxdb-tauri:${target}`,
      `（${suite} target 的 dependsOn 本应替你跑掉这一步。）`
    ].join('\n')
  );
}

/** 读回并校验报告；缺字段一律当读失败，不给默认值。 */
function readReport(reportPath: string, diagnostics: () => string): SelfCheckReport {
  if (!existsSync(reportPath)) throw new Error(`自检报告没有落盘：${reportPath}\n${diagnostics()}`);

  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as SelfCheckReport;
  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new Error(
      `自检报告的结构版本是 ${report.schemaVersion}，本套件只认识 ${REPORT_SCHEMA_VERSION}；` +
        '两端有一侧改了字段而另一侧没跟上。'
    );
  }
  return report;
}

/**
 * 用给定的环境变量增量跑一次打包产物，等它自己退出。
 *
 * @param overrides - 叠加到当前进程环境上的变量
 * @returns 退出码与两股输出
 * @throws 硬超时时 `SIGKILL` 并抛出，诊断里带上已收到的 stdout/stderr
 *
 * @remarks
 * 进程正常情况下**会自己退出** —— 自检模式下 renderer 一上报，Rust 侧就 `app.exit(code)`；
 * 配置有问题时则在建窗之前 `exit(3)`。所以这里等的是 `close` 而不是 `exit`：
 * 前者保证 stdout/stderr 已经收完，而失败时这两股输出往往是唯一的线索。
 */
export async function launch(
  overrides: Readonly<Record<string, string>>,
  profile: CargoProfile = 'release'
): Promise<LaunchResult> {
  const executable = resolveExecutable(profile);
  const child = spawn(executable, [], {
    stdio: 'pipe',
    cwd: dirname(executable),
    env: { ...processEnv, ...overrides }
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => (stdout += chunk));
  child.stderr.on('data', chunk => (stderr += chunk));

  const exitCode = await new Promise<number | null>((settle, fail) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(
        new Error(
          [
            `自检进程在 ${SELFCHECK_TIMEOUT_MS}ms 内没有退出。`,
            `可执行文件：${executable}`,
            `stdout：${stdout || '(空)'}`,
            `stderr：${stderr || '(空)'}`
          ].join('\n')
        )
      );
    }, SELFCHECK_TIMEOUT_MS);
    child.on('error', error => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      settle(code);
    });
  });

  return { exitCode, stdout, stderr };
}

/**
 * 用自检模式跑一次打包产物，把退出码、两股输出与报告一起读回来。
 *
 * @param options - 数据目录与报告路径
 * @returns 退出码、输出与报告
 * @throws 硬超时、或报告没落盘 / 结构版本对不上时抛出，并带上 stdout/stderr 当诊断
 */
export async function runSelfCheck(options: SelfCheckOptions): Promise<SelfCheckRun> {
  // 可选变量用展开而不是赋一个空串：Rust 侧判的是「变量存不存在」，空串会被当成设了一个
  // 不合法的地址，于是进程以退出码 3 死在建窗之前 —— 而调用方的本意是「不跑探针」。
  const result = await launch(
    {
      [REPORT_PATH_ENV]: options.reportPath,
      [APP_DATA_DIR_ENV]: options.dataDir,
      ...(options.probeBaseUrl === undefined ? {} : { [PROBE_BASE_URL_ENV]: options.probeBaseUrl }),
      // 同上：Rust 侧判的是「变量存不存在」，给空串会被当成设了一个不合法的值。
      ...(options.devtoolsProbe === true ? { [DEVTOOLS_PROBE_ENV]: '1' } : {})
    },
    options.profile ?? 'release'
  );

  const diagnostics = (): string =>
    [`stdout：${result.stdout || '(空)'}`, `stderr：${result.stderr || '(空)'}`].join('\n');

  return { ...result, report: readReport(options.reportPath, diagnostics) };
}
