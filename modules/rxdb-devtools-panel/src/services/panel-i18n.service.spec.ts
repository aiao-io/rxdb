import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { panelEnMessages, panelZhMessages } from '../i18n/messages';
import { PanelI18nService } from './panel-i18n.service';

/** 在实例化服务前改写宿主语言；happy-dom 默认 `en-US`。 */
function stubNavigatorLanguage(language: string | undefined): void {
  Object.defineProperty(globalThis.navigator, 'language', { value: language, configurable: true });
}

describe('PanelI18nService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    stubNavigatorLanguage('en-US');
  });

  it('随英文浏览器语言解析为 en，并按复数规则格式化', () => {
    stubNavigatorLanguage('en-GB');

    const i18n = TestBed.inject(PanelI18nService);

    expect(i18n.locale).toBe('en');
    expect(i18n.t('common.connected')).toBe('Connected');
    expect(i18n.t('common.records', { count: 1 })).toBe('1 record');
    expect(i18n.t('common.records', { count: 2 })).toBe('2 records');
  });

  it('随中文浏览器语言解析为 zh-Hans，并保留数字格式', () => {
    stubNavigatorLanguage('zh-CN');

    const i18n = TestBed.inject(PanelI18nService);

    expect(i18n.locale).toBe('zh-Hans');
    expect(i18n.t('common.connected')).toBe('已连接');
    expect(i18n.t('common.records', { count: 2 })).toBe('2 条');
  });

  it('未知或缺失的浏览器语言回退 zh-Hans', () => {
    stubNavigatorLanguage('fr-FR');

    const i18n = TestBed.inject(PanelI18nService);

    expect(i18n.locale).toBe('zh-Hans');
    expect(i18n.t('guard.allowAccess')).toBe('允许访问当前站点');
  });

  it('ICU 插值把参数填入占位符', () => {
    stubNavigatorLanguage('en-US');

    const i18n = TestBed.inject(PanelI18nService);

    expect(i18n.t('opfs.uploadSuccess', { name: 'data.bin' })).toBe('Uploaded: data.bin');
    expect(i18n.t('guard.unsupportedBody', { schemes: 'http、https' })).toContain('http、https');
  });

  it('中英文目录键集合对称，缺失键不泄漏到界面', () => {
    const zhKeys = Object.keys(panelZhMessages);
    const enKeys = Object.keys(panelEnMessages);

    expect(new Set(enKeys)).toEqual(new Set(zhKeys));
  });
});
