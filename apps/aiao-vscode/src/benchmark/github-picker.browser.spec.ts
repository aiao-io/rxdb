import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GitHubRemoteTarget } from '../workbench/git/github/github-picker.js';

interface ProbeEvent {
  readonly kind: string;
  readonly query?: string;
  readonly owner?: string;
  readonly repo?: string;
}

interface ProbeConfig {
  readonly authenticated?: boolean;
  readonly deferredQueries?: readonly string[];
  readonly failMyRepositoriesOnce?: boolean;
}

interface ProbeSnapshot {
  readonly settled: boolean;
  readonly result: GitHubRemoteTarget | null;
  readonly events: readonly ProbeEvent[];
  readonly loginCalls: number;
}

type ProbeAction = 'configure' | 'snapshot' | 'release-query' | 'finish-login';
type ProbePayload = ProbeConfig | { readonly query: string };

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
let browser: Browser;
let page: Page;
let directory: string;
let fixtureUrl: string;
let closeServer: () => Promise<void>;
const browserErrors: string[] = [];

function fixtureSource(): string {
  return `
import { requestGitHubRepository } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/git/github/github-picker.ts'))};
import { GitHubApiError } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/git/github/github-types.ts'))};

let config = {};
let authenticated = true;
let settled = false;
let result = null;
let loginCalls = 0;
let finishLogin;
let listFailures = 0;
const events = [];
const pendingQueries = new Map();
const summary = name => ({ fullName: 'example/' + name, description: name + ' repository', stars: 1, cloneUrl: '', isPrivate: false });
const requireAuthentication = () => {
  if (!authenticated) throw new GitHubApiError('auth_required', '请登录 GitHub', 401);
};
const api = {
  async listMyRepositories() {
    events.push({ kind: 'list-my-repositories' });
    requireAuthentication();
    if (config.failMyRepositoriesOnce && listFailures++ === 0) {
      throw new GitHubApiError('network_failed', '仓库加载失败', 503);
    }
    return [summary('mine-one'), summary('mine-two')];
  },
  async searchRepositories(query) {
    events.push({ kind: 'search', query });
    requireAuthentication();
    if (config.deferredQueries?.includes(query)) {
      return new Promise(resolveQuery => pendingQueries.set(query, resolveQuery));
    }
    return [summary(query)];
  },
  async getRepository(owner, repo) {
    events.push({ kind: 'get-repository', owner, repo });
    return { owner, repo, defaultBranch: repo === 'mine-two' ? 'develop' : 'main', isPrivate: false };
  },
  async listBranches() {
    events.push({ kind: 'list-branches' });
    throw new Error('Opening a repository must not enumerate branches');
  }
};

document.querySelector('#opener').onclick = () => {
  void requestGitHubRepository(document.querySelector('#host'), api, {
    recentRepositories: [{ owner: 'example', repo: 'recent', branch: 'release' }],
    onLogin() {
      loginCalls++;
      events.push({ kind: 'login' });
      return new Promise(resolveLogin => { finishLogin = resolveLogin; });
    }
  }).then(value => { result = value; settled = true; });
};

globalThis.githubPickerProbe = {
  async dispatch(action, payload) {
    if (action === 'configure') {
      config = payload;
      authenticated = config.authenticated !== false;
      return;
    }
    if (action === 'release-query') {
      const resolveQuery = pendingQueries.get(payload.query);
      if (!resolveQuery) throw new Error('No pending query: ' + payload.query);
      pendingQueries.delete(payload.query);
      resolveQuery([summary(payload.query)]);
      await Promise.resolve();
      await Promise.resolve();
      return;
    }
    if (action === 'finish-login') {
      if (!finishLogin) throw new Error('Login has not started');
      authenticated = true;
      finishLogin();
      return;
    }
    if (action !== 'snapshot') throw new Error('Unknown probe action: ' + action);
    return { settled, result, events, loginCalls };
  }
};
`;
}

