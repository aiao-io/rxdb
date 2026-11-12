import { describe, expect, it } from 'vitest';

import { infoPlist } from './plist';
import { stubFile } from './stubs';

const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.slice(at, at + length));

describe('stubFile', () => {
  it('ISO 媒体文件以 ftyp 盒开头，品牌对应格式', () => {
    const mp4 = stubFile('mp4');
    expect(ascii(mp4, 4, 8)).toBe('ftypisom');
    expect(new DataView(mp4.buffer).getUint32(0)).toBe(32);
    expect(ascii(stubFile('mov'), 4, 8)).toBe('ftypqt  ');
    expect(ascii(stubFile('heic'), 4, 8)).toBe('ftypheic');
  });

  it('mp3 带 ID3 标签与可解码的静音帧', () => {
    const mp3 = stubFile('mp3');
    expect(ascii(mp3, 0, 3)).toBe('ID3');
    expect([mp3[10], mp3[11]]).toEqual([0xff, 0xfb]);
    expect((mp3.length - 10) % 417).toBe(0);
  });

  it('其余格式各有正确的魔数', () => {
    expect(ascii(stubFile('xip'), 0, 4)).toBe('xar!');
    const dmg = stubFile('dmg');
    expect(ascii(dmg, dmg.length - 512, 4)).toBe('koly');
    expect(Array.from(stubFile('zip'))).toEqual([0x50, 0x4b, 0x05, 0x06, ...new Array<number>(18).fill(0)]);
    expect(Array.from(stubFile('ttf').slice(0, 4))).toEqual([0, 1, 0, 0]);
  });
});

describe('infoPlist', () => {
  it('写出程序包的 Info.plist', () => {
    const plist = infoPlist({ name: 'System Settings', identifier: 'io.aiao.desktop.settings', version: '26.0' });
    expect(plist.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(plist).toContain('<key>CFBundleName</key>\n\t<string>System Settings</string>');
    expect(plist).toContain('<key>CFBundleIdentifier</key>\n\t<string>io.aiao.desktop.settings</string>');
    expect(plist).toContain('<key>CFBundlePackageType</key>\n\t<string>APPL</string>');
    expect(plist.trimEnd().endsWith('</plist>')).toBe(true);
  });

  it('名字里的 XML 特殊字符被转义', () => {
    expect(infoPlist({ name: 'A & <B>', identifier: 'x', version: '1' })).toContain('<string>A &amp; &lt;B&gt;</string>');
  });
});
