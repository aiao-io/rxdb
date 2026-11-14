import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DiskPath } from '../disk/disk-path';
import { DiskStore } from '../disk/disk-store';
import { infoPlist } from '../disk/formats/plist';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { configureServices } from '../testing/angular';
import { ApplicationCatalog } from './application-catalog';
import { DESKTOP_APPS, DesktopAppManifests } from './desktop-apps';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const SAFARI: DiskPath = ['Applications', 'Safari.app'];
const COPY: DiskPath = ['Users', 'prasenjit', 'Desktop', 'Safari.app'];

function setup(manifests: DesktopAppManifests = DESKTOP_APP_MANIFESTS) {
  configureServices([ApplicationCatalog, { provide: DESKTOP_APPS, useValue: manifests }]);
  return TestBed.inject(ApplicationCatalog);
}

/** 对账一块空盘，返回目录服务和盘。 */
async function reconciled(
  manifests: DesktopAppManifests = DESKTOP_APP_MANIFESTS,
  store: DiskStore = new MemoryDiskStore()
) {
  const catalog = setup(manifests);
  const report = await catalog.reconcile(store);
  return { catalog, store, report };
}

const withPatch = (id: string, patch: object): DesktopAppManifests =>
  ({
    ...DESKTOP_APP_MANIFESTS,
    [id]: { ...DESKTOP_APP_MANIFESTS[id as keyof typeof DESKTOP_APP_MANIFESTS], ...patch }
  }) as unknown as DesktopAppManifests;

describe('ApplicationCatalog.reconcile', () => {
  it('对账前没有系统拥有的包，也没有冲突', () => {
    const catalog = setup();
    expect(catalog.owned().size).toBe(0);
    expect(catalog.ownedPackages().size).toBe(0);
    expect(catalog.conflicts()).toEqual([]);
    expect(catalog.conflictNote()).toBeNull();
  });

  it('对账把清单投影到磁盘，并更新 owned（目录名 → 应用 id）', async () => {
    const { catalog, store, report } = await reconciled();
    expect(report.changed).toBe(true);
    expect(catalog.owned()).toBe(report.owned);
    expect(catalog.ownedPackages()).toBe(report.owned);
    expect(catalog.owned().get('Safari.app')).toBe('safari');
    expect(catalog.owned().get('几猫3A大作.app')).toBe('saltline');
    expect(await store.kindOf(['Applications', '几猫3A大作.app', 'Contents', 'Info.plist'])).toBe('file');
    expect(catalog.conflicts()).toEqual([]);
    expect(catalog.conflictNote()).toBeNull();
  });

  it('同名的非包条目占着位置：记下冲突，给 Finder 一条说明，应用仍可从其他入口打开', async () => {
    const store = new MemoryDiskStore();
    await store.write(['Applications', 'Mail.app'], text('mine'));
    const { catalog } = await reconciled(DESKTOP_APP_MANIFESTS, store);

    expect(catalog.conflicts()).toEqual([{ appId: 'mail', dir: 'Mail.app', reason: 'occupied' }]);
    expect(catalog.conflictNote()).toBe(
      'Mail.app can’t be shown here because an item with the same name already exists. The application can still be opened from Launchpad, Spotlight and the Dock.'
    );
    expect(catalog.packageOf('mail')).toBeNull();
    expect(catalog.owned().has('Mail.app')).toBe(false);
  });

  it('有多个冲突时说明里把名字都列出来', async () => {
    const store = new MemoryDiskStore();
    await store.write(['Applications', 'Mail.app'], text('a'));
    await store.write(['Applications', 'Maps.app'], text('b'));
    const { catalog } = await reconciled(DESKTOP_APP_MANIFESTS, store);
    expect(catalog.conflictNote()).toMatch(/^Mail\.app、Maps\.app can’t be shown here/);
  });

  it('占位的条目被用户删掉后重新对账：补出包，冲突与说明消失', async () => {
    const store = new MemoryDiskStore();
    await store.write(['Applications', 'Mail.app'], text('mine'));
    const { catalog } = await reconciled(DESKTOP_APP_MANIFESTS, store);
    expect(catalog.conflicts()).toHaveLength(1);

    await store.remove(['Applications', 'Mail.app']);
    await catalog.reconcile(store);
    expect(catalog.conflicts()).toEqual([]);
    expect(catalog.conflictNote()).toBeNull();
    expect(catalog.packageOf('mail')).toBe('Mail.app');
  });
});

