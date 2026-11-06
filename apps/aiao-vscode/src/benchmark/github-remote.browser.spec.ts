import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkbenchStatus } from '../workbench/session.js';

interface ApiEvent {
  readonly kind: string;
  readonly sha?: string;
  readonly tree?: string;
  readonly parents?: readonly string[];
  readonly force?: boolean;
  readonly ref?: string;
}

interface ProbeSnapshot {
  readonly revision: string;
  readonly files: Readonly<Record<string, string>>;
  readonly status: WorkbenchStatus;
  readonly stagedText: string | null;
  readonly remoteHead: string;
  readonly events: readonly ApiEvent[];
  readonly errors: readonly { readonly code?: string; readonly message: string }[];
}

type ProbeAction = 'snapshot' | 'edit' | 'advance';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
let browser: Browser;
let page: Page;
let directory: string;
let closeServer: () => Promise<void>;
const browserErrors: string[] = [];

function fixtureSource(): string {
  return `
import { createGitHubBackend } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/git/github/github-backend.ts'))};
import { GitHubApiError } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/git/github/github-types.ts'))};
import { WorkbenchSession } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/session.ts'))};
import { createWorkbenchScm } from ${JSON.stringify(resolve(workspaceRoot, 'apps/aiao-vscode/src/workbench/workbench-scm.ts'))};

const id = 'github:example/browser-probe@main';
const encoder = new TextEncoder();
const events = [];
const errors = [];
const trees = new Map([['tree-1', { 'a.ts': 'initial local file', 'remote.txt': 'initial remote file' }]]);
const commits = new Map([['head-1', { sha: 'head-1', treeSha: 'tree-1', parents: [], message: 'initial' }]]);
let remoteHead = 'head-1';
let treeCount = 1;
let commitCount = 0;
let remoteCount = 0;

function advance(changes) {
  const head = commits.get(remoteHead);
  const treeSha = 'remote-tree-' + ++remoteCount;
  const sha = 'remote-head-' + remoteCount;
  trees.set(treeSha, { ...trees.get(head.treeSha), ...changes });
  commits.set(sha, { sha, treeSha, parents: [remoteHead], message: 'remote update' });
  remoteHead = sha;
  events.push({ kind: 'remote-update', sha });
}

const api = {
  async getBranchSha() {
    events.push({ kind: 'read-head', sha: remoteHead });
    return remoteHead;
  },
  async getCommit(_owner, _repo, sha) {
    const commit = commits.get(sha);
    if (!commit) throw new Error('Unknown commit: ' + sha);
    return commit;
  },
  async getTreeFiles(_owner, _repo, treeSha) {
    return Object.keys(trees.get(treeSha)).sort().map(path => ({ path, sha: treeSha + ':' + path, mode: '100644' }));
  },
  async getFileContents(_owner, _repo, path, ref) {
    return encoder.encode(trees.get(commits.get(ref).treeSha)[path]);
  },
  async createTree(_owner, _repo, baseTree, items) {
    const files = { ...trees.get(baseTree) };
    for (const item of items) {
      if (item.sha === null) delete files[item.path];
      else files[item.path] = item.content;
    }
    const sha = 'tree-' + ++treeCount;
    trees.set(sha, files);
    events.push({ kind: 'create-tree', sha });
    return sha;
  },
  async createCommit(_owner, _repo, message, treeSha, parents) {
    const sha = 'commit-' + ++commitCount;
    commits.set(sha, { sha, treeSha, parents, message });
    events.push({ kind: 'create-commit', sha, tree: treeSha, parents });
    return sha;
  },
  async updateRef(_owner, _repo, ref, sha, force) {
    events.push({ kind: 'update-ref', sha, ref, force });
    if (force || !commits.get(sha).parents.includes(remoteHead)) {
      throw new GitHubApiError('conflict', 'Remote branch advanced', 422);
    }
    remoteHead = sha;
  },
  async listCommits(_owner, _repo, ref) {
    const commit = commits.get(ref);
    return [{ oid: ref, message: commit.message }];
  },
  clearCache() {}
};

const backend = createGitHubBackend({ api });
const session = new WorkbenchSession(backend);
let scm;
async function refresh() {
  scm.update(await backend.status(id));
}
scm = createWorkbenchScm(document.querySelector('#scm'), {
  backend,
  session,
  onOpenDiff() {},
  onOpenFile() {},
  onError(cause) { errors.push({ code: cause.code, message: cause.message }); },
  onRefresh: refresh,
  async onDidChange(snapshot, paths) {
    if (snapshot) session.applySavedSnapshot(snapshot, paths ?? []);
    await refresh();
  }
});
session.subscribe(state => scm.setBusy(state.busy));
await session.open(id);
await refresh();

globalThis.githubRemoteProbe = {
  async dispatch(action, payload) {
    if (action === 'edit') {
      session.edit(payload.path, payload.content);
      await session.save();
      await refresh();
      return;
    }
    if (action === 'advance') return advance(payload);
    if (action !== 'snapshot') throw new Error('Unknown probe action');
    return {
      revision: session.state.revision,
      files: session.state.files,
      status: await backend.status(id),
      stagedText: (await backend.readDiff(id, 'a.ts', 'staged')).modified.text,
      remoteHead,
      events,
      errors
    };
  }
};
`;
}