async function probe<T>(action: ProbeAction, payload?: ProbePayload): Promise<T> {
  return page.evaluate(
    ({ action, payload }) => {
      const target = globalThis as unknown as {
        githubPickerProbe: { dispatch(action: ProbeAction, payload?: ProbePayload): Promise<T> };
      };
      return target.githubPickerProbe.dispatch(action, payload);
    },
    { action, payload }
  );
}

const snapshot = (): Promise<ProbeSnapshot> => probe('snapshot');
const input = (): Locator => page.getByRole('combobox');
const action = (name: string): Locator => page.locator(`[data-github-action="${name}"]`);
const repository = (name: string): Locator => page.getByRole('option').filter({ hasText: `example/${name}` });

async function openPicker(config: ProbeConfig = {}): Promise<void> {
  await probe('configure', config);
  await page.getByRole('button', { name: '打开测试仓库', exact: true }).click();
  await input().waitFor({ state: 'visible' });
}

async function openGitHub(config: ProbeConfig = {}): Promise<void> {
  await openPicker(config);
  await action('provider').click();
}

async function waitForResult(result: GitHubRemoteTarget | null): Promise<void> {
  await expect.poll(async () => (await snapshot()).settled, { timeout: 10000 }).toBe(true);
  expect((await snapshot()).result).toEqual(result);
  expect(await page.locator('dialog[open]').count()).toBe(0);
}

async function waitForQuery(query: string): Promise<void> {
  await expect.poll(async () => (await snapshot()).events.some(event => event.query === query), { timeout: 10000 }).toBe(true);
}

