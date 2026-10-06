import type { CodeEditorLanguageError } from '@aiao/code-editor';
import { TestBed } from '@angular/core/testing';
import { LanguageDescription } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '../code-editor.js';

afterEach(() => {
  TestBed.resetTestingModule();
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
  const fixture = TestBed.createComponent(CodeEditor);
  const reports: CodeEditorLanguageError[] = [];
  fixture.componentInstance.aoLanguageError.subscribe(error => reports.push(error));
  fixture.componentRef.setInput('value', '保留文档');
  fixture.componentRef.setInput('language', 'ReviewLanguage');
  fixture.componentRef.setInput('languages', [description]);
  fixture.componentRef.setInput('readonly', true);
  let thrown: unknown;
  try {
    try {
      fixture.detectChanges();
    } catch (error) {
      thrown = error;
    }
    await Promise.resolve();
    await Promise.resolve();
    console.info(
      'REVIEW_EDITOR',
      JSON.stringify({ framework: 'angular', synchronous, escaped: String(thrown), reportCount: reports.length })
    );
    expect.soft(thrown).toBeUndefined();
    expect.soft(reports).toHaveLength(1);
    expect.soft(reports[0]).toMatchObject({ kind: 'load-failed', language: 'ReviewLanguage', cause: failure });
    expect(fixture.componentInstance.view?.state.doc.toString()).toBe('保留文档');
    expect(fixture.componentInstance.view?.state.facet(EditorState.readOnly)).toBe(true);
  } finally {
    fixture.destroy();
  }
};

describe('评审复验：原 LanguageDescription 的同步 throw 也须走语言错误通道', () => {
  it('同步 loader 异常不能逃出 Angular 初始化', () => probe(true));
  it('对照：同一个错误以 Promise rejection 返回时被正常上报', () => probe(false));
});
