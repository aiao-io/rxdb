/**
 * @aiao/code-editor-react
 *
 * React CodeMirror 代码编辑器组件
 *
 * @example
 * ```tsx
 * import { CodeEditor } from '@aiao/code-editor-react';
 *
 * function App() {
 *   return (
 *     <CodeEditor
 *       value={code}
 *       onChange={setCode}
 *       language="typescript"
 *       theme="dark"
 *     />
 *   );
 * }
 * ```
 */
export { CodeEditor } from './CodeEditor.js';
export type { CodeEditorHandle, CodeEditorProps, CodeEditorSetup, CodeEditorTheme } from './CodeEditor.js';
