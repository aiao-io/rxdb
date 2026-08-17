import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_DATA_DIR_ENV,
  CONFIG_EXIT_CODE,
  DATABASE_FILE,
  REPORT_PATH_ENV,
  launch,
  runSelfCheck,
  type SelfCheckRun
} from './packaged-app';

/**
 * US-210 AC#1 / AC#9：数据在应用重启后仍然存在，且落在应用数据目录里的一个真实文件中。
 *
 * @remarks
 * 只有真实打包产物验得到这件事。一致性套件里 host 与被测代码同在一个 Node 进程、`tauri dev`
 * 下库文件落在开发目录 —— 两者都验不到「进程整个退出、重新拉起，数据还在」，而 US-210 的
 * 全部意义正是把存储从 WebView 的 OPFS 挪到宿主持有的真实文件里。
 *
 * 断言形态刻意选了**跨进程累计启动次数**而不是「写一条读一条」：后者在单次启动内就能通过，
 * 哪怕数据只活在内存里、哪怕每次启动都是一个全新空库，也一样绿。US-207 正是靠 1→2 这条
 * 断言抓到「库目录名与 Chromium 的 `databases` 撞车 → 每次启动被清空 → 应用照常显示已连接」
 * 这种静默丢数据。数字必须**跨进程**从 1 变成 2，内存实现与空库都无从伪装。
 */

/** 一次自检的报告文件路径；每次启动都换一个名字，理由见下面用例里的注释。 */
const reportPath = (workspace: string, launch: number): string => join(workspace, `selfcheck-${launch}.json`);

/** 把失败报告里的原因带进断言消息 —— 否则只看到「'failed' !== 'ok'」，根因一个字都没有。 */
const because = (run: SelfCheckRun): string => run.report.message ?? '(报告里没有原因)';

describe('打包产物的桌面 SQLite 持久化', () => {
  it('重启后累计启动次数递增，库文件落在被指定的应用数据目录内', async () => {
    // 目录在**用例内部**创建而不是 beforeAll：重试会重启 worker，放在外面则「这次跑的是第几次
    // 启动」取决于重试次数，1→2 这条断言随之失去意义。与 Electron 侧那条注释同源。
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-persist-'));
    const dataDir = join(workspace, 'app-data');
    mkdirSync(dataDir);

    try {
      const first = await runSelfCheck({ dataDir, reportPath: reportPath(workspace, 1) });
      expect(first.report.status, because(first)).toBe('ok');
      expect(first.exitCode).toBe(0);
      expect(first.report.launchCount).toBe(1);

      // 这条断言是整套用例里最容易被忽略、也最要紧的一条：它证明 `DEV_RXDB_TAURI_APP_DATA_DIR`
      // 真的接到了建库的那只手上，而不只是「被读到过」。少了它，一个「读了变量却仍用系统默认
      // 目录」的接线错误会全程绿灯 —— 计数照样 1→2，只不过写进了**真实的**用户数据目录，
      // 于是同一台机器上重复跑第二遍就会从 3 开始。
      //
      // 两侧都 realpath：macOS 的 `/var → /private/var` 是这条断言最经典的假红。
      expect(realpathSync(first.report.appDataDir), `${APP_DATA_DIR_ENV} 没有接到 host 上`).toBe(
        realpathSync(dataDir)
      );

      // 计数对了但文件不在，说明数据写去了别处（或者压根没落盘）—— AC#1 的「可备份、可迁移的
      // 真实文件」就没兑现。
      expect(existsSync(join(dataDir, DATABASE_FILE)), `库文件不在 ${dataDir} 下`).toBe(true);

      // 报告文件名每次不同。复用同一路径的话，第二次启动若崩在写报告之前，读到的会是第一次
      // 那份 `launchCount: 1` —— 然后你会去调试一个并不存在的持久化 bug。
      const second = await runSelfCheck({ dataDir, reportPath: reportPath(workspace, 2) });
      expect(second.report.status, because(second)).toBe('ok');
      expect(second.exitCode).toBe(0);
      expect(second.report.launchCount).toBe(2);
      expect(realpathSync(second.report.appDataDir)).toBe(realpathSync(dataDir));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  // 上面那条用例的全部说服力，都建立在「配错了会立刻死」之上：自检的两个环境变量若有一个
  // 被静默忽略，应用会带着系统默认的应用数据目录照常跑完，计数照样 1→2 —— 只不过写进了
  // **真实的**用户数据目录。Rust 侧的单测覆盖了 `plan_from_env` 的每条规则，但覆盖不到
  // 「这个 Err 真的变成了进程退出码，且发生在建窗之前」。这条用例补的就是那一段。
  it('只设了一半的自检变量时，在建窗之前就以配置错误码退出', async () => {
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-misconfig-'));
    const reportPath = join(workspace, 'never-written.json');

    try {
      // 只给报告路径，不给数据目录 —— 变量名打错一个字母时最常见的形态。
      // （父进程本就不该带着 APP_DATA_DIR_ENV；真带了的话这条断言会红着停下并打印 stderr，
      // 而不是悄悄变成另一个含义。）
      const result = await launch({ [REPORT_PATH_ENV]: reportPath });

      expect(result.exitCode, `stderr：${result.stderr || '(空)'}`).toBe(CONFIG_EXIT_CODE);
      expect(result.stderr).toContain(APP_DATA_DIR_ENV);

      // 报告没落盘，是「压根没走到 renderer」的证据：走到了的话，失败方向也会写一份报告出来。
      expect(existsSync(reportPath), '配置错误时不该留下任何报告').toBe(false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});
