/**
 * @aiao/code-editor
 *
 * CodeMirror 代码编辑器核心包
 *
 * @example
 * ```ts
 * import { SUPPORT_LANGUAGES, CodeEditorTheme } from '@aiao/code-editor';
 * ```
 */
export * from './accessibility.js';
export * from './document-sync.js';
export * from './language-error.js';
export * from './language-resolution.js';
export * from './languages.js';

/**
 * CodeEditor 主题类型
 */
export type CodeEditorTheme = 'light' | 'dark';
