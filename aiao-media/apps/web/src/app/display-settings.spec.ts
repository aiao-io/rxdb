import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cardSizeOptions,
  defaultDisplayPreferences,
  displayStorageKey,
  pageWidthOptions,
  type DisplayPreferences
} from './display-preferences';
import { LocalImageMvp } from './local-image-mvp';
import { PromptInput } from './prompts/prompt-input';

class Observer implements ResizeObserver {
  static instances: Observer[] = [];
  readonly observe = vi.fn<(target: Element) => void>();
  readonly unobserve = vi.fn<(target: Element) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(private readonly callback: ResizeObserverCallback) {
    Observer.instances.push(this);
  }

  emit(width: number): void {
    this.callback([{ contentRect: { width } } as ResizeObserverEntry], this);
  }
}

const originalInert = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'inert', { value: false, writable: true, configurable: true });
});
afterAll(() => {
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert');
});
beforeEach(() => {
  Observer.instances = [];
  vi.stubGlobal('ResizeObserver', Observer);
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  vi.spyOn(PromptInput.prototype, 'ngAfterViewInit').mockImplementation(() => undefined);
  vi.stubGlobal('scrollTo', vi.fn());
  history.replaceState(null, '', '/');
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function save(preferences: Partial<DisplayPreferences>) {
  localStorage.setItem(displayStorageKey, JSON.stringify({ ...defaultDisplayPreferences, ...preferences }));
}

/** 打开应用；`view` 默认是设置页，需要显示分区时再把标签切过去。 */
function open(view: 'discover' | 'library' | 'studio' | 'providers' = 'providers') {
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  component.localStatus.set('ready');
  component.view.set(view);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const settle = () => fixture.detectChanges();
  const showDisplayTab = () => {
    component.settingsTab.set('display');
    settle();
  };
  const group = (name: string) => [...host.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)];
  const choice = (name: string, text: string) =>
    group(name).find(input => input.closest('label')?.querySelector('.choice-name')?.textContent?.trim() === text)!;
  const checked = (name: string) => group(name).find(input => input.checked)?.value;
  const choose = (name: string, text: string) => {
    choice(name, text).click();
    settle();
  };
  const resetButton = () =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '恢复默认')!;
  const stored = () => JSON.parse(localStorage.getItem(displayStorageKey) ?? 'null') as DisplayPreferences | null;
  const columns = () => host.querySelectorAll('.feed-column');
  const resize = (width: number) => {
    for (const observer of Observer.instances) observer.emit(width);
    settle();
  };
  return {
    fixture,
    component,
    host,
    settle,
    showDisplayTab,
    group,
    choice,
    checked,
    choose,
    resetButton,
    stored,
    columns,
    resize
  };
}

describe('显示偏好应用到页面', () => {
  it('默认：宿主元素带上宽度档位、对齐方式和样式变量', () => {
    const { host } = open();
    expect(host.classList.contains('image-mvp')).toBe(true);
    expect(host.dataset['pageWidth']).toBe('ultra');
    expect(host.dataset['align']).toBe('center');
    expect(host.style.getPropertyValue('--page-max')).toBe('3200px');
    expect(host.style.getPropertyValue('--library-card-min')).toBe('300px');
    expect(host.style.getPropertyValue('--library-columns')).toBe('8');
  });

  it('已保存的偏好在首屏就生效，不会先闪一下默认排版', () => {
    save({ pageWidth: 'compact', cardSize: 'large', align: 'start' });
    const { host } = open();
    expect(host.dataset['pageWidth']).toBe('compact');
    expect(host.dataset['align']).toBe('start');
    expect(host.style.getPropertyValue('--page-max')).toBe('1200px');
    expect(host.style.getPropertyValue('--library-card-min')).toBe('380px');
    expect(host.style.getPropertyValue('--library-columns')).toBe('6');
  });

  it('铺满窗口不设置最大宽度变量，由样式按档位放开上限', () => {
    save({ pageWidth: 'full' });
    const { host } = open();
    expect(host.dataset['pageWidth']).toBe('full');
    expect(host.style.getPropertyValue('--page-max')).toBe('');
  });

  it('主区带当前页面标识，样式据此给设置页和后台限宽', () => {
    const settings = open('providers');
    expect(settings.host.querySelector('main')?.dataset['view']).toBe('providers');
    settings.component.view.set('library');
    settings.settle();
    expect(settings.host.querySelector('main')?.dataset['view']).toBe('library');
  });

  it('存储里的内容损坏时按默认排版打开', () => {
    localStorage.setItem(displayStorageKey, '{oops');
    const { host } = open();
    expect(host.dataset['pageWidth']).toBe('ultra');
  });
});

