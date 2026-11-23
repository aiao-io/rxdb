import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect as playwrightExpect } from 'playwright/test';

import { isolationHeaders, startArtifactServer } from '../fixtures/artifact-server.mjs';
import { installGitHubOAuth } from '../fixtures/github-oauth.mjs';
import { grantCapabilities } from '../harness/capabilities.mjs';
import { diskCount, diskRow, diskText, filePanel, traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 30_000 });
const APP_ORIGIN = 'https://vscode.aiao.io';
const codeRoot = resolve(import.meta.dirname, '../../../../../apps/aiao-vscode/dist/browser');
const outputRoot = resolve(import.meta.dirname, '../../test-output');
const binary = Buffer.from([0, 255, 128, 1, 42]);

async function diskBytes(session, name, digest = false) {
  const row = await diskRow(session, name);
  if (!row?.blob) throw new Error(`Missing copied file: ${name}`);
  return session.page.evaluate(
    async ({ path, digest }) => {
      const root = await navigator.storage.getDirectory();
      const selected = JSON.parse(localStorage.getItem('aiao-desktop:data-location') ?? 'null');
      const files = await root.getDirectoryHandle(`aiao-desktop-files${selected?.active ? `-${selected.active}` : ''}`);
      const blobs = await files.getDirectoryHandle('blobs');
      const file = await (await blobs.getFileHandle(path.replace(/^blobs\//, ''))).getFile();
      const buffer = await file.arrayBuffer();
      if (digest)
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), value =>
          value.toString(16).padStart(2, '0')
        ).join('');
      return [...new Uint8Array(buffer)];
    },
    { path: row.blob, digest }
  );
}

export const aiaoCodeFiles = {
  name: 'aiao-code-files',
  description: '桌面与 Aiao Code 真实构建：code . 原位编辑、文件/项目复制、权限和嵌入登录边界',
  keys: [
    'aiaoCodeFiles.realBuildAndIsolation',
    'aiaoCodeFiles.folderCopy',
    'aiaoCodeFiles.fileCopiesKeepBytesAndDrafts',
    'aiaoCodeFiles.cancellationAndDuplicate',
    'aiaoCodeFiles.projectArchiveRoundTrip',
    'aiaoCodeFiles.invalidAndOversizeRejected',
    'aiaoCodeFiles.embeddedLoginBoundary',
    'aiaoCodeFiles.standaloneFlowsPreserved',
    'aiaoCodeFiles.closeCancelsPanel',
    'aiaoCodeFiles.terminalFolderRoundTrip',
    'aiaoCodeFiles.terminalRepositoryRoundTrip',
    'aiaoCodeFiles.deniedCapabilitiesVisible'
  ],
  async run(session) {
    const { page, context, helpers } = session;
    const result = traced('aiao-code-files');
    const temporary = await mkdtemp(join(tmpdir(), 'aiao-code-copy-'));
    const projectFolder = join(temporary, 'copied-project');
    const server = await startArtifactServer({
      root: codeRoot,
      headers: {
        ...isolationHeaders,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*'
      }
    });
    let closing = false;
    const pendingRoutes = new Set();
    const routeCode = async route => {
      const pending = (async () => {
        try {
          const url = new URL(route.request().url());
          const response = await route.fetch({ url: `${server.origin}${url.pathname}${url.search}` });
          await route.fulfill({ response });
        } catch (cause) {
          if (closing && /aborted|Target page, context or browser has been closed/.test(String(cause))) return;
          throw cause;
        }
      })();
      pendingRoutes.add(pending);
      try {
        await pending;
      } finally {
        pendingRoutes.delete(pending);
      }
    };
    const isCode = url => url.origin === APP_ORIGIN;
    try {
      await mkdir(outputRoot, { recursive: true });
      const evidence = await mkdtemp(join(outputRoot, 'aiao-code-copy-'));
      console.error(`Aiao Code artifacts: ${evidence}`);
      const index = await readFile(join(codeRoot, 'index.html'));
      await writeFile(
        join(evidence, 'aiao-code-copy-build.json'),
        JSON.stringify(
          {
            root: codeRoot,
            indexSha256: createHash('sha256').update(index).digest('hex'),
            measuredAt: new Date().toISOString(),
            method:
              'Production build served locally at the unchanged application origin through browser routing. No online release.'
          },
          null,
          2
        )
      );
      await context.route(isCode, routeCode);
      const oauth = await installGitHubOAuth(context, APP_ORIGIN, session.origin);
      await context.addInitScript(origin => {
        if (location.protocol !== 'https:' || location.origin !== origin) return;
        const url = new URL(location.href);
        url.searchParams.set('workbench-verify', '');
        history.replaceState(null, '', url);
      }, APP_ORIGIN);
      await mkdir(join(projectFolder, 'src'), { recursive: true });
      await mkdir(join(projectFolder, 'assets'), { recursive: true });
      await writeFile(join(projectFolder, 'src/main.ts'), '\ufeffconsole.log("folder copy")');
      await writeFile(join(projectFolder, 'assets/original.bin'), binary);
      await writeFile(
        join(projectFolder, 'workbench.project.json'),
        JSON.stringify({ template: 'vanilla', entry: 'src/main.ts' })
      );
      await session.openDesktop();
      await helpers.closeAll();
      await helpers.launch('Finder');
      const finder = helpers.win('finder');
      await finder.locator('[data-place="Desktop"]').click();
      await finder.locator('input[type="file"]').setInputFiles([
        { name: 'handoff.bin', mimeType: 'application/octet-stream', buffer: binary },
        { name: 'handoff.txt', mimeType: 'text/plain', buffer: Buffer.from('桌面原文 🌏') },
        { name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('not zip') }
      ]);
      await expect(finder.locator('[role="option"][data-name="handoff.bin"]')).toBeVisible();
      await helpers.closeAll();
      const launchCode = async () => {
        await helpers.launch('Aiao Code');
        const win = helpers.win('vscode');
        await expect(win.locator('[data-webapp-state="ready"]')).toBeVisible({ timeout: 90_000 });
        const frame = page.frames().find(candidate => URL.parse(candidate.url())?.origin === APP_ORIGIN);
        if (!frame) throw new Error('Actual Aiao Code frame missing');
        expect(new URL(frame.url()).searchParams.has('ngsw-bypass')).toBe(true);
        await frame.waitForFunction(() => window.ready && window.workbench, null, { timeout: 60_000 });
        await frame.evaluate(() => window.workbench.ready);
        await expect(win).toHaveClass(/front/);
        return frame;
      };
      let frame = await launchCode();
      expect(await frame.evaluate(() => crossOriginIsolated)).toBe(true);
      expect(await helpers.win('vscode').locator('iframe').getAttribute('sandbox')).not.toContain('allow-popups');
      result.realBuildAndIsolation = true;
      const chooser = page.waitForEvent('filechooser');
      await frame.locator('[data-welcome-action="open-folder"]').click();
      await (await chooser).setFiles(projectFolder);
      await frame.waitForFunction(() => window.workbench.session.state.projectId !== null);
      const originalId = await frame.evaluate(() => window.workbench.session.state.projectId);
      expect(await frame.evaluate(() => window.workbench.session.state.files['src/main.ts'])).toBe(
        '\ufeffconsole.log("folder copy")'
      );
      expect(await frame.evaluate(() => [...window.workbench.session.state.files['assets/original.bin']])).toEqual([
        ...binary
      ]);
      result.folderCopy = true;
      const panel = filePanel(page);
      const menu = async id => {
        await expect(frame.locator('[data-action="new-file"]')).toBeEnabled();
        await frame.locator('[data-action="title-menu"]').click();
        const item = frame.locator(`[data-menu-id="${id}"]`);
        await expect(item).toBeEnabled();
        await item.press('Enter');
      };
      const desktopFolder = async () => {
        await expect(panel.panel).toBeVisible();
        if (!(await panel.location()).endsWith('Desktop')) {
          await panel.up.click();
          await panel.row('Desktop').dblclick();
        }
      };
      const pick = async name => {
        await desktopFolder();
        await panel.row(name).click();
        await panel.confirm.click();
        await expect(panel.panel).toHaveCount(0);
      };
      const save = async name => {
        await desktopFolder();
        await panel.name.fill(name);
        await panel.confirm.click();
        await expect(panel.panel).toHaveCount(0);
      };
      await frame.evaluate(() => window.workbench.session.edit('src/main.ts', 'console.log("draft")'));
      await menu('desktop-import-file');
      await pick('handoff.bin');
      await expect
        .poll(() => frame.evaluate(() => Object.hasOwn(window.workbench.session.state.files, 'handoff.bin')))
        .toBe(true);
      expect(await frame.evaluate(() => window.workbench.session.isModified('src/main.ts'))).toBe(true);
      expect(await frame.evaluate(() => window.workbench.session.state.files['src/main.ts'])).toBe(
        'console.log("draft")'
      );
      await menu('desktop-export-file');
      await save('returned.bin');
      expect(await diskBytes(session, 'returned.bin')).toEqual([...binary]);
      await menu('desktop-import-file');
      await pick('handoff.txt');
      await expect
        .poll(() => frame.evaluate(() => window.workbench.session.state.files['handoff.txt']))
        .toBe('桌面原文 🌏');
      await frame.evaluate(async () => {
        window.workbench.session.edit('handoff.txt', '工作台改文');
        await window.workbench.session.save();
      });
      expect(await diskText(session, 'handoff.txt')).toBe('桌面原文 🌏');
      result.fileCopiesKeepBytesAndDrafts = true;
      await menu('desktop-export-file');
      await expect(panel.panel).toBeVisible();
      await panel.cancel.click();
      expect(await diskCount(session, 'handoff.txt')).toBe(1);
      await menu('desktop-import-file');
      await pick('handoff.txt');
      await expect(frame.locator('[data-log="problems"]')).toContainText('已有同名文件');
      expect(await frame.evaluate(() => window.workbench.session.state.files['handoff.txt'])).toBe('工作台改文');
      result.cancellationAndDuplicate = true;
      const expectedProject = await frame.evaluate(async () => {
        const session = window.workbench.session;
        const id = session.state.projectId;
        await session.backend.stage(id, Object.keys(session.state.files));
        await session.backend.commit(id, 'Copy round trip');
        return {
          files: Object.fromEntries(
            Object.entries(session.state.files).map(([path, value]) => [
              path,
              typeof value === 'string' ? value : [...value]
            ])
          ),
          history: await session.backend.history(id)
        };
      });
      await menu('desktop-export-project');
      await save('workspace-copy.zip');
      await expect.poll(async () => (await diskRow(session, 'workspace-copy.zip'))?.size).toBeGreaterThan(0);
      await menu('desktop-import-project');
      await pick('workspace-copy.zip');
      await expect.poll(() => frame.evaluate(() => window.workbench.session.state.projectId)).not.toBe(originalId);
      const importedProject = await frame.evaluate(async () => {
        const session = window.workbench.session;
        return {
          files: Object.fromEntries(
            Object.entries(session.state.files).map(([path, value]) => [
              path,
              typeof value === 'string' ? value : [...value]
            ])
          ),
          history: await session.backend.history(session.state.projectId)
        };
      });
      expect(importedProject).toEqual(expectedProject);
      result.projectArchiveRoundTrip = true;
      await expect(frame.locator('[data-action="new-file"]')).toBeEnabled();
      await frame.locator('[data-action="title-menu"]').click();
      await expect(frame.locator('[data-menu-id="desktop-export-file"]')).toBeEnabled();
      await page.screenshot({ path: '/tmp/aiao-code-copy-enabled-ui.png' });
      await frame.locator('[data-action="title-menu"]').press('Escape');
      const before = await frame.evaluate(() => window.workbench.session.state.projectId);
      await menu('desktop-import-project');
      await pick('broken.zip');
      await expect(frame.locator('[data-log="problems"]')).toContainText('Archive byte count is invalid');
      expect(await frame.evaluate(() => window.workbench.session.state.projectId)).toBe(before);
      await frame.evaluate(() => {
        window.workbench.session.edit('large.txt', 'x'.repeat(524_289));
        window.workbench.session.select('large.txt');
      });
      await menu('desktop-export-file');
      await expect(frame.locator('[data-log="problems"]')).toContainText('512 KiB');
      await expect(panel.panel).toHaveCount(0);
      expect(await frame.evaluate(() => window.workbench.session.state.files['large.txt'].length)).toBe(524_289);
      await frame.evaluate(() => window.workbench.session.discard());
      result.invalidAndOversizeRejected = true;
      const standalone = await session.openPage();
      await standalone.goto(`${APP_ORIGIN}/?workbench-verify`, { waitUntil: 'load' });
      await standalone.waitForFunction(() => window.ready && window.workbench);
      await standalone.evaluate(() => window.workbench.ready);
      await standalone.locator('[data-action="title-menu"]').click();
      await expect(standalone.locator('[data-menu-id="desktop-import-project"]')).toHaveCount(0);
      await expect(standalone.locator('[data-menu-id="open-folder"]')).toBeEnabled();
      await standalone.locator('[data-action="title-menu"]').press('Escape');
      await standalone.locator('[data-action="github-account"]').click();
      await expect(standalone.getByRole('button', { name: '使用 GitHub 账号登录' })).toBeEnabled();
      await standalone.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      await standalone.close();
      await page.bringToFront();
      result.standaloneFlowsPreserved = true;
      await frame.locator('[data-action="github-account"]').click();
      const login = frame.getByRole('dialog', { name: 'GitHub 登录' });
      const authorize = login.getByRole('button', { name: '使用 GitHub 账号登录' });
      await expect(login.getByLabel('个人访问令牌')).toBeVisible();
      const authorizeAtGitHub = async choice => {
        await expect(authorize).toBeEnabled();
        const opened = context.waitForEvent('page', { timeout: 10_000 });
        await authorize.press('Enter');
        const popup = session.observePage(await opened);
        await expect(popup).toHaveURL(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
        expect(await popup.evaluate(() => window.opener === null)).toBe(true);
        const closed = popup.waitForEvent('close', { timeout: 10_000 });
        await popup.getByRole('link', { name: choice }).click();
        await closed;
        await page.bringToFront();
      };
      await authorizeAtGitHub('Deny');
      await expect(login.getByRole('alert')).toHaveText('已取消 GitHub 授权');
      expect(oauth.exchanges()).toBe(0);
      await authorizeAtGitHub('Authorize');
      await expect(login).toContainText('已连接 GitHub（OAuth）');
      await expect(login).toContainText('desktop-octo');
      await login.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(frame.locator('[data-action="github-account"]')).toHaveAttribute('title', /desktop-octo/);
      expect(oauth.exchanges()).toBe(1);
      expect(await frame.evaluate(() => crossOriginIsolated)).toBe(true);
      await menu('desktop-export-project');
      await expect(panel.panel).toBeVisible();
      await frame.locator('[data-window-action="close"]').dispatchEvent('click');
      await expect(helpers.win('vscode')).toHaveCount(0);
      await expect(panel.panel).toHaveCount(0);
      expect(await diskCount(session, 'workspace-copy.zip')).toBe(1);
      result.closeCancelsPanel = true;
      await helpers.closeAll();
      await helpers.openTerminal();
      const shell = helpers.runInShell;
      const sharedWindow = helpers.win('vscode');
      async function sharedEditor(win, name, file) {
        await expect(win.locator('[data-webapp-state="ready"]')).toBeVisible({ timeout: 90_000 });
        const code = await (await win.locator('iframe').elementHandle()).contentFrame();
        if (!code) throw new Error('Actual Aiao Code frame missing');
        await code.waitForFunction(() => window.ready && window.workbench);
        await code.evaluate(() => window.workbench.ready);
        await expect(code.locator('[data-slot="workspace-label"]')).toHaveText(name);
        expect(await code.evaluate(path => Object.hasOwn(window.workbench.session.state.files, path), file)).toBe(true);
        return code;
      }
      await shell(
        'mkdir -p "$HOME/Desktop/plain folder" && cd "$HOME/Desktop/plain folder" && echo before > plain.txt && code .'
      );
      const plain = await sharedEditor(sharedWindow, 'plain folder', 'plain.txt');
      expect(await plain.evaluate(() => window.workbench.session.state.projectId)).not.toBe(originalId);
      expect(await plain.evaluate(() => Object.keys(window.workbench.session.state.files))).toEqual(['plain.txt']);
      await plain.locator('[data-tree-path="plain.txt"]').dblclick();
      await plain.getByRole('textbox', { name: '项目源码' }).fill('saved-in-place');
      await plain.locator('[data-action="title-menu"]').click();
      await expect(plain.locator('[data-menu-id="open-recent"]')).toBeDisabled();
      await plain.locator('[data-menu-id="save"]').click();
      await expect.poll(() => diskText(session, 'plain.txt')).toBe('saved-in-place');
      expect(await shell('cat plain.txt', /saved-in-place/)).toBe(true);
      expect(await diskCount(session, '.git')).toBe(0);
      await plain.locator('[data-window-action="close"]').dispatchEvent('click');
      await expect(sharedWindow).toHaveCount(0);
      expect(await shell('code plain.txt', /Not a directory:/)).toBe(true);
      await expect(sharedWindow).toHaveCount(0);
      await shell('code .');
      const plainReopened = await sharedEditor(sharedWindow, 'plain folder', 'plain.txt');
      expect(await plainReopened.evaluate(() => window.workbench.session.getSavedSnapshot().files['plain.txt'])).toBe(
        'saved-in-place'
      );
      await plainReopened.locator('[data-window-action="close"]').dispatchEvent('click');
      await expect(sharedWindow).toHaveCount(0);
      result.terminalFolderRoundTrip = true;
      expect(
        await shell('mkdir -p ~/Desktop/bridge && cd ~/Desktop/bridge && git init', /Initialized empty Git repository/)
      ).toBe(true);
      expect(
        await shell('echo shell-original > note.txt && git add . && git commit -m first', /\[main [a-f0-9]{7}\] first/)
      ).toBe(true);
      expect(await shell('git branch topic && git checkout topic', /Switched to branch 'topic'/)).toBe(true);
      await shell('open -a "GitHub Desktop" .');
      const github = helpers.win('github');
      await expect(github.locator('[data-github-repository-name]')).toHaveText('bridge');
      await github.locator('[data-github-repository-menu]').click();
      const repositories = github.locator('[data-github-repository-menu-popup]');
      await repositories.getByRole('button', { name: 'Add', exact: true }).click();
      await repositories.getByRole('menuitem', { name: 'Add Existing Repository…', exact: true }).click();
      const repositoryDialog = github.locator('[data-github-repository-dialog]');
      await repositoryDialog.getByLabel('Remote origin').fill('https://github.com/octo/bridge.git');
      await repositoryDialog.getByRole('button', { name: 'Add origin', exact: true }).click();
      await expect(repositoryDialog.getByRole('button', { name: 'Remove origin', exact: true })).toBeEnabled();
      await repositoryDialog.getByRole('button', { name: 'Close repository dialog' }).click();
      async function openInAiaoCode(target, win) {
        await expect(win.locator('[data-github-sync-action]')).toBeEnabled();
        await target.getByRole('menuitem', { name: 'Repository', exact: true }).click();
        await target.getByRole('menuitem', { name: 'Open in Aiao Code', exact: true }).click();
      }
      await shell('code .');
      const editor = await sharedEditor(sharedWindow, 'bridge', 'note.txt');
      const repositoryId = await editor.evaluate(() => window.workbench.session.state.projectId);
      expect(repositoryId).not.toBe(originalId);
      const rejected = await editor.evaluate(async () => {
        const { backend, state } = window.workbench.session;
        const denials = await Promise.allSettled([
          backend.save(state.projectId, { '../outside.txt': 'outside' }, state.revision),
          backend.save(state.projectId, { '.git/config': 'invalid' }, state.revision)
        ]);
        return denials.map(result => (result.status === 'rejected' ? result.reason.code : 'accepted'));
      });
      expect(rejected).toEqual(['INVALID_ARGUMENT', 'INVALID_ARGUMENT']);
      const other = await session.openDesktopPage({ waitForFinder: false });
      await other.helpers.restored();
      await other.helpers.launch('GitHub Desktop');
      const otherGithub = other.helpers.win('github').last();
      await expect(otherGithub.locator('[data-github-repository-name]')).toHaveText('bridge');
      await openInAiaoCode(other.page, otherGithub);
      const second = await sharedEditor(other.helpers.win('vscode').last(), 'bridge', 'note.txt');
      expect(await second.evaluate(() => window.workbench.session.state.projectId)).toBe(repositoryId);
      expect(await second.evaluate(() => window.workbench.session.state.files['note.txt'])).toBe('shell-original\n');
      await editor.evaluate(async () => {
        const session = window.workbench.session;
        session.edit('note.txt', 'edited-in-aiao-code');
        await session.save();
        const { projectId, revision } = session.state;
        const saved = await session.backend.save(
          projectId,
          { 'large.bin': new Uint8Array(1100000).fill(255) },
          revision
        );
        if (saved.files['large.bin'].length !== 1100000) throw new Error('Incomplete workspace transfer');
      });
      await second.evaluate(async () => {
        const session = window.workbench.session;
        session.edit('note.txt', 'my pending draft');
        try {
          await session.save();
        } catch (error) {
          if (
            !/revision/i.test(error.message) ||
            session.state.files['note.txt'] !== 'my pending draft' ||
            !session.state.dirty
          )
            throw error;
          session.discard();
          return;
        }
        throw new Error('An outdated window overwrote the saved version');
      });
      await other.page.close();
      await editor.locator('[data-window-action="close"]').dispatchEvent('click');
      await expect(sharedWindow).toHaveCount(0);
      await expect(github.locator('[data-file-path="note.txt"]')).toBeVisible();
      expect(await shell('cat note.txt', /edited-in-aiao-code/)).toBe(true);
      expect(await shell('git diff', /\+edited-in-aiao-code/)).toBe(true);
      expect(await shell('git remote -v', /octo\/bridge\.git \(push\)/)).toBe(true);
      expect(await diskBytes(session, 'large.bin', true)).toBe(
        createHash('sha256').update(Buffer.alloc(1100000, 255)).digest('hex')
      );
      await shell('code .');
      const reopened = await sharedEditor(sharedWindow, 'bridge', 'note.txt');
      expect(await reopened.evaluate(() => window.workbench.session.getSavedSnapshot().files['note.txt'])).toBe(
        'edited-in-aiao-code'
      );
      await reopened.locator('[data-window-action="close"]').dispatchEvent('click');
      await expect(sharedWindow).toHaveCount(0);
      result.terminalRepositoryRoundTrip = true;
      await helpers.closeAll();
      await grantCapabilities(session, ['window', 'clipboard:read', 'clipboard:write']);
      await session.reloadDesktop(page, { finder: false });
      frame = await launchCode();
      await expect(frame.locator('[data-action="github-account"]')).toHaveAttribute('title', /desktop-octo/);
      result.embeddedLoginBoundary = true;
      await frame.locator('[data-action="title-menu"]').click();
      await expect(frame.locator('[data-menu-id="desktop-import-project"]')).toBeDisabled();
      await expect(frame.locator('[data-menu-id="desktop-import-project"]')).toContainText('未授予读取权限');
      await expect(frame.locator('[data-menu-id="desktop-export-project"]')).toBeDisabled();
      await expect(frame.locator('[data-menu-id="desktop-export-project"]')).toContainText('未授予写入权限');
      result.deniedCapabilitiesVisible = true;
      await page.screenshot({ path: join(evidence, 'aiao-code-copy-ui.png') });
      return { aiaoCodeFiles: result };
    } finally {
      closing = true;
      await page.close();
      await Promise.all([...pendingRoutes]);
      await context.unroute(isCode, routeCode);
      server.close();
      await rm(temporary, { recursive: true, force: true });
    }
  }
};
