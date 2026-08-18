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

/** 本文件能读懂的报告结构版本，与 `selfcheck.rs` 的 `REPORT_SCHEMA_VERSION` 一致。 */
export const REPORT_SCHEMA_VERSION = 1;

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
 * - `desktop_demo` —— demo 传给 `RxDB` 的 `dbName`（`setup_rxdb_desktop.ts` 的 `DESKTOP_DEMO_DB_NAME`）；
 *   浏览器预览那份另叫 `test_6`，两个后端不同名是 US-207 E9 的要求
 * - `@0_1` —— `RxDB` 给物理库名加的 `RXDB_DB_NAME_SUFFIX`，**已永久冻结**（`packages/rxdb/src/version.ts`）
 * - `.sqlite3` —— 桌面适配器的 `DEFAULT_DATABASE_SUFFIX`
 *
 * 物理文件名刻意**不进报告**：那会绕开 AC#4 划下的边界（物理路径不出协议）。拼错了是本文件
 * 自己的问题，且会直接变红，不会静默通过。
 */
export const DATABASE_FILE = join('rxdb-data', 'desktop_demo@0_1.sqlite3');

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
}

/** release 产物的候选路径（`tauri build --no-bundle` 不进 bundle 目录，就落在 cargo 的 target 下）。 */
function candidates(): string[] {
  const targetDir = resolve(import.meta.dirname, '..', '..', 'dev-rxdb-tauri', 'src-tauri', 'target', 'release');
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
export function resolveExecutable(): string {
  const tried = candidates();
  const found = tried.find(path => existsSync(path));
  if (found) return found;

  throw new Error(
    [
      '找不到 Tauri release 产物。',
      '找过的候选路径：',
      ...tried.map(path => `  - ${path}`),
      '',
      '请先执行：pnpm nx run dev-rxdb-tauri:tauri-package-release',
      '（desktop-smoke target 的 dependsOn 本应替你跑掉这一步。）'
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
export async function launch(overrides: Readonly<Record<string, string>>): Promise<LaunchResult> {
  const executable = resolveExecutable();
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
  const result = await launch({
    [REPORT_PATH_ENV]: options.reportPath,
    [APP_DATA_DIR_ENV]: options.dataDir
  });

  const diagnostics = (): string =>
    [`stdout：${result.stdout || '(空)'}`, `stderr：${result.stderr || '(空)'}`].join('\n');

  return { ...result, report: readReport(options.reportPath, diagnostics) };
}
