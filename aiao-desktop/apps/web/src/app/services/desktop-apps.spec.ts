import { describe, expect, it } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import {
  DesktopAppManifest,
  DesktopAppManifests,
  assertManifests,
  orbitAllow,
  validateManifests,
  webAppOrigins
} from './desktop-apps';

const code = {
  id: 'code',
  name: 'Code',
  icon: 'app-code',
  kind: 'web',
  web: {
    url: 'https://code.example.com/',
    version: 'online',
    allow: ['cross-origin-isolated', 'clipboard-write'],
    readyTimeout: 60_000
  }
} as const;

/** 测试夹具绕开类型检查，模拟来源不受信的登记数据；登记键取各项的 id。 */
const table = (...entries: readonly object[]): DesktopAppManifests =>
  Object.fromEntries(entries.map(entry => [(entry as { id: string }).id, entry])) as unknown as DesktopAppManifests;

const withWeb = (web: object) => ({ ...code, web: { ...code.web, ...web } });
const misfiled = { mismatch: code } as unknown as DesktopAppManifests;

describe('应用登记表', () => {
  it('当前登记表合规：id 等于登记键，系统入口、内置应用与集成应用各就各位', () => {
    expect(validateManifests(DESKTOP_APP_MANIFESTS)).toEqual([]);
    const ids = Object.keys(DESKTOP_APP_MANIFESTS);
    expect(Object.values(DESKTOP_APP_MANIFESTS).map(app => app.id)).toEqual(ids);
    const byKind = (kind: string) =>
      ids.filter(id => DESKTOP_APP_MANIFESTS[id as keyof DesktopAppManifests].kind === kind);
    expect(byKind('system')).toEqual(['launchpad', 'trash']);
    expect(byKind('web')).toEqual(['vscode']);
    expect(byKind('builtin')).toHaveLength(30);
  });

  it('Aiao Code 登记为单窗口的集成应用，指向线上地址，授予跨源隔离与剪贴板', () => {
    expect(DESKTOP_APP_MANIFESTS.vscode).toMatchObject({
      name: 'Aiao Code',
      icon: 'app-aiao-code',
      kind: 'web',
      web: { url: 'https://vscode.aiao.io/', readyTimeout: 60_000 }
    });
    expect((DESKTOP_APP_MANIFESTS.vscode as DesktopAppManifest).single).toBeUndefined();
    expect(orbitAllow(DESKTOP_APP_MANIFESTS.vscode.web)).toBe('cross-origin-isolated; clipboard-read; clipboard-write');
  });

  it('不合规的登记逐项报出应用 id 与字段', () => {
    expect(validateManifests(misfiled)).toEqual(['mismatch.id：登记的 id 是 code，与登记键不一致']);
    const problems = validateManifests(
      table(
        { ...code, id: 'nameless', name: ' ' },
        { id: 'loose', name: 'Loose', icon: 'x', kind: 'builtin', web: code.web },
        { id: 'bare', name: 'Bare', icon: 'x', kind: 'web' },
        { id: 'odd', name: 'Odd', icon: 'x', kind: 'plugin' },
        { ...withWeb({ url: 'http://code.example.com/' }), id: 'plain' },
        { ...withWeb({ url: 'https://user:secret@code.example.com/' }), id: 'secret' },
        { ...withWeb({ url: 'not a url' }), id: 'broken' },
        { ...withWeb({ version: '' }), id: 'unversioned' },
        { ...withWeb({ allow: ['camera'] }), id: 'camera' },
        { ...withWeb({ allow: ['fullscreen', 'fullscreen'] }), id: 'twice' },
        { ...withWeb({ readyTimeout: 0 }), id: 'instant' },
        { ...withWeb({ readyTimeout: 120_001 }), id: 'forever' },
        { ...withWeb({ readyTimeout: 1.5 }), id: 'fraction' }
      )
    );
    expect(problems).toEqual([
      'nameless.name：不能为空',
      'loose.web：只有集成应用（web）才有入口',
      'bare.web：集成应用必须登记入口',
      'odd.kind：只能是 system、builtin 或 web',
      'plain.web.url：必须是不带用户名密码的 HTTPS 地址',
      'secret.web.url：必须是不带用户名密码的 HTTPS 地址',
      'broken.web.url：必须是不带用户名密码的 HTTPS 地址',
      'unversioned.web.version：必须是 1～128 个字符',
      'camera.web.allow：camera 不在允许清单（cross-origin-isolated、clipboard-read、clipboard-write、fullscreen）',
      'twice.web.allow：fullscreen 重复',
      'instant.web.readyTimeout：必须是 1～120000 之间的整数毫秒',
      'forever.web.readyTimeout：必须是 1～120000 之间的整数毫秒',
      'fraction.web.readyTimeout：必须是 1～120000 之间的整数毫秒'
    ]);
    expect(() => assertManifests(misfiled)).toThrow(/应用登记表不合规[\s\S]*mismatch\.id/);
    expect(() => assertManifests(DESKTOP_APP_MANIFESTS)).not.toThrow();
  });

  it('Orbit 的允许来源只取集成应用入口的精确来源，去重且不含通配符', () => {
    expect(webAppOrigins(DESKTOP_APP_MANIFESTS)).toEqual(['https://vscode.aiao.io']);
    const second = withWeb({ url: 'https://code.example.com/editor/?a=1#x' });
    expect(webAppOrigins(table(code, { ...second, id: 'editor' }))).toEqual(['https://code.example.com']);
  });
});
