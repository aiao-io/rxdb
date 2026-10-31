import type { DevToolsI18nSnapshot } from '@aiao/rxdb-devtools';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nStateService } from '../services/i18n-state.service';
import { createFakePanelHost } from '../testing';
import { I18nPage } from './i18n.page';

const snapshot: DevToolsI18nSnapshot = {
  locale: 'fr-CA',
  availableLocales: ['fr', 'zh-Hans'],
  messages: [
    { locale: 'fr', namespace: 'app', key: 'hello', value: 'Bonjour', source: 'remote', active: true },
    { locale: 'fr', namespace: 'app', key: 'hello', value: 'old bundled', source: 'bundle', active: false }
  ],
  missingMessages: [
    { id: 'missing', locale: 'fr-CA', namespace: 'app', key: 'missing-key', updatedAt: '2026-10-28T00:00:00Z' }
  ],
  canClearMissing: true
};
async function render(value: DevToolsI18nSnapshot | null) {
  const host = createFakePanelHost();
  const state = {
    snapshot: signal(value),
    loading: signal(false),
    clearing: signal(false),
    error: signal<string | null>(null),
    refresh: vi.fn(),
    clearMissing: vi.fn()
  };
  TestBed.configureTestingModule({ imports: [I18nPage], providers: host.providers });
  TestBed.overrideComponent(I18nPage, { set: { providers: [{ provide: I18nStateService, useValue: state }] } });
  const fixture = TestBed.createComponent(I18nPage);
  host.transport.emit('HANDSHAKE');
  await fixture.whenStable();
  fixture.detectChanges();
  return { state, element: fixture.nativeElement as HTMLElement };
}
afterEach(() => TestBed.resetTestingModule());
describe('国际化检视页面', () => {
  it('逐行显示语言、目录来源、生效状态与缺失key，并提供独立诊断清空', async () => {
    const { element, state } = await render(snapshot);
    expect(element.querySelector('[data-testid="i18n-current-locale"]')?.textContent).toBe('fr-CA');
    expect(element.textContent).toContain('remote');
    expect(element.textContent).toContain('bundle');
    expect(element.textContent).toContain('已覆盖');
    expect(element.textContent).toContain('missing-key');
    element.querySelector<HTMLButtonElement>('[data-testid="clear-i18n-missing"]')?.click();
    expect(state.clearMissing).toHaveBeenCalledTimes(1);
  });
  it('旧connector或未授权时隐藏清空入口', async () => {
    const { element } = await render({ ...snapshot, canClearMissing: false });
    expect(element.querySelector('[data-testid="clear-i18n-missing"]')).toBeNull();
    TestBed.resetTestingModule();
    const old = await render(null);
    expect(old.element.textContent).toContain('未提供国际化检视');
    expect(old.element.querySelector('[data-testid="clear-i18n-missing"]')).toBeNull();
  });
});
