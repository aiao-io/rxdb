// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountMonacoDiff } from './monaco-diff.js';
import type { WorkbenchDiff } from './session.js';

const api = vi.hoisted(() => ({
  createModel: vi.fn((value: string, _language: string | undefined, uri: { path: string }) => ({
    value,
    uri,
    dispose: vi.fn()
  })),
  createDiffEditor: vi.fn<
    (
      _host: HTMLElement,
      _options: Record<string, unknown>
    ) => {
      setModel: ReturnType<typeof vi.fn>;
      layout: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }
  >(() => ({
    setModel: vi.fn(),
    layout: vi.fn(),
    dispose: vi.fn()
  }))
}));
vi.mock('monaco-editor', () => ({
  editor: api,
  Uri: { from: (value: { path: string }) => value }
}));
afterEach(() => vi.clearAllMocks());

const version = (text: string) => ({
  exists: true,
  binary: false,
  text,
  byteLength: new TextEncoder().encode(text).byteLength
});
const diff = (): WorkbenchDiff => ({
  projectId: 'one',
  path: 'src/main.ts',
  kind: 'working',
  base: version('\uFEFFconst value = 1;\r\n'),
  modified: version(' const value = 2;\n')
});

describe('Monaco Git 差异适配', () => {
  it.each(['staged', 'working'] as const)('%s 双侧只读，保留快照文本并比较空白', kind => {
    const model = { ...diff(), kind };
    const view = mountMonacoDiff(document.createElement('div'), model);
    expect(api.createDiffEditor.mock.calls[0][1]).toMatchObject({
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false,
      ignoreTrimWhitespace: false,
      originalAriaLabel: `${kind === 'staged' ? 'HEAD' : 'index'}（只读）`,
      modifiedAriaLabel: `${kind === 'staged' ? 'index' : 'worktree'}（只读）`
    });
    expect(api.createModel.mock.calls.map(([value]) => value)).toEqual([model.base.text, model.modified.text]);
    expect(
      api.createModel.mock.calls.every(
        ([, language, uri]) => language === undefined && uri.path.endsWith('/src/main.ts')
      )
    ).toBe(true);
    const models = api.createModel.mock.results.map(result => result.value);
    expect(api.createDiffEditor.mock.results[0].value.setModel).toHaveBeenCalledWith({
      original: models[0],
      modified: models[1]
    });
    view.dispose();
  });

  it('多个比较拥有独立模型，释放不会影响其他视图且释放后不再布局', () => {
    const first = mountMonacoDiff(document.createElement('div'), diff());
    const second = mountMonacoDiff(document.createElement('div'), diff());
    const paths = api.createModel.mock.calls.map(([, , uri]) => uri.path);
    expect(new Set(paths).size).toBe(4);
    const editors = api.createDiffEditor.mock.results.map(result => result.value);
    const models = api.createModel.mock.results.map(result => result.value);
    first.layout();
    first.dispose();
    first.dispose();
    first.layout();
    expect(editors[0].layout).toHaveBeenCalledOnce();
    expect(editors[0].dispose).toHaveBeenCalledOnce();
    expect(models.slice(0, 2).every(model => model.dispose.mock.calls.length === 1)).toBe(true);
    expect(models.slice(2).every(model => model.dispose.mock.calls.length === 0)).toBe(true);
    expect(editors[1].dispose).not.toHaveBeenCalled();
    second.dispose();
  });

  it.each(['base', 'modified'] as const)('%s 缺失时使用空文档，支持新增和删除文件', side => {
    const model = { ...diff(), [side]: { exists: false, binary: false, text: null, byteLength: 0 } };
    const view = mountMonacoDiff(document.createElement('div'), model);
    expect(api.createModel.mock.calls[side === 'base' ? 0 : 1][0]).toBe('');
    view.dispose();
  });

  it('原生编辑器创建失败时释放已创建的两个模型', () => {
    api.createDiffEditor.mockImplementationOnce(() => {
      throw new Error('mount failed');
    });
    expect(() => mountMonacoDiff(document.createElement('div'), diff())).toThrow('mount failed');
    expect(api.createModel.mock.results.every(result => result.value.dispose.mock.calls.length === 1)).toBe(true);
  });
});
