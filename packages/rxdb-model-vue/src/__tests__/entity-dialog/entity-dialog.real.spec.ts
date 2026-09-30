import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, provide, type PropType } from 'vue';
import EntityDialog from '../../entity-dialog/EntityDialog.vue';
import { ENTITY_DIALOG_CONTEXT } from '../../entity-dialog/dialog-context';

/**
 * EntityDialog —— **真实组件源码**（对齐 Angular 侧，覆盖率补充）。
 *
 * EntityDetail 的模板宿主组件：覆盖对话框模式（注入对话框上下文）下的
 * 标题栏渲染、全屏切换（真实 `.rxdb-dialog-pane` 样式写入）、边缘拖拽缩放、
 * 关闭（closeRequested + 上下文 close）与非对话框模式的裸投影渲染。
 * 拖拽/缩放走真实 mousedown/mousemove/mouseup 事件链。
 */

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** 对话框上下文宿主：provide 上下文 + 渲染在 .rxdb-dialog-pane 里（等价 CDK overlay pane）。 */
const DialogContextHost = defineComponent({
  props: {
    close: { type: Function as PropType<(result?: unknown) => unknown>, required: false, default: undefined }
  },
  setup(props, { slots }) {
    provide(ENTITY_DIALOG_CONTEXT, { close: props.close ?? (() => undefined) });
    return () => h('div', { class: 'rxdb-dialog-pane' }, slots.default?.());
  }
});

describe('EntityDialog（真实组件）', () => {
  let closeSpy: ReturnType<typeof vi.fn<(result?: unknown) => unknown>>;

  beforeEach(() => {
    closeSpy = vi.fn<(result?: unknown) => unknown>();
    // happy-dom 的 rAF 可能带真实延时；用零延时代替，保证测试确定性
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number
    );
  });

  /** 挂载对话框组件（对话框语境），宿主挂进 document.body 并等待 rAF 初始化 pane。 */
  async function renderDialog() {
    const wrapper = mount(DialogContextHost, {
      props: { close: closeSpy },
      slots: { default: () => h(EntityDialog, { title: '标题' }) },
      attachTo: document.body
    });
    await FLUSH();
    const dialog = wrapper.findComponent(EntityDialog);
    const pane = wrapper.find('.rxdb-dialog-pane').element as HTMLElement;
    return { wrapper, dialog, pane };
  }

  it('DIALOG 语境渲染标题栏、全屏/关闭按钮与八个缩放手柄', async () => {
    const { dialog } = await renderDialog();

    expect((dialog.vm as unknown as { isInDialog: boolean }).isInDialog).toBe(true);
    expect(dialog.element.textContent).toContain('标题');
    expect(dialog.element.querySelector('[aria-label="关闭"]')).toBeTruthy();
    expect(dialog.element.querySelector('[aria-label="全屏"]')).toBeTruthy();
    expect(dialog.element.querySelectorAll('.resize-handle').length).toBe(8);
  });

  it('toggleFullscreen 写入 pane 全屏样式并可还原', async () => {
    const { dialog, pane } = await renderDialog();
    const vm = dialog.vm as unknown as { isFullscreen: boolean; toggleFullscreen(): void };

    vm.toggleFullscreen();
    expect(vm.isFullscreen).toBe(true);
    expect(pane.style.width).toBe('100vw');
    expect(pane.style.height).toBe('100vh');

    vm.toggleFullscreen();
    expect(vm.isFullscreen).toBe(false);
    expect(pane.style.width).toBe('');
  });

  it('边缘拖拽缩放：mousedown → mousemove 改宽度 → mouseup 收尾', async () => {
    const { dialog, pane } = await renderDialog();
    const handle = dialog.element.querySelector('.resize-e') as HTMLElement;

    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 50 }));

    // happy-dom offsetWidth 为 0，最小宽度下限 400
    expect(pane.style.width).toBe('400px');

    document.dispatchEvent(new MouseEvent('mouseup', {}));
    // 收尾后不再响应移动
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 50 }));
    expect(pane.style.width).toBe('400px');
  });

  it('close 输出 closeRequested 并关闭对话框上下文', async () => {
    const { dialog } = await renderDialog();
    const vm = dialog.vm as unknown as { close(): void };

    vm.close();

    expect(dialog.emitted('closeRequested')).toHaveLength(1);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('非 DIAGLOG 语境只渲染投影内容，不渲染标题栏', () => {
    const wrapper = mount(EntityDialog, {
      props: { title: '无对话框' },
      slots: { default: () => h('div', { class: 'content' }, '投影内容') }
    });

    expect((wrapper.vm as unknown as { isInDialog: boolean }).isInDialog).toBe(false);
    expect(wrapper.element.textContent).not.toContain('无对话框');
    expect(wrapper.element.textContent).toContain('投影内容');
    expect(wrapper.element.querySelector('.resize-handle')).toBeNull();
  });
});

