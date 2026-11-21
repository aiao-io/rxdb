import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitBackend } from './git-backend.js';

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions
  ) {
    FakeWorker.instances.push(this);
  }
  postMessage(value: unknown): void {
    this.messages.push(value);
  }
  reply(result: unknown, id?: number): void {
    const request = this.messages.at(-1) as { id: number };
    this.onmessage?.({ data: { id: id ?? request.id, result } } as MessageEvent);
  }
  fail(code: string, message: string): void {
    const request = this.messages.at(-1) as { id: number };
    this.onmessage?.({ data: { id: request.id, error: { code, message } } } as MessageEvent);
  }
}

describe('Git Worker backend', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('location', { href: 'https://ide.example/' });
  });

  it('opens typed text and binary snapshots and keeps text saves comparable with editor buffers', async () => {
    const backend = createGitBackend('https://ide.example/assets/');
    const pending = backend.open('project');
    const worker = FakeWorker.instances[0];
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.messages[0]).toMatchObject({
      action: 'open',
      payload: { projectId: 'project', vendorBaseUrl: 'https://ide.example/assets/git/' }
    });
    worker.reply({
      projectId: 'project',
      revision: 1,
      files: [
        { path: 'main.ts', bytes: [104, 105] },
        { path: 'asset.bin', bytes: [0, 255] }
      ]
    });
    expect(await pending).toEqual({
      projectId: 'project',
      revision: '1',
      files: { 'main.ts': 'hi', 'asset.bin': new Uint8Array([0, 255]) }
    });
    const save = backend.save('project', { 'main.ts': 'changed', 'asset.bin': new Uint8Array([255]) }, '1');
    expect(worker.messages.at(-1)).toMatchObject({
      action: 'save',
      payload: {
        expectedRevision: 1,
        files: [
          { path: 'main.ts', content: 'changed' },
          { path: 'asset.bin', bytes: [255] }
        ]
      }
    });
    worker.reply({
      projectId: 'project',
      revision: 2,
      files: [{ path: 'main.ts', bytes: [...new TextEncoder().encode('changed')] }]
    });
    expect((await save).files['main.ts']).toBe('changed');
    backend.dispose();
  });

  it('does not convert invalid UTF-8 or binary files into editor text', async () => {
    const backend = createGitBackend('https://ide.example/assets/');
    const pending = backend.open('project');
    FakeWorker.instances[0].reply({
      projectId: 'project',
      revision: 1,
      files: [
        { path: 'invalid.ts', bytes: [255] },
        { path: 'asset.bin', bytes: [65] }
      ]
    });
    expect((await pending).files).toEqual({ 'invalid.ts': new Uint8Array([255]), 'asset.bin': new Uint8Array([65]) });
    backend.dispose();
  });

  it('把原子删除列表与保存revision送入同一Worker请求', async () => {
    const backend = createGitBackend('https://ide.example/assets/');
    const pending = backend.save('project', { 'new.ts': 'next' }, '1', ['old.ts']);
    const worker = FakeWorker.instances[0];
    expect(worker.messages.at(-1)).toMatchObject({
      action: 'save',
      payload: { projectId: 'project', expectedRevision: 1, removedPaths: ['old.ts'] }
    });
    worker.reply({ projectId: 'project', revision: 2, files: [{ path: 'new.ts', bytes: [110] }] });
    expect((await pending).revision).toBe('2');
    backend.dispose();
  });

  it('保留编辑文件BOM并映射取消暂存、差异和单文件丢弃', async () => {
    const backend = createGitBackend('https://ide.example/assets/');
    const worker = FakeWorker.instances[0];
    const open = backend.open('p');
    worker.reply({
      projectId: 'p',
      revision: 1,
      files: [{ path: 'main.ts', bytes: [...new TextEncoder().encode('\uFEFFtext\r\n')] }]
    });
    expect((await open).files['main.ts']).toBe('\uFEFFtext\r\n');
    const unstage = backend.unstage('p', ['main.ts']);
    worker.reply({});
    await unstage;
    expect(worker.messages.at(-1)).toMatchObject({
      action: 'unstage',
      payload: { projectId: 'p', paths: ['main.ts'] }
    });
    const diff = backend.readDiff('p', 'main.ts', 'staged');
    worker.reply({ path: 'main.ts', kind: 'staged' });
    expect(await diff).toEqual({ path: 'main.ts', kind: 'staged' });
    expect(worker.messages.at(-1)).toMatchObject({ action: 'readDiff', payload: { path: 'main.ts', kind: 'staged' } });
    const discard = backend.discardWorking('p', 'main.ts');
    worker.reply({ projectId: 'p', revision: 2, files: [{ path: 'main.ts', bytes: [97] }] });
    expect((await discard).files['main.ts']).toBe('a');
    backend.dispose();
  });

  it('dispatches create, status, stage, commit, history, restore and archive operations', async () => {
    const backend = createGitBackend('https://ide.example/assets');
    const worker = FakeWorker.instances[0];
    const created = backend.create('p', { 'main.ts': 'new' });
    worker.reply({ projectId: 'p', revision: 1, files: [] });
    expect((await created).projectId).toBe('p');
    const status = backend.status('p');
    worker.reply({ branch: 'main', head: null, entries: [] });
    expect((await status).branch).toBe('main');
    const staged = backend.stage('p', ['main.ts']);
    worker.reply({});
    await staged;
    const committed = backend.commit('p', 'message');
    worker.reply('abc');
    expect(await committed).toBe('abc');
    const history = backend.history('p');
    worker.reply([{ oid: 'abc', message: 'message' }]);
    expect(await history).toHaveLength(1);
    const restored = backend.restore('p', 'abc');
    worker.reply({ projectId: 'p', revision: 3, files: [] });
    expect((await restored).revision).toBe('3');
    const exported = backend.exportArchive('p');
    worker.reply([0, 255]);
    expect(await exported).toEqual(new Uint8Array([0, 255]));
    const imported = backend.importArchive('new-p', new Uint8Array([1, 2]));
    worker.reply({});
    await imported;
    const removed = backend.remove('p', 'main.ts');
    worker.reply({});
    await removed;
    const renamed = backend.rename('p', 'before', 'after');
    worker.reply({});
    await renamed;
    const moved = backend.move('p', 'before', 'after');
    worker.reply({});
    await moved;
    expect(worker.messages).toHaveLength(11);
    backend.dispose();
  });

  it('propagates stable errors, rejects pending work on dispose and ignores foreign responses', async () => {
    const backend = createGitBackend('https://ide.example/assets/');
    const worker = FakeWorker.instances[0];
    const failed = backend.open('missing');
    worker.reply('foreign', 999);
    worker.fail('project_missing', 'missing');
    await expect(failed).rejects.toMatchObject({ code: 'project_missing', message: 'missing' });
    const pending = backend.open('pending');
    backend.dispose();
    await expect(pending).rejects.toThrow(/closed/i);
    await expect(backend.open('closed')).rejects.toThrow(/closed/i);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects malformed revisions and shuts down a crashed Worker', async () => {
    const backend = createGitBackend('https://ide.example/assets/');
    await expect(backend.save('p', {}, 'wrong')).rejects.toThrow(/revision/i);
    const pending = backend.open('p');
    FakeWorker.instances[0].onerror?.({ message: 'Worker crashed' } as ErrorEvent);
    await expect(pending).rejects.toThrow('Worker crashed');
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
});
