import type { WorkbenchBackend, WorkbenchSession, WorkbenchSnapshot, WorkbenchStatus } from './session.js';
import { confirmWorkbenchAction } from './workbench-dialog.js';
import { createCodicon, createFileIcon, folderCodicon, type CodiconName } from './workbench-icons.js';

/** SCM 文件点击请求，由宿主打开对应差异编辑器。 */
export interface WorkbenchDiffRequest {
  readonly path: string;
  readonly kind: 'working' | 'staged';
}

/** 源代码管理视图使用已保存的工作区和真实 Git 暂存区。 */
export interface WorkbenchScmOptions {
  readonly backend: WorkbenchBackend;
  readonly session: WorkbenchSession;
  onOpenDiff(request: WorkbenchDiffRequest): void | Promise<void>;
  /** 用户点击文件行上的「打开文件」操作时请求宿主打开编辑器。 */
  onOpenFile(path: string): void | Promise<void>;
  onError(cause: unknown): void;
  onDidChange(snapshot?: WorkbenchSnapshot, paths?: readonly string[]): void | Promise<void>;
  /** 用户点击刷新按钮时重新读取 Git 状态。 */
  onRefresh?(): void | Promise<void>;
  /** 重开项目时回填上一次的提交说明。 */
  getSavedMessage?(projectId: string): string | undefined;
  /** 提交成功后上报说明，宿主据此持久化。 */
  onCommitMessage?(projectId: string, message: string): void;
}

/** 宿主统一刷新状态，视图只负责明确的文件和提交动作。 */
export interface WorkbenchScm {
  update(status: WorkbenchStatus): void;
  setBusy(busy: boolean): void;
  /** 对齐 VS Code「视图和更多操作」：悬停显示的内联操作改为始终显示。 */
  setAlwaysShowActions(enabled: boolean): void;
  /** 重开项目后回填持久化的提交说明。 */
  restoreMessage(message: string): void;
  commit(): Promise<void>;
  dispose(): void;
}

type Entry = WorkbenchStatus['entries'][number];
type MutationResult = {
  readonly changed?: boolean;
  readonly snapshot?: WorkbenchSnapshot;
  readonly paths?: readonly string[];
} | void;
type FileAction = 'stage' | 'unstage' | 'discard';
const stagedEntry = (entry: Entry): boolean => /^[MADRCT]$/.test(entry.index);
const workingEntry = (entry: Entry): boolean => /^[MDRT?]$/.test(entry.worktree);

function actionButton(action: string, label: string, icon: CodiconName): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['scmAction'] = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createCodicon(icon));
  return button;
}

function changeGroup(kind: 'working' | 'staged', title: string) {
  const section = document.createElement('section');
  section.className = 'wb-scm-group';
  section.dataset['scmGroup'] = kind;
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'wb-scm-group-header';
  header.setAttribute('aria-expanded', 'true');
  let chevron = createCodicon('chevron-down');
  const label = document.createElement('span');
  label.textContent = title;
  const count = document.createElement('span');
  count.className = 'wb-scm-count';
  count.dataset['scmCount'] = kind;
  count.textContent = '0';
  const list = document.createElement('div');
  list.className = 'wb-scm-list';
  const heading = document.createElement('div');
  heading.className = 'wb-scm-group-heading';
  header.append(chevron, label, count);
  heading.append(header);
  section.append(heading, list);
  header.onclick = event => {
    event.stopPropagation();
    list.hidden = !list.hidden;
    header.setAttribute('aria-expanded', String(!list.hidden));
    const next = createCodicon(list.hidden ? 'chevron-right' : 'chevron-down');
    chevron.replaceWith(next);
    chevron = next;
  };
  return { section, list, count, heading };
}

