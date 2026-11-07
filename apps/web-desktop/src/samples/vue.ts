import { createApp, h, nextTick, onUnmounted, shallowRef, type VNode } from 'vue';
import type { FrameworkDocument } from './document.js';

export async function render(root: HTMLElement, model: FrameworkDocument): Promise<() => void> {
  const app = createApp({
    setup() {
      const state = shallowRef(model.snapshot);
      onUnmounted(
        model.subscribe(() => {
          state.value = model.snapshot;
        })
      );
      return () => {
        const view = state.value;
        const action = (label: string, invoke: () => void, disabled = false): VNode =>
          h('button', { disabled, onClick: invoke }, label);
        return h(
          'main',
          {
            class: 'framework-sample',
            'data-route': view.route,
            'data-theme': view.theme,
            'data-accent': view.accent,
            style: { '--desktop-scale': view.scale / 100 }
          },
          [
            h('h1', model.label),
            !view.desktop &&
              h(
                'p',
                { class: 'sample-boundary' },
                '独立运行：可以编辑和下载文本。桌面托管文件、剪贴板和窗口能力不可用。'
              ),
            view.error && h('p', { role: 'alert' }, view.error),
            !view.loaded && view.error && action('重试读取', () => void model.start()),
            h('label', [
              '文件名',
              h('input', {
                value: view.name,
                disabled: view.busy || !view.loaded,
                onInput: (event: Event) => model.rename((event.target as HTMLInputElement).value)
              })
            ]),
            h('label', { for: 'document-text' }, '文档内容'),
            h('textarea', {
              id: 'document-text',
              value: view.text,
              disabled: view.busy || !view.loaded,
              onInput: (event: Event) => model.edit((event.target as HTMLTextAreaElement).value)
            }),
            h('div', { class: 'sample-actions' }, [
              action('保存到我的文件', () => void model.save(), !view.desktop || view.busy || !view.loaded),
              action('下载文本', () => model.exportText(), view.busy || !view.loaded),
              action('撤销', () => model.undo(), !view.canUndo || view.busy),
              action('重做', () => model.redo(), !view.canRedo || view.busy),
              action('复制全文', () => void model.copy(), !view.desktop || view.busy),
              action('检查当前内容', () => void model.check(), !view.desktop || view.busy),
              action('切换强调色', () => model.toggleAccent())
            ]),
            h(
              'form',
              {
                class: 'sample-route',
                onSubmit: (event: Event) => {
                  event.preventDefault();
                  void model.navigate();
                }
              },
              [
                h('label', [
                  '逻辑位置',
                  h('input', {
                    value: view.location,
                    onInput: (event: Event) => model.setLocation((event.target as HTMLInputElement).value)
                  })
                ]),
                h('button', { disabled: view.busy }, '前往位置')
              ]
            ),
            h('p', { role: 'status' }, view.busy ? '正在处理…' : view.message)
          ]
        );
      };
    }
  });
  app.mount(root);
  await nextTick();
  return () => app.unmount();
}
