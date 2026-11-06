import type { WorkbenchBackend, WorkbenchSession, WorkbenchSnapshot, WorkbenchStatus } from './session.js';
import { confirmWorkbenchAction } from './workbench-dialog.js';
import { createCodicon } from './workbench-icons.js';
import {
  renderScmResources,
  scmActionButton,
  scmFileAction,
  type ScmEntry,
  type ScmFileAction,
  type ScmGroup,
  type WorkbenchScmSortKey,
  type WorkbenchScmViewMode
} from './workbench-scm-resources.js';

/** SCM 文件点击请求，由宿主打开对应差异编辑器。 */
export interface WorkbenchDiffRequest {
  readonly path: string;
  readonly kind: ScmGroup;
}

/** 源代码管理复用宿主的上下文菜单。 */
export type WorkbenchScmMenuEntry =
  | {
      readonly label: string;
      readonly id?: string;
      readonly disabled?: boolean;
      readonly checked?: boolean;
      readonly action: () => void | Promise<unknown>;
    }
  | { readonly separator: true };

/** 源代码管理视图使用已保存的工作区和真实 Git 暂存区。 */
export interface WorkbenchScmOptions {
  readonly backend: WorkbenchBackend;
  readonly session: WorkbenchSession;
  onOpenDiff(request: WorkbenchDiffRequest): void | Promise<void>;
  onOpenFile(path: string): void | Promise<void>;
  onError(cause: unknown): void;
  onDidChange(snapshot?: WorkbenchSnapshot, paths?: readonly string[]): void | Promise<void>;
  onRefresh?(): void | Promise<void>;
  onContextMenu?(position: { x: number; y: number }, entries: readonly WorkbenchScmMenuEntry[]): void;
  getSavedMessage?(projectId: string): string | undefined;
  onCommitMessage?(projectId: string, message: string): void;
}

/** 宿主统一刷新状态，视图负责明确的文件、提交和展示操作。 */
export interface WorkbenchScm {
  update(status: WorkbenchStatus): void;
  setBusy(busy: boolean): void;
  setAlwaysShowActions(enabled: boolean): void;
  setViewMode(mode: WorkbenchScmViewMode): void;
  setSortKey(key: WorkbenchScmSortKey): void;
  getMenuEntries(): readonly WorkbenchScmMenuEntry[];
  restoreMessage(message: string): void;
  commit(): Promise<void>;
  dispose(): void;
}

type MutationResult = {
  readonly changed?: boolean;
  readonly snapshot?: WorkbenchSnapshot;
  readonly paths?: readonly string[];
} | void;
const stagedEntry = (entry: ScmEntry): boolean => /^[MADRCT]$/.test(entry.index);
const workingEntry = (entry: ScmEntry): boolean => /^[MDRT?]$/.test(entry.worktree);
const separator = { separator: true } as const;

function changeGroup(kind: ScmGroup, title: string) {
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
  list.setAttribute('role', 'tree');
  list.setAttribute('aria-label', title);
  const heading = document.createElement('div');
  heading.className = 'wb-scm-group-heading';
  header.append(chevron, label);
  heading.append(header, count);
  section.append(heading, list);
  header.onclick = event => {
    event.stopPropagation();
    list.hidden = !list.hidden;
    header.setAttribute('aria-expanded', String(!list.hidden));
    const next = createCodicon(list.hidden ? 'chevron-right' : 'chevron-down');
    chevron.replaceWith(next);
    chevron = next;
  };
  return { section, list, count, heading, header };
}

