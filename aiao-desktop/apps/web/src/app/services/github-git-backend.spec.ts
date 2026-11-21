import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitWorkbenchError } from './git/git-protocol';
import { GithubGitBackend } from './github-git-backend';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly messages: unknown[] = [];
  readonly terminate = vi.fn();
  shouldThrow = false;

  postMessage(value: unknown): void {
    if (this.shouldThrow) throw new Error('post failed');
    this.messages.push(value);
  }

  reply(id: number, result: unknown): void {
    this.onmessage?.({ data: { id, result } } as MessageEvent);
  }

  fail(id: number, code: string, message: string): void {
    this.onmessage?.({ data: { id, error: { code, message } } } as MessageEvent);
  }

  crash(message = 'worker crashed'): void {
    this.onerror?.({ message } as ErrorEvent);
  }

  messageError(): void {
    this.onmessageerror?.();
  }
}

const snapshot = {
  projectId: 'project',
  revision: 1,
  files: [{ path: 'README.md', bytes: [35, 32, 65, 10] }]
};

const worker = (value: FakeWorker): Worker => value as unknown as Worker;

describe('GitHub Git Worker backend', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('serializes requests and restores binary snapshot bytes', async () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));
    const pending = backend.create('project', [{ path: 'asset.bin', bytes: new Uint8Array([0, 255]) }]);
    expect(current.messages).toEqual([
      { id: 1, action: 'init', payload: { projectId: 'project', files: [{ path: 'asset.bin', bytes: [0, 255] }] } }
    ]);
    current.reply(1, snapshot);
    await expect(pending).resolves.toEqual({
      projectId: 'project',
      revision: 1,
      files: [{ path: 'README.md', bytes: new Uint8Array([35, 32, 65, 10]) }]
    });
  });

  it('maps coded worker errors and unknown codes to storage failure', async () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));
    const known = backend.open('project');
    current.fail(1, 'project_missing', 'missing');
    await expect(known).rejects.toMatchObject({ code: 'project_missing', message: 'missing' });

    const unknown = backend.open('project');
    current.fail(2, 'future_code', 'broken');
    await expect(unknown).rejects.toMatchObject({ code: 'storage_failed', message: 'broken' });
  });

  it('validates successful worker payloads before exposing them', async () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));

    const invalidSnapshot = backend.open('project');
    current.reply(1, { projectId: 'project', revision: 0, files: [] });
    await expect(invalidSnapshot).rejects.toMatchObject({ code: 'storage_failed', message: /invalid snapshot/ });

    const invalidStatus = backend.status('project');
    current.reply(2, { head: null, branch: 'main', raw: '', entries: [{ path: 'README.md' }] });
    await expect(invalidStatus).rejects.toMatchObject({ code: 'storage_failed', message: /invalid status\.entries/ });

    const invalidError = backend.open('project');
    current.onmessage?.({ data: { id: 3, error: { code: 1, message: 'bad' } } } as MessageEvent);
    await expect(invalidError).rejects.toMatchObject({ code: 'storage_failed', message: /invalid response/ });
  });

  it('rejects all pending calls after a worker crash and can restart once', async () => {
    const first = new FakeWorker();
    const second = new FakeWorker();
    let created = 0;
    const factory = vi.fn<() => Worker>(() => (created++ === 0 ? worker(first) : worker(second)));
    const backend = new GithubGitBackend(factory);
    const pending = backend.open('project');
    first.crash('quota');
    await expect(pending).rejects.toMatchObject({ code: 'storage_failed', message: 'quota' });
    backend.restart();
    const next = backend.open('project');
    expect(second.messages).toHaveLength(1);
    second.reply(2, snapshot);
    await expect(next).resolves.toMatchObject({ projectId: 'project' });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('ignores late messages and errors from an old worker after restart', async () => {
    const first = new FakeWorker();
    const second = new FakeWorker();
    let created = 0;
    const factory = vi.fn<() => Worker>(() => (created++ === 0 ? worker(first) : worker(second)));
    const backend = new GithubGitBackend(factory);
    const old = backend.open('project');
    backend.restart();
    await expect(old).rejects.toMatchObject({ code: 'storage_failed' });
    const current = backend.open('project');
    first.reply(1, snapshot);
    first.crash('late');
    expect(second.terminate).not.toHaveBeenCalled();
    second.reply(2, snapshot);
    await expect(current).resolves.toMatchObject({ projectId: 'project' });
  });

  it('turns messageerror and timeout into storage failures', async () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));
    const messageError = backend.open('project');
    current.messageError();
    await expect(messageError).rejects.toMatchObject({ code: 'storage_failed' });

    const timeoutWorker = new FakeWorker();
    const timeoutBackend = new GithubGitBackend(() => worker(timeoutWorker));
    const timed = timeoutBackend.open('project');
    vi.advanceTimersByTime(60_000);
    await expect(timed).rejects.toMatchObject({ code: 'storage_failed', message: /timed out/i });
  });

  it('forwards every public operation and restores serialized values', async () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));
    const status = { head: null, branch: 'main', raw: '', entries: [] };
    const diff = {
      projectId: 'project',
      path: 'README.md',
      kind: 'working' as const,
      base: { exists: true, binary: false, text: 'old', byteLength: 3 },
      modified: { exists: true, binary: false, text: 'new', byteLength: 3 }
    };
    const branches = [{ name: 'main', oid: null, current: true }];
    const commits = [{ oid: 'a'.repeat(40), message: 'initial' }];

    const open = backend.open('project');
    current.reply(1, snapshot);
    await expect(open).resolves.toMatchObject({ projectId: 'project' });

    const created = backend.create('project', [{ path: 'asset.bin', bytes: new Uint8Array([0, 255]) }]);
    current.reply(2, snapshot);
    await expect(created).resolves.toMatchObject({ files: [{ bytes: new Uint8Array([35, 32, 65, 10]) }] });

    const saved = backend.save('project', [], 1, ['old.ts']);
    current.reply(3, snapshot);
    await expect(saved).resolves.toMatchObject({ revision: 1 });

    const currentSnapshot = backend.snapshot('project');
    current.reply(4, snapshot);
    await expect(currentSnapshot).resolves.toMatchObject({ projectId: 'project' });

    const removed = backend.remove('project', 'old.ts');
    current.reply(5, snapshot);
    await expect(removed).resolves.toMatchObject({ projectId: 'project' });

    const renamed = backend.rename('project', 'old.ts', 'new.ts');
    current.reply(6, snapshot);
    await expect(renamed).resolves.toMatchObject({ projectId: 'project' });

    const moved = backend.move('project', 'old.ts', 'new.ts');
    current.reply(7, snapshot);
    await expect(moved).resolves.toMatchObject({ projectId: 'project' });

    const statusRequest = backend.status('project');
    current.reply(8, status);
    await expect(statusRequest).resolves.toEqual(status);

    const stage = backend.stage('project', ['README.md']);
    current.reply(9, status);
    await expect(stage).resolves.toEqual(status);

    const unstage = backend.unstage('project', ['README.md']);
    current.reply(10, status);
    await expect(unstage).resolves.toEqual(status);

    const readDiff = backend.readDiff('project', 'README.md', 'working');
    current.reply(11, diff);
    await expect(readDiff).resolves.toEqual(diff);

    const discarded = backend.discardWorking('project', 'README.md');
    current.reply(12, snapshot);
    await expect(discarded).resolves.toMatchObject({ projectId: 'project' });

    const committed = backend.commit('project', 'initial');
    current.reply(13, 'commit-1');
    await expect(committed).resolves.toBe('commit-1');

    const listedBranches = backend.branches('project');
    current.reply(14, branches);
    await expect(listedBranches).resolves.toEqual(branches);

    const createdBranch = backend.createBranch('project', 'feature');
    current.reply(15, branches);
    await expect(createdBranch).resolves.toEqual(branches);

    const checkedOut = backend.checkout('project', 'feature', true);
    current.reply(16, status);
    await expect(checkedOut).resolves.toEqual(status);

    const history = backend.history('project');
    current.reply(17, commits);
    await expect(history).resolves.toEqual(commits);

    const restored = backend.restore('project', commits[0].oid);
    current.reply(18, snapshot);
    await expect(restored).resolves.toMatchObject({ projectId: 'project' });

    const archive = backend.exportArchive('project');
    current.reply(19, [0, 255]);
    await expect(archive).resolves.toEqual(new Uint8Array([0, 255]));

    const imported = backend.importArchive('project', new Uint8Array([0, 255]));
    current.reply(20, snapshot);
    await expect(imported).resolves.toMatchObject({ projectId: 'project' });

    expect(current.messages).toEqual(
      expect.arrayContaining([
        {
          id: 3,
          action: 'save',
          payload: { projectId: 'project', files: [], expectedRevision: 1, removedPaths: ['old.ts'] }
        },
        { id: 10, action: 'unstage', payload: { projectId: 'project', paths: ['README.md'] } },
        { id: 16, action: 'checkout', payload: { projectId: 'project', branch: 'feature', force: true } },
        { id: 20, action: 'import', payload: { projectId: 'project', archive: [0, 255] } }
      ])
    );
  });

  it('cleans up a synchronously failed postMessage and rejects future calls after dispose', async () => {
    const current = new FakeWorker();
    current.shouldThrow = true;
    const backend = new GithubGitBackend(() => worker(current));
    await expect(backend.open('project')).rejects.toMatchObject({ code: 'storage_failed' });
    expect(current.terminate).toHaveBeenCalledOnce();

    backend.dispose();
    backend.restart();
    await expect(backend.open('project')).rejects.toMatchObject({ code: 'storage_failed' });
  });

  it('validates revisions before sending a save request', () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));
    expect(() => backend.save('project', [], 0)).toThrow('Invalid project revision');
    expect(() => backend.save('project', [], Number.NaN)).toThrow('Invalid project revision');
  });

  it('returns a typed GitWorkbenchError for worker failures', async () => {
    const current = new FakeWorker();
    const backend = new GithubGitBackend(() => worker(current));
    const pending = backend.open('project');
    current.fail(1, 'storage_failed', 'disk unavailable');
    await expect(pending).rejects.toBeInstanceOf(GitWorkbenchError);
  });
});
