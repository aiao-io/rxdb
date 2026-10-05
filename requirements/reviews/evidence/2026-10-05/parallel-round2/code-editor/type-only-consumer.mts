import type {
  CodeEditorAccessibilityState,
  CodeEditorExtension,
  CodeEditorLanguageDescription,
  CodeEditorLanguageError,
  CodeEditorLanguageErrorKind,
  CodeEditorLanguageSupport,
  CodeEditorTheme,
  DocumentChangeSpec,
  ResolvedCodeEditorLanguage
} from '@aiao/code-editor';

export type PublicConsumerTypes = {
  readonly accessibility: CodeEditorAccessibilityState;
  readonly extension: CodeEditorExtension;
  readonly description: CodeEditorLanguageDescription;
  readonly error: CodeEditorLanguageError;
  readonly errorKind: CodeEditorLanguageErrorKind;
  readonly support: CodeEditorLanguageSupport;
  readonly theme: CodeEditorTheme;
  readonly change: DocumentChangeSpec;
  readonly resolved: ResolvedCodeEditorLanguage;
};

export const marker = 'R2-01-type-only-no-runtime-import';
