// @vitest-environment happy-dom
import { SUPPORT_LANGUAGES } from '@aiao/code-editor';
import type { LanguageSupport } from '@codemirror/language';
import { LanguageDescription, language } from '@codemirror/language';
import { getChunks } from '@codemirror/merge';
import { getSearchQuery } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchDiff, WorkbenchFileVersion } from './session.js';
import { createWorkbenchDiff } from './workbench-diff.js';

const disposals: (() => void)[] = [];
afterEach(() => {
  disposals.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
const text = (value: string): WorkbenchFileVersion => ({
  exists: true,
  binary: false,
  text: value,
  byteLength: new TextEncoder().encode(value).byteLength
});
const model = (base = 'const value = 1;\n', modified = 'const value = 2;\n'): WorkbenchDiff => ({
  projectId: 'project',
  path: 'src/main.ts',
  kind: 'working',
  base: text(base),
  modified: text(modified)
});
const host = () => {
  const parent = document.createElement('div');
  document.body.append(parent);
  return parent;
};

describe('只读 Git 双栏差异', () => {
  it('双侧使用真实 readonly MergeView，显示工作区来源且标记变化', async () => {
    const parent = host();
    const view = await createWorkbenchDiff(parent, model());
    disposals.push(view.dispose);
    const contents = [...parent.querySelectorAll<HTMLElement>('.cm-content')];
    expect(contents).toHaveLength(2);
    const editors = contents.map(content => EditorView.findFromDOM(content)!);
    expect(editors.map(editor => editor.state.facet(EditorState.readOnly))).toEqual([true, true]);
    expect(editors.map(editor => editor.state.facet(EditorView.editable))).toEqual([false, false]);
    expect(editors.map(editor => editor.state.doc.toString())).toEqual(['const value = 1;\n', 'const value = 2;\n']);
    expect(getChunks(editors[0].state)?.chunks.length).toBeGreaterThan(0);
    expect(editors[0].state.facet(language)).not.toBeNull();
    expect(parent.textContent).toContain('index → worktree');
    expect(parent.querySelector('.cm-merge-revert')).toBeNull();
  });

  it('Mod+F 在只读双栏中打开查找面板', async () => {
    const parent = host();
    const view = await createWorkbenchDiff(parent, model());
    disposals.push(view.dispose);
    const content = parent.querySelector<HTMLElement>('.cm-content')!;
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    content.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        keyCode: 70,
        bubbles: true,
        cancelable: true,
        ...modifier
      })
    );
    expect(parent.querySelector('.cm-search [main-field]')).not.toBeNull();
  });

  it('在一侧面板提交查询，两侧 pane 的搜索状态同步', async () => {
    const parent = host();
    const view = await createWorkbenchDiff(parent, model());
    disposals.push(view.dispose);
    const editors = [...parent.querySelectorAll<HTMLElement>('.cm-content')].map(content =>
      EditorView.findFromDOM(content)!
    );
    const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    editors[0].contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'f',
        code: 'KeyF',
        keyCode: 70,
        bubbles: true,
        cancelable: true,
        ...modifier
      })
    );
    const field = parent.querySelector<HTMLInputElement>('.cm-search [main-field]')!;
    field.value = 'value';
    field.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editors.map(editor => getSearchQuery(editor.state).search)).toEqual(['value', 'value']);
  });

  it('BOM、CRLF 和末尾换行变化显式标明，不改写输入模型', async () => {
    const parent = host();
    const diff = Object.freeze({ ...model('\uFEFFline\r\n', 'line'), kind: 'staged' as const });
    const exact = JSON.stringify(diff);
    const view = await createWorkbenchDiff(parent, diff);
    disposals.push(view.dispose);
    expect(parent.textContent).toContain('HEAD → index');
    expect(parent.textContent).toContain('CRLF');
    expect(parent.textContent).toContain('BOM');
    expect(parent.textContent).toContain('末尾换行');
    expect(JSON.stringify(diff)).toBe(exact);
  });

  it('二进制只显示字节说明，缺失侧明确显示文件不存在', async () => {
    const parent = host();
    const diff: WorkbenchDiff = {
      ...model(),
      path: 'asset.bin',
      base: { exists: false, binary: false, text: null, byteLength: 0 },
      modified: { exists: true, binary: true, text: null, byteLength: 128 }
    };
    const view = await createWorkbenchDiff(parent, diff);
    disposals.push(view.dispose);
    expect(parent.querySelector('.cm-editor')).toBeNull();
    expect(parent.textContent).toContain('128 字节');
    expect(parent.textContent).toContain('二进制');
    expect(parent.textContent).toContain('文件不存在');
  });

  it('新增文件显示空的缺失侧，未知扩展明示纯文本', async () => {
    const parent = host();
    const view = await createWorkbenchDiff(parent, {
      ...model('', 'new content'),
      path: 'new.unknown',
      base: { exists: false, binary: false, text: null, byteLength: 0 }
    });
    disposals.push(view.dispose);
    const editor = EditorView.findFromDOM(parent.querySelector<HTMLElement>('.cm-content')!)!;
    expect(editor.state.doc.toString()).toBe('');
    expect(parent.textContent).toContain('文件不存在');
    expect(parent.textContent).toContain('纯文本');
  });

  it('语法资源装载失败明示并拒绝，不悄悄降级纯文本', async () => {
    const parent = host();
    const broken = LanguageDescription.of({
      name: 'Broken',
      extensions: ['ts'],
      load: () => Promise.reject(new Error('grammar unavailable'))
    });
    vi.spyOn(LanguageDescription, 'matchFilename').mockReturnValueOnce(broken);
    await expect(createWorkbenchDiff(parent, model())).rejects.toThrow('grammar unavailable');
    expect(parent.querySelector('[role="alert"]')?.textContent).toContain('grammar unavailable');
    expect(parent.querySelector('.cm-editor')).toBeNull();
  });

  it('layout 重新测量两侧，销毁幂等并释放编辑器 DOM', async () => {
    const parent = host();
    const view = await createWorkbenchDiff(parent, { ...model(), path: 'file.unknown' });
    const editors = [...parent.querySelectorAll<HTMLElement>('.cm-content')].map(content =>
      EditorView.findFromDOM(content)!
    );
    const measurements = editors.map(editor => vi.spyOn(editor, 'requestMeasure'));
    const destruction = editors.map(editor => vi.spyOn(editor, 'destroy'));
    view.layout();
    expect(measurements.every(measure => measure.mock.calls.length > 0)).toBe(true);
    view.dispose();
    view.dispose();
    view.layout();
    expect(destruction.every(destroy => destroy.mock.calls.length === 1)).toBe(true);
    expect(parent.children).toHaveLength(0);
  });

  it('语法加载期间关闭面板，不在已脱离宿主中创建迟到的编辑器', async () => {
    // 与 workbench-diff.ts 相同：SUPPORT_LANGUAGES 经 pnpm 软链解析，tsc 判成两个无关类型。
    const support = await LanguageDescription.matchFilename(
      SUPPORT_LANGUAGES as unknown as readonly LanguageDescription[],
      'main.ts'
    )!.load();
    let finish!: (support: LanguageSupport) => void;
    const slow = LanguageDescription.of({
      name: 'Slow',
      extensions: ['ts'],
      load: () =>
        new Promise<LanguageSupport>(resolve => {
          finish = resolve;
        })
    });
    vi.spyOn(LanguageDescription, 'matchFilename').mockReturnValueOnce(slow);
    const parent = host();
    const pending = createWorkbenchDiff(parent, model());
    parent.remove();
    finish(support);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(parent.querySelector('.cm-editor')).toBeNull();
  });
});