describe('设置页的「显示」分区', () => {
  it('在平台生图、同步、本机数据之后新增「显示」标签，方向键可以循环到它', () => {
    const { component, host, settle } = open();
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs().map(tab => tab.textContent?.trim())).toEqual(['平台生图', '同步', '本机数据', '显示']);
    component.selectSettingsTab('data');
    settle();
    const press = (key: string) => {
      tabs()
        .find(tab => tab.getAttribute('aria-selected') === 'true')!
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      settle();
    };
    press('ArrowRight');
    expect(component.settingsTab()).toBe('display');
    press('ArrowRight');
    expect(component.settingsTab()).toBe('providers');
    press('End');
    expect(component.settingsTab()).toBe('display');
  });

  it('#display 链接直达显示分区', () => {
    const { component } = open();
    history.replaceState(null, '', '/providers#display');
    component.onPopState();
    expect(component.settingsTab()).toBe('display');
  });

  it('显示分区的面板只在选中时可见，并且标签与面板互相关联', () => {
    const { host, showDisplayTab } = open();
    const panel = host.querySelector<HTMLElement>('#settings-panel-display')!;
    expect(panel.hidden).toBe(true);
    showDisplayTab();
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('settings-tab-display');
    expect(host.querySelector('#settings-tab-display')?.getAttribute('aria-controls')).toBe('settings-panel-display');
  });

  it('三组选项都是单选，每个选项都能在界面上找到，当前偏好被选中', () => {
    save({ pageWidth: 'wide', cardSize: 'xlarge', align: 'start' });
    const { group, checked, showDisplayTab, host } = open();
    showDisplayTab();
    expect(group('pageWidth').map(input => input.value)).toEqual(pageWidthOptions.map(option => option.id));
    expect(group('cardSize').map(input => input.value)).toEqual(cardSizeOptions.map(option => option.id));
    expect(group('align')).toHaveLength(2);
    expect(checked('pageWidth')).toBe('wide');
    expect(checked('cardSize')).toBe('xlarge');
    expect(checked('align')).toBe('start');
    for (const legend of ['页面宽度', '卡片大小', '内容对齐'])
      expect(
        [...host.querySelectorAll('#settings-panel-display legend')].some(item => item.textContent?.trim() === legend)
      ).toBe(true);
  });

  it('页面宽度的选项标出上限像素，「铺满窗口」标「不限制」', () => {
    const { choice, showDisplayTab } = open();
    showDisplayTab();
    expect(choice('pageWidth', '紧凑').closest('label')?.textContent).toContain('1200 px');
    expect(choice('pageWidth', '超宽').closest('label')?.textContent).toContain('3200 px');
    expect(choice('pageWidth', '铺满窗口').closest('label')?.textContent).toContain('不限制');
  });

  it('卡片大小的选项标出一行最多的列数，默认档另标「默认」', () => {
    const { choice, showDisplayTab } = open();
    showDisplayTab();
    const text = (name: string) => choice('cardSize', name).closest('label')?.textContent ?? '';
    expect(text('小')).toContain('最多 12 列');
    expect(text('中')).toContain('最多 8 列');
    expect(text('中')).toContain('默认');
    expect(text('大')).toContain('最多 6 列');
    expect(text('特大')).toContain('最多 4 列');
    expect(text('小')).not.toContain('默认');
  });

  it('选择后立即生效并写入本机存储，不需要再点保存', () => {
    const { host, showDisplayTab, choose, checked, stored } = open();
    showDisplayTab();
    choose('pageWidth', '紧凑');
    expect(host.dataset['pageWidth']).toBe('compact');
    expect(host.style.getPropertyValue('--page-max')).toBe('1200px');
    choose('cardSize', '特大');
    expect(host.style.getPropertyValue('--library-card-min')).toBe('480px');
    choose('align', '靠左');
    expect(host.dataset['align']).toBe('start');
    expect(stored()).toEqual({ pageWidth: 'compact', cardSize: 'xlarge', align: 'start' });
    expect([checked('pageWidth'), checked('cardSize'), checked('align')]).toEqual(['compact', 'xlarge', 'start']);
  });

  it('改一项不影响另外两项', () => {
    save({ pageWidth: 'wide', cardSize: 'small', align: 'start' });
    const { showDisplayTab, choose, stored } = open();
    showDisplayTab();
    choose('cardSize', '大');
    expect(stored()).toEqual({ pageWidth: 'wide', cardSize: 'large', align: 'start' });
  });

  it('恢复默认：删除保存项，选项回到出厂值；已是默认时按钮不可用', () => {
    const { host, showDisplayTab, choose, resetButton, checked, stored, settle } = open();
    showDisplayTab();
    expect(resetButton().disabled).toBe(true);
    choose('pageWidth', '标准');
    choose('align', '靠左');
    expect(resetButton().disabled).toBe(false);
    resetButton().click();
    settle();
    expect(localStorage.getItem(displayStorageKey)).toBeNull();
    expect(stored()).toBeNull();
    expect([checked('pageWidth'), checked('cardSize'), checked('align')]).toEqual(['ultra', 'medium', 'center']);
    expect(host.dataset['pageWidth']).toBe('ultra');
    expect(resetButton().disabled).toBe(true);
  });

  // jsdom 里 Angular 的 window 级宿主监听收不到 dispatchEvent，与 onEscape、onPopState 的用例一样直接调用处理方法；
  // 真实的 storage 事件接线由 e2e 的两个标签页用例验证。
  it('另一个标签页改了偏好，本页跟着更新；无关的存储键不引起变化', () => {
    const { component, host, showDisplayTab, checked, settle } = open();
    showDisplayTab();
    save({ pageWidth: 'standard', cardSize: 'large' });
    component.onStorage(new StorageEvent('storage', { key: 'aiao-unrelated', storageArea: localStorage }));
    settle();
    expect(host.dataset['pageWidth']).toBe('ultra');
    component.onStorage(new StorageEvent('storage', { key: displayStorageKey, storageArea: localStorage }));
    settle();
    expect(host.dataset['pageWidth']).toBe('standard');
    expect(checked('pageWidth')).toBe('standard');
    expect(checked('cardSize')).toBe('large');
  });

  it('另一个标签页清空了站点数据，本页回到默认排版', () => {
    save({ pageWidth: 'compact' });
    const { component, host, settle } = open();
    expect(host.dataset['pageWidth']).toBe('compact');
    localStorage.clear();
    component.onStorage(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    settle();
    expect(host.dataset['pageWidth']).toBe('ultra');
  });

  it('sessionStorage 等其他存储区的事件不会改动排版', () => {
    const { component, host, settle } = open();
    save({ pageWidth: 'compact' });
    component.onStorage(new StorageEvent('storage', { key: displayStorageKey, storageArea: sessionStorage }));
    settle();
    expect(host.dataset['pageWidth']).toBe('ultra');
  });

  it('保存失败时选择仍然生效，并提示只在本次打开期间有效', () => {
    const { host, showDisplayTab, choose, settle } = open();
    showDisplayTab();
    const panel = host.querySelector<HTMLElement>('#settings-panel-display')!;
    expect(panel.textContent).not.toContain('仅在本次打开期间生效');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    choose('pageWidth', '紧凑');
    settle();
    expect(host.dataset['pageWidth']).toBe('compact');
    expect(panel.textContent).toContain('仅在本次打开期间生效');
  });

  it('生成或同步进行中也能调整显示，它只影响排版', () => {
    const { component, showDisplayTab, choice, choose, host } = open();
    showDisplayTab();
    component.sending.set(true);
    expect(component.settingsBusy()).toBe(true);
    expect(choice('pageWidth', '紧凑').disabled).toBe(false);
    choose('pageWidth', '紧凑');
    expect(host.dataset['pageWidth']).toBe('compact');
  });
});

