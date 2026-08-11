import { expect, expectTypeOf, it } from 'vitest';

import * as PublicApi from '../index';
import { CodeEditor, type CodeEditorSetup, type CodeEditorTheme } from '../index';

it('exports the component and stable public option types', () => {
  expect(CodeEditor).toBeTypeOf('function');
  expectTypeOf<CodeEditorSetup>().toEqualTypeOf<'basic' | 'minimal' | null>();
  expectTypeOf<CodeEditorTheme>().toEqualTypeOf<'light' | 'dark'>();
});

// `export *` 把 `External`（CodeMirror Annotation 实例）也泄漏成了公开契约：
// 一旦消费者写 `view.dispatch({ annotations: External.of(true) })` 就锁死了内部实现，
// 而 React（`CodeEditor.tsx` 的 `const External`）与 Vue（`CodeEditor.vue`）两端都是模块私有，
// 且每端的 Annotation 实例互不相同 —— 三端不可能对齐这个语义。
it('does not leak the internal External annotation', () => {
  expect(Object.keys(PublicApi)).toEqual(['CodeEditor']);
});
