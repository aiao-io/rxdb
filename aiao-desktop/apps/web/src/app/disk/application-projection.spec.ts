import { describe, expect, it } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopAppManifests, applicationManifests } from '../services/desktop-apps';
import {
  APPLICATIONS,
  BundleFacts,
  LEGACY_APP_IDS,
  assertUnprotected,
  bundleDirName,
  bundleInfoText,
  claimBundles,
  planProjection,
  protectedPaths,
  protectionViolation,
  readApplications,
  reconcileApplications
} from './application-projection';
import { DiskPath } from './disk-path';
import { DiskStore } from './disk-store';
import { infoPlist, parseInfoPlist } from './formats/plist';
import { MemoryDiskStore } from './memory-disk-store';

const text = (value: string): Uint8Array => new TextEncoder().encode(value);
const decode = (value: Uint8Array): string => new TextDecoder().decode(value);

const bundle = (dir: string, ...tail: string[]): DiskPath => [...APPLICATIONS, dir, ...tail];
const infoPath = (dir: string): DiskPath => bundle(dir, 'Contents', 'Info.plist');
const pkgInfoPath = (dir: string): DiskPath => bundle(dir, 'Contents', 'PkgInfo');

/** 把清单里的一个应用换成改过的版本（改名、换 bundle 标识…）。 */
const patched = (id: string, patch: object): DesktopAppManifests =>
  ({
    ...DESKTOP_APP_MANIFESTS,
    [id]: { ...DESKTOP_APP_MANIFESTS[id as keyof typeof DESKTOP_APP_MANIFESTS], ...patch }
  }) as unknown as DesktopAppManifests;

/** 清单里去掉一个应用（应用下线）。 */
const without = (id: string): DesktopAppManifests =>
  Object.fromEntries(
    Object.entries(DESKTOP_APP_MANIFESTS).filter(([key]) => key !== id)
  ) as unknown as DesktopAppManifests;

/** 旧版手写种子写出的包：Info.plist 没有 AiaoAppId，标识是 `io.aiao.desktop.<名>`，另有 PkgInfo。 */
async function writeLegacyBundle(store: DiskStore, name: string): Promise<void> {
  const identifier = `io.aiao.desktop.${name.toLowerCase().replace(/\s+/g, '-')}`;
  await store.write(infoPath(`${name}.app`), text(infoPlist({ name, identifier, version: '26.0' })));
  await store.write(pkgInfoPath(`${name}.app`), text('APPL????'));
}

/** 整个卷的内容快照：路径 → 文件内容（目录记为 null），用来断言「一字未动」。 */
async function snapshot(store: DiskStore, dir: DiskPath = []): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const entry of await store.list(dir)) {
    const path = [...dir, entry.name];
    const key = `/${path.join('/')}`;
    if (entry.kind === 'directory') Object.assign(out, { [key]: null }, await snapshot(store, path));
    else out[key] = decode(await store.read(path));
  }
  return out;
}

const applicationNames = async (store: DiskStore): Promise<string[]> =>
  (await store.list(APPLICATIONS)).map(entry => entry.name);

const expectedDirs = (manifests: DesktopAppManifests = DESKTOP_APP_MANIFESTS): string[] =>
  applicationManifests(manifests)
    .map(app => bundleDirName(app))
    .sort((a, b) => a.localeCompare(b));

