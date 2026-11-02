import { mountWorkbench, type BrowserWorkbenchOptions } from '@aiao/browser-workbench';
import { defineComponent, h, onMounted, onUnmounted, ref, type PropType } from 'vue';
import { mountVueEditor } from './mount-editor.js';

/** 使用现有 CodeEditor 挂载共享工作台。 */
export const BrowserWorkbench = defineComponent({
  name: 'BrowserWorkbench',
  props: {
    options: { type: Object as PropType<BrowserWorkbenchOptions>, default: () => ({}) }
  },
  setup(props) {
    const host = ref<HTMLElement>();
    let workbench: ReturnType<typeof mountWorkbench> | undefined;
    onMounted(() => {
      workbench = mountWorkbench(host.value!, props.options, mountVueEditor);
    });
    onUnmounted(() => workbench?.dispose());
    return () => h('div', { ref: host, style: { display: 'block', height: '100%', minHeight: 0 } });
  }
});
