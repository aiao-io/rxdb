import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { BomWorkspaceState } from './bom-workspace-state';

@Component({ template: '' })
class WorkspaceTestPage {}

describe('业务工作条件的恢复与连续使用', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    ['1.5', 1],
    ['-2', 0],
    ['9.5', 3],
    ['bad', 0]
  ])('引导步骤只恢复合法整数：%s', (guide, expected) => {
    const state = TestBed.inject(BomWorkspaceState);
    state.restore({ guide });
    expect(state.guideStep()).toBe(expected);
  });

  it('从链接恢复日期、数量与完整适用条件，清空序列号仍能往返', () => {
    const state = TestBed.inject(BomWorkspaceState);
    state.restore({
      root: 'BATT',
      date: '2026-10-15',
      qty: '10',
      unit: 'none',
      lot: 'LOT-A',
      alternative: '2',
      item: 'PCBA',
      config: '{"颜色":["蓝"]}',
      substitutes: '{"G":{"memberKey":"part"}}'
    });
    expect(state.rootKey()).toBe('BATT');
    expect(state.asOfDate()).toBe('2026-10-15');
    expect(state.plannedQty()).toBe('10');
    expect(state.unit()).toBeNull();
    expect(state.resolutionOptions()).toMatchObject({
      lot: 'LOT-A',
      alternativeNo: 2,
      configSelection: { 颜色: ['蓝'] },
      substituteSelections: { G: { memberKey: 'part' } }
    });
    state.restore(state.queryParams());
    expect(state.unit()).toBeNull();
    expect(state.selectedItem()).toBe('PCBA');
  });

  it('无效链接和表单指出字段问题，不发送悄悄更正的条件', () => {
    const state = TestBed.inject(BomWorkspaceState);
    state.restore({ date: '2026-02-31', qty: '-1', config: '{broken' });
    expect(state.validationError()).toMatch(/日期|配置/);
    expect(state.asOfDate()).toBe('2026-02-31');
    state.asOfDate.set('2026-10-15');
    expect(state.validationError()).toContain('计划量');
  });

  it('选择物料不使已执行结构失效，改变生产条件则改变结果身份', () => {
    const state = TestBed.inject(BomWorkspaceState);
    const key = state.contextKey();
    state.selectedItem.set('BATT');
    expect(state.contextKey()).toBe(key);
    state.plannedQty.set('10');
    expect(state.contextKey()).not.toBe(key);
  });

  it('绑定路由后修改条件进入URL，跨页和刷新能恢复同一任务', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: WorkspaceTestPage },
          { path: 'cost', component: WorkspaceTestPage }
        ])
      ]
    });
    const router = TestBed.inject(Router);
    const state = TestBed.inject(BomWorkspaceState);
    await router.navigateByUrl('/?root=BATT&date=2026-10-15&qty=3&unit=none&costSource=JOINT-MAIN');
    state.bindRouter(router);
    expect(state.rootKey()).toBe('BATT');
    expect(state.jointSourceKey()).toBe('JOINT-MAIN');
    state.update({ rootKey: 'PCBA', plannedQty: '12' });
    TestBed.tick();
    await router.navigate(['/cost'], { queryParams: state.queryParams() });
    expect(router.parseUrl(router.url).queryParams['root']).toBe('PCBA');
    expect(router.parseUrl(router.url).queryParams['qty']).toBe('12');
    expect(state.unit()).toBeNull();
  });
});