describe('reconcileApplications：全新的库', () => {
  it('空盘补出清单里所有 showInApplications 的 .app，Info.plist 带标识与稳定的包标识，另有 PkgInfo', async () => {
    const store = new MemoryDiskStore();
    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);

    expect(report.changed).toBe(true);
    expect(report.conflicts).toEqual([]);
    expect(await applicationNames(store)).toEqual(expectedDirs());
    for (const app of applicationManifests(DESKTOP_APP_MANIFESTS)) {
      if (app.kind === 'system') continue;
      const dir = bundleDirName(app);
      const info = parseInfoPlist(decode(await store.read(infoPath(dir))));
      expect(info).toMatchObject({ name: app.name, identifier: app.bundleId, appId: app.id });
      expect(decode(await store.read(pkgInfoPath(dir)))).toBe('APPL????');
      expect(report.owned.get(dir)).toBe(app.id);
    }
    expect(report.owned.size).toBe(expectedDirs().length);
  });

  it('Finder、关于本机、启动台与废纸篓不出包；几猫3A大作与 Aiao Code 出包并带运行来源', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    const names = await applicationNames(store);

    for (const hidden of ['Finder.app', 'Launchpad.app', 'Trash.app']) expect(names).not.toContain(hidden);
    expect(names).toContain('几猫3A大作.app');
    expect(names).toContain('Aiao Code.app');
    const saltline = parseInfoPlist(decode(await store.read(infoPath('几猫3A大作.app'))));
    expect(saltline).toMatchObject({ appId: 'saltline', runtime: 'bundled-html' });
    const code = parseInfoPlist(decode(await store.read(infoPath('Aiao Code.app'))));
    expect(code).toMatchObject({ appId: 'vscode', runtime: 'remote-web' });
    const notes = parseInfoPlist(decode(await store.read(infoPath('Notes.app'))));
    expect(notes.runtime).toBe('builtin-component');
  });

  it('写进磁盘的 Info.plist 就是 bundleInfoText 给出的内容', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    const safari = DESKTOP_APP_MANIFESTS.safari;
    expect(decode(await store.read(infoPath('Safari.app')))).toBe(bundleInfoText(safari));
  });

  it('幂等：再对账一次没有任何改动，磁盘内容一字不变', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    const before = await snapshot(store);

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.changed).toBe(false);
    expect(report.ops).toEqual([]);
    expect(await snapshot(store)).toEqual(before);
  });

  it('/Applications 还不存在时先建出来', async () => {
    const store = new MemoryDiskStore();
    expect(await store.kindOf(APPLICATIONS)).toBeNull();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(await store.kindOf(APPLICATIONS)).toBe('directory');
  });
});

describe('reconcileApplications：旧种子建成的库', () => {
  const legacyNames = Object.keys(LEGACY_APP_IDS);

  it('旧包被一次性认领并补上标识，用户放在包里的文件原样保留', async () => {
    const store = new MemoryDiskStore();
    for (const name of legacyNames) await writeLegacyBundle(store, name);
    await store.write(bundle('Safari.app', 'Contents', 'Resources', 'mine.txt'), text('my notes'));
    await store.write(bundle('Notes.app', 'readme.md'), text('hello'));

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    const claimed = report.ops.filter(op => op.op === 'rewrite' && op.claimed);
    expect(claimed).toHaveLength(legacyNames.length);
    for (const name of legacyNames) {
      const info = parseInfoPlist(decode(await store.read(infoPath(`${name}.app`))));
      expect(info.appId).toBe(LEGACY_APP_IDS[name]);
    }
    expect(decode(await store.read(bundle('Safari.app', 'Contents', 'Resources', 'mine.txt')))).toBe('my notes');
    expect(decode(await store.read(bundle('Notes.app', 'readme.md')))).toBe('hello');
    expect(await applicationNames(store)).toEqual(expectedDirs());
  });

  it('认领之后清单里的包标识生效（旧种子的标识 → 清单的 bundleId），再对账不重复补写', async () => {
    const store = new MemoryDiskStore();
    await writeLegacyBundle(store, 'System Settings');
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);

    const info = parseInfoPlist(decode(await store.read(infoPath('System Settings.app'))));
    expect(info).toMatchObject({ appId: 'settings', identifier: DESKTOP_APP_MANIFESTS.settings.bundleId });
    const again = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(again.changed).toBe(false);
  });

  it('用户删过一个旧包：缺的预装包被补回', async () => {
    const store = new MemoryDiskStore();
    for (const name of legacyNames.filter(name => name !== 'Maps')) await writeLegacyBundle(store, name);
    expect(await store.kindOf(bundle('Maps.app'))).toBeNull();

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.ops).toContainEqual({ op: 'create', appId: 'maps', dir: 'Maps.app' });
    expect(parseInfoPlist(decode(await store.read(infoPath('Maps.app')))).appId).toBe('maps');
  });

  it('旧名单里的目录名，但标识不是旧种子写的（用户自己的同名程序包）：不认领、不覆盖', async () => {
    const store = new MemoryDiskStore();
    const theirs = infoPlist({ name: 'Safari', identifier: 'com.example.my-safari', version: '1.0' });
    await store.write(infoPath('Safari.app'), text(theirs));

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.conflicts).toContainEqual({ appId: 'safari', dir: 'Safari.app', reason: 'occupied' });
    expect(decode(await store.read(infoPath('Safari.app')))).toBe(theirs);
    expect(report.owned.has('Safari.app')).toBe(false);
  });
});

