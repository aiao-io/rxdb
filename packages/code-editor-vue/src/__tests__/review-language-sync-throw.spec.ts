import type { CodeEditorLanguageError } from '@aiao/code-editor';
import { LanguageDescription } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import { CodeEditor } from '../index.js';

afterEach(() => vi.restoreAllMocks());

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
  const escaped: unknown[] = [];
  const reports: CodeEditorLanguageError[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(CodeEditor, {
    language: 'ReviewLanguage',
    languages: [description],
    value: '保留文档',
    readonly: true,
    disabled: true,
    onLanguageError: (error: CodeEditorLanguageError) => reports.push(error)
  });
  app.config.errorHandler = error => escaped.push(error);
  try {
    app.mount(host);
    await flushPromises();
    const content = host.querySelector<HTMLElement>('.cm-content');
    const view = content ? EditorView.findFromDOM(content) : null;
    console.info(
      'REVIEW_EDITOR',
      JSON.stringify({
        framework: 'vue',
        synchronous,
        escapedCount: escaped.length,
        reportCount: reports.length,
        readonly: view?.state.facet(EditorState.readOnly),
        contentEditable: content?.getAttribute('contenteditable')
      })
    );
    expect.soft(escaped).toEqual([]);
    expect.soft(reports).toHaveLength(1);
    expect.soft(reports[0]).toMatchObject({ kind: 'load-failed', language: 'ReviewLanguage', cause: failure });
    expect(view?.state.doc.toString()).toBe('保留文档');
    expect.soft(view?.state.facet(EditorState.readOnly)).toBe(true);
    expect.soft(content?.getAttribute('contenteditable')).toBe('false');
  } finally {
    app.unmount();
    host.remove();
  }
};

describe('评审复验：同步语言异常不能中断只读/禁用配置', () => {
  it('同步 loader 异常须上报且保持 Vue 只读/禁用状态', () => probe(true));
  it('对照：Promise rejection 被正常上报且访问状态保持正确', () => probe(false));
});
