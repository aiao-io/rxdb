// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSwitchableEditor } from './editor-switcher.js';
import type { WorkbenchEditorHandle, WorkbenchEditorMount, WorkbenchEditorOptions } from './editor.js';

const handles: WorkbenchEditorHandle[] = [];
afterEach(() => {
  handles.splice(0).forEach(handle => handle.dispose());
  document.body.replaceChildren();
});

function fixture() {
  const host = document.createElement('div');
  document.body.append(host);
  const viewState = { anchor: 2, head: 4, scrollTop: 20, scrollLeft: 5 };
  const makeEditor = () => ({
    update: vi.fn(),
    replace: vi.fn(),
    layout: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
    setIndentUnit: vi.fn(),
    setDiagnostics: vi.fn(),
    runCommand: vi.fn(() => true),
    getViewState: vi.fn(() => viewState),
    restoreViewState: vi.fn()
  });
  const codemirror = makeEditor();
  const monaco = makeEditor();
  const mountCodeMirror = vi.fn<WorkbenchEditorMount>(() => codemirror);
  const mountMonaco = vi.fn<WorkbenchEditorMount>(() => monaco);
  let finish!: (mount: WorkbenchEditorMount) => void;
  const pending = new Promise<WorkbenchEditorMount>(resolve => {
    finish = resolve;
  });
  const load = vi.fn(async (engine: string) => (engine === 'codemirror' ? mountCodeMirror : await pending));
  const initial: WorkbenchEditorOptions = {
    value: 'initial',
    language: 'typescript',
    engine: 'codemirror',
    onChange: vi.fn(),
    onCursor: vi.fn()
  };
  const handle = mountSwitchableEditor(host, initial, load);
  handles.push(handle);
  return { host, initial, handle, load, finish, codemirror, monaco, mountCodeMirror, mountMonaco, viewState };
}

async function settle() {
  await new Promise<void>(resolve => queueMicrotask(resolve));
  await new Promise<void>(resolve => queueMicrotask(resolve));
}

describe('编辑器切换', () => {
  it('保留最新未保存文本、语言、缩进、诊断和视图位置，释放旧编辑器', async () => {
    const f = fixture();
    await vi.waitFor(() => expect(f.mountCodeMirror).toHaveBeenCalledOnce());
    f.mountCodeMirror.mock.calls[0][1].onChange('unsaved');
    f.handle.setEngine?.('monaco');
    f.handle.update('latest', 'javascript');
    f.handle.setIndentUnit?.('    ');
    f.handle.setDiagnostics?.([{ line: 2, message: 'problem' }]);
    f.handle.focus?.();
    f.finish(f.mountMonaco);
    await vi.waitFor(() => expect(f.mountMonaco).toHaveBeenCalledOnce());
    expect(f.codemirror.dispose).toHaveBeenCalledOnce();
    expect(f.mountMonaco.mock.calls[0][1]).toMatchObject({
      value: 'latest',
      language: 'javascript',
      indentUnit: '    '
    });
    expect(f.monaco.restoreViewState).toHaveBeenCalledWith(f.viewState);
    expect(f.monaco.setDiagnostics).toHaveBeenCalledWith([{ line: 2, message: 'problem' }]);
    expect(f.monaco.focus).toHaveBeenCalled();
    expect(f.initial.onChange).toHaveBeenCalledExactlyOnceWith('unsaved');
    f.mountMonaco.mock.calls[0][1].onChange('typed');
    expect(f.initial.onChange).toHaveBeenLastCalledWith('typed');
    expect(f.handle.runCommand?.('find')).toBe(true);
  });

  it('快速切回 CodeMirror 时，不挂载已过期的 Monaco 请求', async () => {
    const f = fixture();
    await vi.waitFor(() => expect(f.mountCodeMirror).toHaveBeenCalledOnce());
    f.handle.setEngine?.('monaco');
    f.handle.setEngine?.('codemirror');
    await vi.waitFor(() => expect(f.mountCodeMirror).toHaveBeenCalledTimes(2));
    f.finish(f.mountMonaco);
    await settle();
    expect(f.mountMonaco).not.toHaveBeenCalled();
  });

  it('关闭编辑器后，异步加载完成不会创建实例', async () => {
    const f = fixture();
    await vi.waitFor(() => expect(f.mountCodeMirror).toHaveBeenCalledOnce());
    f.handle.setEngine?.('monaco');
    f.handle.dispose();
    f.finish(f.mountMonaco);
    await settle();
    expect(f.mountMonaco).not.toHaveBeenCalled();
    expect(f.codemirror.dispose).toHaveBeenCalledOnce();
    expect(f.host.childElementCount).toBe(0);
  });

  it('加载期间格式化仍更新编辑缓冲，宿主文本同步不产生重复修改事件', async () => {
    const f = fixture();
    await vi.waitFor(() => expect(f.mountCodeMirror).toHaveBeenCalledOnce());
    f.handle.setEngine?.('monaco');
    f.handle.replace('formatted');
    f.handle.update('formatted', 'typescript');
    f.finish(f.mountMonaco);
    await vi.waitFor(() => expect(f.mountMonaco).toHaveBeenCalledOnce());
    expect(f.mountMonaco.mock.calls[0][1].value).toBe('formatted');
    expect(f.initial.onChange).toHaveBeenCalledExactlyOnceWith('formatted');
  });

  it('加载失败明确显示错误，不自动切回其他引擎', async () => {
    const host = document.createElement('div');
    const load = vi.fn(async () => {
      throw new Error('资源不可用');
    });
    const handle = mountSwitchableEditor(
      host,
      {
        value: '',
        language: 'plaintext',
        engine: 'monaco',
        onChange: vi.fn(),
        onCursor: vi.fn()
      },
      load
    );
    handles.push(handle);
    await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('资源不可用'));
    expect(load).toHaveBeenCalledExactlyOnceWith('monaco');
  });
});
