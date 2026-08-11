/**
 * @aiao/code-editor-vue
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { CodeEditor } from '@aiao/code-editor-vue';
 * </script>
 *
 * <template>
 *   <CodeEditor v-model:value="code" language="typescript" />
 * </template>
 * ```
 */
export type {
  CodeEditorEmits,
  CodeEditorExpose,
  CodeEditorProps,
  CodeEditorSetup,
  CodeEditorTheme
} from './code-editor.types.js';
export { default as CodeEditor } from './CodeEditor.vue';
