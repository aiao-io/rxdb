import { describe, expect, it } from 'vitest';

import { buildCodeEditorContentAttributes, shouldAutoFocusCodeEditor } from '../accessibility.js';

describe('buildCodeEditorContentAttributes', () => {
  it('没有任何取值时返回空对象', () => {
    expect(buildCodeEditorContentAttributes({})).toEqual({});
  });

  it('把四项状态映射成对应的 aria 属性', () => {
    expect(
      buildCodeEditorContentAttributes({
        describedBy: 'hint',
        disabled: true,
        label: '代码输入',
        labelledBy: 'label'
      })
    ).toEqual({
      'aria-describedby': 'hint',
      'aria-disabled': 'true',
      'aria-label': '代码输入',
      'aria-labelledby': 'label'
    });
  });

  it.each(['describedBy', 'label', 'labelledBy'] as const)('%s 为空串时不产出属性', field => {
    // `aria-label=""` 会让 textbox 从「没有可访问名称」变成「名称是空串」，
    // 某些屏幕阅读器就此不再回退到 aria-labelledby 或周边文本。
    expect(buildCodeEditorContentAttributes({ [field]: '' })).toEqual({});
  });

  it('未禁用时不写 aria-disabled="false"', () => {
    // 与 CodeMirror 自己写出的 aria-readonly 叠在一起会让两种状态更难区分。
    expect(buildCodeEditorContentAttributes({ disabled: false, label: 'x' })).toEqual({ 'aria-label': 'x' });
  });

  it('每次调用返回新对象，可直接交给 contentAttributes facet', () => {
    const state = { label: 'x' };
    expect(buildCodeEditorContentAttributes(state)).not.toBe(buildCodeEditorContentAttributes(state));
  });
});

describe('shouldAutoFocusCodeEditor', () => {
  it.each([
    [{}, true],
    [{ disabled: false, readonly: false }, true],
    [{ disabled: true }, false],
    [{ readonly: true }, false],
    [{ disabled: true, readonly: true }, false]
  ])('%j → %s', (state, expected) => {
    expect(shouldAutoFocusCodeEditor(state)).toBe(expected);
  });
});