/** 挂载暂存、更改和提交说明；不会自动保存或自动暂存编辑缓冲。 */
export function createWorkbenchScm(host: HTMLElement, options: WorkbenchScmOptions): WorkbenchScm {
  const element = document.createElement('section');
  element.className = 'wb-scm';
  element.setAttribute('aria-label', '源代码管理');
  const form = document.createElement('form');
  form.className = 'wb-scm-commit-form';
  const message = document.createElement('textarea');
  message.rows = 3;
  message.setAttribute('aria-label', '提交说明');
  message.placeholder = '消息 (⌘ / Ctrl + Enter 提交)';
  const commitButton = actionButton('commit', '提交已暂存内容', 'check');
  commitButton.className = 'wb-primary wb-scm-commit';
  const caption = document.createElement('span');
  caption.textContent = '提交';
  commitButton.append(caption);
  commitButton.onclick = event => {
    event.stopPropagation();
    if (!commitButton.disabled) launch(commit);
  };
  const toolbar = document.createElement('div');
  toolbar.className = 'wb-scm-toolbar';
  toolbar.append(commitButton);
  const hint = document.createElement('p');
  hint.className = 'wb-scm-hint';
  hint.setAttribute('role', 'status');
  form.append(message, hint);
  const staged = changeGroup('staged', '暂存的更改');
  const working = changeGroup('working', '更改');
  const stageAll = actionButton('stage-all', '暂存所有更改', 'add');
  const unstageAll = actionButton('unstage-all', '取消暂存所有更改', 'remove');
  working.heading.append(stageAll);
  staged.heading.append(unstageAll);
  const intro = document.createElement('p');
  intro.className = 'wb-scm-intro';
  intro.hidden = true;
  intro.textContent = '这是新仓库：暂存全部更改并填写说明，创建首次提交。';
  element.append(intro, toolbar, form, working.section, staged.section);
  host.replaceChildren(element);
  const controls: { button: HTMLButtonElement; path: string; action: FileAction }[] = [];
  let status: WorkbenchStatus | null = null;
  let projectId = options.session.state.projectId;
  let generation = 0;
  let repoBusy = false;
  let externalBusy = false;
  let disposed = false;
  const commitHistory = new Map<string, string[]>();
  let historyIndex = -1;

  function historyFor(id: string): string[] {
    const history = commitHistory.get(id);
    if (history) return history;
    const created: string[] = [];
    commitHistory.set(id, created);
    return created;
  }

  function replayHistory(direction: -1 | 1): void {
    const history = historyFor(projectId ?? '');
    if (!history.length) return;
    historyIndex = Math.min(history.length - 1, Math.max(-1, historyIndex + direction));
    message.value = historyIndex === -1 ? '' : history[history.length - 1 - historyIndex];
    syncControls();
  }

  function syncControls(): void {
    if (disposed) return;
    const busy = repoBusy || externalBusy;
    message.disabled = busy || !projectId;
    const hasStaged = status?.entries.some(stagedEntry) ?? false;
    const changes = status?.entries.filter(workingEntry) ?? [];
    const unsavedChanges = changes.some(entry => options.session.isModified(entry.path));
    stageAll.disabled = busy || !projectId || !changes.length || unsavedChanges;
    stageAll.title = unsavedChanges ? '部分文件有未保存的编辑，请先保存' : '暂存所有更改';
    unstageAll.disabled = busy || !projectId || !hasStaged;
    commitButton.disabled = busy || !projectId || !hasStaged || !message.value.trim();
    commitButton.title =
      !hasStaged ? '没有暂存的更改'
      : !message.value.trim() ? '请填写提交说明'
      : '提交已暂存内容';
    hint.textContent = options.session.state.dirty ? '提交仅包含暂存区；未保存的编辑不会被提交。' : '';
    hint.hidden = !hint.textContent;
    for (const control of controls)
      control.button.disabled =
        busy || !projectId || (control.action === 'stage' && options.session.isModified(control.path));
  }

  function launch(operation: () => Promise<void>): void {
    const expected = generation;
    void operation().catch(cause => {
      if (!disposed && generation === expected) options.onError(cause);
    });
  }

  async function mutate(operation: (id: string) => Promise<MutationResult>): Promise<void> {
    if (disposed) throw new Error('源代码管理已关闭');
    if (!projectId) throw new Error('请先打开项目');
    if (repoBusy || externalBusy) throw new Error('Git 操作仍在进行');
    const expected = generation;
    const id = projectId;
    repoBusy = true;
    syncControls();
    try {
      const result = await operation(id);
      if (disposed || generation !== expected || result?.changed === false) return;
      if (result?.snapshot) await options.onDidChange(result.snapshot, result.paths);
      else await options.onDidChange();
    } finally {
      repoBusy = false;
      syncControls();
    }
  }

  async function commit(): Promise<void> {
    if (!status?.entries.some(stagedEntry)) throw new Error('没有暂存的更改');
    if (!message.value.trim()) throw new Error('请填写提交说明');
    const original = message.value;
    const id = projectId;
    if (!id) throw new Error('请先打开项目');
    const trimmed = original.trim();
    await mutate(async current => {
      await options.backend.commit(current, trimmed);
    });
    if (!disposed && projectId === id) {
      const history = historyFor(id);
      if (history.at(-1) !== trimmed) history.push(trimmed);
      historyIndex = -1;
      options.onCommitMessage?.(id, trimmed);
      if (message.value === original) message.value = '';
    }
    syncControls();
  }

  async function groupAction(kind: 'working' | 'staged'): Promise<void> {
    await mutate(async id => {
      const paths = [
        ...new Set(
          (status?.entries.filter(kind === 'working' ? workingEntry : stagedEntry) ?? []).map(entry => entry.path)
        )
      ];
      if (!paths.length) throw new Error(kind === 'working' ? '没有可暂存的更改' : '没有暂存的更改');
      if (kind === 'staged') {
        await options.backend.unstage(id, paths);
        return;
      }
      if (paths.some(path => options.session.isModified(path))) throw new Error('部分文件有未保存的编辑，请先保存');
      await options.backend.stage(id, paths);
    });
  }

  async function fileAction(action: FileAction, entry: Entry): Promise<void> {
    await mutate(async id => {
      if (action === 'unstage') {
        await options.backend.unstage(id, [entry.path]);
        return;
      }
      if (action === 'stage') {
        if (options.session.isModified(entry.path)) throw new Error('此文件有未保存的编辑，请先保存');
        await options.backend.stage(id, [entry.path]);
        return;
      }
      const untracked = entry.index === '?' && entry.worktree === '?';
      const unsaved = options.session.isModified(entry.path) ? ' 此文件未保存的编辑也会被丢弃。' : '';
      const confirmed = await confirmWorkbenchAction(
        host,
        untracked ? '删除未跟踪文件' : '丢弃文件更改',
        (untracked ?
          `将永久删除 ${entry.path}。此文件尚未进入暂存区。`
        : `将 ${entry.path} 恢复到暂存区版本。其他文件与已暂存内容保持不变。`) + unsaved,
        untracked ? '删除文件' : '丢弃更改'
      );
      if (!confirmed || disposed || projectId !== id) return { changed: false };
      const snapshot = await options.backend.discardWorking(id, entry.path);
      return { snapshot, paths: [entry.path] };
    });
  }

  function row(entry: Entry, kind: 'working' | 'staged', display: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'wb-scm-change';
    const file = document.createElement('button');
    file.type = 'button';
    file.className = 'wb-scm-file';
    file.dataset['scmPath'] = entry.path;
    file.title = entry.originalPath ? `${entry.originalPath} → ${entry.path}` : entry.path;
    const name = document.createElement('span');
    name.className = 'wb-scm-name';
    name.textContent = display.split('/').at(-1) ?? display;
    const directory = document.createElement('span');
    directory.className = 'wb-scm-directory';
    directory.textContent = display.includes('/') ? display.slice(0, display.lastIndexOf('/')) : '';
    const decoration = document.createElement('span');
    decoration.className = 'wb-scm-status';
    const state = kind === 'staged' ? entry.index : entry.worktree;
    const badge = state === '?' ? 'U' : state;
    decoration.textContent = badge;
    decoration.dataset['status'] = badge;
    file.append(createFileIcon(entry.path), name, directory);
    container.append(file, decoration);
    file.onclick = event => {
      event.stopPropagation();
      launch(async () => {
        await options.onOpenDiff({ path: entry.path, kind });
      });
    };
    const open = actionButton('open', `打开文件 ${entry.path}`, 'go-to-file');
    open.onclick = event => {
      event.stopPropagation();
      launch(() => Promise.resolve(options.onOpenFile(entry.path)));
    };
    container.append(open);
    const actions = kind === 'staged' ? (['unstage'] as const) : (['stage', 'discard'] as const);
    for (const action of actions) {
      const untracked = entry.index === '?' && entry.worktree === '?';
      const label =
        action === 'stage' ? `暂存更改 ${entry.path}`
        : action === 'unstage' ? `取消暂存 ${entry.path}`
        : untracked ? `删除未跟踪文件 ${entry.path}`
        : `丢弃更改 ${entry.path}`;
      const button = actionButton(
        action,
        label,
        action === 'stage' ? 'add'
        : action === 'unstage' ? 'remove'
        : 'discard'
      );
      button.onclick = event => {
        event.stopPropagation();
        launch(() => fileAction(action, entry));
      };
      controls.push({ button, path: entry.path, action });
      container.append(button);
    }
    return container;
  }

  /** 按目录树分组渲染条目；克隆只改展示路径，操作始终携带完整路径。 */
  function appendRows(
    list: HTMLElement,
    items: readonly { entry: Entry; display: string }[],
    kind: 'working' | 'staged',
    depth: number
  ): void {
    const folders = new Map<string, { entry: Entry; display: string }[]>();
    const direct: { entry: Entry; display: string }[] = [];
    for (const item of items) {
      const slash = item.display.indexOf('/');
      if (slash === -1) direct.push(item);
      else {
        const folder = item.display.slice(0, slash);
        const group = folders.get(folder) ?? [];
        group.push({ entry: item.entry, display: item.display.slice(slash + 1) });
        folders.set(folder, group);
      }
    }
    for (const [folder, children] of [...folders.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const folderRow = document.createElement('div');
      folderRow.className = 'wb-scm-folder';
      folderRow.style.paddingLeft = `${depth * 12}px`;
      folderRow.append(createCodicon(folderCodicon(true)));
      const label = document.createElement('span');
      label.textContent = folder;
      folderRow.append(label);
      list.append(folderRow);
      appendRows(list, children, kind, depth + 1);
    }
    for (const item of direct) {
      const entryRow = row(item.entry, kind, item.display);
      entryRow.style.paddingLeft = `${depth * 12}px`;
      list.append(entryRow);
    }
  }

  function render(): void {
    controls.splice(0);
    staged.list.replaceChildren();
    working.list.replaceChildren();
    const stagedEntries = status?.entries.filter(stagedEntry) ?? [];
    const workingEntries = status?.entries.filter(workingEntry) ?? [];
    intro.hidden = status === null || status.head !== null || workingEntries.length === 0;
    staged.count.textContent = String(stagedEntries.length);
    working.count.textContent = String(workingEntries.length);
    staged.count.hidden = stagedEntries.length === 0;
    working.count.hidden = workingEntries.length === 0;
    appendRows(
      staged.list,
      stagedEntries.map(entry => ({ entry, display: entry.path })),
      'staged',
      0
    );
    appendRows(
      working.list,
      workingEntries.map(entry => ({ entry, display: entry.path })),
      'working',
      0
    );
    syncControls();
  }

  message.oninput = syncControls;
  stageAll.onclick = event => {
    event.stopPropagation();
    launch(() => groupAction('working'));
  };
  unstageAll.onclick = event => {
    event.stopPropagation();
    launch(() => groupAction('staged'));
  };
  message.onkeydown = event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      replayHistory(event.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!commitButton.disabled) launch(commit);
  };
  form.onsubmit = event => {
    event.preventDefault();
    event.stopPropagation();
    if (!commitButton.disabled) launch(commit);
  };
  const release = options.session.subscribe(state => {
    if (state.projectId !== projectId) {
      projectId = state.projectId;
      generation++;
      status = null;
      historyIndex = -1;
      message.value =
        (projectId ? options.getSavedMessage?.(projectId) : undefined) ?? historyFor(projectId ?? '').at(-1) ?? '';
      render();
    } else syncControls();
  });
  render();

  return {
    update(next) {
      if (disposed) return;
      status = next;
      render();
    },
    setBusy(busy) {
      externalBusy = busy;
      syncControls();
    },
    setAlwaysShowActions(enabled) {
      if (disposed) return;
      element.classList.toggle('wb-scm-show-actions', enabled);
    },
    restoreMessage(value) {
      if (disposed) return;
      message.value = value;
      historyIndex = -1;
      syncControls();
    },
    commit,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      release();
      element.remove();
      controls.splice(0);
    }
  };
}
