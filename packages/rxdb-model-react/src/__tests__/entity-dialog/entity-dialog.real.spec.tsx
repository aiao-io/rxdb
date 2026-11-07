/**
 * EntityDialog —— **真实组件源码**（Angular `entity-dialog.real.spec.ts` 的 React 移植）。
 *
 * 覆盖对话框模式（Dialog 语境）下的标题栏渲染、全屏切换（真实面板样式写入）、
 * 边缘拖拽缩放（mousedown/mousemove/mouseup 事件链）、关闭
 * （onCloseRequested + Dialog 关闭）与非对话框模式的裸投影渲染。
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../dialog/dialog';
import { EntityDialog } from '../../entity-dialog/entity-dialog';

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('EntityDialog（真实组件）', () => {
  /** 挂载对话框组件（DIALOG 语境）并返回面板元素（portal 渲染进 document.body）。 */
  function renderDialog() {
    const closed: unknown[] = [];
    const onDialogClose = vi.fn();
    const utils = render(
      <Dialog open onClose={onDialogClose} width='720px' height='80vh'>
        <EntityDialog title='标题' onCloseRequested={() => closed.push(null)}>
          <div>内容</div>
        </EntityDialog>
      </Dialog>
    );
    const pane = document.querySelector('.rxdb-dialog-pane') as HTMLDivElement;
    return { ...utils, pane, closed, onDialogClose };
  }

  it('DIALOG 语境渲染标题栏、全屏/关闭按钮与八个缩放手柄', () => {
    const { pane } = renderDialog();

    expect(pane.textContent).toContain('标题');
    expect(pane.querySelector('[aria-label="关闭"]')).toBeTruthy();
    expect(pane.querySelector('[aria-label="全屏"]')).toBeTruthy();
    expect(pane.querySelectorAll('.resize-handle').length).toBe(8);
    expect(pane.getAttribute('role')).toBe('dialog');
    expect(pane.getAttribute('aria-modal')).toBe('true');
  });

  it('toggleFullscreen 写入 pane 全屏样式并可还原', () => {
    const { pane } = renderDialog();
    const toggle = pane.querySelector('[aria-label="全屏"]') as HTMLElement;

    fireEvent.click(toggle);
    expect(pane.querySelector('[aria-label="退出全屏"]')).toBeTruthy();
    expect(pane.style.width).toBe('100vw');
    expect(pane.style.height).toBe('100vh');

    fireEvent.click(pane.querySelector('[aria-label="退出全屏"]') as HTMLElement);
    expect(pane.querySelector('[aria-label="全屏"]')).toBeTruthy();
    // 还原到存档的内联样式（存档时 width 为 720px）
    expect(pane.style.width).toBe('720px');
    expect(pane.style.height).toBe('80vh');
  });

  it('边缘拖拽缩放：mousedown → mousemove 改宽度 → mouseup 收尾', () => {
    const { pane } = renderDialog();
    const handle = pane.querySelector('.resize-e') as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 100, clientY: 50, bubbles: true });
    fireEvent.mouseMove(document, { clientX: 160, clientY: 50 });

    // happy-dom offsetWidth 为 0，最小宽度下限 400
    expect(pane.style.width).toBe('400px');

    fireEvent.mouseUp(document);
    // 收尾后不再响应移动
    fireEvent.mouseMove(document, { clientX: 260, clientY: 50 });
    expect(pane.style.width).toBe('400px');
  });

  it('西 / 南 / 北边缘缩放走真实 mousedown → mousemove → mouseup 链', () => {
    const { pane } = renderDialog();

    const w = pane.querySelector('.resize-w') as HTMLElement;
    fireEvent.mouseDown(w, { clientX: 100, clientY: 50, bubbles: true });
    fireEvent.mouseMove(document, { clientX: 140, clientY: 50 });
    expect(pane.style.width).toBe('400px');
    fireEvent.mouseUp(document);

    const s = pane.querySelector('.resize-s') as HTMLElement;
    fireEvent.mouseDown(s, { clientX: 10, clientY: 50, bubbles: true });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 90 });
    expect(pane.style.height).toBe('300px');
    fireEvent.mouseUp(document);

    const n = pane.querySelector('.resize-n') as HTMLElement;
    fireEvent.mouseDown(n, { clientX: 10, clientY: 50, bubbles: true });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 10 });
    expect(pane.style.height).toBe('300px');
    fireEvent.mouseUp(document);
  });

  it('拖拽起点已有 left/top 样式时按解析值参与计算', () => {
    const { pane } = renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';

    const e = pane.querySelector('.resize-e') as HTMLElement;
    fireEvent.mouseDown(e, { clientX: 100, clientY: 50, bubbles: true });
    fireEvent.mouseMove(document, { clientX: 160, clientY: 50 });

    expect(pane.style.width).toBe('400px');
    fireEvent.mouseUp(document);
  });

  it('close 输出 onCloseRequested 并关闭对话框', async () => {
    const { pane, closed, onDialogClose, rerender } = renderDialog();

    fireEvent.click(pane.querySelector('[aria-label="关闭"]') as HTMLElement);
    expect(closed).toHaveLength(1);
    expect(onDialogClose).toHaveBeenCalled();

    // 宿主按 onClose 关闭对话框（受控语义，等价 CDK dialogRef.close 后面板销毁）
    rerender(
      <Dialog open={false} onClose={onDialogClose} width='720px' height='80vh'>
        <EntityDialog title='标题'>
          <div>内容</div>
        </EntityDialog>
      </Dialog>
    );
    await FLUSH();
    expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
  });

  it('遮罩点击与 Escape 关闭对话框（不触发 onCloseRequested，与 CDK 一致）', () => {
    const { closed, onDialogClose } = renderDialog();

    fireEvent.click(document.querySelector('.rxdb-dialog-backdrop') as HTMLElement);
    expect(onDialogClose).toHaveBeenCalledTimes(1);
    expect(closed).toHaveLength(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDialogClose).toHaveBeenCalledTimes(2);
    expect(closed).toHaveLength(0);
  });

  it('非 DIALOG 语境只渲染投影内容，不渲染标题栏', () => {
    const { container } = render(
      <EntityDialog title='无对话框'>
        <div>投影</div>
      </EntityDialog>
    );

    expect(container.textContent).toContain('投影');
    expect(container.textContent).not.toContain('无对话框');
    expect(container.querySelector('.resize-handle')).toBeNull();
  });

  it('标题栏用同一指针拖拽面板，释放后不再随指针移动', () => {
    const { pane } = renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';

    const title = [...pane.querySelectorAll('span')].find(s => s.textContent === '标题') as HTMLElement;
    fireEvent.pointerDown(title, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    expect(title.hasPointerCapture(1)).toBe(true);
    fireEvent.pointerMove(title, { pointerId: 2, clientX: 900, clientY: 900 });
    expect(pane.style.left).toBe('100px');
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(title, { pointerId: 1 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 500, clientY: 500 });

    expect(pane.style.left).toBe('140px');
    expect(pane.style.top).toBe('70px');
  });

  it('标题栏拖拽限制在视口内，避免底部操作按钮移出屏幕', () => {
    const { pane } = renderDialog();
    Object.defineProperties(pane, {
      offsetWidth: { configurable: true, value: 720 },
      offsetHeight: { configurable: true, value: 600 }
    });
    pane.style.left = '100px';
    pane.style.top = '50px';

    const title = [...pane.querySelectorAll('span')].find(s => s.textContent === '标题') as HTMLElement;
    fireEvent.pointerDown(title, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: -1000, clientY: -1000 });
    expect(pane.style.left).toBe('0px');
    expect(pane.style.top).toBe('0px');

    fireEvent.pointerMove(title, { pointerId: 1, clientX: 10000, clientY: 10000 });
    expect(pane.style.left).toBe(`${Math.max(0, window.innerWidth - 720)}px`);
    expect(pane.style.top).toBe(`${Math.max(0, window.innerHeight - 600)}px`);
    fireEvent.pointerUp(title, { pointerId: 1 });
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('%s 终止拖拽，之后仍可关闭', event => {
    const { pane, onDialogClose } = renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';
    const title = [...pane.querySelectorAll('span')].find(s => s.textContent === '标题') as HTMLElement;
    fireEvent.pointerDown(title, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent[event](title, { pointerId: 1 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 500, clientY: 500 });

    expect(pane.style.left).toBe('140px');
    expect(pane.style.top).toBe('70px');
    fireEvent.click(pane.querySelector('[aria-label="关闭"]') as HTMLElement);
    expect(onDialogClose).toHaveBeenCalledTimes(1);
  });

  it('右键不会启动标题拖拽', () => {
    const { pane } = renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';
    const title = [...pane.querySelectorAll('span')].find(s => s.textContent === '标题') as HTMLElement;
    fireEvent.pointerDown(title, { pointerId: 1, clientX: 100, clientY: 100, button: 2 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 500, clientY: 500 });
    expect(pane.style.left).toBe('100px');
    expect(pane.style.top).toBe('50px');
  });

  it('全屏后拖拽与缩放被禁用', () => {
    const { pane } = renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';
    fireEvent.click(pane.querySelector('[aria-label="全屏"]') as HTMLElement);

    const title = [...pane.querySelectorAll('span')].find(s => s.textContent === '标题') as HTMLElement;
    fireEvent.pointerDown(title, { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(title, { pointerId: 1 });
    // 全屏时拖拽不生效
    expect(pane.style.left).toBe('0px');
    expect(pane.style.top).toBe('0px');

    const e = pane.querySelector('.resize-e') as HTMLElement;
    fireEvent.mouseDown(e, { clientX: 100, clientY: 50, bubbles: true });
    fireEvent.mouseMove(document, { clientX: 160, clientY: 50 });
    fireEvent.mouseUp(document);
    // 全屏时缩放不生效
    expect(pane.style.width).toBe('100vw');
  });
});
