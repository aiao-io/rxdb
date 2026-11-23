import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { createApprovedCatalogArtifact } from '../fixtures/approved-catalog.mjs';
import { PREFERENCES, surgery } from '../harness/database.mjs';
import { diskCount, diskText, traced } from '../harness/host-calls.mjs';
import { standinProbe } from '../harness/standin.mjs';

const expect = playwrightExpect.configure({ timeout: 20_000 });
const id = 'catalog:editor';
const name = 'Approved Editor';
const first = {
  id,
  name,
  bundleId: 'io.example.editor',
  version: '1.0.0',
  url: 'https://vscode.aiao.io/releases/1.0.0/editor/',
  summary: 'Controlled release for application lifecycle verification.',
  capabilities: ['window'],
  allow: [],
  readyTimeout: 10000
};
const second = {
  ...first,
  version: '2.0.0',
  url: 'https://vscode.aiao.io/releases/2.0.0/editor/',
  capabilities: ['window', 'appearance']
};
const duplicate = { ...first, id: 'catalog:duplicate', name: 'Duplicate', bundleId: 'io.example.duplicate' };
const invalid = {
  ...first,
  id: 'catalog:invalid',
  name: 'Invalid',
  bundleId: 'io.example.invalid',
  url: 'http://unapproved.example/releases/1.0.0/'
};

