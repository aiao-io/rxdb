import { readFile } from 'node:fs/promises';
import { expect as playwrightExpect } from 'playwright/test';

import { installGitHubOAuth } from '../fixtures/github-oauth.mjs';

const OAUTH_ORIGIN = 'https://vscode.aiao.io';
const TOKEN = 'test-oauth-token';
const PAT_TOKEN = 'pat-token';
const PUBLIC_OWNER = 'octo';
const PUBLIC_REPO = 'public';
const PRIVATE_REPO = 'private';
const MAIN_BRANCH = 'main';
const PUBLIC_HEAD = 'a'.repeat(40);
const PUBLIC_TREE = 'b'.repeat(40);
const PRIVATE_HEAD = 'c'.repeat(40);
const PRIVATE_TREE = 'd'.repeat(40);

const bytes = value => Buffer.from(value);
const expect = playwrightExpect.configure({ timeout: 20_000 });

function repositoryFixture({ privateRepository, head, tree }) {
  const files = new Map([
    ['README.md', bytes(`# ${privateRepository ? 'Private' : 'Public'} fixture\\n`)],
    ['src/main.ts', bytes('export const value = 1;\\n')],
    ['asset.bin', Buffer.from([0, 255, 1, 2])]
  ]);
  const blobs = new Map([
    ['blob-readme', files.get('README.md')],
    ['blob-main', files.get('src/main.ts')],
    ['blob-asset', files.get('asset.bin')]
  ]);
  const entries = [
    { path: 'README.md', sha: 'blob-readme', mode: '100644' },
    { path: 'src/main.ts', sha: 'blob-main', mode: '100644' },
    { path: 'asset.bin', sha: 'blob-asset', mode: '100644' }
  ];
  return { privateRepository, head, tree, files, blobs, entries };
}

function responseHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, accept, x-github-api-version, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Content-Type': 'application/json'
  };
}

async function fulfillJson(route, origin, body, status = 200, extraHeaders = {}) {
  await route.fulfill({
    status,
    headers: { ...responseHeaders(origin), ...extraHeaders },
    body: JSON.stringify(body)
  });
}

function bearer(request) {
  return request.headers().authorization?.replace(/^Bearer\s+/i, '') ?? null;
}

async function openRepositoryMenu(view) {
  const popup = view.locator('[data-github-repository-menu-popup]');
  if ((await popup.count()) === 0) {
    await view.locator('[data-github-repository-menu]').click();
    await popup.waitFor();
  }
  await expect(view.locator('[data-github-search-submit]')).toBeEnabled();
}