describe('ApplicationCatalog 保护判断', () => {
  it('violation 用当前拥有的包判断：对账前放行，对账后预装包不能删、不能移', async () => {
    const catalog = setup();
    expect(catalog.violation({ kind: 'remove', path: SAFARI })).toBeNull();

    await catalog.reconcile(new MemoryDiskStore());
    expect(catalog.violation({ kind: 'remove', path: SAFARI })).toBe(
      'The item “Safari.app” can’t be removed because it’s part of a preinstalled application.'
    );
    expect(catalog.violation({ kind: 'move', from: SAFARI, to: ['Applications', 'Other.app'] })).toContain(
      'can’t be moved'
    );
    expect(catalog.violation({ kind: 'remove', path: COPY })).toBeNull();
  });
});

describe('ApplicationCatalog 按路径认应用', () => {
  it('appIdAt 只认 /Applications 顶层系统拥有的包，不看显示名', async () => {
    const { catalog } = await reconciled();
    expect(catalog.appIdAt(SAFARI)).toBe('safari');
    expect(catalog.appIdAt(['Applications', 'Aiao Code.app'])).toBe('vscode');
  });

  it('别的路径都是 null：没有路径、包里的子项、其他目录里的副本、不认识的名字', async () => {
    const { catalog } = await reconciled();
    expect(catalog.appIdAt(null)).toBeNull();
    expect(catalog.appIdAt([...SAFARI, 'Contents'])).toBeNull();
    expect(catalog.appIdAt(COPY)).toBeNull();
    expect(catalog.appIdAt(['Applications', 'Unknown.app'])).toBeNull();
    expect(catalog.appIdAt(['Applications'])).toBeNull();
    expect(catalog.appIdAt(['Library', 'Safari.app'])).toBeNull();
  });

  it('appIdOf 取节点的路径来认', async () => {
    const { catalog } = await reconciled();
    expect(catalog.appIdOf({ path: SAFARI })).toBe('safari');
    expect(catalog.appIdOf({ path: null })).toBeNull();
  });

  it('packageOf 返回应用的包目录名；没有包的应用为 null', async () => {
    const { catalog } = await reconciled();
    expect(catalog.packageOf('safari')).toBe('Safari.app');
    expect(catalog.packageOf('settings')).toBe('System Settings.app');
    expect(catalog.packageOf('finder')).toBeNull();
    expect(catalog.packageOf('launchpad')).toBeNull();
  });

  it('清单改名之后，旧名字的包目录跟着改，packageOf 与 appIdAt 用新名字', async () => {
    const store = new MemoryDiskStore();
    await reconciled(DESKTOP_APP_MANIFESTS, store);
    const { catalog } = await reconciled(withPatch('safari', { name: 'Safari Browser' }), store);
    expect(catalog.packageOf('safari')).toBe('Safari Browser.app');
    expect(catalog.appIdAt(['Applications', 'Safari Browser.app'])).toBe('safari');
    expect(catalog.appIdAt(SAFARI)).toBeNull();
  });
});

