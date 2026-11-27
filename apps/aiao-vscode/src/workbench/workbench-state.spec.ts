import { describe, expect, it } from 'vitest';
import { RUNTIME_IDS } from './terminal/runtime-adapter.js';
import { parseWorkbenchPreferences, parseWorkbenchProjectState } from './workbench-state.js';

describe('工作台持久化状态校验', () => {
  it('兼容旧会话，并复制标签数组', () => {
    const tabs = ['main.ts'];
    const state = parseWorkbenchProjectState({ tabs });
    tabs.push('other.ts');
    expect(state).toEqual({ tabs: ['main.ts'], activePath: null });
  });

  it('保留空文本草稿、空基线和预览标签', () => {
    const state = {
      tabs: ['a.ts'],
      activePath: 'a.ts',
      commitMessage: 'message',
      previewTabs: ['a.ts'],
      drafts: { 'a.ts': { base: '', content: '' }, 'new.ts': { base: null, content: 'new' } }
    };
    expect(parseWorkbenchProjectState(state)).toEqual(state);
  });

  it.each([
    null,
    [],
    {},
    { tabs: [1] },
    { tabs: [], activePath: 1 },
    { tabs: [], previewTabs: 'main.ts' },
    { tabs: [], commitMessage: false },
    { tabs: [], drafts: [] },
    { tabs: [], drafts: { a: 'text' } },
    { tabs: [], drafts: { a: { base: 1, content: 'draft' } } },
    { tabs: [], drafts: { a: { base: null, content: 1 } } }
  ])('损坏会话显式报错：%j', value => {
    expect(() => parseWorkbenchProjectState(value)).toThrow();
  });

  it.each(['  ', '    ', '        '])('接受支持的缩进大小：%j', indentUnit => {
    const preferences = { indentUnit, alwaysShowScmActions: true, runtime: 'webcontainer', editorEngine: 'codemirror' };
    expect(parseWorkbenchPreferences(preferences)).toEqual(preferences);
  });

  it.each(RUNTIME_IDS)('接受运行方式 %s', runtime => {
    expect(parseWorkbenchPreferences({ indentUnit: '  ', alwaysShowScmActions: false, runtime }).runtime).toBe(runtime);
  });

  it('旧版设置没有运行方式时按 WebContainer 读', () => {
    expect(parseWorkbenchPreferences({ indentUnit: '  ', alwaysShowScmActions: false })).toEqual({
      indentUnit: '  ',
      alwaysShowScmActions: false,
      runtime: 'webcontainer',
      editorEngine: 'codemirror'
    });
  });

  it.each(['codemirror', 'monaco'])('接受编辑器 %s', editorEngine => {
    expect(
      parseWorkbenchPreferences({ indentUnit: '  ', alwaysShowScmActions: false, editorEngine }).editorEngine
    ).toBe(editorEngine);
  });

  it('旧版设置保留 CodeMirror', () => {
    expect(
      parseWorkbenchPreferences({ indentUnit: '  ', alwaysShowScmActions: false, runtime: 'webcontainer' }).editorEngine
    ).toBe('codemirror');
  });

  it.each([
    null,
    {},
    { indentUnit: '\t', alwaysShowScmActions: true },
    { indentUnit: ['  '], alwaysShowScmActions: true },
    { indentUnit: '  ', alwaysShowScmActions: 1 },
    { indentUnit: '  ', alwaysShowScmActions: true, runtime: 'deno' },
    { indentUnit: '  ', alwaysShowScmActions: true, runtime: null },
    { indentUnit: '  ', alwaysShowScmActions: true, editorEngine: 'unknown' },
    { indentUnit: '  ', alwaysShowScmActions: true, editorEngine: null }
  ])('拒绝损坏偏好：%j', value => expect(() => parseWorkbenchPreferences(value)).toThrow('设置损坏'));
});
