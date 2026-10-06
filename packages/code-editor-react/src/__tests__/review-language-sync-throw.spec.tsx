import { LanguageDescription } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '../CodeEditor.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const probe = async (synchronous: boolean) => {
  const failure = new Error('语言工厂初始化失败');
  const description = LanguageDescription.of({
    name: 'ReviewLanguage',
    load: () => {
      if (synchronous) throw failure;
      return Promise.reject(failure);
    }
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const report = vi.fn();
  let thrown: unknown;
  try {
    render(
      <CodeEditor
        language='ReviewLanguage'
        languages={[description]}
        value='保留文档'
        readonly
        onLanguageError={report}
      />
    );
  } catch (error) {
    thrown = error;
  }
  await Promise.resolve();
  await Promise.resolve();
  const content = document.querySelector<HTMLElement>('.cm-content');
  const view = content ? EditorView.findFromDOM(content) : null;
  console.info(
    'REVIEW_EDITOR',
    JSON.stringify({
      framework: 'react',
      synchronous,
      escaped: String(thrown),
      reportCount: report.mock.calls.length,
      editorAlive: !!view
    })
  );
  expect.soft(thrown).toBeUndefined();
  expect
    .soft(report)
    .toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'load-failed', language: 'ReviewLanguage', cause: failure })
    );
  expect.soft(view?.state.doc.toString()).toBe('保留文档');
  expect.soft(view?.state.facet(EditorState.readOnly)).toBe(true);
};

describe('评审复验：原 LanguageDescription 的同步 throw 也须走语言错误通道', () => {
  it('同步 loader 异常不能让 React 编辑器卸载', () => probe(true));
  it('对照：同一个错误以 Promise rejection 返回时编辑器继续存在', () => probe(false));
});