describe('卡片大小对发现灵感和我的图片的影响', () => {
  it('单列最小宽度随卡片大小变化，瀑布流按主区宽度重新分列', () => {
    const { component, resize, columns, settle } = open('discover');
    resize(1168);
    expect(columns()).toHaveLength(5);
    component.setDisplay({ cardSize: 'small' });
    settle();
    expect(columns()).toHaveLength(7);
    component.setDisplay({ cardSize: 'large' });
    settle();
    expect(columns()).toHaveLength(4);
    component.setDisplay({ cardSize: 'xlarge' });
    settle();
    expect(columns()).toHaveLength(3);
  });

  it('超宽主区里每一档都按各自的列数上限封顶，档位之间仍有明显差别', () => {
    const { component, resize, columns, settle } = open('discover');
    resize(3168);
    // 默认「中」：放得下 15 列，但最多 8 列，卡片放大填满整行。
    expect(columns()).toHaveLength(8);
    for (const [cardSize, count] of [
      ['small', 12],
      ['large', 6],
      ['xlarge', 4]
    ] as const) {
      component.setDisplay({ cardSize });
      settle();
      expect(columns()).toHaveLength(count);
    }
  });

  it('窗口再宽，列数也不超过上限，不会在右侧留出空列', () => {
    const { component, resize, columns } = open('discover');
    resize(4848);
    expect(columns()).toHaveLength(8);
    expect(component.display().cardSize).toBe('medium');
  });

  it('宿主元素带上作品网格的最小卡片宽度和列数上限，样式据此排版', () => {
    const { component, host, settle } = open('library');
    expect(host.style.getPropertyValue('--library-columns')).toBe('8');
    component.setDisplay({ cardSize: 'small' });
    settle();
    expect(host.style.getPropertyValue('--library-card-min')).toBe('240px');
    expect(host.style.getPropertyValue('--library-columns')).toBe('12');
    component.setDisplay({ cardSize: 'xlarge' });
    settle();
    expect(host.style.getPropertyValue('--library-card-min')).toBe('480px');
    expect(host.style.getPropertyValue('--library-columns')).toBe('4');
  });

  it('已保存的卡片大小在首次分列时就生效', () => {
    save({ cardSize: 'xlarge' });
    const { resize, columns } = open('discover');
    resize(1168);
    expect(columns()).toHaveLength(3);
  });
});
