import { workbenchCommandsStyle } from './workbench-commands-style.js';
import { createCodicon, createFileIcon } from './workbench-icons.js';

/** 命令面板仅展示宿主实际注册的动作。 */
export interface WorkbenchCommand {
  id: string;
  label: string;
  keybinding?: string;
  run(): void | Promise<void>;
}

/** 宿主提供的可搜索选项，内容始终按文本渲染。 */
export interface WorkbenchQuickPickItem extends WorkbenchCommand {
  description?: string;
}

/** 独立选择器不解析文件或命令模式前缀。 */
export interface WorkbenchQuickPickOptions {
  label: string;
  placeholder?: string;
  items: readonly WorkbenchQuickPickItem[];
  /** 从子菜单启动时指定关闭后的返回目标，避免回焦到已移除的菜单项。 */
  returnFocus?: HTMLElement;
}

/** 工作台提供文件与命令来源，组件不维护另一套编辑状态。 */
export interface WorkbenchCommandsOptions {
  getFiles(): readonly string[];
  openFile(path: string): void | Promise<void>;
  getCommands(): readonly WorkbenchCommand[];
  getActivePath?(): string | null;
  /** 最近打开的路径（如标签顺序，旧→新），空查询时用于 MRU 排序。 */
  getRecentPaths?(): readonly string[];
  onError?(cause: unknown): void;
}

/** 不带事件目标的全局快捷键；宿主与预览 iframe 均可转发给工作台路由。 */
export interface WorkbenchShortcut {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey?: boolean;
}

/** 工作台拥有的 Quick Open 与命令面板生命周期。 */
export interface WorkbenchCommandsHandle {
  showQuickOpen(): void;
  showCommandPalette(): void;
  showCommandCenter(): void;
  showPicker(options: WorkbenchQuickPickOptions): void;
  /** 按工作台外壳上下文路由一条转发来的快捷键（如预览 iframe 内的按键）。 */
  dispatchShortcut(shortcut: WorkbenchShortcut): void;
  dispose(): void;
}

interface QuickItem extends WorkbenchQuickPickItem {
  path?: string;
  mode?: string;
  keepOpen?: boolean;
  labelMatches?: readonly number[];
  descriptionMatches?: readonly number[];
}

interface QuickInput {
  overlay: HTMLDivElement;
  input: HTMLInputElement;
  list: HTMLDivElement;
  status: HTMLDivElement;
  items: readonly QuickItem[];
  selected: number;
  includeModes: boolean;
  picker?: WorkbenchQuickPickOptions;
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

interface FuzzyHit {
  score: number;
  matches: readonly number[];
}

/** 模糊子序列打分：词首/分隔符后与连续命中加权，返回命中位置供高亮。 */
function fuzzyMatch(value: string, query: string): FuzzyHit | null {
  const lower = value.toLocaleLowerCase('en-US');
  const target = query.toLocaleLowerCase('en-US').trim();
  if (!target) return { score: 0, matches: [] };
  let score = 0;
  let cursor = 0;
  let streak = 0;
  let last = -2;
  const matches: number[] = [];
  for (let index = 0; index < lower.length && cursor < target.length; index++) {
    if (lower.charCodeAt(index) !== target.charCodeAt(cursor)) continue;
    const boundary = index === 0 || '/.-_ '.includes(lower[index - 1]);
    score += boundary ? 10 : 2;
    if (index === last + 1) {
      streak++;
      score += streak * 4;
    } else streak = 0;
    matches.push(index);
    last = index;
    cursor++;
  }
  return cursor === target.length ? { score, matches } : null;
}

function fuzzyTokens(value: string, query: string): FuzzyHit | null {
  let score = 0;
  const matches: number[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const hit = fuzzyMatch(value, token);
    if (!hit) return null;
    score += hit.score;
    matches.push(...hit.matches);
  }
  return { score, matches };
}

/** 用命中位置渲染高亮片段。 */
function appendHighlighted(parent: HTMLElement, text: string, matches: readonly number[]): void {
  const sorted = [...new Set(matches)].filter(index => index >= 0 && index < text.length).sort((a, b) => a - b);
  let cursor = 0;
  for (const index of sorted) {
    if (index > cursor) parent.append(text.slice(cursor, index));
    const mark = document.createElement('mark');
    mark.className = 'wb-quick-input-match';
    mark.textContent = text[index];
    parent.append(mark);
    cursor = index + 1;
  }
  parent.append(text.slice(cursor));
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
    if (!item.keepOpen) close(item.path === undefined);
    invoke(item.run);
  }

  function filterItems(entries: readonly QuickItem[], query: string): QuickItem[] {
    return entries
      .map(item => ({ item, hit: fuzzyTokens(`${item.label} ${item.description ?? ''} ${item.id}`, query) }))
      .filter((entry): entry is { item: QuickItem; hit: FuzzyHit } => entry.hit !== null)
      .sort((left, right) => right.hit.score - left.hit.score)
      .map(({ item, hit }) => ({
        ...item,
        labelMatches: hit.matches.filter(index => index < item.label.length),
        descriptionMatches: hit.matches
          .filter(index => index > item.label.length && index <= item.label.length + (item.description?.length ?? 0))
          .map(index => index - item.label.length - 1)
      }));
  }

