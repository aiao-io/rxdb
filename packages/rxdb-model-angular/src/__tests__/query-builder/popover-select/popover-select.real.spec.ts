import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverSelectComponent } from '../../../query-builder/popover-select/popover-select.component';

/**
 * PopoverSelectComponent —— **真实加载组件源码**。
 *
 * 此前的覆盖全部来自 operator-selector 的间接渲染（17.4% 分支），
 * 本 spec 直接渲染组件，补齐过滤 / 键盘导航 / Popover API 生命周期 /
 * 定位计算的每一条分支。happy-dom 无完整 Popover API，
 * `hidePopover` / `showPopover` 打桩；`focus` 走 happy-dom 真实实现
 * （assert `document.activeElement`）。
 */

const OPTIONS = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' }
] as const;

describe('PopoverSelectComponent（真实组件）', () => {
  function render(
    inputs: Partial<{
      options: Array<{ value: string; label: string }>;
      selected: string;
      placeholder: string;
      minWidth: string;
    }> = {}
  ) {
    const fixture = TestBed.createComponent(PopoverSelectComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('options', inputs.options ?? [...OPTIONS]);
    fixture.componentRef.setInput('selected', inputs.selected ?? '');
    if (inputs.placeholder) fixture.componentRef.setInput('placeholder', inputs.placeholder);
    if (inputs.minWidth) fixture.componentRef.setInput('minWidth', inputs.minWidth);
    fixture.detectChanges();

    // happy-dom 没有 Popover API
    const el = fixture.nativeElement as HTMLElement;
    const popover = el.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();

    const selectedValues: string[] = [];
    component.selectChange.subscribe(v => selectedValues.push(v));
    return { fixture, component, el, popover, selectedValues };
  }

  /** 按 value 定位选项按钮（id = uid-opt-<value>）。 */
  function optionEl(host: ReturnType<typeof render>, value: string): HTMLElement {
    return host.el.querySelector(`#${host.component['uid']}-opt-${value}`) as HTMLElement;
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    host = render();
  });

  describe('渲染与选项', () => {
    it('未选中时按钮显示 placeholder，选中后显示对应 label', () => {
      expect(host.component['currentLabel']()).toBe('请选择');
      const trigger = host.el.querySelector('button') as HTMLButtonElement;
      expect(trigger.textContent?.trim()).toBe('请选择');

      const withSelection = render({ selected: 'beta' });
      expect(withSelection.component['currentLabel']()).toBe('Beta');
      expect((withSelection.el.querySelector('button') as HTMLButtonElement).textContent?.trim()).toBe('Beta');
    });

    it('自定义 placeholder 生效；选中值不在选项中时回退 placeholder', () => {
      expect(render({ placeholder: '请选择操作符' }).component['currentLabel']()).toBe('请选择操作符');
      expect(render({ selected: 'nope', placeholder: '占位' }).component['currentLabel']()).toBe('占位');
    });

    it('按钮带 popovertarget 指向弹层 id；弹层有 popover 属性、listbox 与 id', () => {
      const uid = host.component['uid'] as string;
      const trigger = host.el.querySelector('button') as HTMLButtonElement;

      expect(trigger.getAttribute('popovertarget')).toBe(uid);
      expect(trigger.getAttribute('type')).toBe('button');
      expect(host.popover.id).toBe(uid);
      expect(host.popover.hasAttribute('popover')).toBe(true);
      expect(host.popover.getAttribute('tabindex')).toBe('-1');
      expect(host.el.querySelector('ul')?.getAttribute('role')).toBe('listbox');
      expect(host.el.querySelector('ul')?.id).toBe(`${uid}-list`);
    });

    it('minWidth 输入应用到按钮与弹层样式', () => {
      const wide = render({ minWidth: '16rem' });
      const trigger = wide.el.querySelector('button') as HTMLButtonElement;

      expect(trigger.style.minWidth).toBe('16rem');
      expect(wide.popover.style.minWidth).toBe('16rem');
    });

    it('全部 options 渲染为 role=option 按钮，带 aria-activedescendant 组合框', () => {
      const optionButtons = [...host.el.querySelectorAll('li[role="none"] button[role="option"]')];
      expect(optionButtons.map(b => b.textContent?.trim())).toEqual(['Alpha', 'Beta', 'Gamma']);

      const filterInput = host.el.querySelector('input[role="combobox"]') as HTMLInputElement;
      expect(filterInput.getAttribute('placeholder')).toBe('搜索...');
      expect(filterInput.getAttribute('aria-expanded')).toBe('true');
      expect(filterInput.getAttribute('aria-controls')).toBe(`${host.component['uid']}-list`);
    });

    it('selected 项带 aria-selected 与高亮 class，并渲染勾选图标', () => {
      const withSelection = render({ selected: 'beta' });
      const selectedBtn = optionEl(withSelection, 'beta');

      expect(selectedBtn.getAttribute('aria-selected')).toBe('true');
      expect(selectedBtn.classList.contains('bg-primary/15')).toBe(true);
      expect(selectedBtn.classList.contains('font-semibold')).toBe(true);
      expect(selectedBtn.querySelector('svg')).toBeTruthy();

      const unselected = optionEl(withSelection, 'alpha');
      expect(unselected.getAttribute('aria-selected')).toBe('false');
      expect(unselected.querySelector('svg')).toBeNull();
    });

    it('activeItemId 跟随高亮索引，越界时为空', () => {
      const component = host.component;
      expect(component['activeItemId']()).toBe(`${component['uid']}-opt-alpha`);

      component['activeIndex'].set(2);
      expect(component['activeItemId']()).toBe(`${component['uid']}-opt-gamma`);

      component['activeIndex'].set(99);
      expect(component['activeItemId']()).toBeNull();
    });
  });

  describe('搜索过滤', () => {
    it('过滤词大小写不敏感、前后空白裁剪', () => {
      host.component['filterText'].set('  bEtA ');
      host.fixture.detectChanges();

      const visible = host.component['filteredOptions']().map(o => o.value);
      expect(visible).toEqual(['beta']);
      const labels = [...host.el.querySelectorAll('li[role="none"] button')].map(b => b.textContent?.trim());
      expect(labels).toEqual(['Beta']);
    });

    it('空过滤词返回全部选项', () => {
      expect(host.component['filteredOptions']().map(o => o.value)).toEqual(['alpha', 'beta', 'gamma']);

      host.component['filterText'].set('   ');
      host.fixture.detectChanges();
      expect(host.component['filteredOptions']().length).toBe(3);
    });

    it('过滤无命中时渲染「无匹配项」空态，activeItemId 为 null', () => {
      host.component['filterText'].set('zzz-no-match');
      host.fixture.detectChanges();

      expect(host.component['filteredOptions']()).toEqual([]);
      expect(host.el.textContent).toContain('无匹配项');
      expect(host.el.querySelectorAll('button[role="option"]')).toHaveLength(0);
      expect(host.component['activeItemId']()).toBeNull();
    });

    it('过滤词变化后高亮自动回到第一项', () => {
      host.component['activeIndex'].set(2);
      host.component['filterText'].set('be');
      host.fixture.detectChanges();

      expect(host.component['activeIndex']()).toBe(0);
      expect(host.component['activeItemId']()).toBe(`${host.component['uid']}-opt-beta`);
    });
  });

  describe('点击选择', () => {
    it('点击选项 emit selectChange、关闭弹层并聚焦触发按钮', () => {
      const trigger = host.el.querySelector('button') as HTMLButtonElement;
      optionEl(host, 'gamma').click();

      expect(host.selectedValues).toEqual(['gamma']);
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('键盘导航', () => {
    it('ArrowDown / ArrowUp 循环移动高亮并滚动可见项', () => {
      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
      expect(host.component['activeIndex']()).toBe(1);
      host.fixture.detectChanges();
      expect(optionEl(host, 'beta').classList.contains('menu-focus')).toBe(true);

      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
      expect(host.component['activeIndex']()).toBe(0);

      // 顶部再上 → 环绕到最后一项
      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
      expect(host.component['activeIndex']()).toBe(2);
    });

    it('Enter 选择当前高亮项', () => {
      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
      const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
      host.component.onKeydown(event);

      expect(event.defaultPrevented).toBe(true);
      expect(host.selectedValues).toEqual(['beta']);
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);
    });

    it('Escape 关闭弹层并聚焦触发按钮；Tab 只关闭', () => {
      const trigger = host.el.querySelector('button') as HTMLButtonElement;

      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(trigger);

      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(2);
    });

    it('无匹配选项时方向键与 Enter 安全 no-op', () => {
      host.component['filterText'].set('zzz-no-match');
      host.fixture.detectChanges();

      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true }));
      host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

      expect(host.component['activeIndex']()).toBe(0);
      expect(host.selectedValues).toEqual([]);
      expect(host.popover.hidePopover).not.toHaveBeenCalled();
    });

    it('未识别的按键不拦截', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
      host.component.onKeydown(event);

      expect(event.defaultPrevented).toBe(false);
      expect(host.selectedValues).toEqual([]);
    });
  });

  describe('Popover API 生命周期', () => {
    it('beforetoggle open 清空过滤词并应用弹层定位', () => {
      host.component['filterText'].set('be');
      const event = Object.assign(new Event('beforetoggle'), { newState: 'open' });
      host.component.onBeforeToggle(event);
      host.fixture.detectChanges();

      expect(host.component['filterText']()).toBe('');
      // happy-dom 无布局：triggerRect 全 0，innerHeight 768 → 空间充足，向下展示
      expect(host.popover.style.position).toBe('fixed');
      expect(host.popover.style.left).toBe('0px');
      expect(host.popover.style.top).toBe('2px');
      expect(host.popover.style.bottom).toBe('unset');
    });

    it('下方空间不足时定位翻转到触发元素上方', () => {
      // happy-dom 默认 innerHeight=768（> 阈值 120）；压到 50 走翻转分支
      Object.defineProperty(window, 'innerHeight', { value: 50, configurable: true });
      try {
        host.component.onBeforeToggle(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
      } finally {
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
      }

      expect(host.popover.style.top).toBe('unset');
      expect(host.popover.style.bottom).toBe('52px');
    });

    it('beforetoggle closed 不清空过滤词', () => {
      host.component['filterText'].set('be');
      host.component.onBeforeToggle(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));

      expect(host.component['filterText']()).toBe('be');
    });

    it('toggle open 聚焦搜索框并重置高亮索引', () => {
      host.component['activeIndex'].set(2);
      host.component.onToggle(Object.assign(new Event('toggle'), { newState: 'open' }));

      const filterInput = host.el.querySelector('input[role="combobox"]') as HTMLInputElement;
      expect(document.activeElement).toBe(filterInput);
      expect(host.component['activeIndex']()).toBe(0);
    });

    it('toggle closed 不做事', () => {
      host.component['filterText'].set('be');
      host.component['activeIndex'].set(2);
      host.component.onToggle(Object.assign(new Event('toggle'), { newState: 'closed' }));

      expect(host.component['filterText']()).toBe('be');
      expect(host.component['activeIndex']()).toBe(2);
    });
  });
});

describe('PopoverSelectComponent（分支收尾）', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('键盘滚动：目标选项已脱离文档时 scrollIntoView 安全跳过', () => {
    const fixture = TestBed.createComponent(PopoverSelectComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('options', [...OPTIONS]);
    fixture.componentRef.setInput('selected', '');
    fixture.detectChanges();

    const popover = (fixture.nativeElement as HTMLElement).querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();

    // 把当前高亮的下一项从文档摘除，模拟选项脱离 DOM 的场景
    (fixture.nativeElement as HTMLElement).querySelector(`#${component['uid']}-opt-beta`)?.remove();

    expect(() =>
      component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    ).not.toThrow();
    expect(component['activeIndex']()).toBe(1);
  });
});