/** 只提供上下文、不渲染 pane 包裹的宿主（模拟 pane 未初始化的场景）。 */
const BareContextHost = defineComponent({
  setup(_props, { slots }) {
    provide(ENTITY_DIALOG_CONTEXT, { close: () => undefined });
    return () => slots.default?.();
  }
});

/**
 * 补充分支：西/南/北边缘缩放、拖拽起点已有 left/top、
 * pane 未初始化时 startResize / toggleFullscreen 安全返回、
 * 无存档状态时收起全屏。
 */
describe('EntityDialog（分支收尾）', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number
    );
  });

  async function renderDialog() {
    const wrapper = mount(DialogContextHost, {
      props: { close: vi.fn() },
      slots: { default: () => h(EntityDialog, { title: '标题' }) },
      attachTo: document.body
    });
    await FLUSH();
    const dialog = wrapper.findComponent(EntityDialog);
    const pane = wrapper.find('.rxdb-dialog-pane').element as HTMLElement;
    return { wrapper, dialog, pane };
  }

  it('西 / 南 / 北边缘缩放走真实 mousedown → mousemove → mouseup 链', async () => {
    const { dialog, pane } = await renderDialog();

    const w = dialog.element.querySelector('.resize-w') as HTMLElement;
    w.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 50 }));
    // happy-dom offsetWidth 为 0，宽度受最小下限约束
    expect(pane.style.width).toBe('400px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));

    const s = dialog.element.querySelector('.resize-s') as HTMLElement;
    s.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 90 }));
    expect(pane.style.height).toBe('300px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));

    const n = dialog.element.querySelector('.resize-n') as HTMLElement;
    n.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    expect(pane.style.height).toBe('300px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));
  });

  it('拖拽起点已有 left/top 样式时按解析值参与计算', async () => {
    const { dialog, pane } = await renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';

    const e = dialog.element.querySelector('.resize-e') as HTMLElement;
    e.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 50 }));

    expect(pane.style.width).toBe('400px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));
  });

  it('pane 未初始化时 startResize 不拦截、toggleFullscreen 只切换状态', async () => {
    // 不挂 pane（BareContextHost 无 pane 包裹）、不 FLUSH → pane 未初始化
    const wrapper = mount(BareContextHost, {
      slots: { default: () => h(EntityDialog, { title: '标题' }) }
    });
    const dialog = wrapper.findComponent(EntityDialog);
    const vm = dialog.vm as unknown as {
      startResize(e: MouseEvent, dir: string): void;
      toggleFullscreen(): void;
      isFullscreen: boolean;
    };

    const evt = new MouseEvent('mousedown', { clientX: 10, clientY: 10, cancelable: true });
    vm.startResize(evt, 'e');
    expect(evt.defaultPrevented).toBe(false);

    vm.toggleFullscreen();
    expect(vm.isFullscreen).toBe(true);
  });

  it('无存档状态时收起全屏不报错、不写样式', async () => {
    const wrapper = mount(DialogContextHost, {
      props: { close: vi.fn() },
      slots: { default: () => h(EntityDialog, { title: '标题' }) },
      attachTo: document.body
    });
    const dialog = wrapper.findComponent(EntityDialog);
    const pane = wrapper.find('.rxdb-dialog-pane').element as HTMLElement;
    const vm = dialog.vm as unknown as { toggleFullscreen(): void; isFullscreen: boolean };

    // pane 初始化前切全屏：#savedPaneState 不会被写入
    vm.toggleFullscreen();
    expect(vm.isFullscreen).toBe(true);

    // rAF 之后 #pane 就绪；再切一次收起：无存档状态走空分支
    await FLUSH();
    expect(pane.style.position).toBe('fixed');
    expect(pane.style.width).not.toBe('100vw');

    vm.toggleFullscreen();
    expect(vm.isFullscreen).toBe(false);
    wrapper.unmount();
  });
});
