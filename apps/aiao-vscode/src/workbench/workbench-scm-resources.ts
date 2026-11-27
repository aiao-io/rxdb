import type { WorkbenchStatus } from './session.js';
import { createCodicon, createFileIcon, type CodiconName } from './workbench-icons.js';

/** 更改列表的展示方式。 */
export type WorkbenchScmViewMode = 'list' | 'tree';
/** 平铺更改列表的排序字段。 */
export type WorkbenchScmSortKey = 'path' | 'name' | 'status';
/** 源代码管理资源所在的差异分组。 */
export type ScmGroup = 'working' | 'staged';
/** 源代码管理文件的可用操作。 */
export type ScmFileAction = 'open' | 'stage' | 'unstage' | 'discard';
export type ScmEntry = WorkbenchStatus['entries'][number];

/** 更改列表将文件动作与宿主的 Git 操作分离。 */
export interface ScmResourceOptions {
  readonly viewMode: WorkbenchScmViewMode;
  readonly sortKey: WorkbenchScmSortKey;
  readonly collapsed: Set<string>;
  readonly selected: string | null;
  onOpen(entry: ScmEntry, kind: ScmGroup): void;
  onAction(action: ScmFileAction, entry: ScmEntry): void;
  onContextMenu(event: MouseEvent, entry: ScmEntry, kind: ScmGroup): void;
  onToggle(): void;
}

/** 统一创建带可访问名称的资源操作按钮。 */
export function scmActionButton(action: string, label: string, icon: CodiconName): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['scmAction'] = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createCodicon(icon));
  return button;
}

/** 返回文件对应分组的状态字母。 */
export function scmStatus(entry: ScmEntry, kind: ScmGroup): string {
  const state = kind === 'staged' ? entry.index : entry.worktree;
  return state === '?' ? 'U' : state;
}

const stateLabels: Readonly<Record<string, string>> = {
  M: '已修改',
  A: '已添加',
  D: '已删除',
  R: '已重命名',
  C: '已复制',
  T: '类型已更改',
  U: '未跟踪'
};
let resourceGroupId = 0;

/** 给文件动作提供与分组一致的名称和图标。 */
export function scmFileAction(action: ScmFileAction, entry: ScmEntry): { label: string; icon: CodiconName } {
  if (action === 'open') return { label: `打开文件 ${entry.path}`, icon: 'go-to-file' };
  if (action === 'stage') return { label: `暂存更改 ${entry.path}`, icon: 'add' };
  if (action === 'unstage') return { label: `取消暂存 ${entry.path}`, icon: 'remove' };
  const untracked = entry.index === '?' && entry.worktree === '?';
  return { label: `${untracked ? '删除未跟踪文件' : '丢弃更改'} ${entry.path}`, icon: 'discard' };
}

function compareEntries(left: ScmEntry, right: ScmEntry, kind: ScmGroup, key: WorkbenchScmSortKey): number {
  if (key === 'name')
    return (
      (left.path.split('/').at(-1) ?? '').localeCompare(right.path.split('/').at(-1) ?? '') ||
      left.path.localeCompare(right.path)
    );
  if (key === 'status')
    return scmStatus(left, kind).localeCompare(scmStatus(right, kind)) || left.path.localeCompare(right.path);
  return left.path.localeCompare(right.path);
}

