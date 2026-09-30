import { Page, _electron as electron, expect, test } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchEnv, resolveExecutable } from './packaged-app';

/**
 * US-217 AC#18 / AC#20：打包产物上的数据库备份与恢复。
 *
 * @remarks
 * 一轮走完故事里的整条路径：在源数据位置启动并备份 → 进程退出 → **删掉源数据目录** → 在另一个数据位置以
 * restore 模式启动、恢复、连接 → 再以普通模式重启一次。每一段都只能由真实产物满足：快照经 renderer / host
 * 的公共契约与流传输出来，归档落在应用数据目录之外，恢复之后的库由同一个打包应用照常读写。
 *
 * 驱动经 `DEV_RXDB_BACKUP_PROBE`：main 把它追加为入口 URL 的 `backup-probe`，renderer 的
 * `LocalDatabaseService` 据此在连接前挂出 {@link PROBE_KEY} 探针（`apps/dev-rxdb-electron/src/app/backup-probe.ts`）。
 * restore 模式下连接压到恢复成功之后——恢复的目标必须是尚未连接的空库。
 *
 * 判据是启动计数：源库备份时有 1 条启动记录；恢复后启动写第 2 条；再普通重启写第 3 条。计数只可能从归档里
 * 接上——恢复前源目录已经删了，目标目录是新建的空目录。
 *
 * 三平台判定由 `release-desktop.yml` 的 electron-smoke 在各自 runner 上跑本文件关闭，本机只证明本平台。
 * 跨 OS 组合（AC#20）分两段：electron-smoke 设 {@link EXPORT_DIR_ENV}，把本平台的归档留作 artifact；
 * backup-cross-os 设 {@link IMPORT_DIR_ENV}，在本平台的打包产物上恢复其他每个平台的归档。
 */

/** 设了它，备份用例把归档另存一份到这个目录，供其他平台恢复。 */
const EXPORT_DIR_ENV = 'RXDB_BACKUP_EXPORT_DIR';

/** 设了它，跨 OS 用例从这个目录读其他平台的归档；不设就整组跳过。 */
const IMPORT_DIR_ENV = 'RXDB_BACKUP_IMPORT_DIR';

/** 支持矩阵承诺的跨 OS 组合：任一平台产出的归档都能在其余平台恢复。 */
const CROSS_OS_PLATFORMS: readonly NodeJS.Platform[] = ['linux', 'darwin', 'win32'];

/** 跨平台交换时的归档文件名：产出平台加后端。 */
const archiveName = (platform: NodeJS.Platform, adapter: string): string => `${platform}-${adapter}.rxdb-backup`;

/** 探针键，与 `backup-probe.ts` 的 `BACKUP_PROBE_KEY` 一致；写死的理由同 `packaged-app.ts` 的 `HIDE_WINDOW_ENV`。 */
const PROBE_KEY = '__aiaoRxdbBackupProbe__';

/** 与 `main.utils.ts` 的 `BACKUP_PROBE_ENV` 一致。 */
const PROBE_ENV = 'DEV_RXDB_BACKUP_PROBE';

/** 归档的范围声明（AC#14）：只含数据库，外置文件须另行备份。 */
const DATABASE_ONLY = { database: 'included', externalFiles: 'excluded' };

interface Backend {
  readonly adapter: string;
  readonly env: Readonly<Record<string, string>>;
  /** 库在 userData 下的物理位置：删源目录前确认它真的在，恢复后确认它落在了新位置。 */
  readonly dataPath: string;
}

/** 两个桌面后端；落盘位置的出处见 `desktop-persistence.spec.ts` 与 `desktop-persistence-pglite.spec.ts`。 */
const BACKENDS: readonly Backend[] = [
  { adapter: 'sqlite-electron', env: {}, dataPath: join('rxdb-data', 'desktop_demo@0_1.sqlite3') },
  { adapter: 'pglite-electron', env: { DEV_RXDB_PGLITE: '1' }, dataPath: join('rxdb-pglite', 'desktop_demo_pg') }
];

