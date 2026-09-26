import { DialogRef } from '@angular/cdk/dialog';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDialogComponent } from '../../entity-dialog/entity-dialog.component';

/**
 * EntityDialogComponent —— **真实组件源码**（覆盖率补充）。
 *
 * EntityDetailComponent 的模板宿主组件：覆盖对话框模式（DIALOG 语境）下的
 * 标题栏渲染、全屏切换（真实 .cdk-overlay-pane 样式写入）、边缘拖拽缩放、
 * 关闭（closeRequested + DialogRef.close）与非对话框模式的裸投影渲染。
 * 拖拽/缩放走真实 mousedown/mousemove/mouseup 事件链。
 */

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('EntityDialogComponent（真实组件）', () => {
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeSpy = vi.fn();
    // happy-dom 的 rAF 可能带真实延时；用零延时代替，保证测试确定性
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number
    );
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: DialogRef, useValue: { close: closeSpy } }]
    });
  });

  /** 挂载对话框组件（DIALOG 语境），并把宿主挂进模拟的 .cdk-overlay-pane。 */
  async function renderDialog() {
    const fixture = TestBed.createComponent(EntityDialogComponent);
    fixture.componentRef.setInput('title', '标题');
    const closed: unknown[] = [];
    fixture.componentInstance.closeRequested.subscribe(() => closed.push(null));
    fixture.detectChanges();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    pane.appendChild(fixture.nativeElement);
    document.body.appendChild(pane);
    await FLUSH();
    return { fixture, component: fixture.componentInstance, closed, pane };
  }

  it('DIALOG 语境渲染标题栏、全屏/关闭按钮与八个缩放手柄', async () => {
    const { fixture, component } = await renderDialog();

    expect(component.isInDialog).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('标题');
    expect(fixture.nativeElement.querySelector('[aria-label="关闭"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="全屏"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.resize-handle').length).toBe(8);
  });

  it('toggleFullscreen 写入 pane 全屏样式并可还原', async () => {
    const { component, pane } = await renderDialog();

    component.toggleFullscreen();
    expect(component.isFullscreen()).toBe(true);
    expect(pane.style.width).toBe('100vw');
    expect(pane.style.height).toBe('100vh');

    component.toggleFullscreen();
    expect(component.isFullscreen()).toBe(false);
    expect(pane.style.width).toBe('');
  });

  it('边缘拖拽缩放：mousedown → mousemove 改宽度 → mouseup 收尾', async () => {
    const { fixture, pane } = await renderDialog();
    const handle = fixture.nativeElement.querySelector('.resize-e') as HTMLElement;

    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 50 }));

    // happy-dom offsetWidth 为 0，最小宽度下限 400
    expect(pane.style.width).toBe('400px');

    document.dispatchEvent(new MouseEvent('mouseup', {}));
    // 收尾后不再响应移动
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 50 }));
    expect(pane.style.width).toBe('400px');
  });

  it('close 输出 closeRequested 并关闭 DialogRef', async () => {
    const { component, closed } = await renderDialog();

    component.close();

    expect(closed).toHaveLength(1);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('非 DIAGLOG 语境只渲染投影内容，不渲染标题栏', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(EntityDialogComponent);
    fixture.componentRef.setInput('title', '无对话框');
    fixture.detectChanges();

    expect(fixture.componentInstance.isInDialog).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('无对话框');
    expect(fixture.nativeElement.querySelector('.resize-handle')).toBeNull();
  });
});

/**
 * 补充分支：西/南/北边缘缩放、拖拽起点已有 left/top、
 * pane 未初始化时 startResize / toggleFullscreen 安全返回、
 * 无存档状态时 close 收起全屏。
 */
describe('EntityDialogComponent（分支收尾）', () => {
  const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number
    );
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: DialogRef, useValue: { close: vi.fn() } }]
    });
  });

  /** 挂载对话框组件并把宿主挂进模拟的 .cdk-overlay-pane，等待 rAF 初始化 pane。 */
  async function renderDialog() {
    const fixture = TestBed.createComponent(EntityDialogComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('title', '标题');
    fixture.detectChanges();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    pane.appendChild(fixture.nativeElement);
    document.body.appendChild(pane);
    await FLUSH();
    return { fixture, component, pane };
  }

  it('西 / 南 / 北边缘缩放走真实 mousedown → mousemove → mouseup 链', async () => {
    const { fixture, pane } = await renderDialog();

    const w = fixture.nativeElement.querySelector('.resize-w') as HTMLElement;
    w.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 50 }));
    // happy-dom offsetWidth 为 0，宽度受最小下限约束
    expect(pane.style.width).toBe('400px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));

    const s = fixture.nativeElement.querySelector('.resize-s') as HTMLElement;
    s.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 90 }));
    expect(pane.style.height).toBe('300px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));

    const n = fixture.nativeElement.querySelector('.resize-n') as HTMLElement;
    n.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 }));
    expect(pane.style.height).toBe('300px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));
  });

  it('拖拽起点已有 left/top 样式时按解析值参与计算', async () => {
    const { fixture, pane } = await renderDialog();
    pane.style.left = '100px';
    pane.style.top = '50px';

    const e = fixture.nativeElement.querySelector('.resize-e') as HTMLElement;
    e.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 50 }));

    expect(pane.style.width).toBe('400px');
    document.dispatchEvent(new MouseEvent('mouseup', {}));
  });

  it('pane 未初始化时 startResize 不拦截、toggleFullscreen 只切换状态', async () => {
    const fixture = TestBed.createComponent(EntityDialogComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('title', '标题');
    fixture.detectChanges(); // 不挂 pane、不 FLUSH → #pane 未初始化

    const evt = new MouseEvent('mousedown', { clientX: 10, clientY: 10, cancelable: true });
    component.startResize(evt, 'e');
    expect(evt.defaultPrevented).toBe(false);

    component.toggleFullscreen();
    expect(component.isFullscreen()).toBe(true);
  });

  it('无存档状态时 close 收起全屏不报错、不写样式', async () => {
    const fixture = TestBed.createComponent(EntityDialogComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('title', '标题');
    fixture.detectChanges();

    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    pane.appendChild(fixture.nativeElement);
    document.body.appendChild(pane);

    // pane 初始化前切全屏：#savedPaneState 不会被写入
    component.toggleFullscreen();
    expect(component.isFullscreen()).toBe(true);

    // rAF 之后 #pane 就绪；再切一次收起：无存档状态走空分支
    await FLUSH();
    expect(pane.style.position).toBe('fixed');
    expect(pane.style.width).not.toBe('100vw');

    component.toggleFullscreen();
    expect(component.isFullscreen()).toBe(false);
  });
});
