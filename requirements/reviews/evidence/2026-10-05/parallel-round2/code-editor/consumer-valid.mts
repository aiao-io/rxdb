import {
  buildCodeEditorContentAttributes,
  codeEditorLanguageLoadFailed,
  codeEditorLanguageNotFound,
  computeMinimalDocumentChange,
  findLanguageByName,
  isSameResolvedLanguage,
  resolveCodeEditorLanguage,
  shouldAutoFocusCodeEditor,
  SQL,
  SUPPORT_LANGUAGES,
  type CodeEditorAccessibilityState,
  type CodeEditorExtension,
  type CodeEditorLanguageDescription,
  type CodeEditorLanguageError,
  type CodeEditorLanguageErrorKind,
  type CodeEditorLanguageSupport,
  type CodeEditorTheme,
  type DocumentChangeSpec,
  type ResolvedCodeEditorLanguage
} from '@aiao/code-editor';
import type { LanguageDescription } from '@codemirror/language';

export const themes: readonly CodeEditorTheme[] = ['light', 'dark'];
export const extension: CodeEditorExtension = [[], { extension: [] }];
export const languageSupport: CodeEditorLanguageSupport = { extension };
export const customLanguage: CodeEditorLanguageDescription = {
  name: 'ReviewCustom',
  alias: ['review-custom'],
  extensions: ['review'],
  filename: undefined,
  support: languageSupport,
  load: () => Promise.resolve(languageSupport)
};
export const nominalLanguages: readonly LanguageDescription[] = SUPPORT_LANGUAGES;
export const structuralLanguages: readonly CodeEditorLanguageDescription[] = nominalLanguages;
export const languages: readonly CodeEditorLanguageDescription[] = [...structuralLanguages, customLanguage];
export const found: CodeEditorLanguageDescription | null = findLanguageByName('SQL', languages);
export const loaded: Promise<CodeEditorLanguageSupport> = SQL.load();
export const resolved: ResolvedCodeEditorLanguage = resolveCodeEditorLanguage('review-custom', languages);
export const equivalent: boolean = isSameResolvedLanguage(undefined, resolved);
export const empty: ResolvedCodeEditorLanguage = { kind: 'none' };
export const unknown: ResolvedCodeEditorLanguage = { kind: 'not-found', name: 'Unknown' };
export const selected: ResolvedCodeEditorLanguage = { kind: 'found', description: customLanguage };

export const describeResolved = (value: ResolvedCodeEditorLanguage): string => {
  switch (value.kind) {
    case 'none':
      return 'plaintext';
    case 'not-found':
      return value.name;
    case 'found':
      return value.description.name;
  }
};

export const accessibility: CodeEditorAccessibilityState = {
  describedBy: 'hint',
  disabled: true,
  label: '代码输入',
  labelledBy: 'label'
};
export const attributes: Record<string, string> = buildCodeEditorContentAttributes(accessibility);
export const focusAllowed: boolean = shouldAutoFocusCodeEditor({ disabled: false, readonly: true });
export const change: DocumentChangeSpec | null = computeMinimalDocumentChange('a😀z', 'a😀!z');
export const explicitChange: DocumentChangeSpec = { from: 3, to: 3, insert: '!' };
export const replay = (current: string, value: DocumentChangeSpec | null): string =>
  value === null ? current : current.slice(0, value.from) + value.insert + current.slice(value.to);
export const replayed: string = replay('a😀z', change);
export const notFound: CodeEditorLanguageError = codeEditorLanguageNotFound('Unknown');
export const failed: CodeEditorLanguageError = codeEditorLanguageLoadFailed('SQL', { status: 503 });
export const errorKind: CodeEditorLanguageErrorKind = failed.kind;
export const originalCause: unknown = failed.cause;
export const errorMessage: string = failed.message;
