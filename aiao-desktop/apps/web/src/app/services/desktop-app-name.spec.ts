import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';

import { appDisplayName } from './desktop-app-name';

const runtime = new I18n({
  defaultLocale: 'en',
  namespace: 'desktop',
  catalogs: [
    { locale: 'zh', namespace: 'desktop', messages: { 'apps.finder.name': '访达' } },
    { locale: 'en', namespace: 'desktop', messages: { 'apps.finder.name': 'Finder' } }
  ]
});

describe('appDisplayName', () => {
  it('有 nameKey 时返回当前语言的显示名', async () => {
    expect(appDisplayName(runtime, { name: 'Finder', nameKey: 'apps.finder.name' })).toBe('Finder');
    await runtime.setLocale('zh');
    expect(appDisplayName(runtime, { name: 'Finder', nameKey: 'apps.finder.name' })).toBe('访达');
  });

  it('无 nameKey 的品牌名回退清单 name', () => {
    expect(appDisplayName(runtime, { name: '几猫3A大作' })).toBe('几猫3A大作');
  });
});
