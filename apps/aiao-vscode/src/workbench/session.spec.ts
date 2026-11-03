import { describe, expect, it, vi } from 'vitest';
import { createSavePreviewController } from './save-preview.js';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchFiles } from './session.js';

function fixture() {
  let revision = '1';
  let files: WorkbenchFiles = { 'main.ts': 'console.log(1)' };
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision, files: { ...files } })),
    save: vi.fn(async (projectId, changes, expected) => {
      if (expected !== revision) throw new Error('文件已被其他标签修改');
      files = { ...files, ...changes };
      revision = String(Number(revision) + 1);
      return { projectId, revision, files: { ...files } };
    }),
    status: vi.fn(async () => ({ branch: 'main', head: null, entries: [] })),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    readDiff: vi.fn<WorkbenchBackend['readDiff']>(async (projectId, path, kind) => ({
      projectId,
      path,
      kind,
      base: { exists: true, binary: false, text: '', byteLength: 0 },
      modified: { exists: true, binary: false, text: '', byteLength: 0 }
    })),
    discardWorking: vi.fn(async projectId => ({ projectId, revision: '2', files: {} })),
    commit: vi.fn(async () => 'abc'),
    history: vi.fn(async () => []),
    restore: vi.fn(async projectId => ({ projectId, revision, files: { ...files } })),
    create: vi.fn(async (projectId, initial) => ({ projectId, revision, files: initial })),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    exportArchive: vi.fn(async () => new Uint8Array()),
    importArchive: vi.fn(async () => undefined),
    dispose: vi.fn()
  };
  return { backend };
}