describe('reconcileApplications：同名条目占着位置', () => {
  it('同名的普通文件：不覆盖，记为 occupied，应用没有包', async () => {
    const store = new MemoryDiskStore();
    await store.write(bundle('Mail.app'), text('not a bundle'));

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.conflicts).toEqual([{ appId: 'mail', dir: 'Mail.app', reason: 'occupied' }]);
    expect(decode(await store.read(bundle('Mail.app')))).toBe('not a bundle');
    expect(report.owned.has('Mail.app')).toBe(false);
    expect(await applicationNames(store)).toHaveLength(expectedDirs().length);
  });

  it('同名的文件夹（没有 Info.plist）同样不覆盖，里面的内容保留', async () => {
    const store = new MemoryDiskStore();
    await store.write(bundle('Photos.app', 'vacation', 'img.jpg'), text('jpeg'));

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.conflicts).toEqual([{ appId: 'photos', dir: 'Photos.app', reason: 'occupied' }]);
    expect(await store.kindOf(infoPath('Photos.app'))).toBeNull();
    expect(decode(await store.read(bundle('Photos.app', 'vacation', 'img.jpg')))).toBe('jpeg');
  });

  it('冲突不阻塞其他应用，也不会反复补写：再对账仍报出冲突但没有改动', async () => {
    const store = new MemoryDiskStore();
    await store.write(bundle('Mail.app'), text('mine'));
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    const before = await snapshot(store);

    const again = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(again.changed).toBe(false);
    expect(again.conflicts).toEqual([{ appId: 'mail', dir: 'Mail.app', reason: 'occupied' }]);
    expect(await snapshot(store)).toEqual(before);
  });
});

describe('reconcileApplications：清单改名', () => {
  it('同一 appId 的包随显示名改名、Info.plist 更新，包里用户的文件和标识都不变', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.write(bundle('Safari.app', 'Contents', 'Resources', 'mine.txt'), text('keep me'));

    const renamed = patched('safari', { name: 'Safari Browser' });
    const report = await reconcileApplications(store, renamed);
    expect(report.ops).toContainEqual({ op: 'rename', appId: 'safari', from: 'Safari.app', to: 'Safari Browser.app' });
    expect(await store.kindOf(bundle('Safari.app'))).toBeNull();
    const info = parseInfoPlist(decode(await store.read(infoPath('Safari Browser.app'))));
    expect(info).toMatchObject({ name: 'Safari Browser', appId: 'safari' });
    expect(decode(await store.read(bundle('Safari Browser.app', 'Contents', 'Resources', 'mine.txt')))).toBe('keep me');
    expect(report.owned.get('Safari Browser.app')).toBe('safari');
    expect(report.owned.has('Safari.app')).toBe(false);

    expect((await reconcileApplications(store, renamed)).changed).toBe(false);
  });

  it('改名的目标被同名条目占着：保持原名，记为 rename-blocked，占位的条目不动', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.write(bundle('Safari Browser.app'), text('someone else'));

    const report = await reconcileApplications(store, patched('safari', { name: 'Safari Browser' }));
    expect(report.conflicts).toEqual([{ appId: 'safari', dir: 'Safari Browser.app', reason: 'rename-blocked' }]);
    expect(await store.kindOf(bundle('Safari.app'))).toBe('directory');
    expect(decode(await store.read(bundle('Safari Browser.app')))).toBe('someone else');
    expect(report.owned.get('Safari.app')).toBe('safari');
  });

  it('包标识等元数据变了：就地重写 Info.plist，目录名不变', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);

    const report = await reconcileApplications(store, patched('music', { bundleId: 'io.aiao.desktop.music2' }));
    expect(report.ops).toEqual([{ op: 'rewrite', appId: 'music', dir: 'Music.app', claimed: false }]);
    expect(parseInfoPlist(decode(await store.read(infoPath('Music.app')))).identifier).toBe('io.aiao.desktop.music2');
  });

  it('缺了 PkgInfo 的包补写 PkgInfo', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.remove(pkgInfoPath('Clock.app'));

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.ops).toEqual([{ op: 'rewrite', appId: 'clock', dir: 'Clock.app', claimed: false }]);
    expect(decode(await store.read(pkgInfoPath('Clock.app')))).toBe('APPL????');
  });

  it('包里的 Info.plist 被改坏（读不出标识）后，这个目录当作用户的文件夹，不覆盖', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.write(infoPath('Weather.app'), text('<plist>garbled</plist>'));

    const report = await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    expect(report.conflicts).toEqual([{ appId: 'weather', dir: 'Weather.app', reason: 'occupied' }]);
    expect(decode(await store.read(infoPath('Weather.app')))).toBe('<plist>garbled</plist>');
  });
});

