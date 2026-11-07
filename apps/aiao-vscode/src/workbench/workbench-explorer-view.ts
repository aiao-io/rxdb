import {
  explorerRowGeometry,
  type ExplorerNameError,
  type ExplorerRow,
  type ExplorerStatus
} from './workbench-explorer-model.js';
import { createCodicon, createFileIcon, type CodiconName } from './workbench-icons.js';

/** 渲染一行所需的上下文：选中项、Git 装饰与激活缩进参考线所属目录。 */
export interface ExplorerRowContext {
  readonly selectedPath: string | null;
  readonly decorations: {
    readonly files: ReadonlyMap<string, ExplorerStatus>;
    readonly folders: ReadonlyMap<string, ExplorerStatus>;
  };
  readonly activeGuide: string | null;
}

/** 文件夹的 Git 传播状态以圆点显示，文件显示状态字母。 */
const FOLDER_BADGE = '•';

function createGuides(row: ExplorerRow, activeGuide: string | null): HTMLElement {
  const guides = document.createElement('span');
  guides.className = 'wb-guides';
  guides.setAttribute('aria-hidden', 'true');
  for (const [index, left] of explorerRowGeometry(row.level).guides.entries()) {
    const guide = document.createElement('i');
    guide.className = row.ancestors[index] === activeGuide ? 'wb-guide active' : 'wb-guide';
    guide.style.left = `${left}px`;
    guides.append(guide);
  }
  return guides;
}

function createLabel(row: ExplorerRow): HTMLElement {
  const label = document.createElement('span');
  label.className = 'wb-label';
  for (const [index, segment] of row.segments.entries()) {
    if (index > 0) {
      const separator = document.createElement('span');
      separator.className = 'wb-label-sep';
      separator.textContent = '/';
      label.append(separator);
    }
    const name = document.createElement('span');
    name.className = 'wb-label-name';
    name.textContent = segment;
    label.append(name);
  }
  return label;
}

/** 文件夹 / 文件行：缩进、参考线、折叠箭头或 Seti 图标、名称与 Git 装饰。 */
export function createExplorerRow(row: ExplorerRow, context: ExplorerRowContext): HTMLButtonElement {
  const folder = row.kind === 'folder';
  const button = document.createElement('button');
  button.className = folder ? 'wb-file wb-folder' : 'wb-file';
  button.dataset['treePath'] = row.key;
  button.dataset['treeParent'] = row.ancestors.at(-1) ?? '';
  button.setAttribute('role', 'treeitem');
  button.setAttribute('aria-level', String(row.level + 1));
  button.style.setProperty('--wb-level', String(row.level));
  button.title = row.key;
  const status = folder ? context.decorations.folders.get(row.key) : context.decorations.files.get(row.key);
  if (folder) {
    button.setAttribute('aria-expanded', String(row.expanded));
  } else {
    button.setAttribute('aria-current', String(row.key === context.selectedPath));
  }
  button.append(createGuides(row, context.activeGuide));
  if (folder) {
    const twistie = createCodicon(row.expanded ? 'chevron-down' : 'chevron-right');
    twistie.classList.add('wb-twistie');
    button.append(twistie);
  } else button.append(createFileIcon(row.key));
  const label = createLabel(row);
  if (!folder) label.className = 'wb-file-name';
  button.append(label);
  if (status) {
    button.dataset['status'] = status;
    const badge = document.createElement('span');
    badge.className = 'wb-file-status';
    badge.dataset['status'] = status;
    badge.textContent = folder ? FOLDER_BADGE : status;
    button.append(badge);
  }
  return button;
}

/** 树内输入行的配置：新建文件 / 文件夹或重命名，提交与取消由调用方决定如何落地。 */
export interface ExplorerInputOptions {
  readonly level: number;
  readonly kind: 'file' | 'folder';
  readonly initial: string;
  readonly label: string;
  readonly icon?: HTMLElement;
  readonly validate: (value: string) => ExplorerNameError | null;
  readonly onCommit: (value: string) => void;
  readonly onCancel: () => void;
}