async function probe<T>(action: ProbeAction, payload?: Readonly<Record<string, string>>): Promise<T> {
  return page.evaluate(
    ({ action, payload }) => {
      const target = globalThis as unknown as {
        githubRemoteProbe: { dispatch(action: ProbeAction, payload?: Readonly<Record<string, string>>): Promise<T> };
      };
      return target.githubRemoteProbe.dispatch(action, payload);
    },
    { action, payload }
  );
}

const snapshot = (): Promise<ProbeSnapshot> => probe('snapshot');
const updates = (state: ProbeSnapshot): readonly ApiEvent[] => state.events.filter(event => event.kind === 'update-ref');

describe('GitHub remote source control in Chromium', () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aiao-github-remote-'));
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
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>GitHub remote probe</title><div id="scm"></div><script type="module" src="/probe.js"></script>');
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
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction('Boolean(globalThis.githubRemoteProbe)');
  });

  afterAll(async () => {
    await browser?.close();
    await closeServer?.();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('commits and pushes, safely pulls and syncs, and preserves conflicting staged edits', async () => {
    const commit = page.locator('[data-scm-action="commit"]');
    expect(await commit.textContent()).toContain('提交并推送');
    await probe('edit', { path: 'a.ts', content: 'first local change' });
    await page.getByRole('button', { name: '暂存所有更改', exact: true }).click();
    await expect.poll(async () => (await snapshot()).stagedText).toBe('first local change');
    await page.getByRole('textbox', { name: '提交说明', exact: true }).fill('first browser commit');
    await commit.click();
    await expect.poll(async () => updates(await snapshot()).length).toBe(1);
    await expect.poll(async () => (await snapshot()).status.entries).toEqual([]);
    let state = await snapshot();
    expect(updates(state)).toEqual([{ kind: 'update-ref', sha: 'commit-1', ref: 'heads/main', force: false }]);
    expect(state.status.head).toBe('commit-1');
    expect(state.remoteHead).toBe('commit-1');

    await probe('edit', { path: 'a.ts', content: 'local edit after commit' });
    await probe('advance', { 'remote.txt': 'remote change for pull' });
    await page.getByRole('button', { name: '拉取', exact: true }).click();
    await expect.poll(async () => (await snapshot()).files['remote.txt']).toBe('remote change for pull');
    state = await snapshot();
    expect(state.files['a.ts']).toBe('local edit after commit');
    expect(updates(state)).toHaveLength(1);

    await page.getByRole('button', { name: '暂存所有更改', exact: true }).click();
    await expect.poll(async () => (await snapshot()).stagedText).toBe('local edit after commit');
    await probe('advance', { 'remote.txt': 'remote change for sync' });
    const beforeSync = await snapshot();
    await page.getByRole('textbox', { name: '提交说明', exact: true }).fill('sync browser changes');
    await page.getByRole('button', { name: '同步更改', exact: true }).click();
    await expect.poll(async () => updates(await snapshot()).length).toBe(2);
    await expect.poll(async () => (await snapshot()).status.entries).toEqual([]);
    state = await snapshot();
    expect(state.files).toEqual({ 'a.ts': 'local edit after commit', 'remote.txt': 'remote change for sync' });
    const syncEvents = state.events.slice(beforeSync.events.length);
    expect(syncEvents.findIndex(event => event.kind === 'read-head')).toBeLessThan(
      syncEvents.findIndex(event => event.kind === 'create-tree')
    );
    expect(syncEvents.find(event => event.kind === 'create-commit')?.parents).toEqual([beforeSync.remoteHead]);
    expect(updates(state).every(event => event.force === false)).toBe(true);

    await probe('edit', { path: 'a.ts', content: 'staged conflicting local edit' });
    await page.getByRole('button', { name: '暂存所有更改', exact: true }).click();
    await expect.poll(async () => (await snapshot()).stagedText).toBe('staged conflicting local edit');
    await probe('advance', { 'a.ts': 'conflicting remote edit' });
    const beforeConflict = await snapshot();
    await page.getByRole('textbox', { name: '提交说明', exact: true }).fill('must not overwrite remote');
    await page.getByRole('button', { name: '同步更改', exact: true }).click();
    await expect.poll(async () => (await snapshot()).errors.length).toBe(1);
    state = await snapshot();
    expect(updates(state)).toHaveLength(2);
    expect(state.files).toEqual(beforeConflict.files);
    expect(state.status).toEqual(beforeConflict.status);
    expect(state.revision).toBe(beforeConflict.revision);
    expect(state.stagedText).toBe('staged conflicting local edit');
    expect(state.errors[0].code).toBe('remote_conflict');
    expect(browserErrors).toEqual([]);
  });
});