describe('reconcileApplications：应用下线', () => {
  it('清单去掉一个应用：包里没有用户文件时整个目录一并移除', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);

    const report = await reconcileApplications(store, without('stocks'));
    expect(report.ops).toEqual([{ op: 'retire', appId: 'stocks', dir: 'Stocks.app' }]);
    expect(await store.kindOf(bundle('Stocks.app'))).toBeNull();
    expect(report.owned.has('Stocks.app')).toBe(false);
  });

  it('包里有用户放进去的文件：只移除系统写入的文件，目录保留为普通文件夹', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.write(bundle('Stocks.app', 'notes.txt'), text('mine'));
    await store.write(bundle('Stocks.app', 'Contents', 'Resources', 'icon.png'), text('png'));

    await reconcileApplications(store, without('stocks'));
    expect(await store.kindOf(infoPath('Stocks.app'))).toBeNull();
    expect(await store.kindOf(pkgInfoPath('Stocks.app'))).toBeNull();
    expect(decode(await store.read(bundle('Stocks.app', 'notes.txt')))).toBe('mine');
    expect(decode(await store.read(bundle('Stocks.app', 'Contents', 'Resources', 'icon.png')))).toBe('png');
  });

  it('包里只有用户的文件、Contents 里没有别的东西时，空的 Contents 一并移除', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.write(bundle('Stocks.app', 'notes.txt'), text('mine'));

    await reconcileApplications(store, without('stocks'));
    expect(await store.kindOf(bundle('Stocks.app', 'Contents'))).toBeNull();
    expect(await store.kindOf(bundle('Stocks.app', 'notes.txt'))).toBe('file');
  });

  it('退役之后不再被认领：再对账没有改动，也不报冲突', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    await store.write(bundle('Stocks.app', 'notes.txt'), text('mine'));
    const manifests = without('stocks');
    await reconcileApplications(store, manifests);

    const again = await reconcileApplications(store, manifests);
    expect(again.changed).toBe(false);
    expect(again.conflicts).toEqual([]);
  });

  it('复制到别处（比如桌面）的包不动', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);
    const copy: DiskPath = ['Users', 'prasenjit', 'Desktop', 'Stocks.app', 'Contents', 'Info.plist'];
    const original = decode(await store.read(infoPath('Stocks.app')));
    await store.write(copy, text(original));

    await reconcileApplications(store, without('stocks'));
    expect(decode(await store.read(copy))).toBe(original);
  });

  it('清单把应用改成不在 Applications 显示（showInApplications:false）同样退役', async () => {
    const store = new MemoryDiskStore();
    await reconcileApplications(store, DESKTOP_APP_MANIFESTS);

    const report = await reconcileApplications(store, patched('weather', { showInApplications: false }));
    expect(report.ops).toEqual([{ op: 'retire', appId: 'weather', dir: 'Weather.app' }]);
    expect(await store.kindOf(bundle('Weather.app'))).toBeNull();
  });
});