describe('ApplicationCatalog.resolve：打开一个 .app 包', () => {
  const copyPlist = (appId: string | undefined, name = 'Safari'): string =>
    infoPlist({ name, identifier: 'io.aiao.desktop.safari', version: '26.0', ...(appId ? { appId } : {}) });

  it('系统拥有的包按路径回到清单，不读文件', async () => {
    const { catalog } = await reconciled();
    const read = vi.fn();
    expect(await catalog.resolve({ name: 'Safari.app', path: SAFARI }, read)).toEqual({ kind: 'app', id: 'safari' });
    expect(read).not.toHaveBeenCalled();
  });

  it('用户复制到别处的包读 Info.plist 里的标识：清单里有就启动同一个应用', async () => {
    const { catalog } = await reconciled();
    const read = vi.fn(async () => copyPlist('safari'));
    expect(await catalog.resolve({ name: 'Safari.app', path: COPY }, read)).toEqual({ kind: 'app', id: 'safari' });
    expect(read).toHaveBeenCalledExactlyOnceWith([...COPY, 'Contents', 'Info.plist']);
  });

  it('按标识而不是文件名：改了名的副本照样打开它的本尊，不会打开同名的别的应用', async () => {
    const { catalog } = await reconciled();
    const path: DiskPath = ['Users', 'prasenjit', 'Desktop', 'Notes.app'];
    const result = await catalog.resolve({ name: 'Notes.app', path }, async () => copyPlist('mail', 'Notes'));
    expect(result).toEqual({ kind: 'app', id: 'mail' });
  });

  it('清单里已经没有这个标识：应用已下线，带上包里写的名字，没有名字时用文件名', async () => {
    const { catalog } = await reconciled();
    const gone = await catalog.resolve({ name: 'Old.app', path: COPY }, async () =>
      copyPlist('retired', 'Retired App')
    );
    expect(gone).toEqual({ kind: 'offline', name: 'Retired App' });

    const noName = await catalog.resolve(
      { name: 'Legacy.APP', path: COPY },
      async () => '<key>AiaoAppId</key><string>retired</string>'
    );
    expect(noName).toEqual({ kind: 'offline', name: 'Legacy' });
  });

  it('没有标识（旧包副本、别人做的包）、读不出 Info.plist、或根本没有路径：不是桌面认识的包', async () => {
    const { catalog } = await reconciled();
    expect(await catalog.resolve({ name: 'X.app', path: COPY }, async () => copyPlist(undefined))).toEqual({
      kind: 'unknown'
    });
    expect(await catalog.resolve({ name: 'X.app', path: COPY }, async () => 'garbage')).toEqual({ kind: 'unknown' });
    expect(
      await catalog.resolve({ name: 'X.app', path: COPY }, () => Promise.reject(new Error('ENOENT: no such file')))
    ).toEqual({ kind: 'unknown' });
    expect(await catalog.resolve({ name: 'X.app', path: null }, vi.fn())).toEqual({ kind: 'unknown' });
  });
});

describe('ApplicationCatalog.find：终端 open -a / -b 的查找', () => {
  it('按应用 id、包标识或显示名找，不区分大小写，显示名可以带 .app', () => {
    const catalog = setup();
    expect(catalog.find('safari')?.id).toBe('safari');
    expect(catalog.find('io.aiao.desktop.safari')?.id).toBe('safari');
    expect(catalog.find('IO.AIAO.DESKTOP.SAFARI')?.id).toBe('safari');
    expect(catalog.find('System Settings')?.id).toBe('settings');
    expect(catalog.find('system settings.app')?.id).toBe('settings');
    expect(catalog.find('几猫3A大作')?.id).toBe('saltline');
  });

  it('id 优先于显示名：某个应用改名成别的应用的 id 时，按 id 找到的仍是后者', () => {
    const catalog = setup(withPatch('notes', { name: 'mail' }));
    expect(catalog.find('mail')?.id).toBe('mail');
    expect(catalog.find('Mail.app')?.id).toBe('notes');
  });

  it('包标识优先于显示名', () => {
    const catalog = setup(withPatch('notes', { name: 'io.aiao.desktop.music' }));
    expect(catalog.find('io.aiao.desktop.music')?.id).toBe('music');
  });

  it('系统入口（启动台、废纸篓）没有 .app 身份，找不到；不认识的名字也找不到', () => {
    const catalog = setup();
    expect(catalog.find('launchpad')).toBeNull();
    expect(catalog.find('Trash')).toBeNull();
    expect(catalog.find('No Such App')).toBeNull();
  });

  it('显示名重名（Finder 与关于本机都叫 Finder）时取清单里靠前的那个', () => {
    expect(setup().find('Finder')?.id).toBe('finder');
  });
});
