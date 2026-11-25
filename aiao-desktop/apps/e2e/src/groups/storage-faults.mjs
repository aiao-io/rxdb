import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect as playwrightExpect } from 'playwright/test';

import { scriptsOf } from '../fixtures/sqlite-shell.mjs';
import { PREFERENCES, surgery } from '../harness/database.mjs';
import { diskText, traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 20_000 });
const payload = name => ({ name, mimeType: 'text/plain', buffer: Buffer.from(`content:${name}`) });
const FILES = 'desktop$desktop_file';
const select = 'aiao-desktop:data-location';
const pending = 'aiao-desktop:restore-pending';

async function interruptWrite(page, at) {
  await page.evaluate(at => {
    const open = FileSystemFileHandle.prototype.createWritable;
    let writes = 0;
    FileSystemFileHandle.prototype.createWritable = function (...args) {
      if (++writes !== at) return open.apply(this, args);
      window.__writePaused = true;
      return new Promise(() => undefined);
    };
  }, at);
}

async function desktopRoots(page) {
  return page.evaluate(async () =>
    (await Array.fromAsync((await navigator.storage.getDirectory()).keys())).filter(name =>
      name.startsWith('aiao-desktop')
    )
  );
}

function restoreWorker(distRoot) {
  for (const { source } of scriptsOf(distRoot)) {
    const match =
      /new Worker\(new URL\([`"'](worker-[\w-]+\.js)[`"'][^)]*\),\{[^}]*name:[`"']aiao-desktop-restore[`"'][^}]*\}\)/.exec(
        source
      );
    if (match) return match[1];
  }
  throw new Error('No restore Worker in the production build.');
}

