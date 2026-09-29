import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_DATA_DIR_ENV,
  BACKUP_ARCHIVE_ENV,
  BACKUP_PROBE_ENV,
  CONFIG_EXIT_CODE,
  DATABASE_FILE,
  REPORT_PATH_ENV,
  launch,
  runSelfCheck,
  type SelfCheckRun
} from './packaged-app';

/**
 * US-217 AC#18 / AC#20：打包产物上的数据库备份与恢复（Tauri SQLite host）。
 *
 * @remarks
 * 一轮走完故事里的整条路径：在源数据位置启动并备份 → 进程退出 → **删掉源数据目录** → 在另一个数据位置以
 * restore 模式启动、恢复、连接 → 再以普通模式重启一次。快照经 renderer / host 的公共契约与流传输出来；
 * 归档由 Rust 侧的自检命令逐块追加进 {@link BACKUP_ARCHIVE_ENV} 指定的文件，落在应用数据目录之外。
 *
 * Tauri 窗口里没有 CDP，测试进程摸不到 renderer——探针的结论随自检报告落盘（`report.backup`），
 * 与 Electron 那份 `backup-restore.spec.ts` 经 `page.evaluate` 读探针的路线不同，判据相同。
 *
 * 判据是跨进程累计启动次数：源库备份时有 1 条启动记录；恢复后启动写第 2 条；再普通重启写第 3 条。
 * 计数只可能从归档里接上——恢复前源目录已经删了，目标目录是新建的空目录。
 *
 * 三平台判定由 `release-desktop.yml` 在各自 runner 上跑 desktop-smoke 关闭，本机只证明本平台。
 * 跨 OS 组合（AC#20）分两段：tauri-smoke 设 {@link EXPORT_DIR_ENV}，把本平台的归档留作 artifact；
 * backup-cross-os 设 {@link IMPORT_DIR_ENV}，在本平台的打包产物上恢复其他每个平台的归档。
 */

/** 归档的范围声明（AC#14）：只含数据库，外置文件须另行备份。 */
const DATABASE_ONLY = { database: 'included', externalFiles: 'excluded' };

/** 设了它，备份用例把归档另存一份到这个目录，供其他平台恢复；与 Electron 那份 spec 同名同义。 */
const EXPORT_DIR_ENV = 'RXDB_BACKUP_EXPORT_DIR';

/** 设了它，跨 OS 用例从这个目录读其他平台的归档；不设就整组跳过。 */
const IMPORT_DIR_ENV = 'RXDB_BACKUP_IMPORT_DIR';

/** 支持矩阵承诺的跨 OS 组合：任一平台产出的归档都能在其余平台恢复。 */
const CROSS_OS_PLATFORMS: readonly NodeJS.Platform[] = ['linux', 'darwin', 'win32'];

/** 跨平台交换时的归档文件名：产出平台加后端，与 Electron 的两份归档放进同一个目录也不冲突。 */
const archiveName = (platform: NodeJS.Platform): string => `${platform}-sqlite-tauri.rxdb-backup`;

/** 把失败报告里的原因带进断言消息。 */
const because = (run: SelfCheckRun): string => run.report.message ?? '(报告里没有原因)';

/**
 * 在空的 `target` 上以 restore 模式启动、恢复一份只记过 1 次启动的归档，再以普通模式重启一次。
 *
 * @remarks
 * 恢复后启动写第 2 条记录，普通重启写第 3 条：计数只可能从归档里接上。报告写在 `workspace` 下。
 */
const restoreAndRelaunch = async (workspace: string, target: string, archivePath: string): Promise<void> => {
  const restore = await runSelfCheck({
    dataDir: target,
    reportPath: join(workspace, 'selfcheck-restore.json'),
    backupProbe: { mode: 'restore', archivePath }
  });
  expect(restore.report.status, because(restore)).toBe('ok');
  expect(restore.exitCode).toBe(0);
  expect(restore.report.backup).toEqual({
    mode: 'restore',
    byteLength: statSync(archivePath).size,
    scope: DATABASE_ONLY,
    manifestScope: DATABASE_ONLY
  });
  expect(restore.report.launchCount).toBe(2);
  expect(realpathSync(restore.report.appDataDir)).toBe(realpathSync(target));
  expect(existsSync(join(target, DATABASE_FILE)), `恢复后的库不在 ${DATABASE_FILE}`).toBe(true);

  // 普通模式重启：恢复出来的库照常读写（计数 3），报告里不再有备份探针。
  const normal = await runSelfCheck({ dataDir: target, reportPath: join(workspace, 'selfcheck-normal.json') });
  expect(normal.report.status, because(normal)).toBe('ok');
  expect(normal.report.launchCount).toBe(3);
  expect(normal.report.backup).toBeNull();
};