  function modes(includeHelp: boolean): QuickItem[] {
    const registered = options.getCommands();
    const entries: QuickItem[] = [
      {
        id: 'files',
        mode: 'files',
        label: '转到文件',
        keybinding: '⌘ / Ctrl + P',
        keepOpen: true,
        run: () => show('')
      },
      {
        id: 'commands',
        mode: 'commands',
        label: '运行命令',
        description: '>',
        keybinding: '⌘ / Ctrl + Shift + P',
        keepOpen: true,
        run: () => show('>')
      }
    ];
    for (const [id, mode, label] of [
      ['openRecent', 'recent', '打开最近项目'],
      ['showSearch', 'search', '在文件中搜索']
    ]) {
      const command = registered.find(entry => entry.id === id);
      if (command) entries.push({ ...command, mode, label, keepOpen: mode === 'recent' });
    }
    if (includeHelp)
      entries.push({
        id: 'help',
        mode: 'help',
        label: '更多快速访问方式',
        description: '?',
        keepOpen: true,
        run: () => show('?')
      });
    return entries;
  }

  function items(query: string, commands: boolean): QuickItem[] {
    const recent = options.getRecentPaths?.() ?? [];
    const recency = (path: string): number => {
      const index = recent.indexOf(path);
      return index === -1 ? Number.MAX_SAFE_INTEGER : recent.length - 1 - index;
    };
    const scored = <T>(entries: readonly T[], score: (entry: T) => FuzzyHit | null): { item: T; hit: FuzzyHit }[] => {
      const result: { item: T; hit: FuzzyHit }[] = [];
      for (const entry of entries) {
        const hit = score(entry);
        if (hit) result.push({ item: entry, hit });
      }
      return result;
    };
    if (commands) {
      return scored(options.getCommands(), command => fuzzyTokens(`${command.label} ${command.id}`, query))
        .sort((left, right) => right.hit.score - left.hit.score)
        .map(({ item, hit }) => ({
          ...item,
          labelMatches: hit.matches.filter(index => index < item.label.length)
        }));
    }
    return scored(options.getFiles(), path => fuzzyTokens(path, query))
      .sort((left, right) => right.hit.score - left.hit.score || recency(left.item) - recency(right.item))
      .map(({ item: path, hit }) => {
        const segments = path.split('/');
        const description = segments.slice(0, -1).join('/');
        const baseStart = description ? description.length + 1 : 0;
        return {
          id: path,
          label: segments.at(-1) ?? path,
          description,
          path,
          labelMatches: hit.matches.filter(index => index >= baseStart).map(index => index - baseStart),
          descriptionMatches: hit.matches.filter(index => index < description.length),
          run: () => options.openFile(path)
        };
      });
  }

