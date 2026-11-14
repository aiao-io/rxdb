import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DesktopAppManifest, LAUNCH_ORDER } from '../../services/desktop-apps';
import { DESKTOP_APP_MANIFESTS } from '../app-manifests';
import { SALTLINE_ENTRY } from './saltline-entry';

/** 构建把 public/ 原样复制到产物根目录，入口文件就是这一份。 */
const shipped = readFileSync(resolve(import.meta.dirname, '../../../../public', SALTLINE_ENTRY), 'utf8');

describe('几猫3A大作', () => {
  it('登记为单窗口的内置应用，启动台与聚焦搜索里都有', () => {
    expect(DESKTOP_APP_MANIFESTS.saltline).toMatchObject({
      id: 'saltline',
      name: '几猫3A大作',
      icon: 'app-saltline',
      kind: 'builtin'
    });
    expect((DESKTOP_APP_MANIFESTS.saltline as DesktopAppManifest).single).toBeUndefined();
    expect(LAUNCH_ORDER).toContain('saltline');
  });

  it('入口是相对地址：与桌面同源，跟着桌面的部署路径走', () => {
    const url = new URL(SALTLINE_ENTRY, 'https://desktop.example/base/');
    expect(url.origin).toBe('https://desktop.example');
    expect(url.pathname).toBe('/base/saltline.html');
  });

  it('入口文件随桌面发布，登记名就是游戏自己的标题', () => {
    expect(shipped.startsWith('<!doctype html>')).toBe(true);
    expect(shipped).toContain(`<title>${DESKTOP_APP_MANIFESTS.saltline.name}</title>`);
  });

  it('游戏是自包含的单文件：不引用外部脚本、样式与媒体，桌面的 COEP 拦不到它', () => {
    const external = /<(?:script|link|img|iframe|source|audio|video)\b[^>]*\b(?:src|href)=["']?(?:https?:)?\/\//gi;
    expect(shipped.match(external)).toBeNull();
  });
});
