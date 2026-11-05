import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalImageMvp } from './local-image-mvp';
import type { LocalProvider } from './local-provider';

const provider: LocalProvider = {
  id: '10000000-0000-4000-8000-000000000001',
  name: '测试供应商',
  baseUrl: 'https://provider.example',
  model: 'fixture-model',
  mode: 'direct',
  rememberKey: false
};

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
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('provider form interaction boundaries', () => {
  it('locks the submitted fields and cancel action until persistence completes', async () => {
    let resolve!: (value: number[]) => void;
    const pending = new Promise<number[]>(yes => {
      resolve = yes;
    });
    const savePreferences = vi.fn(() => pending);
    const fixture = TestBed.createComponent(LocalImageMvp);
    const component = fixture.componentInstance;
    Object.assign(component, {
      store: {
        preference: vi.fn(async () => null),
        savePreferences,
        close: vi.fn(async () => undefined)
      }
    });
    component.view.set('providers');
    component.localStatus.set('ready');
    component.providers.set([provider]);
    component.providerId.set(provider.id);
    component.editProvider(provider);
    fixture.detectChanges();
    await fixture.whenStable();
    const form = (fixture.nativeElement as HTMLElement).querySelector<HTMLFormElement>('.provider-form')!;
    const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'));
    const cancel = Array.from(form.querySelectorAll('button')).find(
      button => button.textContent?.trim() === '取消编辑'
    )!;
    expect(fields.every(field => !field.disabled)).toBe(true);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(savePreferences).toHaveBeenCalledOnce());
    fixture.detectChanges();
    await fixture.whenStable();
    try {
      expect(fields.every(field => field.disabled)).toBe(true);
      expect(cancel.disabled).toBe(true);
      cancel.click();
      expect(component.editingId()).toBe(provider.id);
    } finally {
      resolve([2, 1]);
      await vi.waitFor(() => expect(component.providerBusy()).toBe(false));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fields.every(field => !field.disabled)).toBe(true);
    expect(component.providerName()).toBe('');
    expect(component.providers()[0].name).toBe(provider.name);
  });
});
