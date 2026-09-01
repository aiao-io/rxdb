import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_DATA_DIR_ENV,
  DATABASE_FILE,
  FILE_STORAGE_DIR,
  runSelfCheck,
  type SelfCheckRun,
  type StorageProbe
} from './packaged-app';
import { collectStoredFiles, sha256OfFile } from './stored-files';

/**
 * US-505 AC#1 / AC#3：文件内容在**打包应用**重启后仍在，且与 SQLite 元数据同属一个备份域。
 *
 * @remarks
 * # 为什么一致性套件不够
 *
 * `packages/rxdb-adapter-tauri/conformance/storage-persistence.spec.ts` 杀的是 **stdio 宿主
 * 进程**：host 与被测代码同在一个 Node 进程里，没有窗口生命周期、没有单实例锁、没有安装包
 * 布局，更没有 webview —— 而 AC#1 要排掉的头号嫌疑正是「内容其实活在 webview 存储里」。
 * 只有装好的产物重新拉起一次，才谈得上验证这件事。
 *
 * # 两条判据缺一不可
 *
 * - `launchCount` 单独看只证明 **SQLite** 活着：它整条链路都在库里，一个把文件内容放在
 *   webview 存储或内存里的实现照样能让它 1→2。
 * - `existedBefore` 单独看只证明**有个地方**记住了文件：webview 存储也记得住。
 *
 * 所以还要第三条：到 `<dataDir>/{@link FILE_STORAGE_DIR}/` 下把普通文件捞出来，用 sha256
 * 与报告里的 digest 对上 —— 内容必须真的躺在**被指定的应用数据目录**下的原生文件里。
 * 三条同时成立，才排得掉全部替身。
 *
 * # AC#3 为什么是「拷贝整棵树再从副本启动」
 *
 * 「同一备份域」这句话的可操作含义就是：用户拿走 `<appDataDir>` 这一棵树，元数据与内容
 * 一起跟走。分开验证两者各自存在证不了这件事 —— 它们可能落在两棵互不相干的树上。一次
 * `cp -r` 之后从副本启动，`launchCount` 继续递增（元数据跟来了）**且** `existedBefore`
 * 仍为 true、digest 不变（内容也跟来了），才是这条 AC 的直接证据。
 */

/** 一次自检的报告文件路径；每次启动都换一个名字，理由见 `desktop-persistence.spec.ts`。 */
const reportPath = (workspace: string, launch: number): string => join(workspace, `selfcheck-${launch}.json`);

/** 把失败报告里的原因带进断言消息 —— 否则只看到「'failed' !== 'ok'」，根因一个字都没有。 */
const because = (run: SelfCheckRun): string => run.report.message ?? '(报告里没有原因)';

/**
 * 取出探针结果。
 *
 * @throws 报告里没有探针结果时抛出，并带上失败原因
 *
 * @remarks
 * 不给默认值：`storage` 为 null 意味着这次启动压根没跑到探针那一步，任何兜底都会把
 * 「探针没跑」伪装成「探针跑了但结果是空的」，而后者的调试路径完全不同。
 */
const probeOf = (run: SelfCheckRun): StorageProbe => {
  const { storage } = run.report;
  if (storage === null) throw new Error(`报告里没有文件存储探针结果：${because(run)}`);
  return storage;
};

/**
 * 找出存储根下那个唯一的内容文件。
 *
 * @param dataDir - 应用数据根目录
 * @returns 该文件的绝对路径
 * @throws 不是恰好一个时抛出，并列出实际找到的全部路径
 *
 * @remarks
 * 「恰好一个」不是凑数的严格：多出来的那个若是 `.{write_id}.rxdb-tmp`，说明写会话结束时
 * 临时文件没被清掉（`rust/src/file/mod.rs` 的原子提交路径漏了一条分支）—— 那是一个真实
 * 缺陷，应该在这里就红，而不是等到某天磁盘被临时文件塞满。
 */
const soleStoredFile = (dataDir: string): string => {
  const found = collectStoredFiles(dataDir);
  if (found.length !== 1) {
    throw new Error(
      [`${FILE_STORAGE_DIR}/ 下应当恰好有 1 个普通文件，实际 ${String(found.length)} 个：`, ...found].join('\n  ')
    );
  }
  return found[0];
};