describe('claimBundles：认出系统拥有的包', () => {
  const facts = (dir: string, infoText: string | null): BundleFacts => ({ dir, infoText, hasPkgInfo: true });
  const plain = (name: string, appId: string): string =>
    infoPlist({ name, identifier: `io.aiao.desktop.${name.toLowerCase()}`, version: '26.0', appId });

  it('没有 Info.plist、或读不出标识的目录不认领', () => {
    expect(
      claimBundles(DESKTOP_APP_MANIFESTS, [
        facts('A.app', null),
        facts('B.app', 'nothing to see'),
        facts('C.app', '<plist/>')
      ])
    ).toEqual([]);
  });

  it('带 AiaoAppId 的按它认，不看目录名', () => {
    const [owned] = claimBundles(DESKTOP_APP_MANIFESTS, [facts('Whatever.app', plain('Notes', 'notes'))]);
    expect(owned).toMatchObject({ dir: 'Whatever.app', appId: 'notes', legacy: false });
  });

  it('旧包凭冻结名单认领：目录名在名单里，且标识是旧种子写的', () => {
    const legacy = infoPlist({ name: 'Calendar', identifier: 'io.aiao.desktop.calendar', version: '26.0' });
    const forged = infoPlist({ name: 'Calendar', identifier: 'com.example.calendar', version: '26.0' });
    expect(claimBundles(DESKTOP_APP_MANIFESTS, [facts('Calendar.app', legacy)])).toMatchObject([
      { dir: 'Calendar.app', appId: 'calendar', legacy: true }
    ]);
    expect(claimBundles(DESKTOP_APP_MANIFESTS, [facts('Calendar.app', forged)])).toEqual([]);
    expect(claimBundles(DESKTOP_APP_MANIFESTS, [facts('Unlisted.app', legacy)])).toEqual([]);
  });

  it('同一个应用有多个包时，名字等于清单现名的那个算数，其余是用户的副本', () => {
    const owned = claimBundles(DESKTOP_APP_MANIFESTS, [
      facts('Notes copy.app', plain('Notes', 'notes')),
      facts('Notes.app', plain('Notes', 'notes')),
      facts('Notes 2.app', plain('Notes', 'notes'))
    ]);
    expect(owned.map(item => item.dir)).toEqual(['Notes.app']);
  });

  it('没有哪个包叫现名时（比如清单刚改过名），取目录名排在最前的那个', () => {
    const owned = claimBundles(patched('notes', { name: 'Jottings' }), [
      facts('Zeta.app', plain('Notes', 'notes')),
      facts('Alpha.app', plain('Notes', 'notes'))
    ]);
    expect(owned.map(item => item.dir)).toEqual(['Alpha.app']);
  });

  it('清单里已没有的应用，它的包照样被认领（交给对账去退役）', () => {
    const owned = claimBundles(without('notes'), [facts('Notes.app', plain('Notes', 'notes'))]);
    expect(owned).toMatchObject([{ dir: 'Notes.app', appId: 'notes' }]);
  });
});

describe('readApplications 与 planProjection', () => {
  it('readApplications 只收集 .app 目录的事实：有没有 Info.plist、有没有 PkgInfo', async () => {
    const store = new MemoryDiskStore();
    await store.write(infoPath('A.app'), text('plist A'));
    await store.write(pkgInfoPath('A.app'), text('APPL????'));
    await store.mkdir(bundle('B.app', 'Contents'));
    await store.mkdir(bundle('Folder'));
    await store.write(bundle('c.app'), text('a file named like a bundle'));

    const { entries, facts } = await readApplications(store);
    expect(entries.map(entry => entry.name)).toEqual(['A.app', 'B.app', 'c.app', 'Folder']);
    expect(facts).toEqual([
      { dir: 'A.app', infoText: 'plist A', hasPkgInfo: true },
      { dir: 'B.app', infoText: null, hasPkgInfo: false }
    ]);
  });

  it('planProjection 先补缺的包，再退役下线的，不碰无关条目', () => {
    const plan = planProjection(
      without('stocks'),
      [{ name: 'Stocks.app', kind: 'directory' }],
      [
        {
          dir: 'Stocks.app',
          infoText: infoPlist({
            name: 'Stocks',
            identifier: 'io.aiao.desktop.stocks',
            version: '26.0',
            appId: 'stocks'
          }),
          hasPkgInfo: true
        }
      ]
    );
    const creates = plan.ops.filter(op => op.op === 'create');
    expect(creates).toHaveLength(expectedDirs(without('stocks')).length);
    expect(plan.ops.at(-1)).toEqual({ op: 'retire', appId: 'stocks', dir: 'Stocks.app' });
    expect(plan.conflicts).toEqual([]);
  });
});

