import { describe, expect, it } from 'vitest';

import { codeEditorLanguageLoadFailed, codeEditorLanguageNotFound } from '../language-error.js';

describe('language-error', () => {
  describe('codeEditorLanguageNotFound', () => {
    it('保留原始大小写并把 cause 留空', () => {
      const error = codeEditorLanguageNotFound('TyPeScRiPt5');

      expect(error).toEqual({
        kind: 'not-found',
        language: 'TyPeScRiPt5',
        message: "Language 'TyPeScRiPt5' not found.",
        cause: undefined
      });
    });

    it('载荷冻结，消费者改不动共享实例', () => {
      expect(Object.isFrozen(codeEditorLanguageNotFound('nope'))).toBe(true);
    });
  });

  describe('codeEditorLanguageLoadFailed', () => {
    it('原样透传 rejection 值而不包装成 Error', () => {
      const cause = new Error('chunk load failed');
      const error = codeEditorLanguageLoadFailed('typescript', cause);

      expect(error.kind).toBe('load-failed');
      expect(error.language).toBe('typescript');
      expect(error.message).toBe("Failed to load language 'typescript'.");
      expect(error.cause).toBe(cause);
    });

    it.each([
      { label: '字符串', cause: 'boom' },
      { label: 'undefined', cause: undefined },
      { label: '普通对象', cause: { status: 503 } }
    ])('非 Error 的 $label rejection 也原样透传', ({ cause }) => {
      expect(codeEditorLanguageLoadFailed('sql', cause).cause).toBe(cause);
    });
  });
});