type ProbeOutcome =
  | { status: 'ok'; archive?: string; byteLength?: number; scope: unknown; manifest: { scope: unknown } }
  | { status: 'failed'; code: string; message: string };

/**
 * 拉起打包产物、跑一段断言、再正常关闭。
 *
 * @param userDataDir - `--user-data-dir`
 * @param env - 追加的环境变量（后端选择、探针模式）
 * @param use - 拿到首窗口后要做的事，返回值原样透出
 * @returns `use` 的返回值
 */
async function withPackagedApp<T>(
  userDataDir: string,
  env: Readonly<Record<string, string>>,
  use: (page: Page) => Promise<T>
): Promise<T> {
  const app = await electron.launch({
    executablePath: resolveExecutable(),
    args: [`--user-data-dir=${userDataDir}`],
    env: { ...launchEnv(), ...env }
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return await use(page);
  } finally {
    // 正常关闭：host 在 'will-quit' 里关库、刷盘；直接 kill 就把「退出进程」验成了崩溃恢复。
    await app.close();
  }
}

/**
 * 等卡片走到已连接，核对后端身份并读回启动次数。
 *
 * @throws 连接失败时带上卡片上的错误文案
 */
async function readLaunchCount(page: Page, adapter: string): Promise<string> {
  const status = page.getByTestId('rxdb-status');
  await expect(status).not.toHaveText(/连接中/, { timeout: 60000 });
  const failure = page.getByTestId('rxdb-error');
  if (await failure.count()) throw new Error(`本地适配器连接失败：${await failure.textContent()}`);
  await expect(status).toHaveText(/已连接/);
  await expect(page.getByTestId('rxdb-backend')).toHaveText(adapter);
  return (await page.getByTestId('rxdb-launch-count').textContent()) ?? '';
}

/** 等探针挂出后调用它的一个方法；探针缺席会在这里超时，而不是报一句 `undefined is not a function`。 */
async function callProbe(page: Page, method: 'backup' | 'restore', archive?: string): Promise<ProbeOutcome> {
  await page.waitForFunction(key => key in globalThis, PROBE_KEY, { timeout: 60000 });
  return page.evaluate(
    ([key, name, payload]) => {
      const probe = (globalThis as unknown as Record<string, Record<string, (arg?: string) => Promise<unknown>>>)[key];
      return probe[name](payload) as Promise<ProbeOutcome>;
    },
    [PROBE_KEY, method, archive] as const
  );
}

/** 探针结果必须是成功；失败时把可判别的错误码带进断言文案。 */
function expectOk(outcome: ProbeOutcome, step: string): asserts outcome is Extract<ProbeOutcome, { status: 'ok' }> {
  expect(outcome.status, `${step} 失败：${JSON.stringify(outcome)}`).toBe('ok');
}

/**
 * 在空的 `target` 上以 restore 模式启动、恢复一份只记过 1 次启动的归档，再以普通模式重启一次。
 *
 * @remarks
 * 恢复后启动写第 2 条记录，普通重启写第 3 条：计数只可能从归档里接上。
 */
async function restoreAndRelaunch(backend: Backend, target: string, archivePath: string): Promise<void> {
  await withPackagedApp(target, { ...backend.env, [PROBE_ENV]: 'restore' }, async page => {
    // 连接闸门没开之前 app initializer 挂着，页面还没渲染——探针是此刻唯一的观察面。
    await page.waitForFunction(key => key in globalThis, PROBE_KEY, { timeout: 60000 });
    expect(
      await page.evaluate(key => (globalThis as unknown as Record<string, { mode: string }>)[key].mode, PROBE_KEY)
    ).toBe('restore');
    const outcome = await callProbe(page, 'restore', readFileSync(archivePath).toString('base64'));
    expectOk(outcome, '恢复');
    expect(outcome.scope).toEqual(DATABASE_ONLY);
    expect(await readLaunchCount(page, backend.adapter)).toBe('2');
  });
  expect(existsSync(join(target, backend.dataPath)), `恢复后的库不在 ${backend.dataPath}`).toBe(true);

  // 普通模式重启：恢复出来的库照常读写（计数 3）。
  await withPackagedApp(target, backend.env, async page => {
    expect(await readLaunchCount(page, backend.adapter)).toBe('3');
  });
}

/** 把归档另存进 {@link EXPORT_DIR_ENV}（设了的话），文件名带上本平台。 */
function exportArchive(archivePath: string, adapter: string): void {
  const directory = process.env[EXPORT_DIR_ENV];
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  copyFileSync(archivePath, join(directory, archiveName(process.platform, adapter)));
}

test.describe('打包产物的数据库备份与恢复（US-217 AC#18）', () => {
  for (const backend of BACKENDS) {
    test(`${backend.adapter}：备份 → 退出 → 删除源目录 → 在新位置恢复并启动`, async () => {
      // 三个目录全在用例内部创建：重试会重启 worker，放在外面计数就取决于重试次数。
      const source = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-backup-src-'));
      const target = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-backup-dst-'));
      const archives = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-backup-archive-'));
      const archivePath = join(archives, `${backend.adapter}.rxdb-backup`);

      try {
        // 1. 源位置：照常连接（启动计数 1），再备份。归档落在 userData 之外。
        await withPackagedApp(source, { ...backend.env, [PROBE_ENV]: 'backup' }, async page => {
          expect(await readLaunchCount(page, backend.adapter)).toBe('1');
          const outcome = await callProbe(page, 'backup');
          expectOk(outcome, '备份');
          expect(outcome.scope).toEqual(DATABASE_ONLY);
          expect(outcome.manifest.scope).toEqual(DATABASE_ONLY);
          expect(outcome.byteLength).toBeGreaterThan(0);
          writeFileSync(archivePath, Buffer.from(outcome.archive ?? '', 'base64'));
        });
        expect(readFileSync(archivePath).byteLength).toBeGreaterThan(0);
        exportArchive(archivePath, backend.adapter);

        // 2. 进程已退出。源数据目录确实存在过，然后连同整个 userData 一起删掉：归档不得依赖它。
        expect(existsSync(join(source, backend.dataPath)), `源库不在 ${backend.dataPath}`).toBe(true);
        rmSync(source, { force: true, recursive: true });

        // 3. 新位置：restore 模式下连接等恢复完成（计数 2）；4. 普通模式重启（计数 3）。
        await restoreAndRelaunch(backend, target, archivePath);
      } finally {
        for (const directory of [source, target, archives]) rmSync(directory, { force: true, recursive: true });
      }
    });
  }
});

test.describe('跨 OS 恢复其他平台的归档（US-217 AC#20）', () => {
  const importDir = process.env[IMPORT_DIR_ENV];
  test.skip(
    !importDir,
    `只在 release-desktop.yml 的 backup-cross-os 里跑：由 ${IMPORT_DIR_ENV} 指定其他平台的归档目录`
  );

  for (const backend of BACKENDS) {
    for (const platform of CROSS_OS_PLATFORMS.filter(candidate => candidate !== process.platform)) {
      test(`${backend.adapter}：恢复 ${platform} 产出的归档并启动`, async () => {
        // 矩阵里承诺的每个组合都必须有归档：缺一份是接线断了，不能静默少验一格。
        const archivePath = join(importDir as string, archiveName(platform, backend.adapter));
        expect(existsSync(archivePath), `缺少 ${platform} 产出的归档：${archivePath}`).toBe(true);

        const target = mkdtempSync(join(tmpdir(), 'dev-rxdb-electron-cross-os-dst-'));
        try {
          await restoreAndRelaunch(backend, target, archivePath);
        } finally {
          rmSync(target, { force: true, recursive: true });
        }
      });
    }
  }
});
