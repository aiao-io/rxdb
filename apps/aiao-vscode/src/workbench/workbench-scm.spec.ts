// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchStatus } from './session.js';
import { confirmWorkbenchAction } from './workbench-dialog.js';
import { createWorkbenchScm, type WorkbenchScm, type WorkbenchScmOptions } from './workbench-scm.js';

vi.mock('./workbench-dialog.js', () => ({ confirmWorkbenchAction: vi.fn(async () => true) }));
const handles: WorkbenchScm[] = [];

async function fixture() {
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: '1', files: { 'a.ts': 'saved', 'new.ts': 'new' } })),
    create: vi.fn(async (projectId, files) => ({ projectId, revision: '1', files })),
    save: vi.fn(async (projectId, files) => ({ projectId, revision: '2', files })),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    status: vi.fn(),
    stage: vi.fn(async () => undefined),
    unstage: vi.fn(async () => undefined),
    readDiff: vi.fn(),
    discardWorking: vi.fn(async projectId => ({ projectId, revision: '2', files: { 'a.ts': 'index' } })),
    commit: vi.fn(async () => 'a'.repeat(40)),
    history: vi.fn(),
    restore: vi.fn(),
    exportArchive: vi.fn(),
    importArchive: vi.fn(),
    dispose: vi.fn()
  };
  const session = new WorkbenchSession(backend);
  await session.open('project');
  const host = document.createElement('div');
  document.body.append(host);
  const callbacks = {
    onOpenDiff: vi.fn(async () => undefined),
    onError: vi.fn(),
    onDidChange: vi.fn<WorkbenchScmOptions['onDidChange']>(async () => undefined),
    onCommitMessage: vi.fn(),
    getSavedMessage: vi.fn((_projectId: string) => undefined)
  };
  const scm = createWorkbenchScm(host, { backend, session, ...callbacks });
  handles.push(scm);
  const status: WorkbenchStatus = {
    branch: 'main',
    head: 'b'.repeat(40),
    entries: [
      { path: 'a.ts', index: 'M', worktree: 'M' },
      { path: 'new.ts', index: '?', worktree: '?' }
    ]
  };
  scm.update(status);
  return { host, backend, session, scm, callbacks, status };
}