describe('打包产物的桌面文件存储', () => {
  it('重启后文件内容仍在，且落在被指定的应用数据目录内的原生文件上', async () => {
    // 目录在**用例内部**创建而不是 beforeAll：重试会重启 worker，放在外面则「这次跑的是第几次
    // 启动」取决于重试次数，1→2 这条断言随之失去意义。
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-files-'));
    const dataDir = join(workspace, 'app-data');
    mkdirSync(dataDir);

    try {
      const first = await runSelfCheck({ dataDir, reportPath: reportPath(workspace, 1) });
      expect(first.report.status, because(first)).toBe('ok');
      expect(first.report.launchCount).toBe(1);
      expect(realpathSync(first.report.appDataDir), `${APP_DATA_DIR_ENV} 没有接到 host 上`).toBe(realpathSync(dataDir));

      // 空目录起步，探针这一次必然是「写进去的」；若这里就是 true，说明数据目录覆盖没生效，
      // 探针读到的是上一次真实运行留下的文件。
      const written = probeOf(first);
      expect(written.existedBefore, '首次启动不该已经存在探针文件').toBe(false);

      // 内容真的在磁盘上，且就是报告里那份字节 —— 这条排掉「内容其实在 webview 存储/内存里」。
      const stored = soleStoredFile(dataDir);
      expect(sha256OfFile(stored), `${stored} 的内容与报告里的 digest 对不上`).toBe(written.digest);
      expect(readFileSync(stored).byteLength).toBe(written.byteLength);

      // 报告文件名每次不同，理由见 `desktop-persistence.spec.ts`：复用同一路径时，第二次启动
      // 若崩在写报告之前，读到的会是第一次那份，于是你会去调试一个并不存在的 bug。
      const second = await runSelfCheck({ dataDir, reportPath: reportPath(workspace, 2) });
      expect(second.report.status, because(second)).toBe('ok');
      expect(second.report.launchCount).toBe(2);

      // 第二次**没有写**（existedBefore=true）却仍读得回同样的字节 —— 「重启后内容还在」的
      // 完整判据。少了 existedBefore 这一半，一个每次启动都重写一遍的实现照样全绿。
      const reread = probeOf(second);
      expect(reread.existedBefore, '第二次启动应当读到上一次留下的文件').toBe(true);
      expect(reread.digest).toBe(written.digest);
      expect(reread.byteLength).toBe(written.byteLength);
      expect(soleStoredFile(dataDir), '第二次启动不该再多写一个文件').toBe(stored);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it('整份应用数据目录拷走之后，SQLite 元数据与文件内容一起跟到副本', async () => {
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-backup-'));
    const dataDir = join(workspace, 'app-data');
    const copyDir = join(workspace, 'app-data-copy');
    mkdirSync(dataDir);

    try {
      const origin = await runSelfCheck({ dataDir, reportPath: reportPath(workspace, 1) });
      expect(origin.report.status, because(origin)).toBe('ok');
      expect(origin.report.launchCount).toBe(1);
      const written = probeOf(origin);

      // 拷的是 `<dataDir>` 整棵树 —— US-210 的 `rxdb-data/` 与本故事的 `rxdb-files/` 并列
      // 其中，一次拷贝同时带走两者，这正是「同一备份域」的字面含义。
      // 用 `cpSync` 而不是 shell 的 `cp -r`：三平台同一份代码，且不必再处理引号与路径转义。
      cpSync(dataDir, copyDir, { recursive: true });

      // 先确认两族数据都真的到了副本里，再去看应用从副本启动的行为 —— 否则「副本里其实少了
      // 一族」和「应用没读副本」这两种失败长得一模一样。
      expect(collectStoredFiles(copyDir).length, '副本里没有文件内容').toBe(1);
      expect(sha256OfFile(join(copyDir, DATABASE_FILE)), '副本里的库文件与原件不一致').toBe(
        sha256OfFile(join(dataDir, DATABASE_FILE))
      );

      const restored = await runSelfCheck({ dataDir: copyDir, reportPath: reportPath(workspace, 2) });
      expect(restored.report.status, because(restored)).toBe('ok');
      expect(realpathSync(restored.report.appDataDir), '第二次启动没有真的用副本').toBe(realpathSync(copyDir));

      // 元数据跟过来了：计数从副本里读到的 1 继续涨到 2，而不是从空库的 1 重来。
      expect(restored.report.launchCount, 'SQLite 元数据没有跟到副本').toBe(2);

      // 内容也跟过来了：没有重写（existedBefore=true）却读得回同样的字节。
      const rereadFromCopy = probeOf(restored);
      expect(rereadFromCopy.existedBefore, '文件内容没有跟到副本').toBe(true);
      expect(rereadFromCopy.digest).toBe(written.digest);
      expect(rereadFromCopy.byteLength).toBe(written.byteLength);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});
