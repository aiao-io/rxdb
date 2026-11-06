import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalImageMvp } from './local-image-mvp';
import { PromptInput } from './prompts/prompt-input';
import { plainPrompt } from './prompts/prompt-state';

const originalInert = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'inert', { value: false, writable: true, configurable: true })
);
afterAll(() => {
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert');
});

beforeEach(() => {
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

function workspace() {
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  component.view.set('library');
  component.localStatus.set('ready');
  fixture.detectChanges();
  return { fixture, component, element: fixture.nativeElement as HTMLElement };
}

describe('workspace interaction boundaries', () => {
  it('同步进度收在右上角，默认折叠且本机浏览可用，展开后可以停止同步', () => {
    const r = workspace();
    const pause = vi.fn(() => r.component.sync.update(state => ({ ...state, busy: false, status: 'paused' })));
    Object.assign(r.component, { product: { pause, close: vi.fn() } });
    r.component.sync.update(state => ({ ...state, busy: true, status: 'syncing', message: '正在同步作品…' }));
    r.fixture.detectChanges();
    const indicator = r.element.querySelector<HTMLDetailsElement>('.header-right [aria-label="同步状态"]');
    const stop = indicator?.querySelector<HTMLButtonElement>('button');
    expect(r.element.querySelector('main')?.inert).toBeFalsy();
    expect(r.element.querySelector('main')?.hidden).toBe(false);
    expect(r.element.querySelector('.image-mvp > .sync-progress')).toBeNull();
    expect(indicator).not.toBeNull();
    expect(indicator?.open).toBe(false);
    expect(indicator?.querySelector('summary')?.textContent).toContain('同步中');
    expect(indicator?.querySelector('.sync-icon')?.classList.contains('sync-spinning')).toBe(true);
    indicator!.querySelector('summary')!.click();
    expect(indicator?.open).toBe(true);
    expect(indicator?.textContent).toContain('正在同步作品');
    expect(stop?.disabled).toBe(false);
    stop!.click();
    r.fixture.detectChanges();
    expect(pause).toHaveBeenCalledOnce();
    expect(r.component.syncPaused()).toBe(true);
    expect(r.component.sync().busy).toBe(false);
    expect(indicator?.querySelector('.sync-spinning')).toBeNull();
    expect(indicator?.open).toBe(false);
  });

  it('原图传输也显示同步图标，进度和反馈只在详情中展示', () => {
    const r = workspace();
    r.component.imageSyncBusy.set(true);
    r.component.imageSyncProgress.set('1/3');
    r.component.imageSyncMessage.set('正在上传本机原图');
    r.fixture.detectChanges();
    const indicator = r.element.querySelector<HTMLDetailsElement>('[aria-label="同步状态"]');
    expect(indicator?.open).toBe(false);
    expect(indicator?.querySelector('summary')?.textContent).toContain('同步中');
    expect(indicator?.querySelector('summary')?.textContent).not.toContain('1/3');
    expect(indicator?.textContent).toContain('1/3');
    expect(indicator?.textContent).toContain('正在上传本机原图');
    expect(indicator?.querySelector('.sync-spinning')).not.toBeNull();
    expect(r.element.querySelector('main')?.inert).toBeFalsy();
  });

  it.each([
    ['local', '仅在本机'],
    ['pending', '有待同步改动'],
    ['synced', '同步已确认'],
    ['paused', '同步已暂停'],
    ['failed', '同步未完成'],
    ['conflict', '存在待处理冲突']
  ] as const)('同步状态 %s 静止显示且保留详细反馈', (status, label) => {
    const r = workspace();
    r.component.sync.update(state => ({ ...state, status, message: '详细同步反馈' }));
    r.fixture.detectChanges();
    const indicator = r.element.querySelector<HTMLDetailsElement>('[aria-label="同步状态"]');
    expect(indicator?.querySelector('summary')?.textContent).toContain(label);
    expect(indicator?.querySelector('.sync-spinning')).toBeNull();
    expect(indicator?.textContent).toContain('详细同步反馈');
    expect(indicator?.querySelector('button')).toBeNull();
  });

  it('hands keyboard focus to the prompt after applying an inspiration', () => {
    const r = workspace();
    r.component.promptState.set(plainPrompt(''));
    const focus = vi.spyOn(PromptInput.prototype, 'focus').mockImplementation(() => undefined);
    r.component.applyTemplate(r.component.templates()[0]);
    r.fixture.detectChanges();
    expect(r.component.view()).toBe('studio');
    expect(focus).toHaveBeenCalledOnce();
  });

  it.each(['ctrlKey', 'metaKey'] as const)('preserves %s link clicks for opening another browser tab', modifier => {
    const r = workspace();
    const link = r.element.querySelector<HTMLAnchorElement>('a[href="/create"]')!;
    let prevented: boolean | undefined;
    link.addEventListener('click', event => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    });
    link.dispatchEvent(new MouseEvent('click', { [modifier]: true, cancelable: true }));
    expect(prevented).toBe(false);
    expect(r.component.view()).toBe('library');
  });
});
