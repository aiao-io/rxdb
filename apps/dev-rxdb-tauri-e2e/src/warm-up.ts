/**
 * 桌面 smoke 的全局预热：把「本机第一次拉起打包产物」的一次性成本付在断言之外。
 *
 * @remarks
 * # 为什么需要预热
 *
 * Windows CI 上，总有一次启动恰好是这台 VM 上第一次执行刚构建出来的 exe、第一次创建
 * WebView2 的 profile —— 那一次 renderer 起步可以超过 60s 看门狗。真实观测：三 OS 矩阵
 * 每轮 Windows 首跑，三份 spec 里**最早**拉起产物的那条用例稳定超时 62-64s，而其余每次
 * 启动只要 1-3s —— victim 与具体是哪条用例无关（12:24Z 那轮超时的是
 * `desktop-persistence.spec.ts`，后两轮是 `desktop-file-storage.spec.ts`），只与
 * 「最早」有关。被测试的不是代码路径，是这台 VM 的冷启动，所以把它付在断言之外：
 * 预热启动就算撞上看门狗判 `timedOut` 也算完成任务 —— 机器被暖过，后续每次启动都落在
 * 1-3s 的常态区间。
 *
 * # 为什么不断言
 *
 * 预热启动的结论（ok / failed / timedOut）只写日志。它的用途就是吸收那一次性的成本，
 * 断言它等于把成本又请回门禁里。真出问题（报告没落盘、硬超时）会从 {@link runSelfCheck}
 * 抛出去，整套 smoke 就地失败 —— 那正是一台连应用都拉不起来的机器该有的结局，不该被暖掉。
 *
 * # 为什么放在 globalSetup 而不是某条用例的 beforeAll
 *
 * spec 文件是**并行**跑的（vitest 默认），beforeAll 只挡得住它自己那个文件的断言，
 * 挡不住另一个 worker 先一步 spawn。globalSetup 跑在全部 worker 启动之前，唯一保证
 * 「预热启动是最早的那一次」。
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSelfCheck } from './packaged-app';

export default async function warmUpPackagedApp(): Promise<void> {
  // 目录在预热里创建与销毁：不给真实用户数据目录留下任何一次测试写盘的机会。
  const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-warmup-'));
  const dataDir = join(workspace, 'app-data');
  mkdirSync(dataDir);
  try {
    const run = await runSelfCheck({ dataDir, reportPath: join(workspace, 'warmup.json') });
    console.log(`[warm-up] 第一次启动结束：status=${run.report.status}, exitCode=${String(run.exitCode)}`);
    if (run.report.status !== 'ok') {
      console.log(`[warm-up] 结论原因：${run.report.message ?? '(报告里没有原因)'}`);
    }
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
}
