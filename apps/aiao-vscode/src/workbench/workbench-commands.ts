import { workbenchCommandsStyle } from './workbench-commands-style.js';
import { createCodicon, createFileIcon } from './workbench-icons.js';

/** 命令面板仅展示宿主实际注册的动作。 */
export interface WorkbenchCommand {
  id: string;
  label: string;
  keybinding?: string;
  run(): void | Promise<void>;
}

/** 工作台提供文件与命令来源，组件不维护另一套编辑状态。 */
export interface WorkbenchCommandsOptions {
  getFiles(): readonly string[];
  openFile(path: string): void | Promise<void>;
  getCommands(): readonly WorkbenchCommand[];
  getActivePath?(): string | null;
  onError?(cause: unknown): void;
}

/** 工作台拥有的 Quick Open 与命令面板生命周期。 */
export interface WorkbenchCommandsHandle {
  showQuickOpen(): void;
  showCommandPalette(): void;
  dispose(): void;
}

interface QuickItem {
  id: string;
  label: string;
  description?: string;
  keybinding?: string;
  path?: string;
  run(): void | Promise<void>;
}

interface QuickInput {
  overlay: HTMLDivElement;
  input: HTMLInputElement;
  list: HTMLDivElement;
  status: HTMLDivElement;
  items: readonly QuickItem[];
  selected: number;
}

function targetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function ordinaryInput(target: Element | null): boolean {
  const input = target?.closest('input,textarea,select,[contenteditable="true"]');
  if (!input) return false;
  if (input.matches('input,select')) return true;
  return !input.closest('.cm-content,[data-editor-path],.wb-editor-area');
}

function editorContext(target: Element | null): boolean {
  return !!target?.closest('.cm-editor,[data-editor-path],.wb-editor-area,[role="tree"],.wb-tree');
}

function matchesQuery(value: string, query: string): boolean {
  const lower = value.toLocaleLowerCase('en-US');
  return query
    .toLocaleLowerCase('en-US')
    .split(/\s+/)
    .filter(Boolean)
    .every(token => lower.includes(token));
}