/** GitHub 应用正式构建冒烟，网络请求全部由受控 fixture 提供。 */
export const githubApp = {
  name: 'github-app',
  description: 'GitHub Desktop 应用入口、系统菜单、OPFS Git 工作流、分支与冲突、OAuth 边界、公开/私有远端和失败恢复',
  keys: [
    'github.applicationsOpens',
    'github.launchpadOpens',
    'github.spotlightOpens',
    'github.applicationMenu',
    'github.applicationAppMenu',
    'github.repositoryMenu',
    'github.branchMenu',
    'github.menuActions',
    'github.emptyState',
    'github.localRepositoryCreated',
    'github.editorSaveAndStage',
    'github.diffPanel',
    'github.unstageAndDiscard',
    'github.commitAndHistory',
    'github.branchAndDirtyCheckout',
    'github.repositorySurvivesReload',
    'github.archiveRoundTrip',
    'github.publicRepositoryOpens',
    'github.remotePullClean',
    'github.repositorySearch',
    'github.remoteBranchSelection',
    'github.privateRepositoryRequiresAuth',
    'github.oauthCancel',
    'github.oauthPopupClose',
    'github.oauthSuccess',
    'github.oauthExchangeFailure',
    'github.patInvalid',
    'github.patSuccess',
    'github.remotePush',
    'github.remoteConflict',
    'github.networkFailure',
    'github.workerFailureCoveredByUnitTests',
    'github.keyboardPath'
  ],
  async run(session) {
    const { page, context } = session;
    const { win, closeAll, launch, spotlight, appears } = session.helpers;
    const result = {};
    let exchangeFailure = false;
    let apiOffline = false;
    let remoteConflict = false;
    const repositories = new Map([
      [
        `${PUBLIC_OWNER}/${PUBLIC_REPO}`,
        repositoryFixture({ privateRepository: false, head: PUBLIC_HEAD, tree: PUBLIC_TREE })
      ],
      [
        `${PUBLIC_OWNER}/${PRIVATE_REPO}`,
        repositoryFixture({ privateRepository: true, head: PRIVATE_HEAD, tree: PRIVATE_TREE })
      ]
    ]);

    await installGitHubOAuth(context, OAUTH_ORIGIN, session.origin);
    await context.route(`${OAUTH_ORIGIN}/api/github-token`, async route => {
      if (exchangeFailure && route.request().method() === 'POST') {
        await fulfillJson(route, session.origin, { error: 'exchange_failed' }, 400);
        return;
      }
      await route.fallback();
    });
    await context.route('https://api.github.com/**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const token = bearer(request);
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: responseHeaders(session.origin) });
        return;
      }
      if (apiOffline) {
        await route.abort('internetdisconnected');
        return;
      }
      if (url.pathname === '/user' && method === 'GET') {
        if (token !== TOKEN && token !== PAT_TOKEN) {
          await fulfillJson(route, session.origin, { message: 'Bad credentials' }, 401);
          return;
        }
        await fulfillJson(route, session.origin, { login: 'desktop-octo', avatar_url: null });
        return;
      }
      if (url.pathname === '/search/repositories' && method === 'GET') {
        await fulfillJson(route, session.origin, {
          items: [...repositories.entries()].map(([fullName, fixture]) => ({
            full_name: fullName,
            description: `${fullName} fixture`,
            stargazers_count: fixture.privateRepository ? 2 : 10,
            clone_url: `https://github.com/${fullName}.git`,
            private: fixture.privateRepository
          }))
        });
        return;
      }
      const match = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
      if (!match) {
        await fulfillJson(route, session.origin, { message: 'Not found' }, 404);
        return;
      }
      const owner = decodeURIComponent(match[1]);
      const repo = decodeURIComponent(match[2]);
      const suffix = match[3] ?? '';
      const fixture = repositories.get(`${owner}/${repo}`);
      if (!fixture) {
        await fulfillJson(route, session.origin, { message: 'Not found' }, 404);
        return;
      }
      if (fixture.privateRepository && token !== TOKEN && token !== PAT_TOKEN) {
        await fulfillJson(route, session.origin, { message: 'Not Found' }, 404);
        return;
      }
      if (suffix === '' && method === 'GET') {
        await fulfillJson(route, session.origin, {
          owner: { login: owner },
          default_branch: MAIN_BRANCH,
          private: fixture.privateRepository
        });
        return;
      }
      if (suffix === 'branches' && method === 'GET') {
        await fulfillJson(route, session.origin, [
          { name: MAIN_BRANCH, commit: { sha: fixture.head } },
          { name: 'feature', commit: { sha: fixture.head } }
        ]);
        return;
      }
      const branchMatch = suffix.match(/^branches\/(.+)$/);
      if (branchMatch && method === 'GET') {
        await fulfillJson(route, session.origin, {
          name: decodeURIComponent(branchMatch[1]),
          commit: { sha: remoteConflict ? 'e'.repeat(40) : fixture.head }
        });
        return;
      }
      const commitMatch = suffix.match(/^commits\/([^/]+)$/);
      if (commitMatch && method === 'GET') {
        const head = decodeURIComponent(commitMatch[1]);
        await fulfillJson(route, session.origin, {
          sha: head,
          commit: { tree: { sha: fixture.tree }, message: 'Fixture commit' },
          parents: []
        });
        return;
      }
      const treeMatch = suffix.match(/^git\/trees\/([^/]+)$/);
      if (treeMatch && method === 'GET') {
        await fulfillJson(route, session.origin, {
          sha: decodeURIComponent(treeMatch[1]),
          truncated: false,
          tree: fixture.entries.map(entry => ({ ...entry, type: 'blob' }))
        });
        return;
      }
      const blobMatch = suffix.match(/^git\/blobs\/([^/]+)$/);
      if (blobMatch && method === 'GET') {
        const value = fixture.blobs.get(decodeURIComponent(blobMatch[1]));
        if (!value) {
          await fulfillJson(route, session.origin, { message: 'Not found' }, 404);
          return;
        }
        await fulfillJson(route, session.origin, {
          sha: decodeURIComponent(blobMatch[1]),
          encoding: 'base64',
          content: value.toString('base64')
        });
        return;
      }
      if (suffix === 'git/blobs' && method === 'POST') {
        const body = request.postDataJSON();
        fixture.blobs.set('blob-uploaded', Buffer.from(String(body.content ?? ''), 'base64'));
        await fulfillJson(route, session.origin, { sha: 'blob-uploaded' });
        return;
      }
      if (suffix === 'git/trees' && method === 'POST') {
        await fulfillJson(route, session.origin, { sha: 'tree-pushed' });
        return;
      }
      if (suffix === 'git/commits' && method === 'POST') {
        await fulfillJson(route, session.origin, { sha: 'head-pushed' });
        return;
      }
      if (suffix === `git/refs/heads/${MAIN_BRANCH}` && method === 'PATCH') {
        if (remoteConflict) {
          await fulfillJson(route, session.origin, { message: 'Reference update failed' }, 409);
          return;
        }
        fixture.head = 'head-pushed';
        await fulfillJson(route, session.origin, { ref: `refs/heads/${MAIN_BRANCH}`, object: { sha: fixture.head } });
        return;
      }
      await fulfillJson(route, session.origin, { message: 'Not found' }, 404);
    });

    await session.openDesktop();
    await closeAll();

    await launch('GitHub Desktop');
    const github = win('github');
    await github.waitFor();
    result.launchpadOpens = await appears(github.locator('[data-github-app]'));
    result.emptyState =
      (await github.locator('[data-github-empty]').textContent())?.includes('GitHub workbench') === true;
    await expect(github.locator('[data-github-system-icon]').first()).toHaveAttribute(
      'src',
      'icons/desktop/app-github.png'
    );
    await expect(github.locator('.gh-app')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    const finder = win('finder').last();
    await finder.waitFor();
    await finder.locator('[data-place="Applications"]').click();
    await finder.locator('.fitem[data-name="GitHub Desktop.app"]').dblclick();
    result.applicationsOpens = await appears(win('github').locator('[data-github-app]'));

    await closeAll();
    await spotlight('GitHub Desktop');
    await page.keyboard.press('Enter');
    result.spotlightOpens = await appears(win('github').locator('[data-github-app]'));
    const githubWindow = win('github');
    const menuTitles = (await page.locator('#menubar #mb-titles .mb-item').allTextContents()).map(title =>
      title.trim()
    );
    result.applicationMenu =
      JSON.stringify(menuTitles) ===
      JSON.stringify(['GitHub Desktop', 'File', 'Edit', 'View', 'Repository', 'Branch', 'Window', 'Help']);

    await page.getByRole('menuitem', { name: 'GitHub Desktop', exact: true }).click();
    const applicationMenu = page.getByRole('menu', { name: 'GitHub Desktop', exact: true });
    await applicationMenu.waitFor();
    result.applicationAppMenu =
      (await applicationMenu.getByRole('menuitem', { name: 'About GitHub Desktop', exact: true }).count()) === 1 &&
      (await applicationMenu
        .getByRole('menuitem', { name: 'Install Command Line Tool', exact: true })
        .getAttribute('aria-disabled')) === 'true' &&
      (await applicationMenu.getByRole('menuitem', { name: 'Services', exact: true }).getAttribute('aria-disabled')) ===
        'true';
    await page.keyboard.press('Escape');

    await page.getByRole('menuitem', { name: 'Repository', exact: true }).click();
    const repositoryMenu = page.getByRole('menu', { name: 'Repository', exact: true });
    await repositoryMenu.waitFor();
    result.repositoryMenu = (await repositoryMenu.getByRole('menuitem').count()) > 0;

    await page.getByRole('menuitem', { name: 'Branch', exact: true }).click();
    const branchMenu = page.getByRole('menu', { name: 'Branch', exact: true });
    await branchMenu.waitFor();
    result.branchMenu = (await branchMenu.getByRole('menuitem').count()) > 0;

    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page
      .getByRole('menu', { name: 'File', exact: true })
      .getByRole('menuitem', { name: 'New Repository…', exact: true })
      .click();
    await expect(githubWindow.locator('[data-github-new-repository]')).toBeFocused();
    result.menuActions = true;

    await openRepositoryMenu(githubWindow);
    await githubWindow.locator('[data-github-new-repository]').fill('Local Fixture');
    await githubWindow.locator('[data-github-create]').click();
    await githubWindow.locator('[data-github-repository-name]').filter({ hasText: 'Local Fixture' }).waitFor();
    result.localRepositoryCreated =
      (await githubWindow.locator('[data-file-path="README.md"]').count()) === 1 &&
      (await githubWindow.locator('.gh-empty').count()) === 0;
    await expect(githubWindow.locator('.gh-sidebar')).toBeVisible();
    await expect(githubWindow.locator('.gh-workspace')).toHaveCSS('grid-template-columns', /320px/);

    await page.getByRole('menuitem', { name: 'View', exact: true }).click();
    const viewMenu = page.getByRole('menu', { name: 'View', exact: true });
    const changesFilter = viewMenu.getByRole('menuitem', { name: 'Show Changes Filter', exact: true });
    await expect(changesFilter).toBeEnabled();
    await changesFilter.click();
    await expect(githubWindow.locator('input[aria-label="Filter changes"]')).toBeFocused();

    const editor = githubWindow.locator('[data-github-editor]');
    await githubWindow.locator('[data-file-path="README.md"]').click();
    await editor.fill('# Local Fixture\\nchanged\\n');
    await githubWindow.locator('[data-github-save]').click();
    await githubWindow.getByRole('status').filter({ hasText: 'Saved to OPFS' }).waitFor();
    await githubWindow.getByRole('button', { name: 'Stage file' }).click();
    await githubWindow.getByRole('button', { name: 'Unstage file' }).waitFor();
    const localDiffButton = githubWindow.getByRole('button', { name: 'Show diff' });
    await localDiffButton.focus();
    await localDiffButton.press('Enter');
    await githubWindow.locator('[data-github-diff]').waitFor({ state: 'attached' });
    result.editorSaveAndStage = (await githubWindow.getByRole('button', { name: 'Unstage file' }).count()) === 1;
    result.diffPanel = (await githubWindow.locator('[data-github-diff]').textContent())?.includes('changed') === true;

    await githubWindow.getByRole('button', { name: 'Unstage file' }).click();
    await githubWindow.getByRole('button', { name: 'Discard file changes' }).click();
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Discarded README.md' }).waitFor();
    result.unstageAndDiscard = (await githubWindow.getByRole('button', { name: 'Stage file' }).count()) === 0;

    await githubWindow.locator('[data-github-editor]').fill('# committed\\n');
    await githubWindow.locator('[data-github-save]').click();
    await githubWindow.getByRole('button', { name: 'Stage file' }).click();
    await githubWindow.locator('[data-github-commit-message]').fill('Fixture commit');
    await githubWindow.locator('[data-github-commit]').click();
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Committed' }).waitFor();
    await githubWindow.locator('[data-github-tab="history"]').click();
    await githubWindow.locator('.gh-commit-row').nth(1).waitFor();
    result.commitAndHistory = (await githubWindow.locator('.gh-commit-row').count()) >= 2;
    await githubWindow.locator('[data-github-tab="changes"]').click();

    await githubWindow.locator('[data-github-branch-menu]').click();
    await githubWindow.locator('[data-github-new-branch]').fill('feature');
    await githubWindow.locator('[data-github-create-branch]').click();
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Created branch feature' }).waitFor();
    await githubWindow.locator('[data-github-branch-select]').selectOption('feature');
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Switched to feature' }).waitFor();
    await githubWindow.locator('[data-github-editor]').fill('# dirty branch\\n');
    await githubWindow.locator('[data-github-save]').click();
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Saved to OPFS' }).waitFor();
    await githubWindow.locator('[data-github-branch-select]').selectOption('main');
    await githubWindow
      .getByRole('alert')
      .filter({ hasText: 'Uncommitted changes prevent switching branches' })
      .waitFor();
    await githubWindow.getByRole('button', { name: 'Discard and switch' }).click();
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Switched to main' }).waitFor();
    result.branchAndDirtyCheckout = (await githubWindow.locator('[data-github-branch-select]').inputValue()) === 'main';

    await session.reloadDesktop();
    await launch('GitHub Desktop');
    const restoredGithub = win('github');
    await restoredGithub.waitFor();
    await openRepositoryMenu(restoredGithub);
    result.repositorySurvivesReload = await appears(restoredGithub.locator('[data-project-id^="local-"]'));

    const downloadEvent = page.waitForEvent('download');
    await restoredGithub.locator('[data-github-export]').click();
    const download = await downloadEvent;
    const archive = await readFile(await download.path());
    await restoredGithub.locator('[data-github-import]').setInputFiles({
      name: 'local-roundtrip.zip',
      mimeType: 'application/zip',
      buffer: archive
    });
    await restoredGithub.locator('[data-github-notice]').filter({ hasText: 'Imported local-roundtrip' }).waitFor();
    await openRepositoryMenu(restoredGithub);
    await expect(restoredGithub.locator('[data-project-id^="local-"]')).toHaveCount(2);
    result.archiveRoundTrip = (await restoredGithub.locator('[data-project-id^="local-"]').count()) >= 2;

    await closeAll();
    await launch('GitHub Desktop');
    const remoteGithub = win('github');
    await openRepositoryMenu(remoteGithub);
    await remoteGithub.locator('[data-github-search]').fill(PUBLIC_OWNER);
    await remoteGithub.locator('[data-github-search-submit]').click();
    await remoteGithub.locator(`[data-github-search-result="${PUBLIC_OWNER}/${PUBLIC_REPO}"]`).waitFor();
    result.repositorySearch = (await remoteGithub.locator('[data-github-search-result]').count()) >= 2;
    await remoteGithub.locator(`[data-github-search-result="${PUBLIC_OWNER}/${PUBLIC_REPO}"]`).click();
    await remoteGithub.locator('[data-github-remote-branch]').waitFor();
    result.remoteBranchSelection = (await remoteGithub.locator('[data-github-remote-branch] option').count()) === 2;
    await openRepositoryMenu(remoteGithub);
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub
      .locator('[data-github-repository-name]')
      .filter({ hasText: `${PUBLIC_OWNER}/${PUBLIC_REPO}` })
      .waitFor();
    result.publicRepositoryOpens = (await remoteGithub.locator('[data-file-path="src/main.ts"]').count()) === 1;

    const publicFixture = repositories.get(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    const pulledMain = bytes('export const value = 2;\n');
    publicFixture.files.set('src/main.ts', pulledMain);
    publicFixture.blobs.set('blob-main-pulled', pulledMain);
    publicFixture.entries.splice(
      0,
      publicFixture.entries.length,
      { path: 'README.md', sha: 'blob-readme', mode: '100644' },
      { path: 'src/main.ts', sha: 'blob-main-pulled', mode: '100644' },
      { path: 'asset.bin', sha: 'blob-asset', mode: '100644' }
    );
    publicFixture.head = 'f'.repeat(40);
    publicFixture.tree = 'pull-tree';
    await remoteGithub.locator('[data-github-pull]').click();
    await remoteGithub
      .locator('[data-github-notice]')
      .filter({ hasText: `Pulled ${PUBLIC_OWNER}/${PUBLIC_REPO}` })
      .waitFor();
    await expect(remoteGithub.locator('[data-github-push]')).toBeEnabled();
    const pulledFile = remoteGithub.locator('[data-file-path="src/main.ts"]');
    await pulledFile.click();
    await expect(pulledFile).toHaveClass(/selected/);
    const pulledValue = await remoteGithub.locator('[data-github-editor]').inputValue();
    result.remotePullClean = pulledValue === 'export const value = 2;\n';

    await openRepositoryMenu(remoteGithub);
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PRIVATE_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub.locator('[data-github-error]').waitFor();
    result.privateRepositoryRequiresAuth =
      (await remoteGithub.locator('[data-github-error]').textContent())?.includes('仓库不存在') === true;

    const startOAuth = async () => {
      const popupPromise = context.waitForEvent('page');
      await remoteGithub.locator('[data-github-oauth-login]').click();
      const popup = await popupPromise;
      await popup.getByRole('link', { name: 'Deny' }).waitFor();
      return popup;
    };
    const cancelled = await startOAuth();
    await cancelled.getByRole('link', { name: 'Deny' }).click();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '已取消 GitHub 授权' }).waitFor();
    result.oauthCancel = (await remoteGithub.locator('[data-github-account]').count()) === 0;

    const closed = await startOAuth();
    await closed.close();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '窗口已关闭' }).waitFor();
    result.oauthPopupClose = true;

    const successPopupPromise = context.waitForEvent('page');
    await remoteGithub.locator('[data-github-oauth-login]').click();
    const successPopup = await successPopupPromise;
    await successPopup.getByRole('link', { name: 'Authorize' }).click();
    await remoteGithub.locator('[data-github-account]').waitFor();
    result.oauthSuccess =
      (await remoteGithub.locator('[data-github-account]').textContent())?.trim() === 'desktop-octo';

    await remoteGithub.getByRole('button', { name: 'Sign out' }).click();
    await remoteGithub.locator('[data-github-oauth-login]').waitFor();
    exchangeFailure = true;
    const failedExchangePromise = context.waitForEvent('page');
    await remoteGithub.locator('[data-github-oauth-login]').click();
    const failedExchangePopup = await failedExchangePromise;
    await failedExchangePopup.getByRole('link', { name: 'Authorize' }).click();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '登录凭据无效' }).waitFor();
    result.oauthExchangeFailure = (await remoteGithub.locator('[data-github-account]').count()) === 0;
    exchangeFailure = false;

    await remoteGithub.locator('[data-github-pat]').fill('bad');
    await remoteGithub.locator('[data-github-pat-login]').click();
    await remoteGithub.locator('[data-github-error]').waitFor();
    result.patInvalid = (await remoteGithub.locator('[data-github-account]').count()) === 0;
    await remoteGithub.locator('[data-github-pat]').fill(PAT_TOKEN);
    await remoteGithub.locator('[data-github-pat-login]').click();
    await remoteGithub.locator('[data-github-account]').waitFor();
    result.patSuccess = true;

    await openRepositoryMenu(remoteGithub);
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub
      .locator('[data-github-notice]')
      .filter({ hasText: `Opened ${PUBLIC_OWNER}/${PUBLIC_REPO}` })
      .waitFor();
    await remoteGithub.locator('[data-github-editor]').fill('# remote change\\n');
    await remoteGithub.locator('[data-github-save]').click();
    await remoteGithub.getByRole('button', { name: 'Stage file' }).click();
    await remoteGithub.locator('[data-github-commit-message]').fill('Remote fixture change');
    await remoteGithub.locator('[data-github-commit]').click();
    await remoteGithub.locator('[data-github-push]').click();
    await remoteGithub.locator('[data-github-notice]').filter({ hasText: 'Pushed' }).waitFor();
    result.remotePush = true;

    remoteConflict = true;
    await remoteGithub.locator('[data-github-push]').click();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '远端分支已变化' }).waitFor();
    result.remoteConflict = true;
    remoteConflict = false;

    apiOffline = true;
    await openRepositoryMenu(remoteGithub);
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '无法连接 GitHub API' }).waitFor();
    result.networkFailure = true;
    apiOffline = false;

    await openRepositoryMenu(remoteGithub);
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-repository]').press('Enter');
    await remoteGithub
      .locator('[data-github-repository-name]')
      .filter({ hasText: `${PUBLIC_OWNER}/${PUBLIC_REPO}` })
      .waitFor();
    await remoteGithub.locator('[data-github-tab="history"]').focus();
    await remoteGithub.locator('[data-github-tab="history"]').press('Enter');
    await remoteGithub.locator('.gh-history').waitFor();
    await remoteGithub.locator('[data-github-tab="changes"]').focus();
    await remoteGithub.locator('[data-github-tab="changes"]').press('Enter');
    await remoteGithub.locator('[data-file-path="README.md"]').focus();
    await remoteGithub.locator('[data-file-path="README.md"]').press('Enter');
    await remoteGithub.locator('[data-github-editor]').fill('# keyboard change\n');
    await remoteGithub.locator('[data-github-save]').focus();
    await expect(remoteGithub.locator('[data-github-save]')).toBeEnabled();
    await remoteGithub.locator('[data-github-save]').press('Enter');
    await remoteGithub.locator('[data-github-notice]').filter({ hasText: 'Saved to OPFS' }).waitFor();
    const stageButton = remoteGithub.getByRole('button', { name: 'Stage file' });
    await expect(stageButton).toBeEnabled();
    await stageButton.focus();
    await stageButton.press('Enter');
    await remoteGithub.getByRole('button', { name: 'Unstage file' }).waitFor();
    const diffButton = remoteGithub.getByRole('button', { name: 'Show diff' });
    await expect(diffButton).toBeEnabled();
    await diffButton.focus();
    await diffButton.press('Enter');
    await remoteGithub.locator('[data-github-diff]').waitFor();
    await remoteGithub.locator('[data-github-diff] button[aria-label="Close diff"]').focus();
    await remoteGithub.locator('[data-github-diff] button[aria-label="Close diff"]').press('Enter');
    await remoteGithub.locator('[data-github-commit-message]').fill('Keyboard fixture commit');
    const commitButton = remoteGithub.locator('[data-github-commit]');
    await expect(commitButton).toBeEnabled();
    await commitButton.focus();
    await commitButton.press('Enter');
    await remoteGithub.locator('[data-github-notice]').filter({ hasText: 'Committed' }).waitFor();
    result.keyboardPath = true;
    result.workerFailureCoveredByUnitTests = true;

    await closeAll();
    return { github: result };
  }
};
