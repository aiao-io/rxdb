// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchCommands, type WorkbenchCommand } from './workbench-commands.js';

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose());
  document.body.replaceChildren();
});

function fixture(recent: readonly string[] = []) {
  const root = document.createElement('section');
  root.className = 'ao-workbench';
  root.innerHTML =
    '<div class="cm-editor"><div contenteditable="true" tabindex="0" class="cm-content"></div></div><div role="tree" tabindex="0"></div><input name="message"><textarea aria-label="普通输入"></textarea>';
  document.body.append(root);
  const ids = [
    'save',
    'saveAll',
    'format',
    'run',
    'newFile',
    'rename',
    'toggleSidebar',
    'togglePanel',
    'closeEditor',
    'nextEditor',
    'prevEditor',
    'split',
    'resetLayout',
    'openRecent',
    'showSearch'
  ];
  const runs = Object.fromEntries(ids.map(id => [id, vi.fn()]));
  const labels: Record<string, string> = {
    save: '文件：保存',
    saveAll: '文件：保存全部',
    format: '文件: 格式化代码',
    run: '运行当前项目',
    newFile: '文件：新建文件',
    rename: '文件：重命名',
    toggleSidebar: '视图：切换主侧栏',
    togglePanel: '视图：切换底部面板',
    closeEditor: '关闭编辑器',
    nextEditor: '打开下一个编辑器',
    prevEditor: '打开上一个编辑器',
    split: '拆分编辑器',
    resetLayout: '重置工作台布局',
    openRecent: '文件：打开最近项目',
    showSearch: '搜索：在文件中搜索'
  };
  const commands: WorkbenchCommand[] = ids.map(id => ({
    id,
    label: labels[id],
    keybinding:
      id === 'save' ? 'Ctrl+S / ⌘S'
      : id === 'format' ? '⇧ / Shift + ⌥ / Alt + F'
      : id === 'openRecent' ? 'Ctrl + R'
      : undefined,
    run: runs[id]
  }));
  const open = vi.fn();
  const error = vi.fn();
  const service = createWorkbenchCommands(root, {
    getFiles: () => ['src/main.ts', 'src/components/Counter.tsx', 'README.md', '<img src=x>.txt'],
    getRecentPaths: () => recent,
    openFile: open,
    getCommands: () => commands,
    getActivePath: () => 'src/main.ts',
    onError: error
  });
  disposals.push(service.dispose);
  const editor = root.querySelector<HTMLElement>('.cm-content')!;
  const input = () => root.querySelector<HTMLInputElement>('.wb-quick-input input')!;
  const key = (target: HTMLElement, value: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  return { root, editor, input, key, service, runs, open, error, commands };
}

describe('VS Code 文件与命令快捷入口', () => {
  it('Monaco快捷键先经过工作台，格式化与保存沿用统一命令', () => {
    const { root, key, runs } = fixture();
    const host = document.createElement('div');
    host.className = 'monaco-editor';
    host.dataset['editorPath'] = 'src/main.ts';
    const input = document.createElement('textarea');
    host.append(input);
    root.append(host);
    input.addEventListener('keydown', event => event.stopPropagation());
    expect(key(input, 'f', { shiftKey: true, altKey: true }).defaultPrevented).toBe(true);
    expect(runs['format']).toHaveBeenCalledOnce();
    expect(key(input, 's', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(runs['save']).toHaveBeenCalledOnce();
    expect(key(input, 'z', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(input, 'f', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('终端保留 Shell 的 Ctrl+R / Ctrl+W / Ctrl+P 等按键，工作台快捷键不拦截', () => {
    const { root, key, runs } = fixture();
    const terminal = document.createElement('div');
    terminal.dataset['workbenchTerminal'] = '';
    const input = document.createElement('textarea');
    terminal.append(input);
    root.append(terminal);
    for (const value of ['r', 'w', 'p', 's', 'b', 'j', 'c'])
      expect(key(input, value, { ctrlKey: true }).defaultPrevented).toBe(false);
    for (const run of Object.values(runs)) expect(run).not.toHaveBeenCalled();
    expect(root.querySelector('.wb-quick-input')).toBeNull();
  });

  it('命令中心空查询展示可执行模式，输入文件查询隐藏模式，清空后恢复', () => {
    const { root, input, service } = fixture();
    service.showCommandCenter();
    expect(input().value).toBe('');
    expect(root.querySelectorAll('[data-quick-mode]')).toHaveLength(5);
    expect(root.querySelector('[data-quick-mode="files"]')?.textContent).toContain('转到文件');
    expect(root.querySelector('[data-quick-mode="commands"]')?.textContent).toContain('运行命令');
    input().value = 'main';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('[data-quick-mode]')).toHaveLength(0);
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(1);
    input().value = '';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('[data-quick-mode]')).toHaveLength(5);
  });

  it('模式入口与 ? 帮助复用浮层并保留 Escape 原始回焦', () => {
    const { root, editor, input, key, service } = fixture();
    editor.focus();
    service.showCommandCenter();
    const original = input();
    key(input(), 'ArrowDown');
    key(input(), 'Enter');
    expect(input()).toBe(original);
    expect(input().value).toBe('>');
    input().value = '?文件';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(input().getAttribute('aria-label')).toBe('快速访问帮助');
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(root.querySelector('[data-quick-mode="files"]')).not.toBeNull();
    key(input(), 'Enter');
    expect(input()).toBe(original);
    expect(input().value).toBe('');
    expect(root.querySelectorAll('[data-quick-mode]')).toHaveLength(0);
    key(input(), 'Escape');
    expect(document.activeElement).toBe(editor);
  });

  it('模式只展示已注册动作，最近项目快捷键仅注册时拦截', () => {
    const { root, editor, input, key, service, commands, runs } = fixture();
    expect(key(editor, 'r', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(runs['openRecent']).toHaveBeenCalledOnce();
    for (const init of [
      { metaKey: true },
      { ctrlKey: true, metaKey: true },
      { ctrlKey: true, shiftKey: true },
      { ctrlKey: true, altKey: true }
    ])
      expect(key(editor, 'r', init).defaultPrevented).toBe(false);
    expect(runs['openRecent']).toHaveBeenCalledOnce();
    service.showCommandCenter();
    expect(root.querySelector('[data-quick-mode="recent"] kbd')?.textContent).toBe('Ctrl + R');
    expect(key(input(), 'r', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(runs['openRecent']).toHaveBeenCalledTimes(2);
    expect(key(input(), 'r', { metaKey: true }).defaultPrevented).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-quick-mode="search"]')?.click();
    expect(runs['showSearch']).toHaveBeenCalledOnce();
    commands.splice(
      commands.findIndex(command => command.id === 'openRecent'),
      1
    );
    commands.splice(
      commands.findIndex(command => command.id === 'showSearch'),
      1
    );
    service.showCommandCenter();
    expect(root.querySelectorAll('[data-quick-mode]')).toHaveLength(3);
    expect(key(editor, 'r', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('通用选择器按名称与描述搜索，前缀按文字匹配，选择与取消正确处理焦点', () => {
    const { root, editor, input, key, service, open } = fixture();
    const chosen = vi.fn();
    editor.focus();
    service.showPicker({
      label: '打开最近项目',
      placeholder: '搜索项目',
      items: [
        { id: 'one', label: 'React 站点', description: 'github/example', run: chosen },
        { id: 'two', label: '> 本地项目', run: vi.fn() }
      ]
    });
    expect(input().placeholder).toBe('搜索项目');
    expect(input().getAttribute('aria-label')).toBe('打开最近项目');
    input().value = 'React example';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(1);
    key(input(), 'Enter');
    expect(chosen).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(editor);
    service.showPicker({ label: '打开最近项目', items: [{ id: 'two', label: '> 本地项目', run: vi.fn() }] });
    input().value = '>';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(input().getAttribute('aria-label')).toBe('打开最近项目');
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(1);
    input().value = '?';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(0);
    key(input(), 'Enter');
    expect(open).not.toHaveBeenCalled();
    key(input(), 'Escape');
    expect(document.activeElement).toBe(editor);
  });

  it('从子菜单启动的选择器按显式目标恢复焦点，模式切换保留该目标', () => {
    const { root, editor, input, key, service } = fixture();
    const anchor = document.createElement('button');
    root.append(anchor);
    editor.focus();
    service.showPicker({ label: '打开最近项目', returnFocus: anchor, items: [] });
    key(input(), 'Escape');
    expect(document.activeElement).toBe(anchor);
    editor.focus();
    service.showPicker({ label: '打开最近项目', returnFocus: anchor, items: [] });
    service.showCommandPalette();
    key(input(), 'Escape');
    expect(document.activeElement).toBe(anchor);
  });

  it('Mod+P 打开文件列表，按文件名/路径过滤后 Enter 激活文件', () => {
    const { root, editor, input, key, open } = fixture();
    editor.focus();
    expect(key(editor, 'p', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    input().value = 'components counter';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(root.querySelector('[role="option"]')?.textContent).toContain('Counter.tsx');
    key(input(), 'Enter');
    expect(open).toHaveBeenCalledWith('src/components/Counter.tsx');
    expect(root.querySelector('.wb-quick-input')).toBeNull();
  });

  it('上下方向键移动活动项，Escape 只关闭浮层并恢复原焦点', () => {
    const { root, editor, input, key, open } = fixture();
    editor.focus();
    key(editor, 'p', { metaKey: true });
    key(input(), 'ArrowDown');
    expect(root.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('Counter.tsx');
    key(input(), 'ArrowUp');
    expect(root.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('main.ts');
    key(input(), 'Escape');
    expect(document.activeElement).toBe(editor);
    expect(open).not.toHaveBeenCalled();
  });

  it('Mod+Shift+P 显示可执行命令和快捷键提示，选择只执行注册命令', async () => {
    const { root, editor, input, key, runs } = fixture();
    key(editor, 'P', { ctrlKey: true, shiftKey: true });
    expect(input().getAttribute('aria-label')).toBe('命令面板');
    expect(root.querySelector('[role="option"]')?.textContent).toContain('Ctrl+S / ⌘S');
    input().value = '>重置';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    key(input(), 'Enter');
    await vi.waitFor(() => expect(runs['resetLayout']).toHaveBeenCalledOnce());
    expect(runs['save']).not.toHaveBeenCalled();
  });

  it('模糊子序列匹配并高亮命中片段', () => {
    const { root, editor, input, key } = fixture();
    key(editor, 'p', { ctrlKey: true });
    input().value = 'mts';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    const options = [...root.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(2);
    expect(options[0]?.querySelector('.wb-quick-input-label')?.textContent).toBe('main.ts');
    expect(options[0]?.querySelector('.wb-quick-input-match')).not.toBeNull();
    input().value = 'zzz';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('空查询按最近打开的标签排序', () => {
    const { root, editor, key } = fixture(['README.md', 'src/main.ts']);
    key(editor, 'p', { ctrlKey: true });
    const options = [...root.querySelectorAll('[role="option"]')];
    const index = (name: string) => options.findIndex(option => option.textContent?.includes(name));
    expect(index('main.ts')).toBe(0);
    expect(index('README.md')).toBe(1);
  });

  it('文件名只作为文本显示，没有结果时 Enter 不执行动作', () => {
    const { root, editor, input, key, open } = fixture();
    key(editor, 'p', { ctrlKey: true });
    expect(root.querySelector('.wb-quick-input img')).toBeNull();
    input().value = 'not-found';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('[role="status"]')?.textContent).toContain('没有匹配');
    key(input(), 'Enter');
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    ['s', 'save'],
    ['b', 'toggleSidebar'],
    ['j', 'togglePanel'],
    ['w', 'closeEditor'],
    ['\\', 'split']
  ] as const)('编辑上下文 Mod+%s 执行 %s 并阻止浏览器默认动作', async (value, id) => {
    const { editor, key, runs } = fixture();
    expect(key(editor, value, { ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs[id]).toHaveBeenCalledOnce());
  });

  it('已经由 CodeMirror 处理的按键与 Mod+Enter 不会被全局命令抢占', () => {
    const { editor, key, runs } = fixture();
    editor.addEventListener('keydown', event => event.preventDefault(), { once: true });
    key(editor, 's', { ctrlKey: true });
    expect(runs['save']).not.toHaveBeenCalled();
    expect(key(editor, 'Enter', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(runs['run']).not.toHaveBeenCalled();
  });

  it('普通表单输入优先保留 F2、Mod+\\ 和提交 Mod+Enter，Mod+W 仍关闭当前标签', async () => {
    const { root, key, runs } = fixture();
    const message = root.querySelector<HTMLInputElement>('[name="message"]')!;
    for (const [value, init] of [
      ['F2', {}],
      ['\\', { metaKey: true }],
      ['Enter', { ctrlKey: true }]
    ] as const)
      expect(key(message, value, init).defaultPrevented).toBe(false);
    expect(key(message, 'w', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(runs['rename']).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(runs['closeEditor']).toHaveBeenCalledOnce());
    const tree = root.querySelector<HTMLElement>('[role="tree"]')!;
    expect(key(tree, 'F2').defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['rename']).toHaveBeenCalledOnce());
  });

  it('未注册快捷动作不拦截，输入法组合键与 AltGr 不触发应用命令', () => {
    const { commands, editor, key, runs } = fixture();
    commands.splice(
      commands.findIndex(command => command.id === 'save'),
      1
    );
    expect(key(editor, 's', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(editor, 'p', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(key(editor, 'p', { ctrlKey: true, isComposing: true }).defaultPrevented).toBe(false);
    expect(runs['save']).not.toHaveBeenCalled();
  });

  it('编辑上下文 Shift+Alt+F 执行格式化命令并阻止浏览器默认动作', async () => {
    const { editor, key, runs } = fixture();
    const event = key(editor, 'F', { shiftKey: true, altKey: true });
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['format']).toHaveBeenCalledOnce());
  });

  it('单独 Alt+F 与 Shift+F 不触发格式化，普通输入框内也不抢占', () => {
    const { root, key, runs } = fixture();
    const editor = root.querySelector<HTMLElement>('.cm-content')!;
    expect(key(editor, 'f', { altKey: true }).defaultPrevented).toBe(false);
    expect(key(editor, 'f', { shiftKey: true }).defaultPrevented).toBe(false);
    const input = root.querySelector<HTMLInputElement>('input[name="message"]')!;
    expect(key(input, 'F', { shiftKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(runs['format']).not.toHaveBeenCalled();
  });

  it('新建或重命名的模态输入保留键盘优先级，不在其后方打开 Quick Open', () => {
    const { root, key } = fixture();
    const dialog = document.createElement('dialog');
    dialog.open = true;
    const input = document.createElement('input');
    dialog.append(input);
    root.append(dialog);
    expect(key(input, 'p', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(root.querySelector('.wb-quick-input')).toBeNull();
  });

  it('命令错误交给宿主，释放移除浮层和全部键盘监听', async () => {
    const { root, editor, input, key, service, runs, error } = fixture();
    runs['save'].mockRejectedValueOnce(new Error('save failed'));
    key(editor, 's', { ctrlKey: true });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'save failed' })));
    editor.focus();
    service.showQuickOpen();
    expect(document.activeElement).toBe(input());
    service.dispose();
    expect(root.querySelector('.wb-quick-input')).toBeNull();
    expect(document.activeElement).toBe(editor);
    key(editor, 'p', { ctrlKey: true });
    expect(root.querySelector('.wb-quick-input')).toBeNull();
  });

  it('浮层模式切换复用同一输入框，上方向键可循环到最后一个文件', () => {
    const { root, editor, input, key, service } = fixture();
    editor.focus();
    service.showQuickOpen();
    key(input(), 'ArrowUp');
    expect(root.querySelector('[aria-selected="true"]')?.textContent).toContain('<img src=x>.txt');
    service.showCommandPalette();
    expect(root.querySelectorAll('.wb-quick-input')).toHaveLength(1);
    expect(input().value).toBe('>');
    key(input(), 'Escape');
    expect(document.activeElement).toBe(editor);
  });

  it('浮层输入不会执行背景编辑器快捷键，点击选项执行对应动作', () => {
    const { root, editor, input, key, open, runs } = fixture();
    key(editor, 'p', { ctrlKey: true });
    key(input(), 's', { ctrlKey: true });
    expect(runs['save']).not.toHaveBeenCalled();
    root.querySelectorAll<HTMLButtonElement>('[role="option"]')[2].click();
    expect(open).toHaveBeenCalledWith('README.md');
    expect(root.querySelector('.wb-quick-input')).toBeNull();
    expect(key(editor, 's', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(runs['saveAll']).toHaveBeenCalledOnce();
    expect(runs['save']).not.toHaveBeenCalled();
    expect(key(editor, 's').defaultPrevented).toBe(false);
  });

  it('组合输入中的 Enter 与外部已处理按键不关闭浮层，外部点击可以关闭', () => {
    const { root, editor, input, key, service, open } = fixture();
    editor.focus();
    service.showQuickOpen();
    key(input(), 'Enter', { isComposing: true });
    input().addEventListener('keydown', event => event.preventDefault(), { capture: true, once: true });
    key(input(), 'Escape');
    expect(root.querySelector('.wb-quick-input')).not.toBeNull();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(root.querySelector('.wb-quick-input')).toBeNull();
    expect(open).not.toHaveBeenCalled();
    service.dispose();
    service.dispose();
    service.showCommandPalette();
    expect(root.querySelector('.wb-quick-input')).toBeNull();
  });

  it('同步动作错误也交给宿主，没有活动文件时仍拦截关闭快捷键，释放后不再拦截', async () => {
    const { root, editor, key, runs, error, service, commands } = fixture();
    runs['save'].mockImplementationOnce(() => {
      throw new Error('synchronous failure');
    });
    key(editor, 's', { ctrlKey: true });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'synchronous failure' }));
    service.dispose();
    const empty = createWorkbenchCommands(root, {
      getFiles: () => [],
      openFile: vi.fn(),
      getCommands: () => commands,
      getActivePath: () => null
    });
    disposals.push(empty.dispose);
    expect(key(root, 'w', { ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['closeEditor']).toHaveBeenCalledOnce());
    empty.dispose();
    expect(key(root, 'w', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('Mod+S 和 Mod+Shift+S 分别执行保存当前文件与显式保存全部', () => {
    const { editor, key, runs } = fixture();
    key(editor, 's', { ctrlKey: true });
    key(editor, 'S', { ctrlKey: true, shiftKey: true });
    expect(runs['save']).toHaveBeenCalledOnce();
    expect(runs['saveAll']).toHaveBeenCalledOnce();
  });

  it('焦点在页面主体时全局快捷键仍然生效', async () => {
    const { root, key, runs } = fixture();
    const body = root.ownerDocument.body;
    expect(key(body, 'w', { ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['closeEditor']).toHaveBeenCalledOnce());
    expect(key(body, 's', { ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['save']).toHaveBeenCalledOnce());
    expect(key(body, 'p', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(root.querySelector('.wb-quick-input')).not.toBeNull();
  });

  it('模态对话框打开时 Mod+W 只保护页面不关闭标签，其它快捷键保留给对话框', () => {
    const { root, key, runs } = fixture();
    const dialog = document.createElement('dialog');
    dialog.open = true;
    const input = document.createElement('input');
    dialog.append(input);
    root.append(dialog);
    expect(key(input, 'w', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(runs['closeEditor']).not.toHaveBeenCalled();
    expect(key(input, 'p', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(root.querySelector('.wb-quick-input')).toBeNull();
  });

  it('Ctrl+Tab 与 Ctrl+Shift+Tab 切换下一个/上一个编辑器，Meta+Tab 不劫持', async () => {
    const { editor, key, runs } = fixture();
    expect(key(editor, 'Tab', { ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['nextEditor']).toHaveBeenCalledOnce());
    expect(key(editor, 'Tab', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(runs['prevEditor']).toHaveBeenCalledOnce());
    expect(key(editor, 'Tab', { metaKey: true }).defaultPrevented).toBe(false);
    expect(runs['nextEditor']).toHaveBeenCalledOnce();
  });

  it('预览转发的快捷键经 dispatchShortcut 按工作台外壳上下文路由', async () => {
    const { root, service, runs } = fixture();
    service.dispatchShortcut({ key: 'w', ctrlKey: false, metaKey: true, shiftKey: false });
    await vi.waitFor(() => expect(runs['closeEditor']).toHaveBeenCalledOnce());
    service.dispatchShortcut({ key: 's', ctrlKey: true, metaKey: false, shiftKey: false });
    await vi.waitFor(() => expect(runs['save']).toHaveBeenCalledOnce());
    service.dispatchShortcut({ key: 'p', ctrlKey: false, metaKey: true, shiftKey: false });
    expect(root.querySelector('.wb-quick-input')).not.toBeNull();
  });
});

describe('Markdown 插件的 VS Code 快捷键', () => {
  it('预览快捷键与侧边预览组合键调用已注册插件命令', () => {
    const f = fixture();
    const preview = vi.fn();
    const side = vi.fn();
    f.commands.push(
      { id: 'markdown-preview-enhanced.openPreview', label: 'Markdown: 打开预览', run: preview },
      { id: 'markdown-preview-enhanced.openPreviewToTheSide', label: 'Markdown: 打开侧边预览', run: side }
    );
    expect(f.key(f.editor, 'v', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(preview).toHaveBeenCalledOnce();
    expect(f.key(f.editor, 'k', { metaKey: true }).defaultPrevented).toBe(true);
    expect(f.key(f.editor, 'v').defaultPrevented).toBe(true);
    expect(side).toHaveBeenCalledOnce();
  });

  it('没有插件命令时保留按键，组合键遇到其他键会取消', () => {
    const f = fixture();
    expect(f.key(f.editor, 'v', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(f.key(f.editor, 'k', { ctrlKey: true }).defaultPrevented).toBe(false);
    const side = vi.fn();
    f.commands.push({ id: 'markdown-preview-enhanced.openPreviewToTheSide', label: '侧边预览', run: side });
    f.key(f.editor, 'k', { ctrlKey: true });
    f.key(f.editor, 'a');
    f.key(f.editor, 'v');
    expect(side).not.toHaveBeenCalled();
  });
});