describe('WorkbenchSession', () => {
  it('保存失败保留缓冲，不把失败 revision 标成已保存', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'changed');
    vi.mocked(backend.save).mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(session.save()).rejects.toThrow('quota exceeded');
    expect(session.state.files['main.ts']).toBe('changed');
    expect(session.state.dirty).toBe(true);
    expect(session.state.revision).toBe('1');
  });

  it('restoreTabs 过滤不存在路径并恢复活动文件', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    expect(() => session.restoreTabs(['main.ts'], null)).not.toThrow();
    expect(session.state.tabs).toEqual(['main.ts']);
    expect(session.state.activePath).toBe('main.ts');
    session.restoreTabs(['missing.ts', 'main.ts'], 'missing.ts');
    expect(session.state.tabs).toEqual(['main.ts']);
    expect(session.state.activePath).toBe('main.ts');
    expect(() => session.restoreTabs([], null)).not.toThrow();
    expect(session.state.tabs).toEqual([]);
    expect(session.state.activePath).toBeNull();
    session.dispose();
  });

  it('保存回执不覆盖保存期间的新输入', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'second');
    let finish!: (value: Awaited<ReturnType<WorkbenchBackend['save']>>) => void;
    vi.mocked(backend.save).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = session.save();
    session.edit('main.ts', 'third');
    finish({ projectId: 'first', revision: '2', files: { 'main.ts': 'second' } });
    await pending;
    expect(session.state.files['main.ts']).toBe('third');
    expect(session.state.dirty).toBe(true);
    expect(session.state.revision).toBe('2');
  });

  it('项目切换丢弃迟到的读取结果', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    let finish!: (value: Awaited<ReturnType<WorkbenchBackend['open']>>) => void;
    vi.mocked(backend.open).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const previous = session.open('first');
    await session.open('second');
    finish({ projectId: 'first', revision: '1', files: { 'old.ts': 'old' } });
    await previous;
    expect(session.state.projectId).toBe('second');
    expect(session.state.files['old.ts']).toBeUndefined();
  });

  it('运行先保存，并拒绝迟到的旧编译结果', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'second');
    let finish!: (value: { js: string; css: string }) => void;
    const compile = vi.fn(
      () =>
        new Promise<{ js: string; css: string }>(resolve => {
          finish = resolve;
        })
    );
    const pending = session.run(compile);
    await vi.waitFor(() => expect(compile).toHaveBeenCalled());
    expect(backend.save).toHaveBeenCalled();
    await session.open('second');
    finish({ js: 'old', css: '' });
    await pending;
    expect(session.state.preview).toBeNull();
  });

  it('切换项目和历史恢复不会静默丢弃缓冲', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'unsaved');
    await expect(session.open('second')).rejects.toThrow('未保存');
    await expect(session.restore('abc')).rejects.toThrow('未保存');
    expect(backend.restore).not.toHaveBeenCalled();
  });

  it('关闭会话释放后端并停止派发', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    const listener = vi.fn();
    const release = session.subscribe(listener);
    await session.open('first');
    release();
    const count = listener.mock.calls.length;
    session.dispose();
    expect(backend.dispose).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(count);
    expect(() => session.edit('main.ts', 'x')).toThrow('已关闭');
  });

  it('创建、编辑、撤销缓冲与标签切换保持保存状态', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.create('new', { 'main.ts': 'first', 'data.bin': new Uint8Array([255]) });
    expect(session.state.tabs).toEqual(['main.ts']);
    session.select('data.bin');
    session.closeTab('data.bin');
    expect(session.state.activePath).toBe('main.ts');
    session.edit('main.ts', 'second');
    session.discard();
    expect(session.state.files['main.ts']).toBe('first');
    expect(session.state.dirty).toBe(false);
    await session.save();
    expect(backend.save).not.toHaveBeenCalled();
    session.closeTab('main.ts');
    expect(session.state.activePath).toBeNull();
    expect(() => session.select('missing')).toThrow('文件不存在');
  });

  it('干净状态允许重命名、删除和恢复，并刷新文件与预览', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    await session.rename('main.ts', 'renamed.ts');
    expect(backend.rename).toHaveBeenCalledWith('first', 'main.ts', 'renamed.ts');
    await session.remove('main.ts');
    expect(backend.remove).toHaveBeenCalledWith('first', 'main.ts');
    await session.run(async () => ({ js: 'compiled', css: '' }));
    expect(session.state.preview?.js).toBe('compiled');
    await session.restore('commit');
    expect(session.state.revision).toBe('1');
    expect(session.state.preview).toBeNull();
    session.dispose();
    session.dispose();
    expect(backend.dispose).toHaveBeenCalledOnce();
  });

  it('打开和编译失败可观测，编译失败保留上次成功预览', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    vi.mocked(backend.open).mockRejectedValueOnce(new Error('open failed'));
    await expect(session.open('first')).rejects.toThrow('open failed');
    expect(session.state.error).toBe('open failed');
    expect(session.state.busy).toBe(false);
    await session.open('first');
    await session.run(async () => ({ js: 'previous', css: '' }));
    await expect(
      session.run(async () => {
        throw new Error('compile failed');
      })
    ).rejects.toThrow('compile failed');
    expect(session.state.preview?.js).toBe('previous');
    expect(session.state.error).toBe('compile failed');
    expect(session.state.busy).toBe(false);
  });

  it('保存合并重复请求，保存期间继续输入时拒绝运行', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'second');
    let finish!: (value: Awaited<ReturnType<WorkbenchBackend['save']>>) => void;
    vi.mocked(backend.save).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const save = session.save();
    expect(session.save()).toBe(save);
    const run = session.run(vi.fn());
    session.edit('main.ts', 'third');
    finish({ projectId: 'first', revision: '2', files: { 'main.ts': 'second' } });
    await save;
    await expect(run).rejects.toThrow('保存期间内容发生变化');
    expect(session.state.files['main.ts']).toBe('third');
  });

  it('未打开项目与已关闭会话拒绝操作，空项目不创建活动标签', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await expect(session.run(vi.fn())).rejects.toThrow('请先打开项目');
    await session.create('empty', {});
    expect(session.state.activePath).toBeNull();
    expect(session.state.tabs).toEqual([]);
    session.dispose();
    expect(() => session.subscribe(vi.fn())).toThrow('已关闭');
  });

  it('比较二进制快照内容，编辑其他文本不会把相同字节误标脏', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.create('binary', { 'main.ts': 'one', 'asset.bin': new Uint8Array([0, 255]) });
    session.edit('main.ts', 'two');
    vi.mocked(backend.save).mockResolvedValueOnce({
      projectId: 'binary',
      revision: '2',
      files: { 'main.ts': 'two', 'asset.bin': new Uint8Array([0, 255]) }
    });
    await session.save();
    expect(session.state.dirty).toBe(false);
    session.edit('new.ts', 'new');
    expect(session.state.dirty).toBe(true);
    session.discard();
    expect(session.state.files['new.ts']).toBeUndefined();
  });

  it('已关闭会话忽略迟到的保存回执和编译结果', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'pending');
    let finish!: (value: Awaited<ReturnType<WorkbenchBackend['save']>>) => void;
    vi.mocked(backend.save).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = session.save();
    session.dispose();
    finish({ projectId: 'first', revision: '2', files: { 'main.ts': 'pending' } });
    await pending;
    expect(session.state.revision).toBe('1');
  });

  it.each(['.git/config', '../other.txt', 'MAIN.ts', 'main.ts/nested.ts'])(
    '在编辑缓冲入口拒绝非法或冲突路径 %s',
    async path => {
      const { backend } = fixture();
      const session = new WorkbenchSession(backend);
      await session.open('first');
      expect(() => session.edit(path, 'invalid')).toThrow();
      expect(session.state.files).toEqual({ 'main.ts': 'console.log(1)' });
      expect(session.state.dirty).toBe(false);
    }
  );

  it.each(['create', 'restore', 'remove', 'rename', 'move'] as const)(
    '%s 的迟到结果不能覆盖新项目',
    async operation => {
      const { backend } = fixture();
      const session = new WorkbenchSession(backend);
      await session.open('first');
      let finish!: () => void;
      const snapshot = {
        projectId: operation === 'create' ? 'created' : 'first',
        revision: '2',
        files: { 'main.ts': 'late result' }
      };
      if (operation === 'create' || operation === 'restore')
        vi.mocked(backend[operation]).mockImplementationOnce(
          () =>
            new Promise(resolve => {
              finish = () => resolve(snapshot);
            })
        );
      else
        vi.mocked(backend[operation]).mockImplementationOnce(
          () =>
            new Promise<void>(resolve => {
              finish = resolve;
            })
        );
      const pending =
        operation === 'create' ? session.create('created', {})
        : operation === 'restore' ? session.restore('abc')
        : operation === 'remove' ? session.remove('main.ts')
        : operation === 'move' ? session.move('main.ts', 'moved.ts')
        : session.rename('main.ts', 'renamed.ts');
      await session.open('second');
      finish();
      await pending;
      expect(session.state.projectId).toBe('second');
      expect(session.state.files['main.ts']).toBe('console.log(1)');
    }
  );

  it.each(['open', 'create', 'restore', 'remove', 'rename', 'move'] as const)(
    '%s 等待期间的新输入不能被快照替换清除',
    async operation => {
      const { backend } = fixture();
      const session = new WorkbenchSession(backend);
      await session.open('first');
      let finish!: () => void;
      const snapshot = { projectId: 'first', revision: '2', files: { 'main.ts': 'backend result' } };
      if (operation === 'open' || operation === 'create' || operation === 'restore')
        vi.mocked(backend[operation]).mockImplementationOnce(
          () =>
            new Promise(resolve => {
              finish = () => resolve(snapshot);
            })
        );
      else
        vi.mocked(backend[operation]).mockImplementationOnce(
          () =>
            new Promise<void>(resolve => {
              finish = resolve;
            })
        );
      const pending =
        operation === 'open' ? session.open('second')
        : operation === 'create' ? session.create('created', {})
        : operation === 'restore' ? session.restore('abc')
        : operation === 'remove' ? session.remove('main.ts')
        : operation === 'move' ? session.move('main.ts', 'moved.ts')
        : session.rename('main.ts', 'renamed.ts');
      session.edit('main.ts', 'typed while waiting');
      finish();
      await expect(pending).rejects.toThrow('操作期间内容发生变化');
      expect(session.state.files['main.ts']).toBe('typed while waiting');
      expect(session.state.dirty).toBe(true);
      expect(session.state.busy).toBe(false);
    }
  );

  it('关闭之后迟到的新建结果不再修改会话', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    let finish!: (snapshot: Awaited<ReturnType<WorkbenchBackend['create']>>) => void;
    vi.mocked(backend.create).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const pending = session.create('created', {});
    session.dispose();
    finish({ projectId: 'created', revision: '2', files: {} });
    await pending;
    expect(session.state.projectId).toBe('first');
  });

  it('保存完成不会把仍在编译的会话提前标为闲置', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    let finish!: (compilation: { js: string; css: string }) => void;
    const compile = vi.fn(
      () =>
        new Promise<{ js: string; css: string }>(resolve => {
          finish = resolve;
        })
    );
    const pending = session.run(compile);
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce());
    session.edit('main.ts', 'next revision');
    await session.save();
    expect(session.state.busy).toBe(true);
    finish({ js: 'compiled', css: '' });
    await pending;
    expect(session.state.busy).toBe(false);
  });

  it('新项目的保存不会复用旧项目未完成的保存 Promise', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    session.edit('main.ts', 'old pending');
    let finish!: (snapshot: Awaited<ReturnType<WorkbenchBackend['save']>>) => void;
    vi.mocked(backend.save).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const oldSave = session.save();
    session.discard();
    await session.open('second');
    session.edit('main.ts', 'new project');
    const newSave = session.save();
    expect(newSave).not.toBe(oldSave);
    await newSave;
    finish({ projectId: 'first', revision: '2', files: { 'main.ts': 'old pending' } });
    await oldSave;
    expect(session.state.projectId).toBe('second');
    expect(session.state.files['main.ts']).toBe('new project');
    expect(session.state.dirty).toBe(false);
  });

  it('切换项目后取消旧编译，不把取消错误或忙状态带到新项目', async () => {
    const { backend } = fixture();
    const session = new WorkbenchSession(backend);
    await session.open('first');
    let cancel!: (cause: Error) => void;
    const compile = vi.fn(
      () =>
        new Promise<{ js: string; css: string }>((_, reject) => {
          cancel = reject;
        })
    );
    const pending = session.run(compile);
    await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce());
    await session.open('second');
    cancel(new DOMException('编译已取消', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(session.state.projectId).toBe('second');
    expect(session.state.error).toBeNull();
    expect(session.state.preview).toBeNull();
    expect(session.state.busy).toBe(false);
  });
});

