import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  initialize: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
  snapshot: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  move: vi.fn(),
  status: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  readDiff: vi.fn(),
  discardWorking: vi.fn(),
  commit: vi.fn(),
  history: vi.fn(),
  restore: vi.fn(),
  exportArchive: vi.fn(),
  importArchive: vi.fn(),
  memoryBytes: 64
}));
vi.mock('./git-runtime.js', () => ({ GitWorkbenchRuntime: { create: vi.fn(async () => fixture) } }));

describe('Git Worker protocol', () => {
  let scope: {
    location: { origin: string };
    postMessage: ReturnType<typeof vi.fn>;
    onmessage: (event: MessageEvent) => void;
  };
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const method of Object.values(fixture)) if (typeof method === 'function') method.mockResolvedValue(undefined);
    scope = { location: { origin: 'https://ide.example' }, postMessage: vi.fn(), onmessage: () => undefined };
    vi.stubGlobal('self', scope);
    await import('./git-worker.js');
  });

  const payload = {
    projectId: 'project',
    files: [
      { path: 'main.ts', content: 'code' },
      { path: 'asset.bin', bytes: [255] }
    ],
    paths: ['main.ts'],
    path: 'old.ts',
    destination: 'new.ts',
    message: 'message',
    oid: 'a'.repeat(40),
    archive: [0, 255],
    expectedRevision: 1,
    kind: 'staged' as const
  };

  function request(data: unknown, event: Partial<MessageEvent> = {}): void {
    scope.onmessage({ data, origin: '', source: null, isTrusted: true, ...event } as MessageEvent);
  }

  it.each([{ origin: 'https://untrusted.example' }, { isTrusted: false }, { source: {} as Window }])(
    '拒绝非专用 Worker 通道消息 %o',
    async event => {
      request({ id: 1, action: 'open', payload }, event);
      await Promise.resolve();
      expect(fixture.open).not.toHaveBeenCalled();
      expect(scope.postMessage).not.toHaveBeenCalled();
    }
  );

  it.each([
    'init',
    'open',
    'save',
    'snapshot',
    'remove',
    'rename',
    'move',
    'status',
    'stage',
    'unstage',
    'readDiff',
    'discardWorking',
    'commit',
    'history',
    'restore',
    'export',
    'import',
    'metrics'
  ])('dispatches %s with a matching request identifier', async action => {
    request({ id: 7, action, payload });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith({
        id: 7,
        result: action === 'metrics' ? { memoryBytes: 64 } : undefined
      })
    );
    if (action === 'init')
      expect(fixture.initialize).toHaveBeenCalledWith('project', [
        { path: 'main.ts', bytes: new TextEncoder().encode('code') },
        { path: 'asset.bin', bytes: new Uint8Array([255]) }
      ]);
    if (action === 'save') expect(fixture.save).toHaveBeenCalledWith('project', expect.any(Array), 1);
    if (action === 'rename') expect(fixture.rename).toHaveBeenCalledWith('project', 'old.ts', 'new.ts');
    if (action === 'move') expect(fixture.move).toHaveBeenCalledWith('project', 'old.ts', 'new.ts');
    if (action === 'readDiff') expect(fixture.readDiff).toHaveBeenCalledWith('project', 'old.ts', 'staged');
  });

  it('serializes snapshots and binary exports without losing bytes', async () => {
    fixture.snapshot.mockResolvedValueOnce({
      files: [{ path: 'asset.bin', bytes: new Uint8Array([0, 255]) }],
      revision: 1
    });
    request({ id: 3, action: 'snapshot', payload });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith({
        id: 3,
        result: { files: [{ path: 'asset.bin', bytes: [0, 255] }], revision: 1 }
      })
    );
  });

  it('reports coded runtime failures and rejects unknown commands', async () => {
    fixture.open.mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'storage_failed' }));
    request({ id: 1, action: 'open', payload });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith({ id: 1, error: { code: 'storage_failed', message: 'quota' } })
    );
    request({ id: 2, action: 'unknown', payload });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith({
        id: 2,
        error: { code: 'storage_failed', message: 'Unknown Git action: unknown' }
      })
    );
  });

  it('差异读取必须显式声明暂存区或工作区，不隐式改读另一侧', async () => {
    request({ id: 4, action: 'readDiff', payload: { projectId: 'project', path: 'main.ts' } });
    await vi.waitFor(() =>
      expect(scope.postMessage).toHaveBeenCalledWith({
        id: 4,
        error: { code: 'invalid_path', message: 'readDiff requires working or staged kind' }
      })
    );
    expect(fixture.readDiff).not.toHaveBeenCalled();
  });
});
