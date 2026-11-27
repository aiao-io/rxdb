import { describe, expect, it } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { APP_RESTORES, DesktopAppManifests, validateManifests } from './desktop-apps';

/** 登记表要求的共有字段加一个内置应用的最小描述。 */
const base = {
  id: 'notes',
  name: 'Notes',
  icon: 'app-notes',
  kind: 'builtin',
  bundleId: 'io.example.notes',
  installScope: 'preinstalled',
  showInApplications: true,
  defaultPinned: false,
  dockRemovable: true
} as const;

const table = (entry: object): DesktopAppManifests => ({ notes: entry }) as unknown as DesktopAppManifests;

/** 按接口类型看当前清单（字面量类型里不是每个应用都有 restore 字段）。 */
const manifests: DesktopAppManifests = DESKTOP_APP_MANIFESTS;

describe('清单里的 restore 字段（刷新后窗口怎么恢复，ADESK-US-104）', () => {
  it('取值只有 eager（默认）、foreground 与 deferred', () => {
    expect(APP_RESTORES).toEqual(['eager', 'foreground', 'deferred']);
  });

  it('不写 restore、写 eager、foreground 或 deferred 都合规', () => {
    expect(validateManifests(table(base))).toEqual([]);
    expect(validateManifests(table({ ...base, restore: 'eager' }))).toEqual([]);
    expect(validateManifests(table({ ...base, restore: 'foreground' }))).toEqual([]);
    expect(validateManifests(table({ ...base, restore: 'deferred' }))).toEqual([]);
  });

  it('写了别的值报出应用与字段', () => {
    expect(validateManifests(table({ ...base, restore: 'lazy' }))).toEqual([
      'notes.restore：只能是 eager 或 foreground 或 deferred'
    ]);
  });

  it('集成应用也可以声明 restore，同样要合法', () => {
    const web = {
      ...base,
      kind: 'web',
      web: { url: 'https://code.example.com/', version: 'online', allow: [], readyTimeout: 60_000 }
    };
    expect(validateManifests(table({ ...web, restore: 'deferred' }))).toEqual([]);
    expect(validateManifests(table({ ...web, restore: 'later' }))).toEqual([
      'notes.restore：只能是 eager 或 foreground 或 deferred'
    ]);
  });

  it('当前登记表合规：前台终端自动装载，几猫3A大作始终等用户启动', () => {
    expect(validateManifests(manifests)).toEqual([]);
    expect(DESKTOP_APP_MANIFESTS.terminal.restore).toBe('foreground');
    expect(DESKTOP_APP_MANIFESTS.saltline.restore).toBe('deferred');
  });

  it('Aiao Code（集成应用）与 Finder、备忘录这类轻量应用是默认的 eager：恢复时随窗口装载', () => {
    for (const id of ['vscode', 'finder', 'notes', 'calculator'] as const) {
      const app = manifests[id];
      expect(app.kind !== 'system' && (app.restore ?? 'eager')).toBe('eager');
    }
  });
});