it('应用丢弃回执仅替换指定文件，保留其他未保存缓冲', async () => {
  const { backend } = fixture();
  const session = new WorkbenchSession(backend);
  await session.open('first');
  session.edit('main.ts', 'discard this');
  session.edit('notes.ts', 'keep this buffer');
  const restored = await backend.save('first', { 'main.ts': 'HEAD restored' }, '1');
  session.applySavedSnapshot(restored, ['main.ts']);
  expect(session.state.files['main.ts']).toBe('HEAD restored');
  expect(session.state.files['notes.ts']).toBe('keep this buffer');
  expect(session.state.revision).toBe('2');
  expect(session.state.dirty).toBe(true);
  expect(session.isModified('main.ts')).toBe(false);
  expect(session.isModified('notes.ts')).toBe(true);
  await session.save();
  expect(backend.save).toHaveBeenCalledWith('first', expect.objectContaining({ 'notes.ts': 'keep this buffer' }), '2');
});

it('丢弃删除的文件会关闭其标签，跨项目回执拒绝写入', async () => {
  const { backend } = fixture();
  const session = new WorkbenchSession(backend);
  await session.open('first');
  session.edit('new.ts', 'new');
  session.select('new.ts');
  session.applySavedSnapshot({ projectId: 'first', revision: '2', files: { 'main.ts': 'initial' } }, ['new.ts']);
  expect(session.state.files['new.ts']).toBeUndefined();
  expect(session.state.tabs).not.toContain('new.ts');
  expect(() => session.applySavedSnapshot({ projectId: 'foreign', revision: '9', files: {} }, [])).toThrow('项目');
  expect(session.state.projectId).toBe('first');
});