function strong(text: string): HTMLElement {
  const element = document.createElement('strong');
  element.textContent = text;
  return element;
}

/** VS Code 简体中文措辞的命名校验提示。 */
function validationNodes(error: ExplorerNameError): (string | Node)[] {
  switch (error.kind) {
    case 'empty':
      return ['必须提供文件或文件夹名。'];
    case 'slash':
      return ['文件或文件夹名称不能以斜杠开头。'];
    case 'invalid':
      return ['名称 ', strong(error.name), ' 作为文件或文件夹名无效。请选择其他名称。'];
    case 'exists':
      return ['此位置已存在文件或文件夹 ', strong(error.name), '。请选择其他名称。'];
  }
}

/**
 * 树内输入行：与普通行同一缩进，文件带默认图标、文件夹占位箭头；
 * 边输入边校验，Enter 在有错时保留输入并显示提示，Esc 取消，失焦时合法则提交、否则取消。
 */
export function createExplorerInputRow(options: ExplorerInputOptions): HTMLElement {
  const row = document.createElement('div');
  row.className = 'wb-input-row';
  row.style.setProperty('--wb-level', String(options.level));
  if (options.kind === 'folder') {
    const twistie = createCodicon('chevron-right');
    twistie.classList.add('wb-twistie');
    row.append(twistie);
  } else row.append(options.icon ?? createFileIcon(''));
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'wb-inline-input';
  input.value = options.initial;
  input.spellcheck = false;
  input.setAttribute('aria-label', options.label);
  const validation = document.createElement('div');
  validation.className = 'wb-input-validation';
  validation.setAttribute('role', 'alert');
  validation.hidden = true;
  const show = (error: ExplorerNameError | null): void => {
    input.setAttribute('aria-invalid', String(error !== null));
    validation.hidden = error === null;
    validation.replaceChildren(...(error ? validationNodes(error) : []));
  };
  let settled = false;
  const settle = (commit: boolean): void => {
    if (settled) return;
    settled = true;
    if (commit) options.onCommit(input.value.trim());
    else options.onCancel();
  };
  input.oninput = () => show(input.value.trim() ? options.validate(input.value) : null);
  input.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const error = options.validate(input.value);
      if (error) show(error);
      else settle(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      settle(false);
    }
  };
  input.onblur = () => settle(!options.validate(input.value));
  queueMicrotask(() => {
    input.focus();
    const dot = options.initial.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : options.initial.length);
  });
  row.append(input, validation);
  return row;
}

/** 区块头：可折叠，悬停 / 聚焦该区块时显示区块级动作。 */
export function createExplorerPane(
  key: string,
  label: string,
  collapsed: boolean,
  actions: readonly HTMLButtonElement[],
  onToggle: () => void
): { readonly pane: HTMLElement; readonly header: HTMLElement } {
  const pane = document.createElement('div');
  pane.className = 'wb-pane';
  pane.dataset['pane'] = key;
  const header = document.createElement('div');
  header.className = 'wb-tree-section-row';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'wb-tree-section';
  toggle.dataset['treeSection'] = key;
  toggle.setAttribute('role', 'treeitem');
  toggle.setAttribute('aria-level', '1');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.append(createCodicon(collapsed ? 'chevron-right' : 'chevron-down'));
  const text = document.createElement('span');
  text.textContent = label;
  toggle.append(text);
  toggle.onclick = onToggle;
  header.append(toggle);
  if (actions.length) {
    const holder = document.createElement('div');
    holder.className = 'wb-tree-section-actions';
    holder.append(...actions);
    header.append(holder);
  }
  pane.append(header);
  return { pane, header };
}

/** 区块头 / 标题栏上的图标按钮。 */
export function createExplorerAction(action: string, label: string, icon: CodiconName): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['action'] = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createCodicon(icon));
  return button;
}
