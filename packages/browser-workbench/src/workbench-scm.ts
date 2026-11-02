import type { WorkbenchBackend, WorkbenchSession, WorkbenchSnapshot, WorkbenchStatus } from './session.js';
import { confirmWorkbenchAction } from './workbench-dialog.js';
import { createCodicon, createFileIcon, type CodiconName } from './workbench-icons.js';

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
  onError(cause: unknown): void;
  onDidChange(snapshot?: WorkbenchSnapshot, paths?: readonly string[]): void | Promise<void>;
}

/** 宿主统一刷新状态，视图只负责明确的文件和提交动作。 */
export interface WorkbenchScm {
  update(status: WorkbenchStatus): void;
  setBusy(busy: boolean): void;
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
  commitButton.type = 'submit';
  commitButton.className = 'wb-primary wb-scm-commit';
  const caption = document.createElement('span');
  caption.textContent = '提交';
  commitButton.append(caption);
  const hint = document.createElement('p');
  hint.className = 'wb-scm-hint';
  hint.setAttribute('role', 'status');
  form.append(message, commitButton, hint);
  const staged = changeGroup('staged', '暂存的更改');
  const working = changeGroup('working', '更改');
  const stageAll = actionButton('stage-all', '暂存所有更改', 'add');
  const unstageAll = actionButton('unstage-all', '取消暂存所有更改', 'remove');
  working.heading.append(stageAll);
  staged.heading.append(unstageAll);
  element.append(form, staged.section, working.section);
  host.replaceChildren(element);
  const controls: { button: HTMLButtonElement; path: string; action: FileAction }[] = [];
  let status: WorkbenchStatus | null = null;
  let projectId = options.session.state.projectId;
  let generation = 0;
  let repoBusy = false;
  let externalBusy = false;
  let disposed = false;

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
    await mutate(async current => {
      await options.backend.commit(current, original.trim());
    });
    if (!disposed && projectId === id && message.value === original) message.value = '';
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

  function row(entry: Entry, kind: 'working' | 'staged'): HTMLElement {
    const container = document.createElement('div');
    container.className = 'wb-scm-change';
    const file = document.createElement('button');
    file.type = 'button';
    file.className = 'wb-scm-file';
    file.dataset['scmPath'] = entry.path;
    file.title = entry.originalPath ? `${entry.originalPath} → ${entry.path}` : entry.path;
    const name = document.createElement('span');
    name.className = 'wb-scm-name';
    name.textContent = entry.path.split('/').at(-1) ?? entry.path;
    const directory = document.createElement('span');
    directory.className = 'wb-scm-directory';
    directory.textContent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
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

  function render(): void {
    controls.splice(0);
    staged.list.replaceChildren();
    working.list.replaceChildren();
    const stagedEntries = status?.entries.filter(stagedEntry) ?? [];
    const workingEntries = status?.entries.filter(workingEntry) ?? [];
    staged.count.textContent = String(stagedEntries.length);
    working.count.textContent = String(workingEntries.length);
    stagedEntries.forEach(entry => staged.list.append(row(entry, 'staged')));
    workingEntries.forEach(entry => working.list.append(row(entry, 'working')));
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
      message.value = '';
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
