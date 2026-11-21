import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, withComponentInputBinding } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { canvasRouteMatcher } from '../../designer.routes';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import CanvasPage from '../../pages/canvas.page';
import { DesignerStateService } from '../../services/designer-state.service';

// 回归守卫：表格模式选中实体后切到画布（URL 携带 /canvas/:entityId），选中 MUST NOT 被清空。
// 依赖路由参数经 withComponentInputBinding 绑定到 CanvasPage 的 entityId input。
// 曾经 app.config.ts 漏配该 feature：entityId 永远为 undefined，画布页的构造 effect
// 走「无实体 id」分支调用 onSelectionCleared，导致选中丢失。

// canvas-graph-init 会运行时加载 @antv/x6（happy-dom 下 CJS/ESM 混用报错）；
// 本套件覆盖了 CanvasPage 模板、不会初始化画布，直接 stub。
vi.mock('@antv/x6', () => ({
  Graph: class {},
  MiniMap: class {},
  Selection: class {}
}));
vi.mock('@antv/x6-angular-shape', () => ({
  AngularShapeView: class {},
  register: () => undefined
}));

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

function createFakeState(selected: string[] = []) {
  return {
    entities: signal<unknown[]>([]),
    selectedEntityIds: signal<ReadonlySet<string>>(new Set(selected)),
    onEntitySelected: vi.fn(() => true),
    onSelectionCleared: vi.fn()
  };
}

async function renderCanvasAt(url: string, selected: string[] = []) {
  const state = createFakeState(selected);
  await TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([{ matcher: canvasRouteMatcher, component: CanvasPage }], withComponentInputBinding()),
      { provide: DesignerStateService, useValue: state },
      { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }
    ]
  })
    .overrideComponent(CanvasPage, { set: { template: '' } })
    .compileComponents();

  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(Host);
  await router.navigateByUrl(url);
  fixture.detectChanges();
  return { state, fixture };
}

describe('CanvasPage route input', () => {
  it('MUST bind the route entity id and keep the existing selection (table → canvas switch)', async () => {
    const { state, fixture } = await renderCanvasAt('/canvas/e1', ['e1']);
    const page = fixture.debugElement.children.find(c => c.componentInstance instanceof CanvasPage)
      ?.componentInstance as CanvasPage;

    expect(page.entityId()).toBe('e1');
    expect(state.onSelectionCleared).not.toHaveBeenCalled();
  });

  it('MUST select the route entity when it is not selected yet (deep link)', async () => {
    const { state } = await renderCanvasAt('/canvas/e1');

    expect(state.onEntitySelected).toHaveBeenCalledWith('e1');
    expect(state.onSelectionCleared).not.toHaveBeenCalled();
  });

  it('MUST clear the selection when entering canvas without an entity id', async () => {
    const { state } = await renderCanvasAt('/canvas', ['e1']);

    expect(state.onSelectionCleared).toHaveBeenCalledTimes(1);
  });
});
