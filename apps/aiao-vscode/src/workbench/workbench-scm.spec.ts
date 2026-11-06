// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchSession, type WorkbenchBackend, type WorkbenchSnapshot, type WorkbenchStatus } from './session.js';
import { confirmWorkbenchAction } from './workbench-dialog.js';
import { createWorkbenchScm, type WorkbenchScm, type WorkbenchScmOptions } from './workbench-scm.js';

vi.mock('./workbench-dialog.js', () => ({ confirmWorkbenchAction: vi.fn(async () => true) }));
const handles: WorkbenchScm[] = [];

function menuEntry(scm: WorkbenchScm, label: string) {
  const entry = scm.getMenuEntries().find(item => 'label' in item && item.label === label);
  if (!entry || !('action' in entry)) throw new Error(`源代码管理菜单缺少 ${label}`);
  return entry;
}

function visiblePaths(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>('[data-scm-group="working"] [data-scm-path]')]
    .filter(file => !file.closest('[hidden]'))
    .map(file => file.dataset['scmPath'] ?? '');
}

async function fixture() {
  const backend: WorkbenchBackend = {
    open: vi.fn(async projectId => ({ projectId, revision: '1', files: { 'a.ts': 'saved', 'new.ts': 'new' } })),
    create: vi.fn(async (projectId, files) => ({ projectId, revision: '1', files })),
    save: vi.fn(async (projectId, files) => ({ projectId, revision: '2', files })),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
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
    onOpenFile: vi.fn(async () => undefined),
    onError: vi.fn(),
    onDidChange: vi.fn<WorkbenchScmOptions['onDidChange']>(async () => undefined),
    onRefresh: vi.fn(async () => undefined),
    onCommitMessage: vi.fn(),
    getSavedMessage: vi.fn(() => undefined)
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
    message.setSelectionRange(message.value.length, message.value.length);
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(message.value).toBe(''));
    await session.open('another');
    expect(message.value).toBe('');
    await session.open('project');
    expect(message.value).toBe('第一次提交');
  });

  it('没有提交记录的新仓库显示首次提交引导', async () => {
    const { host, scm, status } = await fixture();
    const intro = host.querySelector<HTMLElement>('.wb-scm-intro');
    expect(intro?.hidden).toBe(true);
    scm.update({ ...status, head: null });
    expect(intro?.hidden).toBe(false);
    expect(intro?.textContent).toContain('首次提交');
    scm.update(status);
    expect(intro?.hidden).toBe(true);
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

  it('暂存组在前，空组隐藏，始终显示操作开关改变动作可见性', async () => {
    const { host, scm, status } = await fixture();
    const groups = [...host.querySelectorAll<HTMLElement>('[data-scm-group]')].map(group => group.dataset['scmGroup']);
    expect(groups.indexOf('working')).toBeGreaterThan(-1);
    expect(groups.indexOf('staged')).toBeLessThan(groups.indexOf('working'));
    const workingCount = host.querySelector<HTMLElement>('[data-scm-count="working"]');
    const stagedCount = host.querySelector<HTMLElement>('[data-scm-count="staged"]');
    expect(workingCount?.hidden).toBe(false);
    expect(stagedCount?.hidden).toBe(false);
    scm.update({ ...status, entries: [{ path: 'a.ts', index: ' ', worktree: 'M' }] });
    expect(workingCount?.hidden).toBe(false);
    expect(stagedCount?.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-scm-group="staged"]')?.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('.wb-scm-empty')?.hidden).toBe(true);
    scm.update({ ...status, entries: [] });
    expect(host.querySelector<HTMLElement>('[data-scm-group="working"]')?.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('.wb-scm-empty')?.hidden).toBe(false);
    expect(host.querySelector('.wb-scm-empty')?.textContent).toContain('没有更改');
    expect(host.querySelector('.wb-scm-show-actions')).toBeNull();
    scm.setAlwaysShowActions(true);
    expect(host.querySelector('.wb-scm-show-actions')).not.toBeNull();
    scm.setAlwaysShowActions(false);
    expect(host.querySelector('.wb-scm-show-actions')).toBeNull();
  });

  it('更改列表按目录树分组渲染，嵌套路径逐级缩进且操作仍作用完整路径', async () => {
    const { host, backend, scm, status } = await fixture();
    scm.setViewMode('tree');
    scm.update({
      ...status,
      entries: [
        { path: 'a.ts', index: ' ', worktree: 'M' },
        { path: 'src/main.tsx', index: ' ', worktree: 'M' },
        { path: 'src/util/helper.ts', index: ' ', worktree: 'M' }
      ]
    });
    const working = host.querySelector<HTMLElement>('[data-scm-group="working"] .wb-scm-list')!;
    const folders = [...working.querySelectorAll<HTMLElement>('.wb-scm-folder')];
    expect(folders.map(folder => folder.textContent)).toEqual(['src', 'util']);
    const nested = working.querySelector<HTMLButtonElement>('[data-scm-path="src/util/helper.ts"]')!;
    expect((nested.parentElement as HTMLElement).style.paddingLeft).toBe('24px');
    nested
      .closest<HTMLElement>('.wb-scm-change')
      ?.querySelector<HTMLButtonElement>('[data-scm-action="stage"]')
      ?.click();
    await vi.waitFor(() => expect(backend.stage).toHaveBeenCalledWith('project', ['src/util/helper.ts']));
  });

  it('提交按钮位于消息框下方并属于表单，每行提供打开文件操作', async () => {
    const { host, callbacks } = await fixture();
    const scm = host.querySelector<HTMLElement>('.wb-scm')!;
    const form = scm.querySelector<HTMLElement>('.wb-scm-commit-form')!;
    const message = form.querySelector('textarea')!;
    const commit = form.querySelector('[data-scm-action="commit"]')!;
    expect(commit).not.toBeNull();
    expect(message.compareDocumentPosition(commit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // a.ts 同时出现在暂存与更改两组，加上 new.ts 共三行
    expect(host.querySelectorAll('[data-scm-action="open"]')).toHaveLength(3);
    host.querySelector<HTMLButtonElement>('[data-scm-action="open"]')?.click();
    await vi.waitFor(() => expect(callbacks.onOpenFile).toHaveBeenCalledWith('a.ts'));
  });

  it('默认按完整路径显示平铺列表，列表支持名称和状态排序', async () => {
    const { host, scm, status } = await fixture();
    scm.update({
      ...status,
      entries: [
        { path: 'z/a.ts', index: ' ', worktree: 'M' },
        { path: 'a/z.ts', index: '?', worktree: '?' },
        { path: 'm/b.ts', index: ' ', worktree: 'D' }
      ]
    });
    expect(host.querySelector('.wb-scm-folder')).toBeNull();
    expect(visiblePaths(host)).toEqual(['a/z.ts', 'm/b.ts', 'z/a.ts']);
    const first = host.querySelector('[data-scm-group="working"] [data-scm-path="a/z.ts"]');
    expect(first?.querySelector('.wb-scm-name')?.textContent).toBe('z.ts');
    expect(first?.querySelector('.wb-scm-directory')?.textContent).toBe('a');
    scm.setSortKey('name');
    expect(visiblePaths(host)).toEqual(['z/a.ts', 'm/b.ts', 'a/z.ts']);
    scm.setSortKey('status');
    expect(visiblePaths(host)).toEqual(['m/b.ts', 'z/a.ts', 'a/z.ts']);
    scm.setSortKey('path');
    expect(visiblePaths(host)).toEqual(['a/z.ts', 'm/b.ts', 'z/a.ts']);
  });

  it('目录可折叠，刷新保留折叠状态，切回列表显示完整路径', async () => {
    const { host, scm, status } = await fixture();
    const entries: WorkbenchStatus['entries'] = [
      { path: 'src/a.ts', index: ' ', worktree: 'M' },
      { path: 'src/nested/b.ts', index: ' ', worktree: 'M' },
      { path: 'z.ts', index: ' ', worktree: 'M' }
    ];
    scm.update({ ...status, entries });
    scm.setViewMode('tree');
    const folder = host.querySelector<HTMLButtonElement>('button.wb-scm-folder');
    expect(folder?.getAttribute('aria-expanded')).toBe('true');
    folder?.click();
    expect(visiblePaths(host)).toEqual(['z.ts']);
    scm.update({ ...status, entries });
    expect(host.querySelector('.wb-scm-folder')?.getAttribute('aria-expanded')).toBe('false');
    expect(visiblePaths(host)).toEqual(['z.ts']);
    host.querySelector<HTMLButtonElement>('button.wb-scm-folder')?.click();
    expect(visiblePaths(host)).toContain('src/nested/b.ts');
    scm.setViewMode('list');
    expect(host.querySelector('.wb-scm-folder')).toBeNull();
    expect(visiblePaths(host)).toEqual(['src/a.ts', 'src/nested/b.ts', 'z.ts']);
  });

  it('工作文件动作按打开、丢弃、暂存排列，状态位于最右，缺失文件不能打开', async () => {
    const { host, scm, status, callbacks } = await fixture();
    const row = host.querySelector('[data-scm-group="working"] .wb-scm-change')!;
    expect(
      [...row.querySelectorAll<HTMLElement>('[data-scm-action]')].map(button => button.dataset['scmAction'])
    ).toEqual(['open', 'discard', 'stage']);
    expect(row.lastElementChild?.classList.contains('wb-scm-status')).toBe(true);
    scm.update({ ...status, entries: [{ path: 'deleted.ts', index: ' ', worktree: 'D' }] });
    const open = host.querySelector<HTMLButtonElement>('[data-scm-group="working"] [data-scm-action="open"]');
    expect(open?.disabled).toBe(true);
    open?.click();
    expect(callbacks.onOpenFile).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('[data-scm-path="deleted.ts"]')?.click();
    await vi.waitFor(() => expect(callbacks.onOpenDiff).toHaveBeenCalledWith({ path: 'deleted.ts', kind: 'working' }));
  });

  it('文件列表支持方向键与首尾导航，Git 刷新后保留文件焦点', async () => {
    const { host, scm, status } = await fixture();
    scm.update({
      ...status,
      entries: [
        { path: 'a.ts', index: ' ', worktree: 'M' },
        { path: 'b.ts', index: ' ', worktree: 'M' },
        { path: 'c.ts', index: ' ', worktree: 'M' }
      ]
    });
    const first = host.querySelector<HTMLButtonElement>('[data-scm-path="a.ts"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect((document.activeElement as HTMLElement).dataset['scmPath']).toBe('b.ts');
    scm.update({
      ...status,
      entries: [
        { path: 'a.ts', index: ' ', worktree: 'M' },
        { path: 'b.ts', index: ' ', worktree: 'M' },
        { path: 'c.ts', index: ' ', worktree: 'M' }
      ]
    });
    expect((document.activeElement as HTMLElement).dataset['scmPath']).toBe('b.ts');
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })
    );
    expect((document.activeElement as HTMLElement).dataset['scmPath']).toBe('c.ts');
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })
    );
    expect((document.activeElement as HTMLElement).dataset['scmPath']).toBe('a.ts');
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    );
    expect((document.activeElement as HTMLElement).dataset['scmPath']).toBe('a.ts');
  });

  it('提交消息内部方向键保持光标行为，历史回放返回原草稿', async () => {
    const { host, scm } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]')!;
    message.value = '历史消息';
    message.dispatchEvent(new Event('input'));
    await scm.commit();
    message.value = 'first\nsecond\nthird';
    message.dispatchEvent(new Event('input'));
    message.setSelectionRange(8, 8);
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    message.dispatchEvent(up);
    message.dispatchEvent(down);
    expect(up.defaultPrevented).toBe(false);
    expect(down.defaultPrevented).toBe(false);
    expect(message.value).toBe('first\nsecond\nthird');
    message.setSelectionRange(0, 5);
    const selected = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    message.dispatchEvent(selected);
    expect(selected.defaultPrevented).toBe(false);
    message.setSelectionRange(0, 0);
    const modified = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true, cancelable: true });
    message.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(message.value).toBe('历史消息');
    message.setSelectionRange(message.value.length, message.value.length);
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(message.value).toBe('first\nsecond\nthird');
  });

  it('标题菜单复用真实批量暂存、取消暂存及刷新动作', async () => {
    const { scm, backend, callbacks } = await fixture();
    await menuEntry(scm, '暂存所有更改').action();
    expect(backend.stage).toHaveBeenCalledWith('project', ['a.ts', 'new.ts']);
    await menuEntry(scm, '取消暂存所有更改').action();
    expect(backend.unstage).toHaveBeenCalledWith('project', ['a.ts']);
    await menuEntry(scm, '刷新').action();
    expect(callbacks.onRefresh).toHaveBeenCalledOnce();
  });

  it('批量丢弃只确认一次，最终快照只更新目标路径并保留其他草稿', async () => {
    const { scm, backend, session, status, callbacks } = await fixture();
    session.edit('a.ts', 'discard me');
    session.edit('new.ts', 'preserve me');
    scm.update({
      ...status,
      entries: [
        { path: 'a.ts', index: ' ', worktree: 'M' },
        { path: 'deleted.ts', index: ' ', worktree: 'D' }
      ]
    });
    const intermediate = { projectId: 'project', revision: '2', files: { 'a.ts': 'index', 'new.ts': 'new' } };
    const final = { ...intermediate, revision: '3', files: { ...intermediate.files, 'deleted.ts': 'restored' } };
    vi.mocked(backend.discardWorking).mockResolvedValueOnce(intermediate).mockResolvedValueOnce(final);
    callbacks.onDidChange.mockImplementation(async (snapshot, paths) => {
      if (snapshot) session.applySavedSnapshot(snapshot, paths ?? []);
    });
    await menuEntry(scm, '丢弃所有更改').action();
    expect(confirmWorkbenchAction).toHaveBeenCalledTimes(1);
    expect(backend.discardWorking).toHaveBeenNthCalledWith(1, 'project', 'a.ts');
    expect(backend.discardWorking).toHaveBeenNthCalledWith(2, 'project', 'deleted.ts');
    expect(callbacks.onDidChange).toHaveBeenCalledExactlyOnceWith(final, ['a.ts', 'deleted.ts']);
    expect(session.state.files['a.ts']).toBe('index');
    expect(session.state.files['deleted.ts']).toBe('restored');
    expect(session.state.files['new.ts']).toBe('preserve me');
    expect(session.isModified('new.ts')).toBe(true);
  });

  it('取消批量丢弃不修改仓库', async () => {
    const { scm, backend, callbacks } = await fixture();
    vi.mocked(confirmWorkbenchAction).mockResolvedValueOnce(false);
    await menuEntry(scm, '丢弃所有更改').action();
    expect(confirmWorkbenchAction).toHaveBeenCalledOnce();
    expect(backend.discardWorking).not.toHaveBeenCalled();
    expect(callbacks.onDidChange).not.toHaveBeenCalled();
  });

  it('批量丢弃等待确认时切出再回到同一项目，旧确认不能写入仓库', async () => {
    const { scm, backend, session, status, callbacks } = await fixture();
    let confirm!: (confirmed: boolean) => void;
    vi.mocked(confirmWorkbenchAction).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          confirm = resolve;
        })
    );
    const operation = menuEntry(scm, '丢弃所有更改').action();
    await vi.waitFor(() => expect(confirmWorkbenchAction).toHaveBeenCalledOnce());
    await session.open('other');
    await session.open('project');
    scm.update(status);
    confirm(true);
    await operation;
    expect(backend.discardWorking).not.toHaveBeenCalled();
    expect(callbacks.onDidChange).not.toHaveBeenCalled();
  });

  it('批量丢弃执行中切出再回到同一项目，迟到结果不能继续批次或回灌快照', async () => {
    const { scm, backend, session, status, callbacks } = await fixture();
    let finish!: (snapshot: WorkbenchSnapshot) => void;
    vi.mocked(backend.discardWorking).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const operation = menuEntry(scm, '丢弃所有更改').action();
    await vi.waitFor(() => expect(backend.discardWorking).toHaveBeenCalledOnce());
    await session.open('other');
    await session.open('project');
    scm.update(status);
    finish({ projectId: 'project', revision: '2', files: { 'a.ts': 'stale', 'new.ts': 'new' } });
    await operation;
    expect(backend.discardWorking).toHaveBeenCalledExactlyOnceWith('project', 'a.ts');
    expect(callbacks.onDidChange).not.toHaveBeenCalled();
    expect(session.state.files['a.ts']).toBe('saved');
  });

  it('批量丢弃部分失败时先刷新已完成路径，再报错并保留未完成文件草稿', async () => {
    const { scm, backend, session, callbacks } = await fixture();
    session.edit('a.ts', 'discard me');
    session.edit('new.ts', 'keep after failure');
    const snapshot = { projectId: 'project', revision: '2', files: { 'a.ts': 'index', 'new.ts': 'new' } };
    const failure = new Error('second discard failed');
    vi.mocked(backend.discardWorking).mockResolvedValueOnce(snapshot).mockRejectedValueOnce(failure);
    callbacks.onDidChange.mockImplementation(async (next, paths) => {
      if (next) session.applySavedSnapshot(next, paths ?? []);
    });
    await expect(menuEntry(scm, '丢弃所有更改').action()).rejects.toBe(failure);
    expect(backend.discardWorking).toHaveBeenNthCalledWith(1, 'project', 'a.ts');
    expect(backend.discardWorking).toHaveBeenNthCalledWith(2, 'project', 'new.ts');
    expect(callbacks.onDidChange).toHaveBeenCalledExactlyOnceWith(snapshot, ['a.ts']);
    expect(session.state.files['a.ts']).toBe('index');
    expect(session.isModified('a.ts')).toBe(false);
    expect(session.state.files['new.ts']).toBe('keep after failure');
    expect(session.isModified('new.ts')).toBe(true);
  });

  it('提交执行中切出再回到同一项目，迟到提交不能清空新草稿或写入消息历史', async () => {
    const { host, scm, backend, session, status, callbacks } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]')!;
    let finish!: (oid: string) => void;
    vi.mocked(backend.commit).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    message.value = 'same message';
    message.dispatchEvent(new Event('input'));
    const operation = scm.commit();
    await vi.waitFor(() => expect(backend.commit).toHaveBeenCalledOnce());
    await session.open('other');
    await session.open('project');
    scm.update(status);
    message.value = 'same message';
    message.dispatchEvent(new Event('input'));
    finish('c'.repeat(40));
    await operation;
    expect(message.value).toBe('same message');
    expect(callbacks.onCommitMessage).not.toHaveBeenCalled();
    expect(callbacks.onDidChange).not.toHaveBeenCalled();
    message.value = '';
    message.dispatchEvent(new Event('input'));
    message.setSelectionRange(0, 0);
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(message.value).toBe('');
  });

  it('Git 刷新保留行内暂存按钮焦点，文件移入暂存组后焦点跟随文件', async () => {
    const { host, scm, status } = await fixture();
    const stage = host
      .querySelector<HTMLButtonElement>('[data-scm-group="working"] [data-scm-path="a.ts"]')
      ?.closest('.wb-scm-change')
      ?.querySelector<HTMLButtonElement>('[data-scm-action="stage"]');
    expect(stage).not.toBeNull();
    stage?.focus();
    scm.update(status);
    const active = document.activeElement as HTMLElement;
    expect(active.dataset['scmAction']).toBe('stage');
    expect(active.closest('[data-scm-group]')?.getAttribute('data-scm-group')).toBe('working');
    expect(active.closest('.wb-scm-change')?.querySelector('[data-scm-path]')?.getAttribute('data-scm-path')).toBe(
      'a.ts'
    );
    scm.update({
      ...status,
      entries: [
        { path: 'a.ts', index: 'M', worktree: ' ' },
        { path: 'new.ts', index: '?', worktree: '?' }
      ]
    });
    const moved = document.activeElement as HTMLElement;
    expect(moved.dataset['scmPath']).toBe('a.ts');
    expect(moved.closest('[data-scm-group]')?.getAttribute('data-scm-group')).toBe('staged');
  });

  it('长单行提交说明在中间位置按方向键不能误触历史回放', async () => {
    const { host, scm } = await fixture();
    const message = host.querySelector<HTMLTextAreaElement>('[aria-label="提交说明"]')!;
    message.value = '历史消息';
    message.dispatchEvent(new Event('input'));
    await scm.commit();
    const draft = 'long commit message '.repeat(24);
    message.value = draft;
    message.dispatchEvent(new Event('input'));
    const cursor = Math.floor(draft.length / 2);
    message.setSelectionRange(cursor, cursor);
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    message.dispatchEvent(up);
    message.dispatchEvent(down);
    expect(up.defaultPrevented).toBe(false);
    expect(down.defaultPrevented).toBe(false);
    expect(message.value).toBe(draft);
    expect(message.selectionStart).toBe(cursor);
    message.setSelectionRange(0, 0);
    message.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(message.value).toBe('历史消息');
  });
});
