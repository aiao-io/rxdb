import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverRatio } from './inspiration-feed';
import { LocalImageMvp } from './local-image-mvp';
import type { PromptTemplate } from './prompts/prompt-catalog';
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
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'inert', { value: false, writable: true, configurable: true });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    }
  });
});
afterAll(() => {
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert');
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
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

/** 打开首页并让瀑布流量到一个内容宽度（默认是 1440 宽窗口里的主区）。 */
function home(width = 1168) {
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  component.localStatus.set('ready');
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = () => fixture.detectChanges();
  const resize = (next: number) => {
    for (const observer of Observer.instances) observer.emit(next);
    settle();
  };
  resize(width);
  const cards = () => [...element.querySelectorAll<HTMLElement>('.feed-card')];
  const columns = () => [...element.querySelectorAll<HTMLElement>('.feed-column')];
  const label = (template: PromptTemplate) => `查看${template.title}`;
  const cardOf = (template: PromptTemplate) =>
    cards().find(card => card.querySelector('button')?.getAttribute('aria-label') === label(template))!;
  return { fixture, component, element, settle, resize, cards, columns, cardOf, label };
}

describe('发现灵感首页', () => {
  it('首页只有图片：每个灵感一张封面卡，没有英雄区、创作助手和生成表单', () => {
    const r = home();
    expect(r.component.view()).toBe('discover');
    expect(r.cards()).toHaveLength(r.component.templates().length);
    for (const template of r.component.templates())
      expect(r.cardOf(template).querySelector('img')?.getAttribute('src')).toBe(template.image);
    for (const gone of [
      '.discovery-intro',
      '.inspiration-showcase',
      '.creative-assistant',
      '.studio-grid',
      '.composer',
      '.privacy-line',
      'app-prompt-input'
    ])
      expect(r.element.querySelector(gone), gone).toBeNull();
    expect(r.element.querySelector('main h1')?.textContent?.trim()).toBe('发现灵感');
  });

  it('按主区宽度分列，前五个灵感各占一列排在第一排', () => {
    const r = home(1168);
    const first = r.component.templates().slice(0, 5);
    expect(r.columns()).toHaveLength(5);
    expect(r.columns().map(column => column.querySelector('.feed-card button')?.getAttribute('aria-label'))).toEqual(
      first.map(r.label)
    );
  });

  it('窗口变窄时重新分列；元素被隐藏（宽度为 0）时保持原布局', () => {
    const r = home(1168);
    r.resize(429);
    expect(r.columns()).toHaveLength(2);
    expect(r.cards()).toHaveLength(r.component.templates().length);
    r.resize(0);
    expect(r.columns()).toHaveLength(2);
    expect(r.cards()).toHaveLength(r.component.templates().length);
  });

  it('封面按图片真实宽高比预留空间，加载前后卡片高度不变', () => {
    const r = home();
    for (const template of r.component.templates()) {
      const cover = r.cardOf(template).querySelector<HTMLElement>('.feed-cover')!;
      expect(Number(cover.style.getPropertyValue('--cover-ratio'))).toBeCloseTo(coverRatio(template.image), 6);
    }
  });

  it('卡片只露出标题、作者和参考示例标注，可用键盘按钮打开', () => {
    const r = home();
    const [coffee] = r.component.templates();
    const card = r.cardOf(coffee);
    expect(card.querySelector('.feed-title')?.textContent?.trim()).toBe(coffee.title);
    expect(card.querySelector('.feed-author')?.textContent?.trim()).toBe(coffee.author);
    expect(card.querySelector('.feed-rights')?.textContent?.trim()).toBe('参考示例');
    const original = r.component.templates().find(template => template.rights === 'aiao-original-text-and-svg')!;
    expect(r.cardOf(original).querySelector('.feed-rights')?.textContent?.trim()).toBe('原创示意');
    expect(r.cardOf(original).querySelector('.feed-author')?.textContent?.trim()).toBe('Aiao');
  });

  it('点开卡片显示完整媒体、提示词和套用入口，Esc 关闭', () => {
    const r = home();
    const [coffee] = r.component.templates();
    r.cardOf(coffee).querySelector<HTMLButtonElement>('button.feed-link')!.click();
    r.settle();
    const dialog = r.element.querySelector<HTMLDialogElement>('dialog.template-panel')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.media-stage img')?.getAttribute('src')).toBe(coffee.image);
    expect(dialog.querySelector('h2')?.textContent?.trim()).toBe(coffee.title);
    expect(dialog.querySelector('blockquote')?.textContent).toContain('手冲咖啡');
    expect([...dialog.querySelectorAll('button')].some(button => button.textContent?.trim() === '用这个灵感创作')).toBe(
      true
    );
    r.component.onEscape();
    r.settle();
    expect(r.element.querySelector('dialog')).toBeNull();
  });

  it('分类和搜索只改变卡片，并向读屏用户播报结果数', () => {
    const r = home();
    const total = r.component.templates().length;
    expect(r.element.querySelector('[role="status"].feed-count')?.textContent?.trim()).toBe(`共 ${total} 个灵感`);
    r.component.category.set('人像头像');
    r.settle();
    const portraits = r.component.templates().filter(template => template.purpose === '人像头像').length;
    expect(r.cards()).toHaveLength(portraits);
    expect(r.columns()).toHaveLength(5);
    expect(r.element.querySelector('.feed-count')?.textContent?.trim()).toBe(`共 ${portraits} 个灵感`);
    r.component.search.set('咖啡');
    r.settle();
    expect(r.cards()).toHaveLength(0);
  });

  it('没有结果时给出说明，重置后回到全部卡片', () => {
    const r = home();
    r.component.search.set('不存在的关键词');
    r.settle();
    expect(r.element.querySelector('.feed')).toBeNull();
    expect(r.element.querySelector('.no-results')?.textContent).toContain('没有找到相关灵感');
    r.element.querySelector<HTMLButtonElement>('.no-results button')!.click();
    r.settle();
    r.resize(1168);
    expect(r.cards()).toHaveLength(r.component.templates().length);
  });

  it('封面加载失败时卡片仍可打开，并说明示例图暂时无法加载', () => {
    const r = home();
    const [coffee] = r.component.templates();
    r.cardOf(coffee).querySelector('img')!.dispatchEvent(new Event('error'));
    r.settle();
    const card = r.cardOf(coffee);
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('button.feed-link')?.textContent).toContain('示例图暂时无法加载');
    expect(card.querySelector<HTMLElement>('.feed-cover')?.style.getPropertyValue('--cover-ratio')).not.toBe('');
  });

  it('创作页保留生成表单和结果面板，不再出现灵感瀑布流', () => {
    const r = home();
    r.component.view.set('studio');
    r.settle();
    expect(r.element.querySelector('.feed')).toBeNull();
    expect(r.element.querySelector('.studio-grid .composer')).not.toBeNull();
    expect(r.element.querySelector('.studio-grid .result-panel')).not.toBeNull();
    expect(r.element.querySelector('.home-studio')).toBeNull();
    expect(r.element.querySelector('.composer .panel-title')?.textContent).toContain('创作设置');
  });
});
