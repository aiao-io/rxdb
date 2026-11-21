import { describe, expect, it } from 'vitest';

import { infoPlist, parseInfoPlist } from './plist';

const base = { name: 'Notes', identifier: 'io.aiao.desktop.notes', version: '26.0' };

describe('infoPlist', () => {
  it('写出标准的 XML 属性列表头与程序包的常用键', () => {
    const xml = infoPlist(base);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist')).toBe(true);
    expect(xml).toContain('<plist version="1.0">\n<dict>');
    expect(xml.endsWith('</dict>\n</plist>\n')).toBe(true);
    expect(xml).toContain('<key>CFBundleDisplayName</key>\n\t<string>Notes</string>');
    expect(xml).toContain('<key>CFBundleIdentifier</key>\n\t<string>io.aiao.desktop.notes</string>');
    expect(xml).toContain('<key>CFBundleShortVersionString</key>\n\t<string>26.0</string>');
    expect(xml).toContain('<key>CFBundlePackageType</key>\n\t<string>APPL</string>');
  });

  it('没有 appId 和 runtime 时不写 AiaoAppId、AiaoRuntime（旧种子的样子）', () => {
    const xml = infoPlist(base);
    expect(xml).not.toContain('AiaoAppId');
    expect(xml).not.toContain('AiaoRuntime');
  });

  it('带 appId 和 runtime 时写进自定义键，包可以凭它回到清单', () => {
    const xml = infoPlist({ ...base, appId: 'notes', runtime: 'builtin-component' });
    expect(xml).toContain('<key>AiaoAppId</key>\n\t<string>notes</string>');
    expect(xml).toContain('<key>AiaoRuntime</key>\n\t<string>builtin-component</string>');
  });

  it('文本里的 XML 特殊字符会转义', () => {
    const xml = infoPlist({ ...base, name: `A & B <"C"> 'D'` });
    expect(xml).toContain('<string>A &amp; B &lt;&quot;C&quot;&gt; &apos;D&apos;</string>');
    expect(xml).not.toContain('<string>A & B');
  });
});

describe('parseInfoPlist', () => {
  it('读出名字、包标识、appId 与运行来源，写出再读入保持一致', () => {
    const parsed = parseInfoPlist(infoPlist({ ...base, appId: 'notes', runtime: 'bundled-html' }));
    expect(parsed).toEqual({
      name: 'Notes',
      identifier: 'io.aiao.desktop.notes',
      appId: 'notes',
      runtime: 'bundled-html'
    });
  });

  it('转义的字符往返不变，中文名也一样', () => {
    for (const name of [`A & B <"C"> 'D'`, '几猫3A大作', '&amp; 字面量']) {
      expect(parseInfoPlist(infoPlist({ ...base, name })).name).toBe(name);
    }
  });

  it('没有的键是 undefined（旧包没有 AiaoAppId）', () => {
    const parsed = parseInfoPlist(infoPlist(base));
    expect(parsed.appId).toBeUndefined();
    expect(parsed.runtime).toBeUndefined();
    expect(parsed.identifier).toBe('io.aiao.desktop.notes');
  });

  it('键值之间允许空白和换行', () => {
    const xml = '<dict><key>AiaoAppId</key>\n   \t<string>mail</string></dict>';
    expect(parseInfoPlist(xml).appId).toBe('mail');
  });

  it('坏格式或别的内容只会读不到标识，不会读出别的东西', () => {
    expect(parseInfoPlist('')).toEqual({
      name: undefined,
      identifier: undefined,
      appId: undefined,
      runtime: undefined
    });
    expect(parseInfoPlist('not a plist at all')).toMatchObject({ appId: undefined, identifier: undefined });
    expect(parseInfoPlist('<key>AiaoAppId</key><integer>5</integer>').appId).toBeUndefined();
    expect(parseInfoPlist('<key>AiaoAppId</key><string>unterminated').appId).toBeUndefined();
    expect(parseInfoPlist('<string>mail</string><key>AiaoAppId</key>').appId).toBeUndefined();
  });
});
