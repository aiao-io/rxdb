import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect as playwrightExpect } from 'playwright/test';

import { installGitHubOAuth } from '../fixtures/github-oauth.mjs';
import { traced } from '../harness/host-calls.mjs';

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
  return { privateRepository, head, tree, blobs, entries, branches: new Map(), commits: new Map(), trees: new Map() };
}

function storeBlob(fixture, content) {
  const sha = `blob-${fixture.blobs.size}`;
  fixture.blobs.set(sha, content);
  return sha;
}

function treeAt(fixture, sha) {
  return sha === fixture.tree ? fixture.entries : fixture.trees.get(sha);
}

function storeTree(fixture, { base_tree: base, tree }) {
  const previous = base === undefined ? [] : treeAt(fixture, base);
  if (!previous) return null;
  const entries = new Map(previous.map(entry => [entry.path, entry]));
  for (const { path, mode, type, sha, content } of tree) {
    if (sha === null) {
      entries.delete(path);
      continue;
    }
    const blob = sha ?? storeBlob(fixture, Buffer.from(content));
    if (type !== 'blob' || mode !== '100644' || !fixture.blobs.has(blob)) return null;
    entries.set(path, { path, mode, sha: blob });
  }
  const sha = `tree-${fixture.trees.size}`;
  fixture.trees.set(sha, [...entries.values()]);
  return sha;
}

