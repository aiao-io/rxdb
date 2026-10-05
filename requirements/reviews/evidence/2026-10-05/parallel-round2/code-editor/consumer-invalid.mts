import {
  computeMinimalDocumentChange,
  resolveCodeEditorLanguage,
  type CodeEditorAccessibilityState,
  type CodeEditorLanguageDescription,
  type CodeEditorLanguageError,
  type CodeEditorLanguageErrorKind,
  type CodeEditorTheme,
  type DocumentChangeSpec,
  type ResolvedCodeEditorLanguage
} from '@aiao/code-editor';

export const wrongTheme: CodeEditorTheme = 'sepia';
export const wrongErrorKind: CodeEditorLanguageErrorKind = 'network-error';
export const wrongError: CodeEditorLanguageError = {
  kind: 'not-found',
  language: 123,
  message: 'invalid language type',
  cause: undefined
};
export const wrongChange: DocumentChangeSpec = { from: '0', to: 1, insert: 'x' };
export const missingDescription: ResolvedCodeEditorLanguage = { kind: 'found' };
export const wrongAccessibility: CodeEditorAccessibilityState = { disabled: 'true' };
export const wrongLoader: CodeEditorLanguageDescription = {
  name: 'ReviewCustom',
  alias: [],
  extensions: [],
  filename: undefined,
  support: undefined,
  load: () => Promise.resolve({ extension: 1 })
};
export const wrongDocumentInput = computeMinimalDocumentChange(123, 'next');
export const wrongLanguageInput = resolveCodeEditorLanguage('SQL', ['SQL']);
