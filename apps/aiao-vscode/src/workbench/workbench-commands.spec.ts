// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkbenchCommands, type WorkbenchCommand } from './workbench-commands.js';

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose());
  document.body.replaceChildren();
});

function fixture() {
  const root = document.createElement('section');
  root.className = 'ao-workbench';
  root.innerHTML =
    '<div class="cm-editor"><div contenteditable="true" tabindex="0" class="cm-content"></div></div><div role="tree" tabindex="0"></div><input name="message"><textarea aria-label="普通输入"></textarea>';
  document.body.append(root);
  const ids = [
    'save',
    'saveAll',
    'run',
    'newFile',
    'rename',
    'toggleSidebar',
    'togglePanel',
    'closeEditor',
    'split',
    'resetLayout'
  ];
  const runs = Object.fromEntries(ids.map(id => [id, vi.fn()]));
  const labels: Record<string, string> = {
    save: '文件：保存',
    saveAll: '文件：保存全部',
    run: '运行当前项目',
    newFile: '文件：新建文件',
    rename: '文件：重命名',
    toggleSidebar: '视图：切换主侧栏',
    togglePanel: '视图：切换底部面板',
    closeEditor: '关闭编辑器',
    split: '拆分编辑器',
    resetLayout: '重置工作台布局'
  };
  const commands: WorkbenchCommand[] = ids.map(id => ({
    id,
    label: labels[id],
    keybinding: id === 'save' ? 'Ctrl+S / ⌘S' : undefined,
    run: runs[id]
  }));
  const open = vi.fn();
  const error = vi.fn();
  const service = createWorkbenchCommands(root, {
    getFiles: () => ['src/main.ts', 'src/components/Counter.tsx', 'README.md', '<img src=x>.txt'],
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

  it('普通表单输入优先保留 F2、Mod+W、Mod+\\ 和提交 Mod+Enter', async () => {
    const { root, key, runs } = fixture();
    const message = root.querySelector<HTMLInputElement>('[name="message"]')!;
    for (const [value, init] of [
      ['F2', {}],
      ['w', { ctrlKey: true }],
      ['\\', { metaKey: true }],
      ['Enter', { ctrlKey: true }]
    ] as const)
      expect(key(message, value, init).defaultPrevented).toBe(false);
    expect(runs['rename']).not.toHaveBeenCalled();
    expect(runs['closeEditor']).not.toHaveBeenCalled();
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

  it('同步动作错误也交给宿主，没有活动文件时不劫持浏览器关闭快捷键', () => {
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
    expect(key(root, 'w', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(runs['closeEditor']).not.toHaveBeenCalled();
  });

  it('Mod+S 和 Mod+Shift+S 分别执行保存当前文件与显式保存全部', () => {
    const { editor, key, runs } = fixture();
    key(editor, 's', { ctrlKey: true });
    key(editor, 'S', { ctrlKey: true, shiftKey: true });
    expect(runs['save']).toHaveBeenCalledOnce();
    expect(runs['saveAll']).toHaveBeenCalledOnce();
  });
});
