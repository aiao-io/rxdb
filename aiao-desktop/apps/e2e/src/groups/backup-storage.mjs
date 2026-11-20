import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect as playwrightExpect } from 'playwright/test';

import { startArtifactServer } from '../fixtures/artifact-server.mjs';
import { PREFERENCES, surgery } from '../harness/database.mjs';
import { diskText, traced } from '../harness/host-calls.mjs';
import { createSession } from '../harness/session.mjs';

const expect = playwrightExpect.configure({ timeout: 20_000 });

function changedManifest(archive, edit) {
  const magic = Buffer.from('AIAO-DESKTOP-BACKUP/1\n');
  const length = archive.readUInt32LE(magic.length);
  const start = magic.length + 4;
  const manifest = JSON.parse(archive.subarray(start, start + length).toString());
  edit(manifest);
  const header = Buffer.from(JSON.stringify(manifest));
  const size = Buffer.alloc(4);
  size.writeUInt32LE(header.length);
  return Buffer.concat([
    magic,
    size,
    header,
    archive.subarray(start + length, archive.length - 32),
    createHash('sha256').update(header).digest()
  ]);
}

export const backupStorage = {
  name: 'backup-storage',
  description: '完整备份、校验拒绝、独立恢复与真实存储检查',
  keys: [
    'backupStorage.exportsCompleteArchive',
    'backupStorage.rejectsDamagedArchive',
    'backupStorage.restoreCancellationKeepsData',
    'backupStorage.restoresFilesIntoNewGeneration',
    'backupStorage.firstAidUsesRealData',
    'backupStorage.healthUsesBrowserEstimate',
    'backupStorage.crossOriginRestoresRecordsAndPreferences',
    'backupStorage.oldTabKeepsDraftAndRejectsWrites',
    'backupStorage.unsavedRestoreAndEraseCancellation',
    'backupStorage.backupControlsAccessible',
    'backupStorage.binaryEmptyAndTrashRoundTrip',
    'backupStorage.exportSerializesOtherTabWrites',
    'backupStorage.restoreKeyboardCancellation',
    'backupStorage.invalidArchiveVariantsKeepData'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('backup-storage');
    await session.openDesktop();
    await helpers.closeAll();
    await helpers.launch('Finder');
    const finder = () => page.locator('.win.front[data-app="finder"]:not(.closing)');
    await finder().locator('[data-place="Desktop"]').click();
    await finder()
      .locator('input[type="file"]')
      .setInputFiles([
        { name: 'backup-test.txt', mimeType: 'text/plain', buffer: Buffer.from('备份保留 🌏\nsecond line') },
        {
          name: 'backup-binary.bin',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from([0, 255, 128, 1, 0, 42])
        },
        { name: 'backup-empty.dat', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) },
        { name: 'backup-trash.txt', mimeType: 'text/plain', buffer: Buffer.from('trash kept') }
      ]);
    await expect(finder().locator('[role="option"][data-name="backup-test.txt"]')).toBeVisible();
    await expect(finder().locator('[role="option"][data-name="backup-trash.txt"]')).toBeVisible();
    await finder().locator('[role="option"][data-name="backup-trash.txt"]').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to Trash', exact: true }).click();
    await expect(finder().locator('[role="option"][data-name="backup-trash.txt"]')).toHaveCount(0);
    await helpers.launch('Notes');
    await helpers.win('notes').locator('[data-new]').click();
    await expect(helpers.win('notes').locator('[data-doc] h1')).toHaveText('New Note');
    await helpers.win('notes').locator('[data-doc]').fill('backup-note-body');
    await surgery(session, async db => {
      await expect
        .poll(
          async () =>
            (
              await db.shell.rows('SELECT COUNT(*) FROM "desktop$note" WHERE "body" LIKE ?', ['%backup-note-body%'])
            )[0][0]
        )
        .toBe(1);
    });
    await helpers.spotlight('dark mode');
    await page.keyboard.press('Enter');
    await surgery(session, async db => {
      await expect
        .poll(
          async () =>
            (await db.shell.rows(`SELECT "value" FROM "${PREFERENCES}" WHERE "key" = 'system:settings'`))[0]?.[0]
        )
        .toContain('dark');
    });
    await helpers.launch('Disk Utility');
    const disk = () => helpers.win('diskutil').last();
    await expect(disk().locator('[data-storage-health]')).toContainText('Origin quota estimate');
    result.healthUsesBrowserEstimate = (await disk().locator('[data-storage-health]').innerText()).includes(
      'Available'
    );
    const writer = await session.openDesktopPage();
    await writer.helpers.closeAll();
    await writer.helpers.launch('Finder');
    await writer.helpers.win('finder').locator('[data-place="Desktop"]').click();
    await page.evaluate(() => {
      const read = FileSystemFileHandle.prototype.getFile;
      FileSystemFileHandle.prototype.getFile = async function (...args) {
        FileSystemFileHandle.prototype.getFile = read;
        window.__backupReading = true;
        await new Promise(resolve => {
          window.__continueBackup = resolve;
        });
        return read.apply(this, args);
      };
    });
    const downloadEvent = page.waitForEvent('download');
    await disk().getByRole('button', { name: 'Export Backup', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__backupReading === true)).toBe(true);
    await writer.helpers
      .win('finder')
      .locator('input[type="file"]')
      .setInputFiles({ name: 'after-snapshot.txt', mimeType: 'text/plain', buffer: Buffer.from('queued write') });
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await navigator.locks.query()).pending.filter(lock => lock.name === 'aiao-desktop-disk').length
        )
      )
      .toBeGreaterThan(0);
    const waitingRows = await surgery(session, db =>
      db.shell.rows('SELECT COUNT(*) FROM "desktop$desktop_file" WHERE "name" = ?', ['after-snapshot.txt'])
    );
    expect(waitingRows[0][0]).toBe(0);
    await page.evaluate(() => window.__continueBackup());
    const download = await downloadEvent;
    await expect(writer.helpers.win('finder').locator('[role="option"][data-name="after-snapshot.txt"]')).toBeVisible();
    await writer.page.close();
    result.exportSerializesOtherTabWrites = true;
    const archive = await readFile(await download.path());
    result.exportsCompleteArchive = archive.subarray(0, 22).toString().startsWith('AIAO-DESKTOP-BACKUP/1\n');
    const choose = async buffer =>
      disk()
        .getByLabel('Choose backup')
        .setInputFiles({ name: 'desktop.aiao-backup', mimeType: 'application/vnd.aiao.desktop-backup', buffer });
    await choose(archive.subarray(0, archive.length - 1));
    await expect(disk().getByRole('alert')).toBeVisible();
    result.rejectsDamagedArchive =
      (await diskText(session, 'backup-test.txt')) === '备份保留 🌏\nsecond line' &&
      (await page.evaluate(() => localStorage.getItem('aiao-desktop:data-location') === null));
    const invalidArchives = [
      changedManifest(archive, manifest => {
        manifest.schema++;
      }),
      changedManifest(archive, manifest => {
        manifest.entries[1].path = ['files', '..', 'outside'];
      }),
      changedManifest(archive, manifest => {
        manifest.entries[2].path = manifest.entries[1].path;
      }),
      changedManifest(archive, manifest => {
        manifest.entries[1].size = 256 * 1024 * 1024 + 1;
      }),
      Buffer.concat([archive, Buffer.from([1])])
    ];
    const damaged = Buffer.from(archive);
    damaged[damaged.length - 33] ^= 1;
    invalidArchives.push(damaged);
    for (const invalid of invalidArchives) {
      await choose(invalid);
      await expect(disk().getByRole('alert')).toBeVisible();
      await expect(disk().locator('[data-restore-confirm]')).toHaveCount(0);
    }
    result.invalidArchiveVariantsKeepData =
      (await diskText(session, 'backup-test.txt')) === '备份保留 🌏\nsecond line' &&
      (await page.evaluate(() => localStorage.getItem('aiao-desktop:data-location') === null));
    await choose(archive);
    await expect(disk().locator('[data-restore-confirm]')).toBeVisible();
    await disk().getByRole('button', { name: 'Cancel Restore' }).focus();
    await page.keyboard.press('Tab');
    await expect(disk().getByRole('button', { name: 'Restore Desktop', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(disk().locator('[data-restore-confirm]')).toHaveCount(0);
    result.restoreKeyboardCancellation = true;
    result.restoreCancellationKeepsData = await page.evaluate(
      () => localStorage.getItem('aiao-desktop:data-location') === null
    );
    await choose(archive);
    await expect(disk().getByRole('button', { name: 'Restore Desktop', exact: true })).toBeEnabled();
    await helpers.launch('TextEdit');
    const draft = helpers.win('textedit').last();
    await draft.locator('[data-te-doc]').fill('main unsaved draft');
    await helpers.launch('Disk Utility');
    await disk().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
    const prompt = page.getByRole('alertdialog', { name: 'Save changes before closing?' });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(draft.locator('[data-te-doc]')).toHaveText('main unsaved draft');
    await helpers.launch('Disk Utility');
    await disk().getByRole('button', { name: 'Erase', exact: true }).click();
    await page.locator('.pop [data-e]').click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    result.unsavedRestoreAndEraseCancellation =
      (await page.evaluate(() => localStorage.getItem('aiao-desktop:data-location') === null)) &&
      (await diskText(session, 'backup-test.txt')) === '备份保留 🌏\nsecond line';
    await page.keyboard.press('Escape');
    await draft.locator('.tl .c').click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Don’t Save', exact: true }).click();
    const old = await session.openDesktopPage();
    await old.helpers.desktopIcon('backup-test.txt').dblclick();
    const oldEditor = old.helpers.win('textedit').last();
    await expect(oldEditor.getByRole('status')).toContainText('Saved');
    await oldEditor.locator('[data-te-doc]').fill('draft in another tab');
    await helpers.launch('Disk Utility');
    const accessibility = await new AxeBuilder({ page }).include('app-backup-panel').analyze();
    result.backupControlsAccessible = accessibility.violations.map(issue => `${issue.id}: ${issue.help}`);
    await disk().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('aiao-desktop:data-location') ?? 'null')?.active ??
              document.querySelector('app-backup-panel [role=alert]')?.textContent ??
              'pending'
          ),
        { timeout: 30_000 }
      )
      .toMatch(/^[a-f0-9]{12}$/);
    await page.waitForLoadState('load');
    await expect(page.locator('#stage')).toBeVisible();
    await helpers.launch('Disk Utility');
    await expect(old.page.locator('[data-data-replaced]')).toBeVisible();
    await oldEditor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(oldEditor.getByRole('alert')).toContainText('another tab');
    result.oldTabKeepsDraftAndRejectsWrites =
      (await oldEditor.locator('[data-te-doc]').innerText()) === 'draft in another tab';
    await old.page.close({ runBeforeUnload: false });
    result.restoresFilesIntoNewGeneration = (await diskText(session, 'backup-test.txt')) === '备份保留 🌏\nsecond line';
    await disk().getByRole('button', { name: 'First Aid', exact: true }).click();
    await expect(page.locator('.pop [data-log]')).toContainText('Check complete.');
    result.firstAidUsesRealData = (await page.locator('.pop [data-log]').innerText()).includes(
      'File references and sizes are consistent.'
    );
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const otherServer = await startArtifactServer({ root: session.distRoot });
    const other = await createSession({
      browser: session.browser,
      origin: otherServer.origin,
      label: 'backup-migration',
      distRoot: session.distRoot
    });
    try {
      await other.openDesktop();
      await other.helpers.closeAll();
      await other.helpers.launch('Disk Utility');
      const target = () => other.helpers.win('diskutil').last();
      await target().getByLabel('Choose backup').setInputFiles({
        name: 'migration.aiao-backup',
        mimeType: 'application/vnd.aiao.desktop-backup',
        buffer: archive
      });
      await expect(target().getByRole('button', { name: 'Restore Desktop', exact: true })).toBeEnabled();
      await target().getByRole('button', { name: 'Restore Desktop', exact: true }).click();
      await expect
        .poll(() =>
          other.page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('aiao-desktop:data-location') ?? 'null')?.active ??
              document.querySelector('app-backup-panel [role=alert]')?.textContent ??
              'pending'
          )
        )
        .toMatch(/^[a-f0-9]{12}$/);
      await other.page.waitForLoadState('load');
      await expect(other.page.locator('html')).toHaveAttribute('data-theme', 'dark');
      const notes = await surgery(other, db =>
        db.shell.rows('SELECT COUNT(*) FROM "desktop$note" WHERE "body" LIKE ?', ['%backup-note-body%'])
      );
      result.crossOriginRestoresRecordsAndPreferences =
        other.origin !== session.origin &&
        notes[0][0] === 1 &&
        (await diskText(other, 'backup-test.txt')) === '备份保留 🌏\nsecond line';
      await other.helpers.launch('Finder');
      const restoredFinder = () => other.page.locator('.win.front[data-app="finder"]:not(.closing)');
      await restoredFinder().locator('[data-place="Desktop"]').click();
      const downloadRestored = async name => {
        await restoredFinder()
          .locator(`[role="option"][data-name=${JSON.stringify(name)}]`)
          .click({ button: 'right' });
        const downloading = other.page.waitForEvent('download');
        await other.page.getByRole('menuitem', { name: 'Download File', exact: true }).click();
        return readFile(await (await downloading).path());
      };
      const binary = await downloadRestored('backup-binary.bin');
      const empty = await downloadRestored('backup-empty.dat');
      await other.page.locator('#dock .di[data-app="trash"]').click();
      await expect(restoredFinder().locator('[data-title]')).toHaveText('Trash');
      await restoredFinder().locator('[role="option"][data-name="backup-trash.txt"]').click({ button: 'right' });
      await other.page.getByRole('menuitem', { name: 'Put Back', exact: true }).click();
      await expect(restoredFinder().locator('[role="option"][data-name="backup-trash.txt"]')).toHaveCount(0);
      await restoredFinder().locator('[data-place="Desktop"]').click();
      await expect(restoredFinder().locator('[role="option"][data-name="backup-trash.txt"]')).toBeVisible();
      const restoredTrash = await downloadRestored('backup-trash.txt');
      result.binaryEmptyAndTrashRoundTrip =
        binary.equals(Buffer.from([0, 255, 128, 1, 0, 42])) &&
        empty.length === 0 &&
        restoredTrash.toString() === 'trash kept';
      await expect(restoredFinder().locator('[role="option"][data-name="after-snapshot.txt"]')).toHaveCount(0);
      expect(other.errors).toEqual([]);
    } finally {
      await other.close();
      otherServer.close();
    }
    return { backupStorage: result };
  }
};