function resourceRow(entry: ScmEntry, kind: ScmGroup, depth: number, options: ScmResourceOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'wb-scm-change';
  container.style.paddingLeft = `${depth * 12}px`;
  const state = scmStatus(entry, kind);
  container.dataset['status'] = state;
  const file = document.createElement('button');
  file.type = 'button';
  file.className = 'wb-scm-file';
  file.dataset['scmPath'] = entry.path;
  file.dataset['scmNode'] = `${kind}:file:${entry.path}`;
  file.setAttribute('role', 'treeitem');
  file.setAttribute('aria-level', String(depth + 1));
  file.setAttribute('aria-label', `${entry.path}，${stateLabels[state] ?? state}`);
  file.setAttribute('aria-selected', String(file.dataset['scmNode'] === options.selected));
  file.tabIndex = -1;
  file.title = entry.originalPath ? `${entry.originalPath} → ${entry.path}` : entry.path;
  const name = document.createElement('span');
  name.className = 'wb-scm-name';
  name.textContent = entry.path.split('/').at(-1) ?? entry.path;
  const directory = document.createElement('span');
  directory.className = 'wb-scm-directory';
  directory.textContent =
    options.viewMode === 'list' ? entry.path.slice(0, Math.max(0, entry.path.lastIndexOf('/'))) : '';
  const decoration = document.createElement('span');
  decoration.className = 'wb-scm-status';
  decoration.textContent = state;
  decoration.dataset['status'] = state;
  decoration.title = stateLabels[state] ?? state;
  decoration.setAttribute('aria-hidden', 'true');
  file.append(createFileIcon(entry.path), name, directory);
  file.onclick = event => {
    event.stopPropagation();
    options.onOpen(entry, kind);
  };
  container.oncontextmenu = event => options.onContextMenu(event, entry, kind);
  container.append(file);
  const actions: readonly ScmFileAction[] = kind === 'staged' ? ['open', 'unstage'] : ['open', 'discard', 'stage'];
  for (const action of actions) {
    const { label, icon } = scmFileAction(action, entry);
    const button = scmActionButton(action, label, icon);
    button.dataset['scmTarget'] = entry.path;
    button.onclick = event => {
      event.stopPropagation();
      options.onAction(action, entry);
    };
    container.append(button);
  }
  container.append(decoration);
  return container;
}

function appendTree(
  list: HTMLElement,
  entries: readonly ScmEntry[],
  kind: ScmGroup,
  prefix: string,
  depth: number,
  options: ScmResourceOptions
): void {
  const folders = new Map<string, ScmEntry[]>();
  const direct: ScmEntry[] = [];
  for (const entry of entries) {
    const relative = entry.path.slice(prefix.length);
    const slash = relative.indexOf('/');
    if (slash === -1) direct.push(entry);
    else {
      const folder = relative.slice(0, slash);
      const children = folders.get(folder) ?? [];
      children.push(entry);
      folders.set(folder, children);
    }
  }
  for (const [folder, children] of [...folders].sort(([left], [right]) => left.localeCompare(right))) {
    const path = `${prefix}${folder}`;
    const key = `${kind}:folder:${path}`;
    const collapsed = options.collapsed.has(key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wb-scm-folder';
    button.dataset['scmNode'] = key;
    button.dataset['scmFolder'] = path;
    button.style.paddingLeft = `${depth * 12 + 6}px`;
    button.setAttribute('role', 'treeitem');
    button.setAttribute('aria-label', path);
    button.setAttribute('aria-level', String(depth + 1));
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-selected', String(key === options.selected));
    button.tabIndex = -1;
    const label = document.createElement('span');
    label.textContent = folder;
    button.append(createCodicon(collapsed ? 'chevron-right' : 'chevron-down'), label);
    button.onclick = event => {
      event.stopPropagation();
      if (options.collapsed.has(key)) options.collapsed.delete(key);
      else options.collapsed.add(key);
      options.onToggle();
    };
    list.append(button);
    const group = document.createElement('div');
    group.id = `wb-scm-resources-${++resourceGroupId}`;
    button.setAttribute('aria-owns', group.id);
    button.setAttribute('aria-controls', group.id);
    group.setAttribute('role', 'group');
    group.hidden = collapsed;
    appendTree(group, children, kind, `${path}/`, depth + 1, options);
    list.append(group);
  }
  for (const entry of direct.sort((left, right) => left.path.localeCompare(right.path)))
    list.append(resourceRow(entry, kind, depth, options));
}

/** 渲染完整路径资源；树模式的展示路径不会改变 Git 操作目标。 */
export function renderScmResources(
  list: HTMLElement,
  entries: readonly ScmEntry[],
  kind: ScmGroup,
  options: ScmResourceOptions
): void {
  list.replaceChildren();
  if (options.viewMode === 'tree') appendTree(list, entries, kind, '', 0, options);
  else
    for (const entry of [...entries].sort((left, right) => compareEntries(left, right, kind, options.sortKey)))
      list.append(resourceRow(entry, kind, 0, options));
}
