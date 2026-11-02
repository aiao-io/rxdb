import { mountWorkbench } from '@aiao/browser-workbench';
import { CodeEditor, type CodeEditorExpose } from '@aiao/code-editor-vue';
import { createApp, h, ref, shallowReactive } from 'vue';

/** 将单文件编辑器交给 Vue 生命周期管理。 */
export const mountVueEditor: Parameters<typeof mountWorkbench>[2] = (element, initial) => {
  const state = shallowReactive({ value: initial.value, language: initial.language });
  const editor = ref<CodeEditorExpose>();
  const reportCursor = () => {
    const view = editor.value!.view!;
    const position = view.state.selection.main.head;
    const line = view.state.doc.lineAt(position);
    initial.onCursor(line.number, position - line.from + 1);
  };
  const app = createApp({
    render: () =>
      h('div', { style: { height: '100%' }, onKeyup: reportCursor, onMouseup: reportCursor, onInput: reportCursor }, [
        h(CodeEditor, {
          ref: editor,
          value: state.value,
          language: state.language,
          theme: 'dark',
          label: '项目源码',
          onChange: initial.onChange
        })
      ])
  });
  app.mount(element);
  return {
    update: (value, language) => {
      state.value = value;
      state.language = language;
    },
    dispose: () => app.unmount()
  };
};