/** 提供 VS Code 风格的文件/命令浮层，并在编辑器处理按键后才路由全局快捷键。 */
export function createWorkbenchCommands(root: HTMLElement, options: WorkbenchCommandsOptions): WorkbenchCommandsHandle {
  const owner = root.ownerDocument;
  const style = owner.createElement('style');
  style.textContent = workbenchCommandsStyle;
  root.append(style);
  let quick: QuickInput | undefined;
  let previousFocus: HTMLElement | null = null;
  let disposed = false;

  function report(cause: unknown): void {
    if (options.onError) options.onError(cause);
    else console.error('[BrowserWorkbench command]', cause);
  }

  function invoke(run: () => void | Promise<void>): void {
    try {
      void Promise.resolve(run()).catch(report);
    } catch (cause) {
      report(cause);
    }
  }

  function close(restoreFocus: boolean): void {
    quick?.overlay.remove();
    quick = undefined;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }

  function position(): void {
    if (!quick) return;
    const rectangle = root.getBoundingClientRect();
    quick.overlay.style.left = `${rectangle.left + rectangle.width / 2}px`;
    quick.overlay.style.top = `${Math.max(8, rectangle.top + 8)}px`;
    quick.overlay.style.width = `${Math.max(280, Math.min(600, rectangle.width - 24))}px`;
  }

  function select(index: number): void {
    if (!quick || !quick.items.length) return;
    quick.selected = (index + quick.items.length) % quick.items.length;
    for (const [item, row] of [...quick.list.children].entries())
      row.setAttribute('aria-selected', String(item === quick.selected));
    const active = quick.list.children[quick.selected] as HTMLElement;
    quick.input.setAttribute('aria-activedescendant', active.id);
    const top = active.offsetTop - quick.list.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < quick.list.scrollTop) quick.list.scrollTop = top;
    else if (bottom > quick.list.scrollTop + quick.list.clientHeight)
      quick.list.scrollTop = bottom - quick.list.clientHeight;
  }

  function choose(index: number): void {
    const item = quick?.items[index];
    if (!item) return;
    close(item.path === undefined);
    invoke(item.run);
  }

  function items(query: string, commands: boolean): QuickItem[] {
    if (commands)
      return options
        .getCommands()
        .filter(command => matchesQuery(`${command.label} ${command.id}`, query))
        .map(command => ({ ...command }));
    return options
      .getFiles()
      .filter(path => matchesQuery(path, query))
      .map(path => {
        const segments = path.split('/');
        return {
          id: path,
          label: segments.at(-1) ?? path,
          description: segments.slice(0, -1).join('/'),
          path,
          run: () => options.openFile(path)
        };
      });
  }

  function renderItems(): void {
    if (!quick) return;
    const commands = quick.input.value.trimStart().startsWith('>');
    const query = commands ? quick.input.value.trimStart().slice(1).trim() : quick.input.value.trim();
    quick.input.setAttribute('aria-label', commands ? '命令面板' : '快速打开文件');
    quick.input.placeholder = commands ? '键入要运行的命令' : '按名称或路径搜索文件';
    quick.overlay.setAttribute('aria-label', commands ? '命令面板' : '快速打开文件');
    quick.items = items(query, commands);
    quick.selected = 0;
    quick.list.replaceChildren();
    for (const [index, item] of quick.items.entries()) {
      const row = owner.createElement('button');
      row.type = 'button';
      row.tabIndex = -1;
      row.id = `${quick.list.id}-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === 0));
      row.append(item.path ? createFileIcon(item.path) : createCodicon('chevron-right'));
      const label = owner.createElement('span');
      label.className = 'wb-quick-input-label';
      label.textContent = item.label;
      row.append(label);
      const description = owner.createElement('span');
      description.className = 'wb-quick-input-description';
      description.textContent = item.description ?? '';
      row.append(description);
      if (item.keybinding) {
        const hint = owner.createElement('kbd');
        hint.textContent = item.keybinding;
        row.append(hint);
      }
      row.onclick = () => choose(index);
      row.onpointermove = () => select(index);
      quick.list.append(row);
    }
    quick.status.textContent =
      quick.items.length ?
        `${quick.items.length} ${commands ? '个命令' : '个文件'}`
      : `没有匹配的${commands ? '命令' : '文件'}`;
    if (quick.items.length) quick.input.setAttribute('aria-activedescendant', quick.list.children[0].id);
    else quick.input.removeAttribute('aria-activedescendant');
  }

  function quickKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || !quick) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      choose(quick.selected);
      return;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    select(quick.selected + (event.key === 'ArrowDown' ? 1 : -1));
  }

  function show(commands: boolean): void {
    if (disposed) return;
    if (!quick) {
      previousFocus = owner.activeElement instanceof HTMLElement ? owner.activeElement : null;
      const overlay = owner.createElement('div');
      overlay.className = 'wb-quick-input';
      overlay.setAttribute('role', 'dialog');
      const box = owner.createElement('div');
      box.className = 'wb-quick-input-box';
      box.append(createCodicon('search'));
      const input = owner.createElement('input');
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-autocomplete', 'list');
      const list = owner.createElement('div');
      list.className = 'wb-quick-input-list';
      list.id = `wb-quick-${crypto.randomUUID()}`;
      list.setAttribute('role', 'listbox');
      input.setAttribute('aria-controls', list.id);
      const status = owner.createElement('div');
      status.className = 'wb-quick-input-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      input.oninput = renderItems;
      input.onkeydown = quickKey;
      box.append(input);
      overlay.append(box, list, status);
      root.append(overlay);
      quick = { overlay, input, list, status, items: [], selected: 0 };
    }
    quick.input.value = commands ? '>' : '';
    renderItems();
    position();
    quick.input.focus();
    quick.input.setSelectionRange(quick.input.value.length, quick.input.value.length);
  }

  function runCommand(id: string, event: KeyboardEvent): void {
    const command = options.getCommands().find(item => item.id === id);
    if (!command) return;
    event.preventDefault();
    invoke(command.run);
  }

  function keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.altKey) return;
    const target = targetElement(event.target);
    if (target?.closest('dialog[open],[aria-modal="true"]')) return;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 'p') {
      event.preventDefault();
      show(event.shiftKey);
      return;
    }
    if (quick?.overlay.contains(target)) return;
    if (!modifier && !event.shiftKey && event.key === 'F2' && !ordinaryInput(target) && editorContext(target)) {
      runCommand('rename', event);
      return;
    }
    if (modifier && event.shiftKey && key === 's') {
      runCommand('saveAll', event);
      return;
    }
    if (!modifier || event.shiftKey) return;
    if (key === 'w' && !ordinaryInput(target) && (options.getActivePath?.() || editorContext(target))) {
      runCommand('closeEditor', event);
      return;
    }
    if (key === '\\' && !ordinaryInput(target) && editorContext(target)) {
      runCommand('split', event);
      return;
    }
    const shortcuts: Record<string, string> = { s: 'save', b: 'toggleSidebar', j: 'togglePanel' };
    const id = shortcuts[key];
    if (id) runCommand(id, event);
  }

  const outside = (event: Event) => {
    if (quick && !quick.overlay.contains(event.target as Node)) close(false);
  };
  root.addEventListener('keydown', keydown);
  owner.addEventListener('pointerdown', outside);
  owner.defaultView?.addEventListener('resize', position);
  return {
    showQuickOpen: () => show(false),
    showCommandPalette: () => show(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      close(true);
      style.remove();
      root.removeEventListener('keydown', keydown);
      owner.removeEventListener('pointerdown', outside);
      owner.defaultView?.removeEventListener('resize', position);
    }
  };
}