async function readRemoteFiles(page, repository, ref = MAIN_BRANCH) {
  return page.evaluate(
    async ([name, ref]) => {
      const base = `https://api.github.com/repos/${name}`;
      const read = async path => {
        const response = await fetch(`${base}/${path}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`GET ${path} returned ${response.status}`);
        return response.json();
      };
      const branch = await read(`branches/${encodeURIComponent(ref)}`);
      const { commit } = await read(`commits/${branch.commit.sha}`);
      const { tree } = await read(`git/trees/${commit.tree.sha}?recursive=1`);
      const files = await Promise.all(
        tree.map(async ({ path, sha }) => [path, (await read(`git/blobs/${sha}`)).content])
      );
      return Object.fromEntries(files);
    },
    [repository, ref]
  );
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

async function openRepositoryMenu(view, panel = 'list') {
  const popup = view.locator('[data-github-repository-menu-popup]');
  const dialog = view.locator('[data-github-repository-dialog]');
  const labels = { clone: 'Clone a Repository', new: 'Create a New Repository', local: 'Add Local Repository' };
  if (panel !== 'list' && (await dialog.getByRole('heading', { name: labels[panel], exact: true }).count())) return;
  if (await dialog.count()) await view.getByRole('button', { name: 'Close repository dialog' }).click();
  if (!(await popup.count())) await view.locator('[data-github-repository-menu]').click();
  await expect(popup).toBeVisible();
  if (panel === 'list') return;
  const actions = { clone: 'Clone Repository…', new: 'Create New Repository…', local: 'Add Existing Repository…' };
  await popup.getByRole('button', { name: 'Add', exact: true }).click();
  await popup.getByRole('menuitem', { name: actions[panel], exact: true }).click();
  await expect(dialog.getByRole('heading', { name: labels[panel], exact: true })).toBeVisible();
}

async function verifyToolbar(view) {
  const app = view.locator('[data-github-app]');
  const titlebar = view.locator('.gh-titlebar');
  const toolbar = view.locator('.gh-toolbar');
  await expect(titlebar).toHaveCSS('height', '32px');
  await expect(toolbar).toHaveCSS('height', '50px');
  const controls = await titlebar.getByRole('button').all();
  expect(await Promise.all(controls.map(button => button.getAttribute('aria-label')))).toEqual([
    'Close',
    'Minimize',
    'Zoom'
  ]);
  const boxes = await Promise.all(controls.map(button => button.boundingBox()));
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  expect(boxes[1].x).toBeLessThan(boxes[2].x);
  expect(boxes[0].y).toBe(boxes[2].y);
  const refresh = view.locator('[data-github-fetch-origin]');
  const [icon, label] = await Promise.all([
    refresh.locator('svg').boundingBox(),
    refresh.locator('small').boundingBox()
  ]);
  expect(icon.x).toBeLessThan(label.x);
  for (const kind of ['repository', 'worktree', 'branch']) {
    const trigger = view.locator(`[data-github-${kind}-menu]`);
    await trigger.click();
    const popup = view.locator(`[data-github-${kind}-menu-popup]`);
    await expect(popup).toBeVisible();
    await expect(popup.getByRole('searchbox')).toBeFocused();
    await expect(popup).toHaveCSS('width', kind === 'repository' ? '250px' : '365px');
    const [appBox, toolbarBox, popupBox] = await Promise.all([
      app.boundingBox(),
      toolbar.boundingBox(),
      popup.boundingBox()
    ]);
    expect(Math.abs(popupBox.y - (toolbarBox.y + toolbarBox.height))).toBeLessThan(1);
    expect(Math.abs(popupBox.y + popupBox.height - (appBox.y + appBox.height))).toBeLessThan(1);
    await trigger.click();
    await expect(popup).toHaveCount(0);
  }
}

async function showRepositoryFiles(view) {
  const button = view.getByRole('button', {
    name: 'Open in Aiao Code',
    exact: true
  });
  if ((await button.count()) > 0) {
    await button.click();
    await view.locator('[data-file-path]').first().waitFor();
    const windowLayer = view.locator('xpath=..');
    const externalWindow = windowLayer.locator('.win[data-app="vscode"]:not(.closing)').last();
    const closeButton = externalWindow.locator('.tl .c');
    if ((await closeButton.count()) > 0) await closeButton.click();
  }
}

function changedFileRow(view, path) {
  return view.locator(`.gd-row:has([data-file-path="${path}"])`);
}

function changedFileCheckbox(view, path) {
  return changedFileRow(view, path).locator('.gh-file-checkbox');
}

async function stageChangedFile(view, path) {
  const checkbox = changedFileCheckbox(view, path);
  await expect(checkbox).toHaveCount(1);
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await expect(checkbox).toHaveAccessibleName('Unstage file');
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeEnabled();
}

async function unstageChangedFile(view, path) {
  const checkbox = changedFileCheckbox(view, path);
  await checkbox.uncheck();
  await expect(checkbox).toHaveAccessibleName('Stage file');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeEnabled();
}

async function discardChangedFile(view, path) {
  await changedFileRow(view, path).locator('[data-file-path]').click({ button: 'right' });
  await view.getByRole('button', { name: 'Discard changes', exact: true }).click();
}

function terminalOutput(session) {
  const { runInShell, xtermText } = session.helpers;
  let sequence = 0;
  return async command => {
    const token = `D${++sequence}`;
    const finished = await runInShell(
      `echo ${token}'BEGIN'; ${command}; echo ${token}'END'`,
      new RegExp(`${token}END.*\\$\\s*$`)
    );
    const rows = (await xtermText()).replaceAll('\u00a0', ' ');
    if (!finished || !rows.includes(`${token}BEGIN`)) throw new Error(`Terminal did not finish ${command}\n${rows}`);
    return rows.split(`${token}BEGIN`).at(-1).split(`${token}END`)[0].trim();
  };
}

async function droppedRepository(session, view) {
  const temporary = await mkdtemp(join(tmpdir(), 'aiao-github-drop-'));
  const folder = join(temporary, 'drop-fixture');
  const plain = join(temporary, 'plain-folder');
  const client = await session.page.context().newCDPSession(session.page);
  try {
    await mkdir(folder);
    await mkdir(plain);
    const git = (...args) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          '-c',
          'commit.gpgsign=false',
          '-C',
          folder,
          ...args
        ],
        { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }
      ).trim();
    git('init', '-q', '--template=', '-b', 'main');
    await writeFile(join(folder, 'tracked.txt'), 'committed\n');
    git('add', 'tracked.txt');
    git('commit', '-qm', 'original commit');
    git('checkout', '-qb', 'topic');
    git('remote', 'add', 'origin', 'https://github.com/octo/drop-fixture.git');
    await writeFile(join(folder, 'tracked.txt'), 'staged\n');
    git('add', 'tracked.txt');
    await writeFile(join(folder, 'tracked.txt'), 'working\n');
    const head = git('rev-parse', 'HEAD');
    const bounds = await view.locator('[data-github-app]').boundingBox();
    const drop = async files => {
      const event = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        data: { items: [], files, dragOperationsMask: 1 }
      };
      for (const type of ['dragEnter', 'dragOver', 'drop'])
        await client.send('Input.dispatchDragEvent', { ...event, type });
    };
    await drop([plain, folder]);
    await expect(view.locator('[data-github-notice]')).toContainText('/Documents/GitHub/drop-fixture');
    await expect(view.locator('[data-github-error]')).toContainText('plain-folder');
    await expect(view.locator('[data-github-branch-select]')).toHaveValue('topic');
    await drop([folder]);
    await expect(view.locator('[data-github-error]')).toContainText('目标目录已存在');
    await session.helpers.openTerminal();
    const outputOf = terminalOutput(session);
    expect(await outputOf('cd ~/Documents/GitHub/drop-fixture && git rev-parse HEAD')).toBe(head);
    expect(await outputOf('git status --short')).toBe('MM tracked.txt');
    expect(await outputOf('git diff --cached')).toContain('+staged');
    expect(await outputOf('git diff')).toContain('+working');
    expect(await outputOf('cat tracked.txt')).toBe('working');
    expect(await outputOf('git remote -v')).toContain('https://github.com/octo/drop-fixture.git');
    await outputOf('git remote remove origin');
    expect(await outputOf('git remote -v')).toBe('');
    expect(await outputOf('open -R .')).toBe('');
    const finder = session.helpers.win('finder').filter({ has: session.page.locator('[data-name="drop-fixture"]') });
    const source = finder.locator('[data-name="drop-fixture"]').last();
    try {
      await expect(source).toBeVisible();
    } catch (error) {
      const titles = await session.page
        .locator('.win:not(.closing)')
        .evaluateAll(windows =>
          windows.map(window => [window.getAttribute('data-app'), window.getAttribute('aria-label')])
        );
      throw new Error(`open -R . did not reveal the repository in Finder: ${JSON.stringify(titles)}`, { cause: error });
    }
    const layout = await session.page.addStyleTag({
      content: `.win[data-app="github"] {left: 5px!important; top: 45px!important; width: 48vw!important;} .win[data-app="finder"] {left: 50vw!important; top: 45px!important; width: 47vw!important;} .win[data-app="terminal"]{visibility:hidden}`
    });
    try {
      const target = view.locator('[data-github-app]');
      await source.dragTo(target, { targetPosition: { x: 80, y: 150 } });
      await expect(view.locator('[data-github-notice]')).toHaveText('Opened drop-fixture');
      await openRepositoryMenu(view);
      await expect(view.locator('[data-project-id]').filter({ hasText: 'drop-fixture' })).toHaveCount(1);
      await openRepositoryMenu(view, 'local');
      await expect(view.getByRole('button', { name: 'Add origin', exact: true })).toBeEnabled();
      const volumePath = view.getByRole('textbox', { name: 'Macintosh HD folder' });
      await volumePath.fill('~/Documents/GitHub/drop-fixture');
      await volumePath.press('Enter');
      await expect(view.locator('[data-github-repository-dialog]')).toHaveCount(0);
      await expect(view.locator('[data-github-branch-select]')).toHaveValue('topic');
    } finally {
      await layout.evaluate(element => element.remove());
    }
  } finally {
    await client.detach();
    await rm(temporary, { recursive: true, force: true });
  }
}

async function terminalRoundTrip(session) {
  const { page } = session;
  const { win, closeAll, openTerminal, runInShell } = session.helpers;
  await closeAll();
  await openTerminal();
  const originalTerminal = win('terminal').first();
  const setup =
    'mkdir -p "$HOME/Documents/Git Demo" && cd "$HOME/Documents/Git Demo" && git init && echo start > note.txt && git add note.txt && git commit -m initial && open -a "GitHub Desktop" .';
  expect(await runInShell(setup, /\[main [0-9a-f]+\] initial/)).toBe(true);
  const github = win('github');
  await expect(github.locator('[data-github-repository-name]')).toHaveText('Git Demo');
  await expect(github.locator('[data-github-fetch-origin]')).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Repository', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open in Terminal', exact: true }).click();
  await expect(win('terminal')).toHaveCount(2);
  await originalTerminal.locator('.tl .c').dispatchEvent('click');
  await expect(win('terminal')).toHaveCount(1);
  expect(await runInShell('pwd', /\/Users\/[^/]+\/Documents\/Git Demo/)).toBe(true);

  expect(await runInShell('echo shell > note.txt && git add note.txt && git status --short', /M\s+note\.txt/)).toBe(
    true
  );
  await expect(changedFileCheckbox(github, 'note.txt')).toBeChecked();
  expect(await runInShell('git commit -m "Terminal commit"', /\[main [0-9a-f]+\] Terminal commit/)).toBe(true);
  await expect(changedFileCheckbox(github, 'note.txt')).toHaveCount(0);
  expect(await runInShell('git checkout -b terminal-topic', /Switched to branch 'terminal-topic'/)).toBe(true);
  await expect(github.locator('[data-github-branch-select]')).toHaveValue('terminal-topic');

  const layout = await page.addStyleTag({
    content:
      '.win[data-app="github"] { left: 10px !important; } .win[data-app="terminal"] { left: 73vw !important; width: 26vw !important; }'
  });
  try {
    const activateGithub = () => github.locator('.gh-titlebar').click({ position: { x: 110, y: 10 } });
    await activateGithub();
    await github.getByRole('tab', { name: 'History' }).click();
    await expect(github.locator('.gh-commit-row').first()).toContainText('Terminal commit');
    expect(
      await runInShell(
        'echo topic > note.txt && git add note.txt && git commit -m "Topic commit"',
        /\[terminal-topic [0-9a-f]+\] Topic commit/
      )
    ).toBe(true);
    await expect(github.locator('.gh-commit-row').first()).toContainText('Topic commit');
    await activateGithub();
    await github.locator('[data-github-branch-menu]').click();
    await github
      .getByRole('dialog', { name: 'Branch list' })
      .getByRole('button', { name: 'main', exact: true })
      .click();
    await expect(github.locator('[data-github-branch-select]')).toHaveValue('main');
    expect(await runInShell('git status', /On branch main/)).toBe(true);
    await activateGithub();
    await github.getByRole('combobox', { name: 'Select Branch to Compare' }).selectOption('terminal-topic');
    await expect(github.getByRole('button', { name: 'Behind 1' })).toHaveAttribute('aria-pressed', 'true');
    await expect(github.locator('.gh-commit-row').first()).toContainText('Topic commit');
    await expect(github.locator('[data-history-unified] code')).toHaveText(['shell', 'topic']);
    await github.getByRole('button', { name: 'Clear branch comparison' }).click();
    await expect(github.locator('.gh-commit-row').first()).toContainText('Terminal commit');

    const outputOf = terminalOutput(session);
    expect(await outputOf('echo before-draft > note.txt')).toBe('');
    await activateGithub();
    await github.getByRole('tab', { name: 'Changes' }).click();
    await github.locator('[data-file-path="note.txt"]').click({ button: 'right' });
    await github.getByRole('button', { name: 'Open note.txt', exact: true }).click();
    const editor = github.locator('[data-github-editor]');
    await expect(editor).toHaveValue('before-draft\n');
    await editor.fill('not yet saved\n');
    expect(await runInShell('echo terminal-write > note.txt && git status --short', /M\s+note\.txt/)).toBe(true);
    await expect(changedFileCheckbox(github, 'note.txt')).toBeVisible();
    await activateGithub();
    const refresh = github.locator('[data-github-fetch-origin]');
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(editor).toHaveValue('not yet saved\n');
    await github.locator('[data-github-save]').click();
    await expect(github.locator('[data-github-error]')).toContainText(/Expected revision \d+, current revision is \d+/);
    await expect(editor).toHaveValue('not yet saved\n');
    expect(await outputOf('cat note.txt')).toBe('terminal-write');
  } finally {
    await layout.evaluate(element => element.remove());
  }
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
    'github.historyDetails',
    'github.toolbarLayout',
    'github.diffModes',
    'github.clonedRepositoryInTerminal',
    'github.historyContextMenu',
    'github.branchAndDirtyCheckout',
    'github.repositorySurvivesReload',
    'github.archiveRoundTrip',
    'github.droppedRepository',
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
    'github.keyboardPath',
    'github.terminalRoundTrip'
  ],
  async run(session) {
    const { page, context } = session;
    const { win, closeAll, launch, spotlight, appears } = session.helpers;
    const result = traced('github-app');
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
          { name: 'feature', commit: { sha: fixture.head } },
          ...Array.from(fixture.branches, ([name, sha]) => ({ name, commit: { sha } }))
        ]);
        return;
      }
      const branchMatch = suffix.match(/^branches\/(.+)$/);
      if (branchMatch && method === 'GET') {
        const name = decodeURIComponent(branchMatch[1]);
        const head = [MAIN_BRANCH, 'feature'].includes(name) ? fixture.head : fixture.branches.get(name);
        await fulfillJson(
          route,
          session.origin,
          { name, commit: { sha: remoteConflict ? 'e'.repeat(40) : head } },
          head ? 200 : 404
        );
        return;
      }
      const commitMatch = suffix.match(/^commits\/([^/]+)$/);
      if (commitMatch && method === 'GET') {
        const head = decodeURIComponent(commitMatch[1]);
        const commit =
          fixture.commits.get(head) ??
          (head === fixture.head ? { tree: fixture.tree, message: 'Fixture commit', parents: [] } : null);
        if (!commit) return fulfillJson(route, session.origin, { message: 'Unknown commit' }, 404);
        await fulfillJson(route, session.origin, {
          sha: head,
          commit: { tree: { sha: commit.tree }, message: commit.message },
          parents: commit.parents.map(sha => ({ sha }))
        });
        return;
      }
      const treeMatch = suffix.match(/^git\/trees\/([^/]+)$/);
      if (treeMatch && method === 'GET') {
        const sha = decodeURIComponent(treeMatch[1]);
        const entries = treeAt(fixture, sha);
        if (!entries) return fulfillJson(route, session.origin, { message: 'Unknown tree' }, 404);
        await fulfillJson(route, session.origin, {
          sha,
          truncated: false,
          tree: entries.map(entry => ({ ...entry, type: 'blob' }))
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
        const sha = storeBlob(fixture, Buffer.from(body.content, 'base64'));
        await fulfillJson(route, session.origin, { sha }, 201);
        return;
      }
      if (suffix === 'git/trees' && method === 'POST') {
        const sha = storeTree(fixture, request.postDataJSON());
        await fulfillJson(route, session.origin, { sha }, sha ? 201 : 422);
        return;
      }
      if (suffix === 'git/commits' && method === 'POST') {
        const commit = request.postDataJSON();
        if (!fixture.trees.has(commit.tree))
          return fulfillJson(route, session.origin, { message: 'Unknown tree' }, 422);
        const sha = `commit-${fixture.commits.size}`;
        fixture.commits.set(sha, commit);
        await fulfillJson(route, session.origin, { sha }, 201);
        return;
      }
      if (suffix === 'git/refs' && method === 'POST') {
        const { ref, sha } = request.postDataJSON();
        const name = ref.replace(/^refs\/heads\//, '');
        if (
          name === ref ||
          [MAIN_BRANCH, 'feature'].includes(name) ||
          fixture.branches.has(name) ||
          !fixture.commits.has(sha)
        )
          return fulfillJson(route, session.origin, { message: 'Cannot create reference' }, 422);
        fixture.branches.set(name, sha);
        return fulfillJson(route, session.origin, { ref, object: { sha } }, 201);
      }
      if (suffix === `git/refs/heads/${MAIN_BRANCH}` && method === 'PATCH') {
        if (remoteConflict) {
          await fulfillJson(route, session.origin, { message: 'Reference update failed' }, 409);
          return;
        }
        const { sha, force } = request.postDataJSON();
        if (force || !fixture.commits.get(sha)?.parents.includes(fixture.head))
          return fulfillJson(route, session.origin, { message: 'Non-fast-forward' }, 422);
        fixture.head = sha;
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
    await page.getByRole('menuitem', { name: 'File', exact: true }).click();
    await page
      .getByRole('menu', { name: 'File', exact: true })
      .getByRole('menuitem', { name: 'Add Local Repository…', exact: true })
      .press('Enter');
    const addLocal = githubWindow.getByRole('button', { name: 'Add local repository', exact: true });
    await expect(addLocal).toBeFocused();
    await page.evaluate(() => {
      const original = window.showDirectoryPicker;
      window.showDirectoryPicker = async () => {
        window.showDirectoryPicker = original;
        throw new DOMException('Selection cancelled', 'AbortError');
      };
    });
    await addLocal.press('Enter');
    await expect(githubWindow.locator('[data-github-error]')).toHaveCount(0);
    result.menuActions = true;

    await openRepositoryMenu(githubWindow, 'new');
    await githubWindow.locator('[data-github-new-repository]').fill('Local Fixture');
    await githubWindow.locator('[data-github-create]').click();
    await githubWindow.locator('[data-github-repository-name]').filter({ hasText: 'Local Fixture' }).waitFor();
    await expect(githubWindow.locator('[data-github-repository-dialog]')).toHaveCount(0);
    await verifyToolbar(githubWindow);
    result.toolbarLayout = true;
    await showRepositoryFiles(githubWindow);
    result.localRepositoryCreated =
      (await githubWindow.locator('[data-file-path="README.md"]').count()) === 1 &&
      (await githubWindow.locator('.gh-empty').count()) === 0;
    await expect(githubWindow.locator('.gh-sidebar')).toBeVisible();
    await expect(githubWindow.locator('.gh-workspace')).toHaveCSS('grid-template-columns', /^250px [\d.]+px$/);

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
    await stageChangedFile(githubWindow, 'README.md');
    await expect(changedFileCheckbox(githubWindow, 'README.md')).toBeChecked();
    await githubWindow.locator('[data-file-path="README.md"]').click();
    await githubWindow.locator('[data-github-diff]').waitFor({ state: 'attached' });
    result.editorSaveAndStage = await changedFileCheckbox(githubWindow, 'README.md').isChecked();
    result.diffPanel = (await githubWindow.locator('[data-github-diff]').textContent())?.includes('changed') === true;

    await unstageChangedFile(githubWindow, 'README.md');
    await discardChangedFile(githubWindow, 'README.md');
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Discarded README.md' }).waitFor();
    result.unstageAndDiscard = (await changedFileCheckbox(githubWindow, 'README.md').count()) === 0;
    await showRepositoryFiles(githubWindow);

    await githubWindow.locator('[data-github-editor]').fill('# committed\\n');
    await githubWindow.locator('[data-github-save]').click();
    await githubWindow.getByRole('status').filter({ hasText: 'Saved to OPFS' }).waitFor();
    await stageChangedFile(githubWindow, 'README.md');
    await githubWindow.locator('[data-github-commit-message]').fill('Fixture commit');
    await githubWindow.getByRole('textbox', { name: 'Commit description' }).fill('First release notes');
    await githubWindow.locator('[data-github-commit]').click();
    await githubWindow.locator('[data-github-notice]').filter({ hasText: 'Committed' }).waitFor();
    await showRepositoryFiles(githubWindow);
    await githubWindow.locator('[data-github-tab="history"]').click();
    const historyRows = githubWindow.locator('.gh-commit-row');
    await historyRows.nth(1).waitFor();
    result.commitAndHistory = (await historyRows.count()) >= 2;
    await expect(githubWindow.locator('[data-history-file-path="README.md"]')).toHaveClass(
      /gh-history-file-row-selected/
    );
    await expect(githubWindow.locator('[data-history-file-path="README.md"]').getByRole('img')).toHaveAccessibleName(
      'Modified'
    );
    await expect(githubWindow.locator('[data-github-commit-sha]')).toHaveText(/^[a-f0-9]{7}$/);
    await expect(githubWindow.locator('.gh-detail-header')).toContainText('Browser Workbench');
    await expect(githubWindow.locator('.gh-commit-body')).toHaveText('First release notes');
    await expect(githubWindow.locator('[data-history-unified]').first()).toBeVisible();
    const settings = githubWindow.getByRole('button', { name: 'Diff Settings' });
    await settings.click();
    await githubWindow.getByRole('button', { name: 'Split Diff', exact: true }).click();
    await expect(githubWindow.locator('[data-history-split]').first()).toBeVisible();
    await settings.click();
    await githubWindow.getByRole('button', { name: 'Unified Diff', exact: true }).click();
    result.diffModes = true;
    result.historyDetails =
      (await githubWindow.locator('.gh-history-detail').count()) === 1 &&
      (await githubWindow.locator('[data-github-history-diff]').count()) === 1;
    await expect(historyRows.first().locator('.gh-context-trigger')).toHaveCount(0);
    await historyRows.first().click({ button: 'right' });
    await githubWindow.locator('.gh-context-menu').waitFor();
    result.historyContextMenu =
      (await githubWindow.getByRole('button', { name: 'Copy SHA', exact: true }).count()) === 1;
    await githubWindow.getByRole('button', { name: 'Copy SHA', exact: true }).click();
    await githubWindow.locator('.gh-context-menu').waitFor({ state: 'detached' });
    await githubWindow.locator('[data-github-tab="changes"]').click();

    await githubWindow.locator('[data-github-branch-menu]').click();
    await githubWindow.getByRole('button', { name: 'New Branch', exact: true }).click();
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

    await openRepositoryMenu(restoredGithub, 'local');
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

    await restoredGithub.locator('[data-github-repository-menu]').click();
    await droppedRepository(session, restoredGithub);
    result.droppedRepository = true;
    await closeAll();
    await launch('GitHub Desktop');
    const remoteGithub = win('github');
    await openRepositoryMenu(remoteGithub, 'clone');
    await remoteGithub.locator('[data-github-search]').fill(PUBLIC_OWNER);
    await remoteGithub.locator('[data-github-search-submit]').click();
    await remoteGithub.locator(`[data-github-search-result="${PUBLIC_OWNER}/${PUBLIC_REPO}"]`).waitFor();
    result.repositorySearch = (await remoteGithub.locator('[data-github-search-result]').count()) >= 2;
    await remoteGithub.locator(`[data-github-search-result="${PUBLIC_OWNER}/${PUBLIC_REPO}"]`).click();
    await remoteGithub.locator('[data-github-remote-branch]').waitFor();
    result.remoteBranchSelection = (await remoteGithub.locator('[data-github-remote-branch] option').count()) === 2;
    await openRepositoryMenu(remoteGithub, 'clone');
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await expect(remoteGithub.locator('[data-github-repository-name]')).toHaveText(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await expect(remoteGithub.getByRole('button', { name: 'Open in Aiao Code', exact: true })).toBeEnabled();
    await showRepositoryFiles(remoteGithub);
    await expect(remoteGithub.locator('[data-file-path="src/main.ts"]')).toHaveCount(1);
    result.publicRepositoryOpens = true;

    const publicFixture = repositories.get(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    const pulledMain = bytes('export const value = 2;\n');
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
    await showRepositoryFiles(remoteGithub);
    await expect(remoteGithub.locator('[data-github-push]')).toBeEnabled();
    const pulledFile = remoteGithub.locator('[data-file-path="src/main.ts"]');
    await pulledFile.click();
    await expect(pulledFile).toHaveClass(/selected/);
    const pulledValue = await remoteGithub.locator('[data-github-editor]').inputValue();
    result.remotePullClean = pulledValue === 'export const value = 2;\n';

    await openRepositoryMenu(remoteGithub, 'clone');
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PRIVATE_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub.locator('[data-github-error]').waitFor();
    result.privateRepositoryRequiresAuth =
      (await remoteGithub.locator('[data-github-error]').textContent())?.includes('仓库不存在') === true;

    await openRepositoryMenu(remoteGithub, 'clone');
    const startOAuth = async () => {
      const button = remoteGithub.locator('[data-github-oauth-login]');
      await expect(button).toBeEnabled();
      await button.focus();
      const [popup] = await Promise.all([context.waitForEvent('page'), button.press('Enter')]);
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

    await openRepositoryMenu(remoteGithub, 'clone');
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub
      .locator('[data-github-notice]')
      .filter({ hasText: `Opened ${PUBLIC_OWNER}/${PUBLIC_REPO}` })
      .waitFor();
    await showRepositoryFiles(remoteGithub);
    await remoteGithub.locator('[data-file-path="README.md"]').click();
    await remoteGithub.locator('[data-github-editor]').fill('# remote change\n');
    await remoteGithub.locator('[data-github-save]').click();
    await remoteGithub.getByRole('status').filter({ hasText: 'Saved to OPFS' }).waitFor();
    await stageChangedFile(remoteGithub, 'README.md');
    await remoteGithub.locator('[data-github-commit-message]').fill('Remote fixture change');
    await remoteGithub.locator('[data-github-commit]').click();
    await remoteGithub.locator('[data-github-push]').click();
    await remoteGithub.locator('[data-github-notice]').filter({ hasText: 'Pushed' }).waitFor();
    const pushed = await readRemoteFiles(session.page, `${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    expect(Buffer.from(pushed['README.md'], 'base64').toString('utf8')).toBe('# remote change\n');
    expect(Buffer.from(pushed['asset.bin'], 'base64')).toEqual(Buffer.from([0, 255, 1, 2]));

    remoteConflict = true;
    await remoteGithub.locator('[data-github-push]').click();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '远端分支已变化' }).waitFor();
    result.remoteConflict = true;
    remoteConflict = false;

    apiOffline = true;
    await openRepositoryMenu(remoteGithub, 'clone');
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-open-remote]').click();
    await remoteGithub.locator('[data-github-error]').filter({ hasText: '无法连接 GitHub API' }).waitFor();
    result.networkFailure = true;
    apiOffline = false;

    await openRepositoryMenu(remoteGithub, 'clone');
    await remoteGithub.locator('[data-github-repository]').fill(`${PUBLIC_OWNER}/${PUBLIC_REPO}`);
    await remoteGithub.locator('[data-github-repository]').press('Enter');
    await remoteGithub
      .locator('[data-github-repository-name]')
      .filter({ hasText: `${PUBLIC_OWNER}/${PUBLIC_REPO}` })
      .waitFor();
    await showRepositoryFiles(remoteGithub);
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
    const stageCheckbox = changedFileCheckbox(remoteGithub, 'README.md');
    await expect(stageCheckbox).toBeEnabled();
    await stageCheckbox.focus();
    await stageCheckbox.press('Space');
    await expect(stageCheckbox).toBeChecked();
    await expect(stageCheckbox).toBeEnabled();
    const changedFile = remoteGithub.locator('[data-file-path="README.md"]');
    await expect(changedFile).toBeEnabled();
    await changedFile.focus();
    await changedFile.press('Enter');
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

    await page.getByRole('menuitem', { name: 'Repository', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Open in Terminal', exact: true }).click();
    await expect(win('terminal')).toHaveCount(1);
    expect(await session.helpers.runInShell('pwd', /\/Documents\/GitHub\/octo\/public/)).toBe(true);
    expect(await session.helpers.runInShell('git remote -v', /origin\s+https:\/\/github\.com\/octo\/public\.git/)).toBe(
      true
    );
    result.clonedRepositoryInTerminal = true;
    const outputOf = terminalOutput(session);
    expect(await outputOf('cd ~/Documents/GitHub/drop-fixture')).toBe('');
    expect(await outputOf(`git remote add origin https://github.com/${PUBLIC_OWNER}/${PUBLIC_REPO}.git`)).toBe('');
    expect(await outputOf('git push origin topic')).toBe('Pushed to origin');
    const topic = await readRemoteFiles(session.page, `${PUBLIC_OWNER}/${PUBLIC_REPO}`, 'topic');
    expect(topic).toEqual({ 'tracked.txt': Buffer.from('committed\n').toString('base64') });
    expect(await readRemoteFiles(session.page, `${PUBLIC_OWNER}/${PUBLIC_REPO}`)).toEqual(pushed);
    expect(await session.helpers.runInShell('git status --short', /MM\s+tracked\.txt/)).toBe(true);
    result.remotePush = true;
    result.workerFailureCoveredByUnitTests = true;

    await terminalRoundTrip(session);
    result.terminalRoundTrip = true;
    await closeAll();
    return { github: result };
  }
};
