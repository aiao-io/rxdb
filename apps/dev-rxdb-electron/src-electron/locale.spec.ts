import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLocaleId } from '../src/app/locale';

describe('Electron renderer locale setup', () => {
  it('maps Chinese locales to the registered zh locale', () => {
    expect(resolveLocaleId('zh-CN')).toBe('zh');
    expect(resolveLocaleId('en-US')).toBe('en-US');
  });

  it('registers Chinese locale data synchronously before app configuration', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/app/app.config.ts'), 'utf8');
    const registration = source.indexOf("registerLocaleData(localeZh, 'zh')");
    const configuration = source.indexOf('export const appConfig');

    expect(source).not.toContain('import(`@angular/common/locales/zh-Hans`)');
    expect(registration).toBeGreaterThan(-1);
    expect(registration).toBeLessThan(configuration);
  });
});