export const storageFaults = {
  name: 'storage-faults',
  description: '导入复制、恢复和抹除的真实中断、配额与 Worker 故障恢复',
  keys: [
    'storageFaults.importInterruptionRollsBackBatch',
    'storageFaults.duplicateInterruptionKeepsSource',
    'storageFaults.quotaFailureRetriesWithoutLosingData',
    'storageFaults.restoreFailureKeepsCurrentGeneration',
    'storageFaults.workerFailureCanRetry',
    'storageFaults.restoreInterruptionCleansTemporaryTarget',
    'storageFaults.opfsUnavailableIsVisible',
    'storageFaults.firstAidRepairsOrphansAndPreservesReferences',
    'storageFaults.firstAidRejectsDamagedReferences',
    'storageFaults.eraseDialogsAccessible',
    'storageFaults.volumeEraseResumesAndKeepsAppData',
    'storageFaults.fullEraseRecoversDamagedSelectionAndInterruption'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('storage-faults');
    const finder = () => page.locator('.win.front[data-app="finder"]:not(.closing)');
    const item = name => finder().locator(`[role="option"][data-name=${JSON.stringify(name)}]`);
    const desktop = async () => {
      await helpers.launch('Finder');
      await finder().locator('[data-place="Desktop"]').click();
    };
    const importFiles = async names => {
      await finder().locator('input[type="file"]').setInputFiles(names.map(payload));
      await expect(item(names.at(-1))).toBeVisible();
    };
    const reopen = async () => {
      await page.goto('about:blank');
      await page.goto(`${session.origin}/?boot=0`, { waitUntil: 'load' });
      await helpers.restored();
      await helpers.closeAll();
      await desktop();
    };
    const count = name =>
      surgery(session, db =>
        db.shell.rows(`SELECT COUNT(*) FROM "${FILES}" WHERE "name" = ?`, [name]).then(rows => rows[0][0])
      );
    const batchRecord = () =>
      surgery(session, db =>
        db.shell
          .rows(`SELECT COUNT(*) FROM "${PREFERENCES}" WHERE "key" = 'disk:pending-batch'`)
          .then(rows => rows[0][0])
      );
    await session.openDesktop();
    await helpers.closeAll();
    await desktop();
    await importFiles(['keep.txt', 'orphan-meta.txt']);
    await interruptWrite(page, 2);
    await finder().locator('input[type="file"]').setInputFiles(['partial-one.txt', 'partial-two.txt'].map(payload));
    await expect.poll(() => page.evaluate(() => window.__writePaused === true)).toBe(true);
    expect(await count('partial-one.txt')).toBe(1);
    expect(await batchRecord()).toBe(1);
    await reopen();
    result.importInterruptionRollsBackBatch =
      (await count('partial-one.txt')) === 0 &&
      (await batchRecord()) === 0 &&
      (await diskText(session, 'keep.txt')) === 'content:keep.txt';

    await finder().locator('[data-more]').click();
    await page.getByRole('menuitem', { name: /New Folder/ }).click();
    await item('untitled folder').dblclick();
    await importFiles(['child-one.txt', 'child-two.txt']);
    await desktop();
    await interruptWrite(page, 2);
    await item('untitled folder').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__writePaused === true)).toBe(true);
    expect(await count('untitled folder copy')).toBe(1);
    await reopen();
    result.duplicateInterruptionKeepsSource =
      (await count('untitled folder copy')) === 0 &&
      (await count('child-one.txt')) === 1 &&
      (await count('child-two.txt')) === 1 &&
      (await batchRecord()) === 0;

    await page.evaluate(() => {
      const open = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = function () {
        FileSystemFileHandle.prototype.createWritable = open;
        return Promise.reject(new DOMException('Injected quota exhaustion', 'QuotaExceededError'));
      };
    });
    await finder()
      .locator('input[type="file"]')
      .setInputFiles([payload('quota.txt')]);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /quota|space/i })
        .last()
    ).toBeVisible();
    expect(await count('quota.txt')).toBe(0);
    await importFiles(['quota.txt']);
    result.quotaFailureRetriesWithoutLosingData =
      (await diskText(session, 'quota.txt')) === 'content:quota.txt' &&
      (await diskText(session, 'keep.txt')) === 'content:keep.txt';

    await helpers.launch('Disk Utility');
    const disk = () => helpers.win('diskutil').last();
    const downloadEvent = page.waitForEvent('download');
    await disk().getByRole('button', { name: 'Export Backup', exact: true }).click();
    const archive = await readFile(await (await downloadEvent).path());
    const choose = async () => {
      await helpers.launch('Disk Utility');
      await disk()
        .getByLabel('Choose backup')
        .setInputFiles({ name: 'test.aiao-backup', mimeType: 'application/vnd.aiao.desktop-backup', buffer: archive });
      await expect(disk().getByRole('button', { name: 'Restore Desktop', exact: true })).toBeEnabled();
    };
    const workerUrl = `${session.origin}/${restoreWorker(session.distRoot)}`;
    const injectWorker = async prefix => {
      const handler = async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${prefix}\n${await response.text()}` });
      };
      await session.context.route(workerUrl, handler);
      return () => session.context.unroute(workerUrl, handler);
    };
    const stopQuota = await injectWorker(
      `FileSystemFileHandle.prototype.createWritable = function () { return Promise.reject(new DOMException('Injected restore quota exhaustion', 'QuotaExceededError')); };`
    );
    await choose();
    await disk().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
    await expect(disk().getByRole('alert')).toContainText(/quota|space/i);
    result.restoreFailureKeepsCurrentGeneration =
      (await page.evaluate(key => localStorage.getItem(key), select)) === null &&
      (await diskText(session, 'keep.txt')) === 'content:keep.txt' &&
      (await page.evaluate(key => localStorage.getItem(key), pending)) === null;
    await stopQuota();
    const stopCrash = await injectWorker(
      `if (self.name === 'aiao-desktop-restore') self.addEventListener('message', event => { event.stopImmediatePropagation(); throw new Error('Injected restore Worker crash'); }, { once: true });`
    );
    await disk().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
    await expect(disk().getByRole('alert')).toContainText('Injected restore Worker crash');
    result.workerFailureCanRetry =
      (await page.evaluate(key => localStorage.getItem(key), select)) === null &&
      (await page.evaluate(key => localStorage.getItem(key), pending)) === null;
    await stopCrash();
    const stopHang = await injectWorker(
      `FileSystemFileHandle.prototype.createWritable = function () { self.__bodyWritePaused = true; return new Promise(() => undefined); };`
    );
    const workerEvent = page.waitForEvent('worker', worker => worker.url() === workerUrl);
    await disk().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
    const restoring = await workerEvent;
    await expect.poll(() => restoring.evaluate(() => self.__bodyWritePaused === true)).toBe(true);
    const interrupted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).generation, pending);
    await page.goto('about:blank');
    await stopHang();
    await page.goto(`${session.origin}/?boot=0`, { waitUntil: 'load' });
    await helpers.restored();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pending)).toBeNull();
    const remaining = await page.evaluate(async generation => {
      const root = await navigator.storage.getDirectory();
      return (await Array.fromAsync(root.keys())).filter(name => name.includes(generation));
    }, interrupted);
    result.restoreInterruptionCleansTemporaryTarget =
      remaining.length === 0 && (await diskText(session, 'keep.txt')) === 'content:keep.txt';
    await choose();
    await disk().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
    /* Restore 触发整页导航：poll 的 evaluate 落在导航窗口里会抛「Execution context destroyed」，
       expect.poll 取值抛错不重试——catch 转 null 让它继续轮询到导航结束。 */
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), select).catch(() => null)).not.toBeNull();
    await page.waitForLoadState('load');
    await helpers.restored();
    result.workerFailureCanRetry &&= (await diskText(session, 'keep.txt')) === 'content:keep.txt';

    await page.evaluate(() => {
      window.__storageGetDirectory = navigator.storage.getDirectory.bind(navigator.storage);
      navigator.storage.getDirectory = async () => {
        throw new DOMException('Injected OPFS unavailable', 'NotAllowedError');
      };
    });
    await helpers.launch('Disk Utility');
    await disk().getByRole('button', { name: 'Refresh Storage Status', exact: true }).click();
    await expect(disk().getByRole('alert')).toContainText('Injected OPFS unavailable');
    await expect(disk().locator('[data-storage-health]')).toContainText('Unavailable');
    result.opfsUnavailableIsVisible = true;
    await page.evaluate(() => {
      navigator.storage.getDirectory = window.__storageGetDirectory;
    });

    await surgery(session, db => db.shell.execute(`DELETE FROM "${FILES}" WHERE "name" = 'orphan-meta.txt'`));
    await page.evaluate(async () => {
      const active = JSON.parse(localStorage.getItem('aiao-desktop:data-location')).active;
      const root = await navigator.storage.getDirectory();
      const files = await root.getDirectoryHandle(`aiao-desktop-files-${active}`);
      const blobs = await files.getDirectoryHandle('blobs');
      const file = await blobs.getFileHandle('orphan.raw', { create: true });
      const stream = await file.createWritable();
      await stream.write('orphan');
      await stream.close();
    });
    await disk().getByRole('button', { name: 'First Aid', exact: true }).click();
    /* First Aid 是两步式：先点 Run 才开始检查（macOS 语义）。 */
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText(/[1-9]\d* unreferenced file bodies\./);
    const aidAxe = await new AxeBuilder({ page }).include('app-first-aid-panel').analyze();
    await page.getByRole('button', { name: 'Repair Orphan Files', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText('0 unreferenced file bodies.');
    result.firstAidRepairsOrphansAndPreservesReferences = (await diskText(session, 'keep.txt')) === 'content:keep.txt';
    const bodyPath = await surgery(
      session,
      async db =>
        (
          await db.shell.rows(
            `SELECT m."opfs_path" FROM "storage$storage_file_meta" m JOIN "${FILES}" f ON f."content_id" = m."id" WHERE f."name" = 'keep.txt'`
          )
        )[0][0]
    );
    await page.evaluate(async path => {
      const active = JSON.parse(localStorage.getItem('aiao-desktop:data-location')).active;
      let directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(`aiao-desktop-files-${active}`);
      const segments = path.split('/');
      for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
      const handle = await directory.getFileHandle(segments.at(-1));
      window.__missingBody = { directory, name: segments.at(-1), bytes: await (await handle.getFile()).arrayBuffer() };
      await directory.removeEntry(segments.at(-1));
      const orphan = await directory.getFileHandle('another-orphan', { create: true });
      const stream = await orphan.createWritable();
      await stream.write('do not remove while references are broken');
      await stream.close();
    }, bodyPath);
    await page.getByRole('button', { name: 'Check Again', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText('Errors found.');
    await expect(page.locator('.pop [data-log]')).toContainText('Storage body is missing');
    await page.getByRole('button', { name: 'Repair Orphan Files', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText('Repair stopped');
    result.firstAidRejectsDamagedReferences = await page.evaluate(async () => {
      const { directory, name, bytes } = window.__missingBody;
      await directory.getFileHandle('another-orphan');
      const handle = await directory.getFileHandle(name, { create: true });
      const stream = await handle.createWritable();
      await stream.write(bytes);
      await stream.close();
      return true;
    });
    await page.getByRole('button', { name: 'Check Again', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText('Check complete.');
    await page.getByRole('button', { name: 'Repair Orphan Files', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText('0 unreferenced file bodies.');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await disk().getByRole('button', { name: 'Erase', exact: true }).click();
    const eraseAxe = await new AxeBuilder({ page }).include('app-erase-panel').analyze();
    result.eraseDialogsAccessible = [...aidAxe.violations, ...eraseAxe.violations].map(issue => issue.id);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await helpers.launch('Notes');
    await helpers.win('notes').locator('[data-new]').click();
    await expect(helpers.win('notes').locator('[data-doc] h1')).toHaveText('New Note');
    await helpers.win('notes').locator('[data-doc]').fill('Keep this note across volume erase');
    await surgery(session, async db => {
      await expect
        .poll(
          async () =>
            (
              await db.shell.rows('SELECT COUNT(*) FROM "desktop$note" WHERE "body" LIKE ?', [
                '%Keep this note across volume erase%'
              ])
            )[0][0]
        )
        .toBe(1);
    });
    await helpers.launch('Disk Utility');
    const notesBefore = await surgery(session, db => db.count('desktop$note'));
    await page.evaluate(() => {
      const remove = FileSystemDirectoryHandle.prototype.removeEntry;
      FileSystemDirectoryHandle.prototype.removeEntry = async function (...args) {
        await remove.apply(this, args);
        window.__erasePaused = true;
        return new Promise(() => undefined);
      };
    });
    await disk().getByRole('button', { name: 'Erase', exact: true }).click();
    await page.locator('.pop [data-e]').click();
    await expect.poll(() => page.evaluate(() => window.__erasePaused === true)).toBe(true);
    await reopen();
    result.volumeEraseResumesAndKeepsAppData =
      (await count('keep.txt')) === 0 && (await surgery(session, db => db.count('desktop$note'))) === notesBefore;

    const oldRoots = await desktopRoots(page);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      await root.getDirectoryHandle('unrelated-game', { create: true });
      localStorage.setItem('game:test', 'keep');
      localStorage.setItem('aiao-desktop:data-location', 'damaged');
    });
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('[data-data-problem]')).toBeVisible();
    await page.locator('[data-dp-ask-erase]').click();
    await expect(page.locator('[data-dp-confirm]')).toContainText('Games');
    await page.locator('[data-dp-cancel]').click();
    expect(await page.evaluate(key => localStorage.getItem(key), select)).toBe('damaged');
    await page.locator('[data-dp-ask-erase]').click();
    await page.evaluate(() => {
      const remove = FileSystemDirectoryHandle.prototype.removeEntry;
      FileSystemDirectoryHandle.prototype.removeEntry = async function (...args) {
        await remove.apply(this, args);
        window.__erasePaused = true;
        return new Promise(() => undefined);
      };
    });
    await page.locator('[data-dp-erase]').click();
    await expect.poll(() => page.evaluate(() => window.__erasePaused === true)).toBe(true);
    await page.goto('about:blank');
    await session.openDesktop();
    const reset = await page.evaluate(async () => ({
      journal: localStorage.getItem('aiao-desktop:erase-pending'),
      game: localStorage.getItem('game:test'),
      entries: await Array.fromAsync((await navigator.storage.getDirectory()).keys())
    }));
    result.fullEraseRecoversDamagedSelectionAndInterruption =
      reset.journal === null &&
      reset.game === 'keep' &&
      reset.entries.includes('unrelated-game') &&
      oldRoots.every(name => !reset.entries.includes(name));
    return { storageFaults: result };
  }
};
