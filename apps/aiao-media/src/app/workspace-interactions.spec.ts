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
  it('keeps local browsing available and exposes a working stop action while syncing', () => {
    const r = workspace();
    const pause = vi.fn(() => r.component.sync.update(state => ({ ...state, busy: false, status: 'paused' })));
    Object.assign(r.component, { product: { pause, close: vi.fn() } });
    r.component.sync.update(state => ({ ...state, busy: true, status: 'syncing', message: '正在同步作品…' }));
    r.fixture.detectChanges();
    const banner = r.element.querySelector<HTMLElement>('[aria-label="同步状态"]');
    const stop = banner?.querySelector<HTMLButtonElement>('button');
    expect(r.element.querySelector('main')?.inert).toBeFalsy();
    expect(banner?.textContent).toContain('正在同步作品');
    expect(stop?.disabled).toBe(false);
    stop!.click();
    r.fixture.detectChanges();
    expect(pause).toHaveBeenCalledOnce();
    expect(r.component.syncPaused()).toBe(true);
    expect(r.component.sync().busy).toBe(false);
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