export const approvedCatalog = {
  name: 'approved-catalog',
  description: '批准目录、安装更新回退卸载、跨页撤权、离线与中断恢复、键盘和 axe（受控目录夹具）',
  standins: ['aiao-code'],
  keys: [
    'approvedCatalog.productionEmpty',
    'approvedCatalog.invalidEntriesRejected',
    'approvedCatalog.packageConflictKeepsFiles',
    'approvedCatalog.confirmationAndEntrypoints',
    'approvedCatalog.offlineAndReloadKeepInstallation',
    'approvedCatalog.updateAndRollback',
    'approvedCatalog.otherTabRevokesOldInstance',
    'approvedCatalog.draftCancellationKeepsSession',
    'approvedCatalog.dockPinLifecycle',
    'approvedCatalog.uninstallKeepsUserAndRemoteData',
    'approvedCatalog.unapprovedCatalogRejected',
    'approvedCatalog.failedWriteRetries',
    'approvedCatalog.interruptedProjectionRecovers',
    'approvedCatalog.corruptStateResetsExplicitly',
    'approvedCatalog.keyboardAndAxe'
  ],
  async run(session, server) {
    const { page, helpers, context } = session;
    const result = traced('approved-catalog');
    const fixtures = [];
    const store = () => helpers.win('appstore');
    const editor = () => helpers.win(id);
    const card = () => store().locator(`[data-catalog-app="${id}"]`);
    const modal = () => store().locator('.confirmation');
    const showStore = async () => {
      await helpers.launch('App Store');
      await expect(store().getByRole('button', { name: 'Refresh Catalog' })).toBeEnabled();
    };
    const closePrompt = target => target.locator('[data-catalog-close-confirm]');
    const confirm = async (action, closing = []) => {
      await modal().getByRole('button', { name: action, exact: true }).click();
      for (const target of closing)
        await closePrompt(target).getByRole('button', { name: 'Close Window', exact: true }).click();
      await expect(modal()).toHaveCount(0);
    };
    const closeEditor = async () => {
      if (!(await editor().count())) return;
      await editor().locator('.tl .c').click();
      await closePrompt(page).getByRole('button', { name: 'Close Window', exact: true }).click();
      await expect(editor()).toHaveCount(0);
    };
    const startEditor = async () => {
      await card().getByRole('button', { name: 'Open', exact: true }).click();
      await expect(editor().locator('[data-webapp-state="ready"]')).toBeVisible();
      return standinProbe(page).frame();
    };
    const installed = () =>
      surgery(session, async db => {
        const rows = await db.shell.rows(`SELECT value FROM "${PREFERENCES}" WHERE key = 'apps:installed'`);
        return rows.length ? JSON.parse(rows[0][0]).apps : [];
      });
    try {
      await session.openDesktop();
      await helpers.closeAll();
      await showStore();
      await expect(store().getByText('No approved apps available', { exact: true })).toBeVisible();
      expect(await store().getByRole('alert').count()).toBe(0);
      result.productionEmpty = true;

      const v1 = await createApprovedCatalogArtifact({
        source: session.distRoot,
        releases: [first, invalid, duplicate, duplicate]
      });
      fixtures.push(v1);
      const v2 = await createApprovedCatalogArtifact({
        source: session.distRoot,
        releases: [first, second],
        trustedDigests: [v1.sha256]
      });
      fixtures.push(v2);
      server.switchTo(v1.root);
      await session.reloadDesktop();
      await helpers.win('finder').locator('[data-place="Desktop"]').click();
      await helpers
        .win('finder')
        .locator('input[type="file"]')
        .setInputFiles([{ name: 'catalog-user.txt', mimeType: 'text/plain', buffer: Buffer.from('user data stays') }]);
      await expect.poll(() => diskCount(session, 'catalog-user.txt')).toBe(1);
      await showStore();
      await expect(card()).toBeVisible();
      expect(await store().locator('[data-catalog-app]').count()).toBe(1);
      expect(await store().getByRole('alert').count()).toBeGreaterThan(0);
      result.invalidEntriesRejected = true;

      await helpers.launch('Finder');
      const finder = helpers.win('finder');
      await finder.locator('[data-place="Applications"]').click();
      await finder
        .locator('input[type="file"]')
        .setInputFiles([
          { name: `${name}.app`, mimeType: 'text/plain', buffer: Buffer.from('user item, not an application') }
        ]);
      await expect.poll(() => diskCount(session, `${name}.app`)).toBe(1);
      await showStore();
      await card().getByRole('button', { name: 'Install…', exact: true }).click();
      await modal().getByRole('button', { name: 'Install', exact: true }).click();
      await expect(modal().getByRole('alert')).toContainText('already exists');
      expect(await installed()).toEqual([]);
      expect(await diskText(session, `${name}.app`)).toBe('user item, not an application');
      await modal().getByRole('button', { name: 'Cancel', exact: true }).click();
      await helpers.launch('Finder');
      await finder.locator(`[role="option"][data-name="${name}.app"]`).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
      const rename = page.locator('app-file-operation-dialog');
      await rename.getByRole('textbox', { name: 'New name' }).fill('catalog-conflict-kept.txt');
      await rename.getByRole('button', { name: 'Rename', exact: true }).click();
      await expect(rename).toHaveCount(0);
      await showStore();
      result.packageConflictKeepsFiles = true;

      const install = card().getByRole('button', { name: 'Install…', exact: true });
      await install.focus();
      await page.keyboard.press('Enter');
      await expect(modal().getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
      await expect(modal()).toContainText('Manage its own window');
      const confirmAxe = await new AxeBuilder({ page }).include('app-app-store .confirmation').analyze();
      await page.keyboard.press('Shift+Tab');
      await expect(modal().getByRole('button', { name: 'Install', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal()).toHaveCount(0);
      await expect(install).toBeFocused();
      expect(await installed()).toEqual([]);
      await install.click();
      await confirm('Install');
      expect(await installed()).toEqual([{ id, version: '1.0.0', previous: null }]);
      expect(await diskCount(session, `${name}.app`)).toBe(1);
      await helpers.launch('Finder');
      await helpers.win('finder').locator('[data-place="Applications"]').click();
      await expect(helpers.win('finder').locator(`[role="option"][data-name="${name}.app"]`)).toBeVisible();
      await helpers.launch(name);
      await expect(editor().locator('[data-webapp-state="ready"]')).toBeVisible();
      await expect(page.locator(`#dock .di[data-app="${id}"]`)).toBeVisible();
      await showStore();
      await page.locator(`#dock .di[data-app="${id}"]`).click({ button: 'right' });
      await page.locator('#layer-menu [data-act="add-to-dock"]').click();
      await helpers.spotlight(name);
      await expect(page.locator('#spot')).toContainText(name);
      await page.keyboard.press('Escape');
      await showStore();
      result.confirmationAndEntrypoints = true;

      session.expectLoadFailure(`${session.origin}/approved-apps.json`);
      await context.route(`${session.origin}/approved-apps.json`, route => route.abort('internetdisconnected'), {
        times: 1
      });
      await store().getByRole('button', { name: 'Refresh Catalog' }).click();
      await expect(
        store()
          .getByRole('alert')
          .filter({ hasText: /fetch|network|failed/i })
      ).toBeVisible();
      expect((await installed())[0].version).toBe('1.0.0');
      await closeEditor();
      await session.reloadDesktop();
      await expect(page.locator(`#dock .di[data-app="${id}"]`)).toBeVisible();
      await helpers.launch(name);
      await expect(editor().locator('[data-webapp-state="ready"]')).toBeVisible();
      result.offlineAndReloadKeepInstallation = true;

      await closeEditor();
      server.switchTo(v2.root);
      await session.reloadDesktop();
      await showStore();
      await expect(card().getByRole('button', { name: 'Update to 2.0.0…', exact: true })).toBeVisible();
      const oldFrame = await startEditor();
      await oldFrame.evaluate(() => localStorage.setItem('catalog-remote-data', 'keep remote data'));
      const other = await session.openDesktopPage();
      await other.helpers.launch(name);
      await expect(other.helpers.win(id).locator('[data-webapp-state="ready"]')).toBeVisible();
      const otherFrame = await standinProbe(other.page).frame();
      await oldFrame.locator('[data-standin-input]').fill('local draft');
      await otherFrame.locator('[data-standin-input]').fill('other tab draft');
      await showStore();
      await card().getByRole('button', { name: 'Update to 2.0.0…', exact: true }).click();
      await expect(modal()).toContainText('Read desktop appearance');
      await modal().getByRole('button', { name: 'Update', exact: true }).click();
      await expect(closePrompt(page)).toBeVisible();
      await expect(closePrompt(other.page)).toBeVisible();
      const closeAxe = await new AxeBuilder({ page }).include('[data-catalog-close-confirm]').analyze();
      await page.screenshot({ path: '/tmp/aiao-catalog-close-confirm.png' });
      await closePrompt(other.page).getByRole('button', { name: 'Keep Editing', exact: true }).click();
      await expect(modal()).toHaveCount(0);
      await expect(closePrompt(page)).toHaveCount(0);
      expect(oldFrame.isDetached()).toBe(false);
      expect(otherFrame.isDetached()).toBe(false);
      expect(await oldFrame.locator('[data-standin-input]').inputValue()).toBe('local draft');
      expect(await otherFrame.locator('[data-standin-input]').inputValue()).toBe('other tab draft');
      expect((await installed())[0].version).toBe('1.0.0');
      result.draftCancellationKeepsSession = true;
      await showStore();
      await card().getByRole('button', { name: 'Update to 2.0.0…', exact: true }).click();
      await confirm('Update', [page, other.page]);
      await expect(other.helpers.win(id)).toHaveCount(0);
      await expect(editor()).toHaveCount(0);
      expect(oldFrame.isDetached()).toBe(true);
      expect(otherFrame.isDetached()).toBe(true);
      result.otherTabRevokesOldInstance = true;
      await other.page.close();
      const nextFrame = await startEditor();
      expect(await nextFrame.evaluate(() => window.standin.capabilities)).toContain('appearance');
      await showStore();
      await card().getByRole('button', { name: 'Roll Back to 1.0.0…', exact: true }).click();
      await confirm('Roll Back', [page]);
      expect((await installed())[0]).toEqual({ id, version: '1.0.0', previous: '2.0.0' });
      const rolledBack = await startEditor();
      expect(await rolledBack.evaluate(() => window.standin.capabilities)).toEqual(['window']);
      expect(nextFrame.isDetached()).toBe(true);
      result.updateAndRollback = true;
      await showStore();

      await context.route(
        `${session.origin}/approved-apps.json`,
        route => route.fulfill({ contentType: 'application/json', body: '{}' }),
        { times: 1 }
      );
      await store().getByRole('button', { name: 'Refresh Catalog' }).click();
      await expect(store().getByRole('alert')).toContainText('approval');
      expect((await installed())[0].version).toBe('1.0.0');
      result.unapprovedCatalogRejected = true;
      await card().getByRole('button', { name: 'Uninstall…', exact: true }).click();
      await modal().getByRole('button', { name: 'Cancel', exact: true }).click();
      expect((await installed())[0].version).toBe('1.0.0');
      await card().getByRole('button', { name: 'Uninstall…', exact: true }).click();
      await confirm('Uninstall', [page]);
      expect(await installed()).toEqual([]);
      expect(await diskCount(session, `${name}.app`)).toBe(0);
      expect(await diskText(session, 'catalog-user.txt')).toBe('user data stays');
      await expect(page.locator(`#dock .di[data-app="${id}"]`)).toHaveCount(0);
      await context.route('https://vscode.aiao.io/catalog-data-check', route =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage check</title>' })
      );
      const remote = await context.newPage();
      await remote.goto('https://vscode.aiao.io/catalog-data-check');
      expect(await remote.evaluate(() => localStorage.getItem('catalog-remote-data'))).toBe('keep remote data');
      await remote.close();
      result.uninstallKeepsUserAndRemoteData = true;

      await page.evaluate(() => {
        const original = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = function () {
          FileSystemFileHandle.prototype.createWritable = original;
          return Promise.reject(new DOMException('Injected catalog quota exhaustion', 'QuotaExceededError'));
        };
      });
      await card().getByRole('button', { name: 'Install…', exact: true }).click();
      await modal().getByRole('button', { name: 'Install', exact: true }).click();
      await expect(modal().getByRole('alert')).toContainText(/quota/i);
      expect(await installed()).toEqual([]);
      expect(await diskCount(session, `${name}.app`)).toBe(0);
      await confirm('Install');
      expect((await installed())[0].version).toBe('2.0.0');
      result.failedWriteRetries = true;
      await expect(page.locator(`#dock .di[data-app="${id}"]`)).toHaveCount(0);
      const dock = await surgery(session, async db => {
        const rows = await db.shell.rows(`SELECT value FROM "${PREFERENCES}" WHERE key = 'dock:layout'`);
        return JSON.parse(rows[0][0]);
      });
      expect(dock.items.some(item => item.id === id)).toBe(false);
      result.dockPinLifecycle = true;
      await card().getByRole('button', { name: 'Uninstall…', exact: true }).click();
      await confirm('Uninstall');

      await page.evaluate(() => {
        const original = FileSystemFileHandle.prototype.createWritable;
        let writes = 0;
        FileSystemFileHandle.prototype.createWritable = function (...args) {
          if (++writes !== 2) return original.apply(this, args);
          window.__catalogWritePaused = true;
          return new Promise(() => undefined);
        };
      });
      await card().getByRole('button', { name: 'Install…', exact: true }).click();
      await modal().getByRole('button', { name: 'Install', exact: true }).click();
      await page.waitForFunction(() => window.__catalogWritePaused);
      await page.goto('about:blank');
      await session.openDesktop();
      await showStore();
      expect(await installed()).toEqual([]);
      expect(await diskCount(session, `${name}.app`)).toBe(0);
      expect(await diskText(session, 'catalog-user.txt')).toBe('user data stays');
      expect(
        await surgery(session, db =>
          db.shell.rows(`SELECT key FROM "${PREFERENCES}" WHERE key = 'apps:pending-projection'`)
        )
      ).toEqual([]);
      await card().getByRole('button', { name: 'Install…', exact: true }).click();
      await confirm('Install');
      result.interruptedProjectionRecovers = true;

      await surgery(session, db =>
        db.shell.execute(`UPDATE "${PREFERENCES}" SET value = ? WHERE key = 'apps:installed'`, [
          JSON.stringify({
            version: 1,
            apps: [{ id, version: '2.0.0', previous: null, capabilities: ['filesystem:write'] }]
          })
        ])
      );
      await session.reloadDesktop();
      await showStore();
      await expect(
        store().getByRole('alert').filter({ hasText: 'Optional applications need attention' })
      ).toBeVisible();
      await store().getByRole('button', { name: 'Reset Optional Apps…' }).click();
      await modal().getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(modal()).toHaveCount(0);
      await expect(
        store().getByRole('alert').filter({ hasText: 'Optional applications need attention' })
      ).toBeVisible();
      await store().getByRole('button', { name: 'Reset Optional Apps…' }).click();
      await confirm('Reset Optional Apps');
      expect(await installed()).toEqual([]);
      expect(await diskText(session, 'catalog-user.txt')).toBe('user data stays');
      await store().getByRole('button', { name: 'Refresh Catalog' }).click();
      await expect(card().getByRole('button', { name: 'Install…', exact: true })).toBeVisible();
      result.corruptStateResetsExplicitly = true;
      const storeAxe = await new AxeBuilder({ page }).include('app-app-store').analyze();
      result.keyboardAndAxe = [...confirmAxe.violations, ...closeAxe.violations, ...storeAxe.violations].map(
        item => item.id
      );
      await store().screenshot({ path: '/tmp/aiao-approved-catalog-ui.png' });
      return { approvedCatalog: result };
    } catch (error) {
      await page.screenshot({ path: '/tmp/aiao-approved-catalog-failure.png' });
      throw error;
    } finally {
      server.switchTo(session.distRoot);
      for (const fixture of fixtures) await fixture.dispose();
    }
  }
};