it('取消当前运行保留成功预览，迟到结果和 AbortError 均不覆盖它', async () => {
  const { backend } = fixture();
  const session = new WorkbenchSession(backend);
  await session.open('first');
  await session.run(async () => ({ js: 'previous', css: '' }));
  const previous = session.state.preview;
  const compilation = Promise.withResolvers<{ js: string; css: string }>();
  const compile = vi.fn(() => compilation.promise);
  const pending = session.run(compile);
  await vi.waitFor(() => expect(compile).toHaveBeenCalledOnce());
  session.cancelRun();
  compilation.reject(new DOMException('cancelled', 'AbortError'));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(session.state.preview).toBe(previous);
  expect(session.state.error).toBeNull();
  expect(session.state.busy).toBe(false);
  session.dispose();
  expect(() => session.cancelRun()).toThrow('已关闭');
});

it('保存当前文件不会把其他文件未保存的编辑写入磁盘', async () => {
  const { backend } = fixture();
  const session = new WorkbenchSession(backend);
  await session.open('first');
  session.edit('main.ts', 'save current');
  session.edit('notes.ts', 'keep unsaved');
  await session.save(['main.ts']);
  expect(backend.save).toHaveBeenCalledWith('first', { 'main.ts': 'save current' }, '1');
  expect(session.isModified('main.ts')).toBe(false);
  expect(session.isModified('notes.ts')).toBe(true);
  const compile = vi.fn(async () => ({ js: 'preview', css: '' }));
  await session.runSaved(compile);
  expect(compile).toHaveBeenCalledWith(expect.objectContaining({ files: { 'main.ts': 'save current' } }));
  expect(session.state.files['notes.ts']).toBe('keep unsaved');
  expect(backend.save).toHaveBeenCalledOnce();
});

