/**
 * PopoverSelect —— **真实组件源码**（Angular `popover-select.real.spec.ts` 的 React 移植）。
 *
 * 直接渲染组件，覆盖过滤 / 键盘导航 / Popover API 生命周期 / 定位计算的每一条分支。
 * happy-dom 无完整 Popover API，`hidePopover` / `showPopover` 打桩；事件经
 * `beforetoggle` / `toggle` 原生事件名驱动（React 19 将这两个事件委托到元素上）。
 */
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PopoverSelect } from '../../../query-builder/popover-select/popover-select';

const OPTIONS = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'beta', label: 'Beta' },
  { value: 'gamma', label: 'Gamma' }
] as const;

describe('PopoverSelect（真实组件）', () => {
  function renderSelect(
    props: Partial<{
      options: Array<{ value: string; label: string }>;
      selected: string;
      placeholder: string;
      minWidth: string;
    }> = {}
  ) {
    const selectedValues: string[] = [];
    const utils = render(
      <PopoverSelect
        options={props.options ?? [...OPTIONS]}
        selected={props.selected ?? ''}
        placeholder={props.placeholder}
        minWidth={props.minWidth}
        onSelectChange={value => selectedValues.push(value)}
      />
    );

    // happy-dom 没有 Popover API
    const popover = utils.container.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();

    return { ...utils, popover, selectedValues };
  }

  /** 按 value 定位选项按钮（id = uid-opt-<value>）。 */
  function optionEl(host: ReturnType<typeof renderSelect>, value: string): HTMLElement {
    return host.container.querySelector(`[id$="-opt-${value}"]`) as HTMLElement;
  }

  let host: ReturnType<typeof renderSelect>;

  beforeEach(() => {
    host = renderSelect();
  });

  describe('渲染与选项', () => {
    it('未选中时按钮显示 placeholder，选中后显示对应 label', () => {
      const trigger = host.container.querySelector('button') as HTMLButtonElement;
      expect(trigger.textContent?.trim()).toBe('请选择');

      const withSelection = renderSelect({ selected: 'beta' });
      expect((withSelection.container.querySelector('button') as HTMLButtonElement).textContent?.trim()).toBe('Beta');
    });

    it('自定义 placeholder 生效；选中值不在选项中时回退 placeholder', () => {
      expect(
        (
          renderSelect({ placeholder: '请选择操作符' }).container.querySelector('button') as HTMLButtonElement
        ).textContent?.trim()
      ).toBe('请选择操作符');
      expect(
        (
          renderSelect({ selected: 'nope', placeholder: '占位' }).container.querySelector('button') as HTMLButtonElement
        ).textContent?.trim()
      ).toBe('占位');
    });

    it('按钮带 popovertarget 指向弹层 id；弹层有 popover 属性、listbox 与 id', () => {
      const uid = host.popover.id;
      const trigger = host.container.querySelector('button') as HTMLButtonElement;

      expect(trigger.getAttribute('popovertarget')).toBe(uid);
      expect(trigger.getAttribute('type')).toBe('button');
      expect(host.popover.id).toBe(uid);
      expect(host.popover.hasAttribute('popover')).toBe(true);
      expect(host.popover.getAttribute('tabindex')).toBe('-1');
      expect(host.container.querySelector('ul')?.getAttribute('role')).toBe('listbox');
      expect(host.container.querySelector('ul')?.id).toBe(`${uid}-list`);
    });

    it('minWidth 输入应用到按钮与弹层样式', () => {
      const wide = renderSelect({ minWidth: '16rem' });
      const trigger = wide.container.querySelector('button') as HTMLButtonElement;

      expect(trigger.style.minWidth).toBe('16rem');
      expect(wide.popover.style.minWidth).toBe('16rem');
    });

    it('全部 options 渲染为 role=option 按钮，带 aria-activedescendant 组合框', () => {
      const optionButtons = [...host.container.querySelectorAll('li[role="none"] button[role="option"]')];
      expect(optionButtons.map(b => b.textContent?.trim())).toEqual(['Alpha', 'Beta', 'Gamma']);

      const filterInput = host.container.querySelector('input[role="combobox"]') as HTMLInputElement;
      expect(filterInput.getAttribute('placeholder')).toBe('搜索...');
      expect(filterInput.getAttribute('aria-expanded')).toBe('true');
      expect(filterInput.getAttribute('aria-controls')).toBe(`${host.popover.id}-list`);
    });

    it('selected 项带 aria-selected 与高亮 class，并渲染勾选图标', () => {
      const withSelection = renderSelect({ selected: 'beta' });
      const selectedBtn = optionEl(withSelection, 'beta');

      expect(selectedBtn.getAttribute('aria-selected')).toBe('true');
      expect(selectedBtn.classList.contains('bg-primary/15')).toBe(true);
      expect(selectedBtn.classList.contains('font-semibold')).toBe(true);
      expect(selectedBtn.querySelector('svg')).toBeTruthy();

      const unselected = optionEl(withSelection, 'alpha');
      expect(unselected.getAttribute('aria-selected')).toBe('false');
      expect(unselected.querySelector('svg')).toBeNull();
    });
  });

  describe('搜索过滤', () => {
    it('过滤词大小写不敏感、前后空白裁剪', () => {
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, {
        target: { value: '  bEtA ' }
      });

      const labels = [...host.container.querySelectorAll('li[role="none"] button')].map(b => b.textContent?.trim());
      expect(labels).toEqual(['Beta']);
    });

    it('空过滤词返回全部选项', () => {
      expect(host.container.querySelectorAll('li[role="none"] button[role="option"]')).toHaveLength(3);

      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, { target: { value: '   ' } });
      expect(host.container.querySelectorAll('li[role="none"] button[role="option"]')).toHaveLength(3);
    });

    it('过滤无命中时渲染「无匹配项」空态', () => {
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, {
        target: { value: 'zzz-no-match' }
      });

      expect(host.container.textContent).toContain('无匹配项');
      expect(host.container.querySelectorAll('button[role="option"]')).toHaveLength(0);
    });

    it('过滤词变化后高亮自动回到第一项', () => {
      // 打开弹层（高亮第一项）→ 键盘下移 → 过滤 → 高亮回到第一项
      fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, { target: { value: 'be' } });

      const active = host.container.querySelector('.menu-focus') as HTMLElement;
      expect(active?.textContent?.trim()).toBe('Beta');
    });
  });

  describe('点击选择', () => {
    it('点击选项 emit onSelectChange、关闭弹层并聚焦触发按钮', () => {
      const trigger = host.container.querySelector('button') as HTMLButtonElement;
      fireEvent.click(optionEl(host, 'gamma'));

      expect(host.selectedValues).toEqual(['gamma']);
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('键盘导航', () => {
    it('ArrowDown / ArrowUp 循环移动高亮', () => {
      fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
      expect(host.container.querySelector('.menu-focus')?.textContent?.trim()).toBe('Beta');

      fireEvent.keyDown(host.popover, { key: 'ArrowUp' });
      expect(host.container.querySelector('.menu-focus')?.textContent?.trim()).toBe('Alpha');

      // 顶部再上 → 环绕到最后一项
      fireEvent.keyDown(host.popover, { key: 'ArrowUp' });
      expect(host.container.querySelector('.menu-focus')?.textContent?.trim()).toBe('Gamma');
    });

    it('Enter 选择当前高亮项', () => {
      fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
      fireEvent.keyDown(host.popover, { key: 'Enter' });

      expect(host.selectedValues).toEqual(['beta']);
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);
    });

    it('Escape 关闭弹层并聚焦触发按钮；Tab 只关闭', () => {
      const trigger = host.container.querySelector('button') as HTMLButtonElement;

      fireEvent.keyDown(host.popover, { key: 'Escape' });
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(trigger);

      fireEvent.keyDown(host.popover, { key: 'Tab' });
      expect(host.popover.hidePopover).toHaveBeenCalledTimes(2);
    });

    it('无匹配选项时方向键与 Enter 安全 no-op', () => {
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, {
        target: { value: 'zzz-no-match' }
      });

      fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
      fireEvent.keyDown(host.popover, { key: 'ArrowUp' });
      fireEvent.keyDown(host.popover, { key: 'Enter' });

      expect(host.selectedValues).toEqual([]);
      expect(host.popover.hidePopover).not.toHaveBeenCalled();
    });

    it('未识别的按键不拦截', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
      fireEvent(host.popover, event);

      expect(event.defaultPrevented).toBe(false);
      expect(host.selectedValues).toEqual([]);
    });
  });

  describe('Popover API 生命周期', () => {
    it('beforetoggle open 清空过滤词并应用弹层定位', () => {
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, { target: { value: 'be' } });
      act(() => {
        host.popover.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
      });

      expect((host.container.querySelector('input[role="combobox"]') as HTMLInputElement).value).toBe('');
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
        act(() => {
          host.popover.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
        });
      } finally {
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
      }

      expect(host.popover.style.top).toBe('unset');
      expect(host.popover.style.bottom).toBe('52px');
    });

    it('beforetoggle closed 不清空过滤词', () => {
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, { target: { value: 'be' } });
      act(() => {
        host.popover.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));
      });

      expect((host.container.querySelector('input[role="combobox"]') as HTMLInputElement).value).toBe('be');
    });

    it('toggle open 聚焦搜索框并重置高亮索引', () => {
      fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
      act(() => {
        host.popover.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
      });

      const filterInput = host.container.querySelector('input[role="combobox"]') as HTMLInputElement;
      expect(document.activeElement).toBe(filterInput);
      expect(host.container.querySelector('.menu-focus')?.textContent?.trim()).toBe('Alpha');
    });

    it('toggle closed 不做事', () => {
      fireEvent.change(host.container.querySelector('input[role="combobox"]')!, { target: { value: 'be' } });
      fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
      act(() => {
        host.popover.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
      });

      expect((host.container.querySelector('input[role="combobox"]') as HTMLInputElement).value).toBe('be');
      expect(host.container.querySelector('.menu-focus')?.textContent?.trim()).toBe('Beta');
    });
  });
});
