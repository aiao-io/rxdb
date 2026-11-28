import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { OrdersScenarioGuide } from './orders-scenario-guide';
import { ORDER_SCENARIOS } from './orders-scenarios';

function render() {
  const fixture = TestBed.createComponent(OrdersScenarioGuide);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const tabs = () => [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panel = () => root.querySelector<HTMLElement>('[data-testid="orders-scenario"]');
  return { fixture, root, tabs, panel };
}

describe('OrdersScenarioGuide（怎么测）', () => {
  afterEach(() => localStorage.clear());

  it('每个场景一个页签，默认选中第一个，下面列出它的步骤与每一步的预期', () => {
    const { tabs, panel } = render();

    expect(tabs().map(tab => tab.textContent?.trim())).toEqual(ORDER_SCENARIOS.map(scenario => scenario.label));
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(panel()?.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    const steps = [...(panel()?.querySelectorAll('[data-testid="orders-scenario-step"]') ?? [])];
    expect(steps).toHaveLength(ORDER_SCENARIOS[0].steps.length);
    expect(steps[0].textContent).toContain(ORDER_SCENARIOS[0].steps[0].action);
    expect(steps[0].textContent).toContain(ORDER_SCENARIOS[0].steps[0].expect);
  });

  it('点页签换到那个场景', () => {
    const { fixture, tabs, panel } = render();
    const reject = ORDER_SCENARIOS.findIndex(scenario => scenario.key === 'reject');

    tabs()[reject].click();
    fixture.detectChanges();

    expect(tabs()[reject].getAttribute('aria-selected')).toBe('true');
    expect(tabs()[0].getAttribute('aria-selected')).toBe('false');
    expect(panel()?.getAttribute('data-scenario')).toBe('reject');
    expect(panel()?.textContent).toContain(ORDER_SCENARIOS[reject].title);
  });

  it('左右方向键在页签之间移动并选中，首尾相接', () => {
    const { fixture, tabs } = render();

    tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();

    const last = tabs().at(-1);
    expect(last?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(last);
    last?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });
});

describe('OrdersScenarioGuide 收起', () => {
  afterEach(() => localStorage.clear());

  it('默认展开；收起之后记在本机，重新打开页面（如切换身份）还是收起的', () => {
    const first = render();
    const details = first.root.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);

    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    TestBed.tick();
    TestBed.resetTestingModule();

    const second = render();
    expect((second.root.querySelector('details') as HTMLDetailsElement).open).toBe(false);
  });
});

describe('ORDER_SCENARIOS', () => {
  it('覆盖演示的每类关系与同步：推送、级联删除、拉取、外键被拒、多对多、撤销、两人并发、访客', () => {
    expect(ORDER_SCENARIOS.map(scenario => scenario.key)).toEqual([
      'push',
      'cascade',
      'pull',
      'reject',
      'm2m',
      'undo',
      'concurrent',
      'visitor'
    ]);
    for (const scenario of ORDER_SCENARIOS) expect(scenario.steps.length).toBeGreaterThan(0);
  });
});