it.each(['other', 'first'])('旧项目排队保存不会写入切换或重新打开后的%s项目草稿', async nextProject => {
  const { backend } = fixture();
  const pending = Promise.withResolvers<Awaited<ReturnType<WorkbenchBackend['save']>>>();
  vi.mocked(backend.open).mockImplementation(async projectId => ({
    projectId,
    revision: '1',
    files: { 'a.ts': `${projectId}-a0`, 'b.ts': `${projectId}-b0` }
  }));
  vi.mocked(backend.save).mockImplementation(async (projectId, files) => {
    if (projectId === 'first' && vi.mocked(backend.save).mock.calls.length === 1) return pending.promise;
    return { projectId, revision: '2', files };
  });
  const session = new WorkbenchSession(backend);
  await session.open('first');
  session.edit('a.ts', 'first saved');
  session.edit('b.ts', 'first queued');
  const first = session.save(['a.ts']);
  const queued = session.save(['b.ts']);
  session.discard();
  await session.open(nextProject);
  session.edit('b.ts', 'new project draft');
  pending.resolve({ projectId: 'first', revision: '2', files: { 'a.ts': 'first saved', 'b.ts': 'first-b0' } });
  await Promise.all([first, queued]);
  expect(backend.save).toHaveBeenCalledTimes(1);
  expect(session.state.projectId).toBe(nextProject);
  expect(session.state.revision).toBe('1');
  expect(session.state.files['b.ts']).toBe('new project draft');
  expect(session.isModified('b.ts')).toBe(true);
});

it.each(['VITE_FLAG=1\n', ''])('保存 .env 字符串 %j 收到字节回执后只写入一次', async content => {
  const { backend } = fixture();
  vi.mocked(backend.save)
    .mockResolvedValueOnce({
      projectId: 'first',
      revision: '2',
      files: { 'main.ts': 'console.log(1)', '.env': new TextEncoder().encode(content) }
    })
    .mockRejectedValue(new Error('unexpected rewrite'));
  const session = new WorkbenchSession(backend);
  await session.open('first');
  session.edit('.env', content);
  const controller = createSavePreviewController(session, async () => ({ js: '', css: '' }));
  try {
    await expect(controller.save(['.env'])).resolves.toBeUndefined();
    expect(backend.save).toHaveBeenCalledOnce();
    expect(session.state.revision).toBe('2');
    expect(session.isModified('.env')).toBe(false);
    expect(session.state.dirty).toBe(false);
  } finally {
    controller.dispose();
    session.dispose();
  }
});

it.each([
  {
    label: '保留 BOM 和 CRLF',
    bytes: new TextEncoder().encode('\uFEFF名称=值\r\n'),
    content: '\uFEFF名称=值\r\n',
    modified: false
  },
  { label: '删除 BOM', bytes: new TextEncoder().encode('\uFEFF名称=值\r\n'), content: '名称=值\r\n', modified: true },
  {
    label: '替换 CRLF',
    bytes: new TextEncoder().encode('\uFEFF名称=值\r\n'),
    content: '\uFEFF名称=值\n',
    modified: true
  },
  { label: '替换不同字节', bytes: new TextEncoder().encode('FLAG=1'), content: 'FLAG=2', modified: true },
  { label: '非法 UTF-8 不等于替换字符', bytes: new Uint8Array([255]), content: '\uFFFD', modified: true }
])('编辑字节快照时精确识别 $label', async ({ bytes, content, modified }) => {
  const { backend } = fixture();
  vi.mocked(backend.open).mockResolvedValueOnce({ projectId: 'first', revision: '1', files: { '.env': bytes } });
  const session = new WorkbenchSession(backend);
  await session.open('first');
  session.edit('.env', content);
  expect(session.isModified('.env')).toBe(modified);
  expect(session.state.dirty).toBe(modified);
  expect(backend.save).not.toHaveBeenCalled();
  session.dispose();
});
