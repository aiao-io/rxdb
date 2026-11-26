import { CdkPortal } from '@angular/cdk/portal';
import { Component, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RightPanel, SidePanelOutlet } from './side-panel';

/** 固定宽窄屏：RightPanel 构造时读一次 matchMedia */
function viewport(wide: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  } as unknown as MediaQueryList);
}

/** 像商品页那样经 portal 提供一个面板 */
@Component({
  imports: [CdkPortal, SidePanelOutlet],
  template: `
    <button id="opener" type="button">打开</button>
    <ng-template cdkPortal>
      <p data-testid="page-panel-content">模拟服务端的内容</p>
      <dialog open><input data-testid="dialog-input" /></dialog>
    </ng-template>
    <app-side-panel-outlet />
  `
})
class Host {
  readonly portal = viewChild.required(CdkPortal);
  readonly panel = inject(RightPanel);
}

function renderHost() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const release = host.panel.provide('server', { heading: '模拟服务端变更', portal: host.portal() });
  const element = fixture.nativeElement as HTMLElement;
  const opener = element.querySelector('#opener') as HTMLButtonElement;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { fixture, host, release, opener, byTestId };
}

afterEach(() => vi.restoreAllMocks());

describe('RightPanel', () => {
  it('同一时刻只开一个：开另一个就换掉；再点开着的那个就关上', () => {
    viewport(true);
    const panel = TestBed.inject(RightPanel);

    panel.open('history', null);
    panel.open('sync', null);
    expect(panel.active()).toBe('sync');

    panel.toggle('sync', null);
    expect(panel.active()).toBeNull();
  });

  it('关上之后焦点回到打开它的按钮', () => {
    viewport(true);
    const panel = TestBed.inject(RightPanel);
    const opener = document.body.appendChild(document.createElement('button'));

    panel.open('history', opener);
    panel.close();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('页面撤回它提供的面板时，开着的也一并关上', () => {
    viewport(true);
    const { host, release } = renderHost();

    host.panel.open('server', null);
    release();

    expect(host.panel.active()).toBeNull();
    expect(host.panel.pagePanel('server')).toBeUndefined();
  });
});

describe('SidePanelOutlet', () => {
  it('宽屏：页面提供的面板渲染在右侧一栏，标题是页面给的，不加遮罩', () => {
    viewport(true);
    const { fixture, host, opener, byTestId } = renderHost();

    host.panel.open('server', opener);
    fixture.detectChanges();

    expect(byTestId('side-panel')?.getAttribute('role')).toBe('complementary');
    expect(byTestId('side-panel')?.textContent).toContain('模拟服务端变更');
    expect(byTestId('page-panel-content')).not.toBeNull();
    expect(byTestId('side-panel-backdrop')).toBeNull();
  });

  it('Esc 关面板，焦点回到开关；面板里的对话框先处理自己的 Esc', () => {
    viewport(true);
    const { fixture, host, opener, byTestId } = renderHost();
    host.panel.open('server', opener);
    fixture.detectChanges();

    byTestId('dialog-input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.panel.active()).toBe('server');

    byTestId('side-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.panel.active()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('窄屏：盖住页面的抽屉带遮罩，点遮罩关上', () => {
    viewport(false);
    const { fixture, host, byTestId } = renderHost();
    host.panel.open('server', null);
    fixture.detectChanges();

    expect(byTestId('side-panel')?.getAttribute('aria-modal')).toBe('true');
    byTestId('side-panel-backdrop')!.click();

    expect(host.panel.active()).toBeNull();
  });
});