  function renderItems(): void {
    if (!quick) return;
    const value = quick.input.value.trimStart();
    const commands = !quick.picker && value.startsWith('>');
    const help = !quick.picker && value.startsWith('?');
    const query = commands || help ? value.slice(1).trim() : value.trim();
    const label =
      quick.picker?.label ??
      (commands ? '命令面板'
      : help ? '快速访问帮助'
      : '快速打开文件');
    quick.input.setAttribute('aria-label', label);
    quick.input.placeholder =
      quick.picker?.placeholder ??
      (quick.picker ? '键入以搜索'
      : commands ? '键入要运行的命令'
      : help ? '键入以搜索快速访问方式'
      : '按名称或路径搜索文件');
    quick.overlay.setAttribute('aria-label', label);
    quick.items =
      quick.picker ? filterItems(quick.picker.items, query)
      : help ? filterItems(modes(false), query)
      : [...(!commands && !query && quick.includeModes ? modes(true) : []), ...items(query, commands)];
    quick.selected = 0;
    quick.list.replaceChildren();
    for (const [index, item] of quick.items.entries()) {
      const row = owner.createElement('button');
      row.type = 'button';
      row.tabIndex = -1;
      row.id = `${quick.list.id}-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === 0));
      if (item.mode) row.dataset['quickMode'] = item.mode;
      if (item.path && quick.items[index - 1]?.mode) row.className = 'wb-quick-input-section-start';
      row.append(item.path ? createFileIcon(item.path) : createCodicon('chevron-right'));
      const label = owner.createElement('span');
      label.className = 'wb-quick-input-label';
      appendHighlighted(label, item.label, item.labelMatches ?? []);
      row.append(label);
      const description = owner.createElement('span');
      description.className = 'wb-quick-input-description';
      appendHighlighted(description, item.description ?? '', item.descriptionMatches ?? []);
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
    const noun =
      quick.picker ? '选项'
      : help ? '快速访问方式'
      : commands ? '命令'
      : '文件';
    const count = quick.items.filter(item => !item.mode || help).length;
    quick.status.textContent = quick.items.length ? `${count} 个${noun}` : `没有匹配的${noun}`;
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

  function show(value: string, includeModes = false, picker?: WorkbenchQuickPickOptions): void {
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
      quick = { overlay, input, list, status, items: [], selected: 0, includeModes };
    }
    quick.includeModes = includeModes;
    quick.picker = picker;
    quick.input.value = value;
    renderItems();
    position();
    quick.input.focus();
    quick.input.setSelectionRange(quick.input.value.length, quick.input.value.length);
  }

  function invokeCommand(id: string): boolean {
    const command = options.getCommands().find(item => item.id === id);
    if (!command) return false;
    invoke(command.run);
    return true;
  }

  function route(shortcut: WorkbenchShortcut, target: Element | null): boolean {
    const modifier = shortcut.ctrlKey || shortcut.metaKey;
    const key = shortcut.key.toLowerCase();
    if (target?.closest('dialog[open],[aria-modal="true"]')) return false;
    if (shortcut.ctrlKey && !shortcut.metaKey && !shortcut.shiftKey && key === '`') return invokeCommand('showTerminal');
    if (target?.closest('[data-workbench-terminal]')) return false;
    if (modifier && key === 'p') {
      show(shortcut.shiftKey ? '>' : '');
      return true;
    }
    if (shortcut.ctrlKey && !shortcut.metaKey && !shortcut.shiftKey && !shortcut.altKey && key === 'r')
      return invokeCommand('openRecent');
    if (quick?.overlay.contains(target)) return false;
    if (modifier && key === 'tab' && !shortcut.metaKey)
      return invokeCommand(shortcut.shiftKey ? 'prevEditor' : 'nextEditor');
    if (!modifier && !shortcut.shiftKey && key === 'f2' && !ordinaryInput(target) && editorContext(target))
      return invokeCommand('rename');
    if (shortcut.shiftKey && shortcut.altKey && key === 'f' && !ordinaryInput(target) && editorContext(target))
      return invokeCommand('format');
    if (modifier && shortcut.shiftKey && key === 's') return invokeCommand('saveAll');
    if (modifier && shortcut.shiftKey) {
      const viewShortcuts: Readonly<Record<string, string>> = {
        e: 'showExplorer',
        f: 'showSearch',
        g: 'showScm',
        m: 'showProblems',
        u: 'showOutput'
      };
      const id = viewShortcuts[key];
      return id ? invokeCommand(id) : false;
    }
    if (!modifier || shortcut.shiftKey) return false;
    if (key === 'w') return invokeCommand('closeEditor');
    if (key === '\\' && !ordinaryInput(target) && editorContext(target)) return invokeCommand('split');
    const shortcuts: Record<string, string> = { s: 'save', b: 'toggleSidebar', j: 'togglePanel' };
    const id = shortcuts[key];
    return id ? invokeCommand(id) : false;
  }

  /** 专属捕获层：⌘/Ctrl+W 与编辑器级快捷键无论焦点在哪都先于 CodeMirror 路由。 */
  function pageKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.altKey) return;
    const modifier = event.ctrlKey || event.metaKey;
    const target = targetElement(event.target);
    if (!target) return;
    if (target.closest('[data-workbench-terminal]')) return;
    const key = event.key.toLowerCase();
    if (event.shiftKey && key === 'enter' && modifier) {
      if (!ordinaryInput(target) && editorContext(target)) {
        event.preventDefault();
        event.stopPropagation();
        invokeCommand('insertLineAbove');
      }
      return;
    }
    if (!modifier || event.shiftKey) return;
    if (key === 'w') {
      event.preventDefault();
      if (!target.closest('dialog[open],[aria-modal="true"]')) invokeCommand('closeEditor');
      return;
    }
    const editorShortcuts: Readonly<Record<string, string>> = { g: 'gotoLine', l: 'selectLine' };
    const id = editorShortcuts[key];
    if (id && editorContext(target) && !ordinaryInput(target) && !target.closest('dialog[open],[aria-modal="true"]')) {
      event.preventDefault();
      event.stopPropagation();
      invokeCommand(id);
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || (event.altKey && !event.shiftKey)) return;
    const shortcut: WorkbenchShortcut = {
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey
    };
    if (route(shortcut, targetElement(event.target))) event.preventDefault();
  }

  const outside = (event: Event) => {
    if (quick && !quick.overlay.contains(event.target as Node)) close(false);
  };
  owner.addEventListener('keydown', pageKeydown, true);
  owner.addEventListener('keydown', keydown);
  owner.addEventListener('pointerdown', outside);
  owner.defaultView?.addEventListener('resize', position);
  return {
    showQuickOpen: () => show(''),
    showCommandPalette: () => show('>'),
    showCommandCenter: () => show('', true),
    showPicker(picker) {
      show('', false, picker);
      if (quick && picker.returnFocus) previousFocus = picker.returnFocus;
    },
    dispatchShortcut(shortcut) {
      if (disposed) return;
      route(shortcut, root);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      close(true);
      style.remove();
      owner.removeEventListener('keydown', pageKeydown, true);
      owner.removeEventListener('keydown', keydown);
      owner.removeEventListener('pointerdown', outside);
      owner.defaultView?.removeEventListener('resize', position);
    }
  };
}