describe('GitHub repository Quick Pick in Chromium', () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aiao-github-picker-'));
    await build({
      stdin: { contents: fixtureSource(), resolveDir: workspaceRoot },
      outfile: join(directory, 'probe.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022'
    });
    const server = createServer(async (request, response) => {
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          '<!doctype html><meta charset="utf-8"><title>GitHub picker probe</title><button id="opener">打开测试仓库</button><div id="host"></div><script type="module" src="/probe.js"></script>'
        );
        return;
      }
      if (request.url !== '/probe.js') {
        response.writeHead(404).end();
        return;
      }
      response.setHeader('Content-Type', 'text/javascript');
      response.end(await readFile(join(directory, 'probe.js')));
    });
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    closeServer = () =>
      new Promise<void>((resolveClose, reject) => server.close(error => (error ? reject(error) : resolveClose())));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server has no TCP address');
    fixtureUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => browserErrors.push(error.message));
  });

  beforeEach(async () => {
    browserErrors.length = 0;
    await page.goto(fixtureUrl);
    await page.waitForFunction('Boolean(globalThis.githubPickerProbe)');
  });

  afterEach(() => {
    expect(browserErrors).toEqual([]);
  });

  afterAll(async () => {
    await browser?.close();
    await closeServer?.();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('starts with a provider and recents, then accepts a default branch using only the keyboard', async () => {
    await openPicker();
    expect(await action('provider').count()).toBe(1);
    expect(await action('recent').textContent()).toContain('example/recent');
    expect((await snapshot()).events).toEqual([]);

    await input().press('Enter');
    await repository('mine-one').waitFor({ state: 'visible' });
    await input().press('ArrowDown');
    await input().press('ArrowUp');
    await input().press('ArrowDown');
    await input().press('Enter');

    await waitForResult({ owner: 'example', repo: 'mine-two', branch: 'develop' });
    expect((await snapshot()).events).toEqual([
      { kind: 'list-my-repositories' },
      { kind: 'get-repository', owner: 'example', repo: 'mine-two' }
    ]);
  });

  it('accepts a public tree URL immediately and preserves a branch containing slashes', async () => {
    await openPicker({ authenticated: false });
    await input().fill('https://github.com/example/public/tree/feature/browser');
    await input().press('Enter');

    await waitForResult({ owner: 'example', repo: 'public', branch: 'feature/browser' });
    expect((await snapshot()).events).toEqual([{ kind: 'get-repository', owner: 'example', repo: 'public' }]);
    expect((await snapshot()).loginCalls).toBe(0);
  });

  it('reopens a recent repository on its recorded branch', async () => {
    await openPicker();
    await action('recent').click();

    await waitForResult({ owner: 'example', repo: 'recent', branch: 'release' });
    expect((await snapshot()).events.some(event => event.kind === 'list-branches')).toBe(false);
  });

  it('preserves both step inputs when going back and restores focus on Escape', async () => {
    await openPicker();
    await input().fill('initial-query');
    await action('provider').click();
    await input().fill('back-query');
    await repository('back-query').waitFor({ state: 'visible' });
    await action('back').click();
    expect(await input().inputValue()).toBe('initial-query');
    await action('provider').click();
    expect(await input().inputValue()).toBe('back-query');
    await repository('back-query').waitFor({ state: 'visible' });

    await input().press('Escape');
    await waitForResult(null);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('opener');
  });

  it('keeps newer search results when an older request finishes later', async () => {
    await openGitHub({ deferredQueries: ['slow'] });
    await input().fill('slow');
    await waitForQuery('slow');
    await input().fill('latest');
    await repository('latest').waitFor({ state: 'visible' });
    await probe('release-query', { query: 'slow' });

    expect(await repository('slow').count()).toBe(0);
    expect(await repository('latest').count()).toBe(1);
    await input().press('Enter');
    await waitForResult({ owner: 'example', repo: 'latest', branch: 'main' });
  });

  it('invalidates a pending search as soon as input changes, before the next debounce fires', async () => {
    await openGitHub({ deferredQueries: ['slow'] });
    await input().fill('slow');
    await waitForQuery('slow');
    await input().evaluate(async element => {
      const target = globalThis as unknown as {
        githubPickerProbe: { dispatch(action: ProbeAction, payload?: ProbePayload): Promise<void> };
      };
      (element as HTMLInputElement).value = 'next';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await target.githubPickerProbe.dispatch('release-query', { query: 'slow' });
    });

    expect(await input().inputValue()).toBe('next');
    expect(await repository('slow').count()).toBe(0);
    await repository('next').waitFor({ state: 'visible' });
    await input().press('Enter');
    await waitForResult({ owner: 'example', repo: 'next', branch: 'main' });
  });

  it('starts login once and automatically resumes the failed repository request', async () => {
    await openGitHub({ authenticated: false });
    await action('login').waitFor({ state: 'visible' });
    await input().press('Enter');
    await input().press('Enter');
    expect((await snapshot()).loginCalls).toBe(1);
    expect((await snapshot()).events.filter(event => event.kind === 'list-my-repositories')).toHaveLength(1);

    await probe('finish-login');
    await repository('mine-one').waitFor({ state: 'visible' });
    expect((await snapshot()).events.filter(event => event.kind === 'list-my-repositories')).toHaveLength(2);
    await input().press('Enter');
    await waitForResult({ owner: 'example', repo: 'mine-one', branch: 'main' });
    expect((await snapshot()).loginCalls).toBe(1);
  });

  it('retries a failed request without closing the picker', async () => {
    await openGitHub({ failMyRepositoriesOnce: true });
    await action('retry').waitFor({ state: 'visible' });
    expect((await snapshot()).settled).toBe(false);
    await action('retry').click();
    await repository('mine-one').waitFor({ state: 'visible' });
    await input().press('Enter');

    await waitForResult({ owner: 'example', repo: 'mine-one', branch: 'main' });
    expect((await snapshot()).events.filter(event => event.kind === 'list-my-repositories')).toHaveLength(2);
  });

  it('ignores a response arriving after Escape and keeps focus on the original control', async () => {
    await openGitHub({ deferredQueries: ['cancelled'] });
    await input().fill('cancelled');
    await waitForQuery('cancelled');
    await input().press('Escape');
    await waitForResult(null);
    await probe('release-query', { query: 'cancelled' });

    expect(await page.locator('dialog').count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('opener');
    expect((await snapshot()).result).toBeNull();
  });
});