afterEach(() => {
  handles.splice(0).forEach(handle => handle.dispose());
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('VSCode式源代码管理', () => {
  it('提交消息按项目记忆，上下方向键回放历史，切换项目恢复最后一条', async () => {
    const { host, backend, session, callbacks } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('.wb-scm-commit-form textarea');
    if (!message) throw new Error('提交说明缺失');
    message.value = '第一次提交';
    message.dispatchEvent(new Event('input'));
    host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]')?.click();
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledWith('project', '第一次提交'));
    await vi.waitFor(() => expect(message.value).toBe(''));
    expect(callbacks.onCommitMessage).toHaveBeenCalledWith('project', '第一次提交');
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(message.value).toBe('第一次提交'));
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(message.value).toBe(''));
    await session.open('another');
    expect(message.value).toBe('');
    await session.open('project');
    expect(message.value).toBe('第一次提交');
  });

  it('组头一次性暂存或取消暂存全部路径，按钮不嵌套', async () => {
    const { host, backend, callbacks } = await fixture();
    const stageAll = host.querySelector<HTMLButtonElement>('[aria-label="暂存所有更改"]');
    const unstageAll = host.querySelector<HTMLButtonElement>('[aria-label="取消暂存所有更改"]');
    expect(stageAll).not.toBeNull();
    expect(unstageAll).not.toBeNull();
    expect(stageAll?.parentElement?.closest('button')).toBeNull();
    stageAll?.click();
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledExactlyOnceWith('project', ['a.ts', 'new.ts']));
    await vi.waitFor(() => expect(callbacks.onDidChange).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(unstageAll?.disabled).toBe(false));
    unstageAll?.click();
    await vi.waitFor(() => expect(backend.unstage).toHaveBeenCalledExactlyOnceWith('project', ['a.ts']));
  });

  it('组头暂存遇任一未保存文件整体禁用，取消全部暂存不碰缓冲', async () => {
    const { host, session, backend } = await fixture();
    session.edit('a.ts', 'unsaved');
    const stageAll = host.querySelector<HTMLButtonElement>('[aria-label="暂存所有更改"]');
    const unstageAll = host.querySelector<HTMLButtonElement>('[aria-label="取消暂存所有更改"]');
    expect(stageAll?.disabled).toBe(true);
    expect(stageAll?.title).toContain('未保存');
    expect(unstageAll?.disabled).toBe(false);
    stageAll?.click();
    unstageAll?.click();
    await vi.waitFor(() => expect(backend.unstage).toHaveBeenCalledWith('project', ['a.ts']));
    expect(backend.stage).not.toHaveBeenCalled();
    expect(session.state.files['a.ts']).toBe('unsaved');
  });

  it('按暂存区和工作区分组计数，同一MM文件可分别打开两侧差异', async () => {
    const { host, callbacks } = await fixture();
    expect(host.querySelector('[data-scm-count="staged"]')?.textContent).toBe('1');
    expect(host.querySelector('[data-scm-count="working"]')?.textContent).toBe('2');
    const staged = host.querySelector<HTMLButtonElement>('[data-scm-group="staged"] [data-scm-path="a.ts"]');
    staged?.click();
    await vi.waitFor(() => expect(callbacks.onOpenDiff).toHaveBeenCalledWith({ path: 'a.ts', kind: 'staged' }));
    host.querySelector<HTMLButtonElement>('[data-scm-group="working"] [data-scm-path="a.ts"]')?.click();
    await vi.waitFor(() => expect(callbacks.onOpenDiff).toHaveBeenCalledWith({ path: 'a.ts', kind: 'working' }));
  });

  it('每个文件提供真实stage与unstage，有未保存缓冲时不暂存磁盘旧版', async () => {
    const { host, backend, session, callbacks } = await fixture();
    host.querySelector<HTMLButtonElement>('[data-scm-group="working"] [aria-label="暂存更改 a.ts"]')?.click();
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledWith('project', ['a.ts']));
    await vi.waitFor(() => expect(callbacks.onDidChange).toHaveBeenCalledOnce());
    host.querySelector<HTMLButtonElement>('[data-scm-group="staged"] [aria-label="取消暂存 a.ts"]')?.click();
    await vi.waitFor(() => expect(backend.unstage).toHaveBeenCalledWith('project', ['a.ts']));
    session.edit('a.ts', 'unsaved');
    expect(
      host.querySelector<HTMLButtonElement>('[data-scm-group="working"] [aria-label="暂存更改 a.ts"]')?.disabled
    ).toBe(true);
    expect(backend.save).not.toHaveBeenCalled();
  });

  it('提交按钮与ModEnter只提交index，空说明或无暂存时禁用', async () => {
    const { host, scm, backend, session, callbacks } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]');
    const commit = host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]');
    if (!message || !commit) throw new Error('提交控件缺失');
    expect(commit.disabled).toBe(true);
    message.value = 'staged only';
    message.dispatchEvent(new Event('input'));
    expect(commit.disabled).toBe(false);
    session.edit('a.ts', 'unsaved after staging');
    expect(commit.disabled).toBe(false);
    const bubble = vi.fn();
    host.addEventListener('keydown', bubble);
    message.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledExactlyOnceWith('project', 'staged only'));
    await vi.waitFor(() => expect(message.value).toBe(''));
    expect(backend.stage).not.toHaveBeenCalled();
    expect(backend.save).not.toHaveBeenCalled();
    expect(bubble).not.toHaveBeenCalled();
    expect(callbacks.onDidChange).toHaveBeenCalledOnce();
    scm.update({ branch: 'main', head: null, entries: [] });
    message.value = 'nothing staged';
    message.dispatchEvent(new Event('input'));
    expect(commit.disabled).toBe(true);
    await expect(scm.commit()).rejects.toThrow(/暂存/);
  });

  it('丢弃使用标准确认并只把目标snapshot路径交给宿主', async () => {
    const { host, backend, callbacks } = await fixture();
    vi.mocked(confirmWorkbenchAction).mockResolvedValueOnce(false);
    host.querySelector<HTMLButtonElement>('[aria-label="丢弃更改 a.ts"]')?.click();
    await vi.waitFor(() => expect(confirmWorkbenchAction).toHaveBeenCalled());
    expect(backend.discardWorking).not.toHaveBeenCalled();
    const remove = host.querySelector<HTMLButtonElement>('[aria-label="删除未跟踪文件 new.ts"]');
    await vi.waitFor(() => expect(remove?.disabled).toBe(false));
    remove?.click();
    await vi.waitFor(() => expect(backend.discardWorking).toHaveBeenCalledWith('project', 'new.ts'));
    await vi.waitFor(() =>
      expect(callbacks.onDidChange).toHaveBeenCalledWith(
        { projectId: 'project', revision: '2', files: { 'a.ts': 'index' } },
        ['new.ts']
      )
    );
  });

  it('确认丢弃可替换该文件未保存缓冲，并保留其它文件的未保存编辑', async () => {
    const { host, session, callbacks } = await fixture();
    session.edit('a.ts', 'discard unsaved');
    session.edit('new.ts', 'keep unsaved');
    callbacks.onDidChange.mockImplementation(async (snapshot, paths) => {
      if (snapshot) session.applySavedSnapshot(snapshot, paths ?? []);
    });
    const discard = host.querySelector<HTMLButtonElement>('[aria-label="丢弃更改 a.ts"]');
    expect(discard?.disabled).toBe(false);
    discard?.click();
    await vi.waitFor(() => expect(session.state.files['a.ts']).toBe('index'));
    expect(session.isModified('a.ts')).toBe(false);
    expect(session.state.files['new.ts']).toBe('keep unsaved');
    expect(session.isModified('new.ts')).toBe(true);
    expect(vi.mocked(confirmWorkbenchAction).mock.calls.at(-1)?.[2]).toContain('未保存的编辑也会被丢弃');
  });

  it('操作失败保留说明并显示错误，忙时不能重复提交', async () => {
    const { host, backend, callbacks } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]');
    if (!message) throw new Error('说明缺失');
    message.value = 'keep message';
    message.dispatchEvent(new Event('input'));
    let rejectCommit!: (cause: Error) => void;
    vi.mocked(backend.commit).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectCommit = reject;
        })
    );
    const button = host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]');
    button?.click();
    await vi.waitFor(() => expect(button?.disabled).toBe(true));
    button?.click();
    rejectCommit(new Error('git write failed'));
    await vi.waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'git write failed' }))
    );
    expect(backend.commit).toHaveBeenCalledTimes(1);
    expect(message.value).toBe('keep message');
    expect(callbacks.onDidChange).not.toHaveBeenCalled();
  });

  it('分组折叠和外部Git保存屏障不销毁消息输入', async () => {
    const { host, scm } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]');
    if (!message) throw new Error('说明缺失');
    message.value = 'retained';
    message.dispatchEvent(new Event('input'));
    const header = host.querySelector<HTMLButtonElement>('[data-scm-group="working"] .wb-scm-group-header');
    header?.click();
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(header?.querySelector('.codicon-chevron-right')).not.toBeNull();
    header?.click();
    expect(header?.getAttribute('aria-expanded')).toBe('true');
    expect(header?.querySelector('.codicon-chevron-down')).not.toBeNull();
    scm.setBusy(true);
    expect(message.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]')?.disabled).toBe(true);
    scm.setBusy(false);
    expect(message.value).toBe('retained');
    expect(message.disabled).toBe(false);
  });

  it('后台预览编译不阻止提交已经存在的暂存内容', async () => {
    const { host, session, backend } = await fixture();
    let finish!: (value: { js: string; css: string }) => void;
    const compile = vi.fn(
      () =>
        new Promise<{ js: string; css: string }>(resolve => {
          finish = resolve;
        })
    );
    const running = session.run(compile);
    await vi.waitFor(() => expect(compile).toHaveBeenCalled());
    expect(session.state.busy).toBe(true);
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]');
    if (!message) throw new Error('说明缺失');
    message.value = 'commit during preview';
    message.dispatchEvent(new Event('input'));
    const button = host.querySelector<HTMLButtonElement>('[data-scm-action="commit"]');
    expect(button?.disabled).toBe(false);
    button?.click();
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledWith('project', 'commit during preview'));
    finish({ js: '', css: '' });
    await running;
  });

  it('项目切换忽略上一项目操作的迟到刷新，释放不会销毁共享后端', async () => {
    const { host, session, backend, scm, callbacks } = await fixture();
    let finish!: () => void;
    vi.mocked(backend.stage).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    host.querySelector<HTMLButtonElement>('[aria-label="暂存更改 a.ts"]')?.click();
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalled());
    await session.open('other');
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks.onDidChange).not.toHaveBeenCalled();
    expect(host.querySelector('[data-scm-count="staged"]')?.textContent).toBe('0');
    scm.dispose();
    scm.dispose();
    expect(backend.dispose).not.toHaveBeenCalled();
    scm.update({ branch: 'ignored', head: null, entries: [] });
    expect(host.children).toHaveLength(0);
  });
});