/** 把归档另存进 {@link EXPORT_DIR_ENV}（设了的话），文件名带上本平台。 */
const exportArchive = (archivePath: string): void => {
  const directory = process.env[EXPORT_DIR_ENV];
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  copyFileSync(archivePath, join(directory, archiveName(process.platform)));
};

describe('打包产物的数据库备份与恢复（US-217 AC#18）', () => {
  it('备份 → 退出 → 删除源目录 → 在新位置恢复并启动', async () => {
    // 目录全在用例内部创建：重试会重启 worker，放在外面计数就取决于重试次数。
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-backup-'));
    const source = join(workspace, 'source-data');
    const target = join(workspace, 'target-data');
    const archivePath = join(workspace, 'desktop_demo.rxdb-backup');
    mkdirSync(source);
    mkdirSync(target);

    try {
      // 1. 源位置：照常连接（启动计数 1），再经流逐块备份进归档文件。
      const backup = await runSelfCheck({
        dataDir: source,
        reportPath: join(workspace, 'selfcheck-backup.json'),
        backupProbe: { mode: 'backup', archivePath }
      });
      expect(backup.report.status, because(backup)).toBe('ok');
      expect(backup.exitCode).toBe(0);
      expect(backup.report.launchCount).toBe(1);
      expect(backup.report.backup).toMatchObject({
        mode: 'backup',
        scope: DATABASE_ONLY,
        manifestScope: DATABASE_ONLY
      });
      // renderer 数出来的字节数与落盘的文件大小一致：每一块都真的追加进去了，没有半路丢块。
      expect(backup.report.backup?.byteLength).toBeGreaterThan(0);
      expect(statSync(archivePath).size).toBe(backup.report.backup?.byteLength);

      exportArchive(archivePath);

      // 2. 进程已退出。源库确实存在过，然后连同整个数据目录一起删掉：归档不得依赖它。
      expect(existsSync(join(source, DATABASE_FILE)), `源库不在 ${DATABASE_FILE}`).toBe(true);
      rmSync(source, { force: true, recursive: true });

      // 3. 新位置：restore 模式下连接等恢复完成（计数 2）；4. 普通模式重启（计数 3）。
      await restoreAndRelaunch(workspace, target, archivePath);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  // 探针是追加写：归档已存在时照跑，就会把第二份归档接在第一份后面，恢复读到的是一份损坏的归档。
  // Rust 侧在建窗之前拒绝，这条用例钉住「这个 Err 真的变成了配置错误码」。
  it('备份归档已存在时，在建窗之前就以配置错误码退出', async () => {
    const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-backup-misconfig-'));
    const dataDir = join(workspace, 'app-data');
    const reportPath = join(workspace, 'never-written.json');
    const archivePath = join(workspace, 'existing.rxdb-backup');
    mkdirSync(dataDir);
    writeFileSync(archivePath, 'stale');

    try {
      const result = await launch({
        [REPORT_PATH_ENV]: reportPath,
        [APP_DATA_DIR_ENV]: dataDir,
        [BACKUP_PROBE_ENV]: 'backup',
        [BACKUP_ARCHIVE_ENV]: archivePath
      });

      expect(result.exitCode, `stderr：${result.stderr || '(空)'}`).toBe(CONFIG_EXIT_CODE);
      expect(result.stderr).toContain(BACKUP_ARCHIVE_ENV);
      // 报告没落盘、旧归档一字未动：配置错误发生在 renderer 之前，探针没来得及追加任何一块。
      expect(existsSync(reportPath), '配置错误时不该留下任何报告').toBe(false);
      expect(readFileSync(archivePath, 'utf8')).toBe('stale');
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});

describe('跨 OS 恢复其他平台的归档（US-217 AC#20）', () => {
  const importDir = process.env[IMPORT_DIR_ENV];

  describe.skipIf(!importDir)(
    `由 ${IMPORT_DIR_ENV} 指定其他平台的归档目录（release-desktop.yml 的 backup-cross-os）`,
    () => {
      for (const platform of CROSS_OS_PLATFORMS.filter(candidate => candidate !== process.platform)) {
        it(`恢复 ${platform} 产出的归档并启动`, async () => {
          // 矩阵里承诺的每个组合都必须有归档：缺一份是接线断了，不能静默少验一格。
          const archivePath = join(importDir as string, archiveName(platform));
          expect(existsSync(archivePath), `缺少 ${platform} 产出的归档：${archivePath}`).toBe(true);

          const workspace = mkdtempSync(join(realpathSync(tmpdir()), 'rxdb-tauri-cross-os-'));
          const target = join(workspace, 'target-data');
          mkdirSync(target);
          try {
            await restoreAndRelaunch(workspace, target, archivePath);
          } finally {
            rmSync(workspace, { force: true, recursive: true });
          }
        });
      }
    }
  );
});