/** 挂载暂存、更改和提交说明；不会自动保存或自动暂存编辑缓冲。 */
export function createWorkbenchScm(host: HTMLElement, options: WorkbenchScmOptions): WorkbenchScm {
  const element = document.createElement('section');
  element.className = 'wb-scm';
  element.setAttribute('aria-label', '源代码管理');
  const form = document.createElement('form');
  form.className = 'wb-scm-commit-form';
  const message = document.createElement('textarea');
  message.rows = 1;
  message.setAttribute('aria-label', '提交说明');
  const shortcut = /mac/i.test(host.ownerDocument.defaultView?.navigator.platform ?? '') ? '⌘' : 'Ctrl';
  message.placeholder = `消息 (${shortcut}+Enter 提交)`;
  const commitButton = scmActionButton('commit', '提交已暂存内容', 'check');
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
  form.append(message, toolbar, hint);
  const staged = changeGroup('staged', '暂存的更改');
  const working = changeGroup('working', '更改');
  const stageAll = scmActionButton('stage-all', '暂存所有更改', 'add');
  const unstageAll = scmActionButton('unstage-all', '取消暂存所有更改', 'remove');
  const discardAll = scmActionButton('discard-all', '丢弃所有更改', 'discard');
  working.heading.insertBefore(discardAll, working.count);
  working.heading.insertBefore(stageAll, working.count);
  staged.heading.insertBefore(unstageAll, staged.count);
  const intro = document.createElement('p');
  intro.className = 'wb-scm-intro';
  intro.hidden = true;
  intro.textContent = '暂存更改并填写说明，创建首次提交。';
  const empty = document.createElement('p');
  empty.className = 'wb-scm-empty';
  empty.setAttribute('role', 'status');
  element.append(intro, form, staged.section, working.section, empty);
  host.replaceChildren(element);
  let status: WorkbenchStatus | null = null;
  let projectId = options.session.state.projectId;
  let generation = 0;
  let repoBusy = false;
  let externalBusy = false;
  let disposed = false;
  let viewMode: WorkbenchScmViewMode = 'list';
  let sortKey: WorkbenchScmSortKey = 'path';
  let selected: string | null = null;
  const collapsed = new Set<string>();
  const commitHistory = new Map<string, string[]>();
  let historyIndex = -1;
  let historyDraft = '';

  function entries(kind: ScmGroup): readonly ScmEntry[] {
    return status?.entries.filter(kind === 'working' ? workingEntry : stagedEntry) ?? [];
  }

  function historyFor(id: string): string[] {
    const history = commitHistory.get(id);
    if (history) return history;
    const created: string[] = [];
    commitHistory.set(id, created);
    return created;
  }

  function resizeMessage(): void {
    message.style.height = 'auto';
    message.style.height = `${Math.min(134, Math.max(26, message.scrollHeight))}px`;
  }

  function replayHistory(direction: -1 | 1): boolean {
    const history = historyFor(projectId ?? '');
    if (!history.length || (direction === -1 && historyIndex === -1)) return false;
    if (historyIndex === -1) historyDraft = message.value;
    historyIndex = Math.min(history.length - 1, Math.max(-1, historyIndex + direction));
    message.value = historyIndex === -1 ? historyDraft : history[history.length - 1 - historyIndex];
    const cursor = direction === 1 ? 0 : message.value.length;
    message.setSelectionRange(cursor, cursor);
    resizeMessage();
    syncControls();
    return true;
  }

  function busy(): boolean {
    return repoBusy || externalBusy;
  }

  function syncControls(): void {
    if (disposed) return;
    message.disabled = busy() || !projectId;
    form.hidden = !projectId;
    const hasStaged = entries('staged').length > 0;
    const changes = entries('working');
    const unsavedChanges = changes.some(entry => options.session.isModified(entry.path));
    stageAll.disabled = busy() || !projectId || !changes.length || unsavedChanges;
    stageAll.title = unsavedChanges ? '部分文件有未保存的编辑，请先保存' : '暂存所有更改';
    unstageAll.disabled = busy() || !projectId || !hasStaged;
    discardAll.disabled = busy() || !projectId || !changes.length;
    commitButton.disabled = busy() || !projectId || !hasStaged || !message.value.trim();
    commitButton.title =
      !hasStaged ? '没有暂存的更改'
      : !message.value.trim() ? '请填写提交说明'
      : '提交已暂存内容';
    hint.textContent = options.session.state.dirty ? '提交仅包含暂存区；未保存的编辑不会被提交。' : '';
    hint.hidden = !hint.textContent;
    for (const button of element.querySelectorAll<HTMLButtonElement>('[data-scm-target]')) {
      const path = button.dataset['scmTarget'] ?? '';
      const action = button.dataset['scmAction'];
      button.disabled =
        action === 'open' ?
          !(path in options.session.state.files)
        : busy() || !projectId || (action === 'stage' && options.session.isModified(path));
    }
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
    if (busy()) throw new Error('Git 操作仍在进行');
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
    if (!entries('staged').length) throw new Error('没有暂存的更改');
    if (!message.value.trim()) throw new Error('请填写提交说明');
    const original = message.value;
    const id = projectId;
    const expected = generation;
    if (!id) throw new Error('请先打开项目');
    const trimmed = original.trim();
    await mutate(async current => {
      await options.backend.commit(current, trimmed);
    });
    if (!disposed && generation === expected && projectId === id) {
      const history = historyFor(id);
      if (history.at(-1) !== trimmed) history.push(trimmed);
      historyIndex = -1;
      options.onCommitMessage?.(id, trimmed);
      if (message.value === original) message.value = '';
    }
    resizeMessage();
    syncControls();
  }

  async function groupAction(kind: ScmGroup): Promise<void> {
    await mutate(async id => {
      const paths = [...new Set(entries(kind).map(entry => entry.path))];
      if (!paths.length) throw new Error(kind === 'working' ? '没有可暂存的更改' : '没有暂存的更改');
      if (kind === 'staged') return options.backend.unstage(id, paths);
      if (paths.some(path => options.session.isModified(path))) throw new Error('部分文件有未保存的编辑，请先保存');
      await options.backend.stage(id, paths);
    });
  }

  async function discardPaths(id: string, paths: readonly string[], expected: number): Promise<MutationResult> {
    let snapshot: WorkbenchSnapshot | undefined;
    const completed: string[] = [];
    try {
      for (const path of paths) {
        if (disposed || generation !== expected || projectId !== id) return { changed: false };
        snapshot = await options.backend.discardWorking(id, path);
        if (disposed || generation !== expected || projectId !== id) return { changed: false };
        completed.push(path);
      }
    } catch (cause) {
      if (snapshot && !disposed && generation === expected && projectId === id)
        await options.onDidChange(snapshot, completed);
      throw cause;
    }
    return { snapshot, paths: completed };
  }

  async function discard(items: readonly ScmEntry[]): Promise<void> {
    if (!items.length) return;
    const expected = generation;
    await mutate(async id => {
      const entry = items[0];
      const multiple = items.length > 1;
      const untracked = entry.index === '?' && entry.worktree === '?';
      const title =
        multiple ? '丢弃所有更改'
        : untracked ? '删除未跟踪文件'
        : '丢弃文件更改';
      const description =
        multiple ? `将丢弃 ${items.length} 个文件的更改。已跟踪文件恢复到暂存区版本，未跟踪文件将永久删除。`
        : untracked ? `将永久删除 ${entry.path}。此文件尚未进入暂存区。`
        : `将 ${entry.path} 恢复到暂存区版本。其他文件与已暂存内容保持不变。`;
      const unsaved = items.some(item => options.session.isModified(item.path)) ? ' 未保存的编辑也会被丢弃。' : '';
      const confirmed = await confirmWorkbenchAction(
        host,
        title,
        description + unsaved,
        multiple ? '丢弃所有更改'
        : untracked ? '删除文件'
        : '丢弃更改'
      );
      if (!confirmed || disposed || generation !== expected || projectId !== id) return { changed: false };
      return discardPaths(id, [...new Set(items.map(item => item.path))], expected);
    });
  }

  async function fileAction(action: ScmFileAction, entry: ScmEntry): Promise<void> {
    if (action === 'open') {
      await options.onOpenFile(entry.path);
      return;
    }
    if (action === 'discard') return discard([entry]);
    await mutate(async id => {
      if (action === 'unstage') return options.backend.unstage(id, [entry.path]);
      if (options.session.isModified(entry.path)) throw new Error('此文件有未保存的编辑，请先保存');
      await options.backend.stage(id, [entry.path]);
    });
  }

  function fileMenu(event: MouseEvent, entry: ScmEntry, kind: ScmGroup): void {
    event.preventDefault();
    event.stopPropagation();
    const expected = generation;
    const actions: readonly ScmFileAction[] = kind === 'staged' ? ['open', 'unstage'] : ['open', 'discard', 'stage'];
    const menu: WorkbenchScmMenuEntry[] = [
      {
        label: '打开更改',
        action: () => {
          if (disposed || generation !== expected) return;
          return options.onOpenDiff({ path: entry.path, kind });
        }
      }
    ];
    for (const action of actions) {
      const { label } = scmFileAction(action, entry);
      const disabled =
        action === 'open' ?
          !(entry.path in options.session.state.files)
        : busy() || (action === 'stage' && options.session.isModified(entry.path));
      menu.push({
        label,
        disabled,
        action: () => {
          if (disposed || generation !== expected) return;
          return fileAction(action, entry);
        }
      });
    }
    options.onContextMenu?.({ x: event.clientX, y: event.clientY }, menu);
  }

  function visibleNodes(): HTMLButtonElement[] {
    return [...element.querySelectorAll<HTMLButtonElement>('[data-scm-node]')].filter(
      node => !node.closest('[hidden]')
    );
  }

  function selectNode(node: HTMLButtonElement): void {
    selected = node.dataset['scmNode'] ?? null;
    for (const item of element.querySelectorAll<HTMLButtonElement>('[data-scm-node]')) {
      item.tabIndex = item === node ? 0 : -1;
      item.setAttribute('aria-selected', String(item === node));
    }
  }

  function render(): void {
    if (disposed) return;
    const active = host.ownerDocument.activeElement;
    const activeElement = active instanceof HTMLElement ? active : null;
    const focusedRow = activeElement?.closest('.wb-scm-change');
    const focusedNode = focusedRow?.querySelector<HTMLButtonElement>('[data-scm-node]') ?? activeElement;
    const focusKey = focusedNode?.dataset['scmNode'];
    const focusPath = focusedNode?.dataset['scmPath'];
    const focusAction = activeElement?.dataset['scmAction'];
    const focusIndex = visibleNodes().findIndex(node => node.dataset['scmNode'] === focusKey);
    const resourceOptions = {
      viewMode,
      sortKey,
      collapsed,
      selected,
      onOpen(entry: ScmEntry, kind: ScmGroup) {
        launch(() => Promise.resolve(options.onOpenDiff({ path: entry.path, kind })));
      },
      onAction(action: ScmFileAction, entry: ScmEntry) {
        launch(() => fileAction(action, entry));
      },
      onContextMenu: fileMenu,
      onToggle: render
    };
    for (const [kind, group] of [
      ['staged', staged],
      ['working', working]
    ] as const) {
      const items = entries(kind);
      group.section.hidden = !items.length;
      group.count.textContent = String(items.length);
      group.count.hidden = !items.length;
      renderScmResources(group.list, items, kind, resourceOptions);
    }
    intro.hidden = status === null || status.head !== null || !entries('working').length;
    empty.hidden = Boolean(status?.entries.length);
    empty.textContent =
      !projectId ? '请先打开项目以管理源代码。'
      : status ? '没有更改'
      : '正在读取更改…';
    const nodes = visibleNodes();
    const next =
      nodes.find(node => node.dataset['scmNode'] === (focusKey ?? selected)) ??
      (focusPath ? nodes.find(node => node.dataset['scmPath'] === focusPath) : undefined) ??
      nodes[Math.min(Math.max(0, focusIndex), nodes.length - 1)];
    syncControls();
    if (next) {
      if (selected || focusKey) selectNode(next);
      else next.tabIndex = 0;
      const nextAction =
        focusAction ?
          [...(next.closest('.wb-scm-change')?.querySelectorAll<HTMLButtonElement>('[data-scm-action]') ?? [])].find(
            button => button.dataset['scmAction'] === focusAction && !button.disabled
          )
        : undefined;
      if (focusKey) (nextAction ?? next).focus();
    } else if (focusKey) message.focus();
  }

  function setViewMode(mode: WorkbenchScmViewMode): void {
    viewMode = mode;
    render();
  }
  function setSortKey(key: WorkbenchScmSortKey): void {
    sortKey = key;
    render();
  }

  function collapseAll(): void {
    for (const folder of element.querySelectorAll<HTMLElement>('[data-scm-folder]'))
      if (folder.dataset['scmNode']) collapsed.add(folder.dataset['scmNode']);
    render();
  }

  function getMenuEntries(): readonly WorkbenchScmMenuEntry[] {
    return [
      { label: '提交已暂存内容', id: 'scm-commit', disabled: commitButton.disabled, action: commit },
      { label: '暂存所有更改', id: 'scm-stage-all', disabled: stageAll.disabled, action: () => groupAction('working') },
      {
        label: '取消暂存所有更改',
        id: 'scm-unstage-all',
        disabled: unstageAll.disabled,
        action: () => groupAction('staged')
      },
      {
        label: '丢弃所有更改',
        id: 'scm-discard-all',
        disabled: discardAll.disabled,
        action: () => discard(entries('working'))
      },
      { label: '刷新', id: 'scm-refresh', disabled: busy() || !projectId, action: () => options.onRefresh?.() },
      separator,
      { label: '以列表形式查看', id: 'scm-view-list', checked: viewMode === 'list', action: () => setViewMode('list') },
      { label: '以树形式查看', id: 'scm-view-tree', checked: viewMode === 'tree', action: () => setViewMode('tree') },
      separator,
      {
        label: '按路径排序',
        id: 'scm-sort-path',
        checked: sortKey === 'path',
        disabled: viewMode === 'tree',
        action: () => setSortKey('path')
      },
      {
        label: '按名称排序',
        id: 'scm-sort-name',
        checked: sortKey === 'name',
        disabled: viewMode === 'tree',
        action: () => setSortKey('name')
      },
      {
        label: '按状态排序',
        id: 'scm-sort-status',
        checked: sortKey === 'status',
        disabled: viewMode === 'tree',
        action: () => setSortKey('status')
      },
      {
        label: '折叠全部',
        id: 'scm-collapse-all',
        disabled: viewMode !== 'tree' || !status?.entries.length,
        action: collapseAll
      }
    ];
  }

  element.addEventListener('focusin', event => {
    const node = event.target;
    if (!(node instanceof HTMLButtonElement)) return;
    const resource =
      node.dataset['scmNode'] ?
        node
      : node.closest('.wb-scm-change')?.querySelector<HTMLButtonElement>('[data-scm-node]');
    if (resource) selectNode(resource);
  });
  element.onkeydown = event => {
    const node = event.target;
    if (
      !(node instanceof HTMLButtonElement) ||
      !node.dataset['scmNode'] ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const nodes = visibleNodes();
    const index = nodes.indexOf(node);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') next = nodes[Math.min(nodes.length - 1, index + 1)];
    else if (event.key === 'ArrowUp') next = nodes[Math.max(0, index - 1)];
    else if (event.key === 'Home') next = nodes[0];
    else if (event.key === 'End') next = nodes.at(-1);
    else if (event.key === 'ArrowRight' && node.hasAttribute('aria-expanded')) {
      if (node.getAttribute('aria-expanded') === 'false') node.click();
      else next = nodes[index + 1];
    } else if (event.key === 'ArrowLeft') {
      if (node.getAttribute('aria-expanded') === 'true') node.click();
      else
        next = nodes
          .slice(0, index)
          .reverse()
          .find(item => Number(item.getAttribute('aria-level')) < Number(node.getAttribute('aria-level')));
    } else return;
    event.preventDefault();
    event.stopPropagation();
    next?.focus();
  };
  message.oninput = () => {
    historyIndex = -1;
    resizeMessage();
    syncControls();
  };
  stageAll.onclick = event => {
    event.stopPropagation();
    launch(() => groupAction('working'));
  };
  unstageAll.onclick = event => {
    event.stopPropagation();
    launch(() => groupAction('staged'));
  };
  discardAll.onclick = event => {
    event.stopPropagation();
    launch(() => discard(entries('working')));
  };
  message.onkeydown = event => {
    if (event.isComposing) return;
    const unmodified = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const caret = message.selectionStart === message.selectionEnd;
    const atStart = message.selectionStart === 0;
    const atEnd = message.selectionEnd === message.value.length;
    const historyKey = (event.key === 'ArrowUp' && atStart) || (event.key === 'ArrowDown' && atEnd);
    if (unmodified && caret && historyKey && replayHistory(event.key === 'ArrowUp' ? 1 : -1)) {
      event.preventDefault();
      event.stopPropagation();
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
    if (state.projectId === projectId) {
      syncControls();
      return;
    }
    projectId = state.projectId;
    generation++;
    status = null;
    selected = null;
    collapsed.clear();
    historyIndex = -1;
    message.value =
      (projectId ? options.getSavedMessage?.(projectId) : undefined) ?? historyFor(projectId ?? '').at(-1) ?? '';
    resizeMessage();
    render();
  });
  render();

  return {
    update(next) {
      if (!disposed) {
        status = next;
        render();
      }
    },
    setBusy(value) {
      externalBusy = value;
      syncControls();
    },
    setAlwaysShowActions(enabled) {
      if (!disposed) element.classList.toggle('wb-scm-show-actions', enabled);
    },
    setViewMode,
    setSortKey,
    getMenuEntries,
    restoreMessage(value) {
      if (!disposed) {
        message.value = value;
        historyIndex = -1;
        resizeMessage();
        syncControls();
      }
    },
    commit,
    dispose() {
      if (!disposed) {
        disposed = true;
        generation++;
        release();
        element.remove();
      }
    }
  };
}