describe('受保护路径与保护判断', () => {
  const owned = new Map([['Safari.app', 'safari']]);
  const safari = bundle('Safari.app');
  const refused = (path: DiskPath, verb: 'removed' | 'moved'): string =>
    `The item “${path.at(-1)}” can’t be ${verb} because it’s part of a preinstalled application.`;

  it('protectedPaths 列出每个系统包的包目录、Contents、Info.plist 与 PkgInfo', () => {
    expect(protectedPaths(owned)).toEqual([
      safari,
      bundle('Safari.app', 'Contents'),
      infoPath('Safari.app'),
      pkgInfoPath('Safari.app')
    ]);
    expect(protectedPaths(new Map())).toEqual([]);
  });

  it('删除或移动预装包本身、包里系统写入的 Contents、Info.plist、PkgInfo 都拒绝，说明 Finder 风格', () => {
    for (const path of [safari, bundle('Safari.app', 'Contents'), infoPath('Safari.app'), pkgInfoPath('Safari.app')]) {
      expect(protectionViolation(owned, { kind: 'remove', path })).toBe(refused(path, 'removed'));
      expect(protectionViolation(owned, { kind: 'move', from: path, to: ['Users', 'prasenjit', 'x'] })).toBe(
        refused(path, 'moved')
      );
    }
  });

  it('删除或移走 /Applications 及更高的祖先（含卷根）会连带预装包，拒绝并说明「包含预装应用」', () => {
    expect(protectionViolation(owned, { kind: 'remove', path: ['Applications'] })).toBe(
      'The item “Applications” can’t be removed because it contains preinstalled applications.'
    );
    expect(protectionViolation(owned, { kind: 'move', from: ['Applications'], to: ['Users', 'x'] })).toBe(
      'The item “Applications” can’t be moved because it contains preinstalled applications.'
    );
    expect(protectionViolation(owned, { kind: 'remove', path: [] })).toBe(
      'The item “Macintosh HD” can’t be removed because it contains preinstalled applications.'
    );
    expect(protectionViolation(owned, { kind: 'move', from: safari.slice(0, 1), to: ['Elsewhere'] })).not.toBeNull();
  });

  it('覆盖受保护的文件（写入）拒绝，说明「不能被改动」', () => {
    for (const path of [infoPath('Safari.app'), pkgInfoPath('Safari.app'), bundle('Safari.app', 'Contents'), safari])
      expect(protectionViolation(owned, { kind: 'write', path })).toBe(
        `The item “${path.at(-1)}” can’t be changed because it’s part of a preinstalled application.`
      );
  });

  it('用户放进包里的文件可以写、删、移', () => {
    const mine = bundle('Safari.app', 'Contents', 'Resources', 'mine.txt');
    expect(protectionViolation(owned, { kind: 'write', path: mine })).toBeNull();
    expect(protectionViolation(owned, { kind: 'remove', path: mine })).toBeNull();
    expect(
      protectionViolation(owned, { kind: 'move', from: mine, to: bundle('Safari.app', 'renamed.txt') })
    ).toBeNull();
    expect(protectionViolation(owned, { kind: 'remove', path: bundle('Safari.app', 'readme.md') })).toBeNull();
  });

  it('移动的目标是受保护路径、或包含受保护路径的祖先时拒绝，说明「不能被替换」', () => {
    const source: DiskPath = ['Users', 'prasenjit', 'Desktop', 'Safari.app'];
    expect(protectionViolation(owned, { kind: 'move', from: source, to: safari })).toBe(
      '“Safari.app” can’t be replaced because it’s part of a preinstalled application.'
    );
    expect(protectionViolation(owned, { kind: 'move', from: source, to: infoPath('Safari.app') })).toBe(
      '“Info.plist” can’t be replaced because it’s part of a preinstalled application.'
    );
    expect(protectionViolation(owned, { kind: 'move', from: source, to: ['Applications'] })).toBe(
      '“Applications” can’t be replaced because it’s part of a preinstalled application.'
    );
  });

  it('不受保护的：同名的非包条目、复制到别处的包、无关目录，以及没有预装包时的一切', () => {
    for (const path of [
      bundle('Mail.app'),
      ['Users', 'prasenjit', 'Desktop', 'Safari.app'],
      ['Users'],
      ['Applications', 'Notes.app', 'readme.md']
    ]) {
      expect(protectionViolation(owned, { kind: 'remove', path })).toBeNull();
      expect(protectionViolation(owned, { kind: 'write', path })).toBeNull();
      expect(
        protectionViolation(owned, { kind: 'move', from: path, to: ['Users', 'prasenjit', 'Documents', 'x'] })
      ).toBeNull();
    }
    const nothing = new Map<string, string>();
    expect(protectionViolation(nothing, { kind: 'remove', path: ['Applications'] })).toBeNull();
    expect(protectionViolation(nothing, { kind: 'write', path: infoPath('Safari.app') })).toBeNull();
  });

  it('assertUnprotected：受保护时抛 EACCES（移动报源路径），放行时什么也不发生', () => {
    expect(() => assertUnprotected(owned, { kind: 'remove', path: safari })).toThrow(refused(safari, 'removed'));
    try {
      assertUnprotected(owned, { kind: 'move', from: safari, to: ['Users', 'x'] });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'DiskError',
        code: 'EACCES',
        path: safari,
        message: refused(safari, 'moved')
      });
    }
    expect(() => assertUnprotected(owned, { kind: 'write', path: ['Users', 'x'] })).not.toThrow();
  });
});
