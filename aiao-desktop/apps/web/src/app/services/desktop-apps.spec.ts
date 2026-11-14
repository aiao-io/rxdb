import { describe, expect, it } from 'vitest';

import { DESKTOP_CAPABILITIES } from '@aiao/orbit/desktop';
import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import {
  APP_CAPABILITIES,
  applicationManifests,
  assertManifests,
  defaultDockApps,
  DesktopAppManifest,
  DesktopAppManifests,
  grantedCapabilities,
  LAUNCH_ORDER,
  orbitAllow,
  runtimeOf,
  validateManifests,
  webAppOrigins
} from './desktop-apps';

/** 登记表要求的、与这些用例无关的共有字段。 */
const common = {
  bundleId: 'io.example.code',
  installScope: 'preinstalled',
  showInApplications: true,
  defaultPinned: false,
  dockRemovable: true
} as const;

const code = {
  id: 'code',
  name: 'Code',
  icon: 'app-code',
  kind: 'web',
  ...common,
  capabilities: ['clipboard:write'],
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
/** 只换入口字段，其余沿用 entry() 给的默认值。 */
const webOnly = (web: object) => ({ web: { ...code.web, ...web } });
/** 每个夹具项有自己的包标识，免得互相触发「包标识重复」。 */
const entry = (id: string, extra: object) => ({ ...code, bundleId: `io.example.${id}`, ...extra, id });
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
    expect(byKind('builtin')).toHaveLength(31);
  });

  it('Aiao Code 登记为单窗口的集成应用，指向线上地址，授予跨源隔离与剪贴板', () => {
    expect(DESKTOP_APP_MANIFESTS.vscode).toMatchObject({
      name: 'Aiao Code',
      icon: 'app-aiao-code',
      kind: 'web',
      web: { url: 'https://vscode.aiao.io/', readyTimeout: 60_000, frame: 'transparent' }
    });
    expect((DESKTOP_APP_MANIFESTS.vscode as DesktopAppManifest).single).toBeUndefined();
    expect(orbitAllow(DESKTOP_APP_MANIFESTS.vscode.web)).toBe('cross-origin-isolated; clipboard-read; clipboard-write');
  });

  it('不合规的登记逐项报出应用 id 与字段', () => {
    expect(validateManifests(misfiled)).toEqual(['mismatch.id：登记的 id 是 code，与登记键不一致']);
    const problems = validateManifests(
      table(
        entry('nameless', { name: ' ' }),
        entry('loose', { kind: 'builtin' }),
        entry('bare', { web: undefined }),
        { id: 'odd', name: 'Odd', icon: 'x', kind: 'plugin' },
        entry('plain', webOnly({ url: 'http://code.example.com/' })),
        entry('secret', webOnly({ url: 'https://user:secret@code.example.com/' })),
        entry('broken', webOnly({ url: 'not a url' })),
        entry('unversioned', webOnly({ version: '' })),
        entry('camera', { ...webOnly({ allow: ['camera'] }), capabilities: [] }),
        entry('twice', { ...webOnly({ allow: ['fullscreen', 'fullscreen'] }), capabilities: [] }),
        entry('instant', webOnly({ readyTimeout: 0 })),
        entry('forever', webOnly({ readyTimeout: 120_001 })),
        entry('fraction', webOnly({ readyTimeout: 1.5 })),
        entry('glass', webOnly({ frame: 'glass' }))
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
      'fraction.web.readyTimeout：必须是 1～120000 之间的整数毫秒',
      'glass.web.frame：只能是 standard 或 transparent'
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

describe('应用清单派生的视图（D-17）', () => {
  it('运行来源：系统入口没有；内置应用是组件；几猫3A大作是同源 HTML；Aiao Code 是远程应用', () => {
    expect(runtimeOf(DESKTOP_APP_MANIFESTS.launchpad)).toBeNull();
    expect(runtimeOf(DESKTOP_APP_MANIFESTS.finder)).toBe('builtin-component');
    expect(runtimeOf(DESKTOP_APP_MANIFESTS.saltline)).toBe('bundled-html');
    expect(runtimeOf(DESKTOP_APP_MANIFESTS.vscode)).toBe('remote-web');
  });

  it('出现在 Applications 的是可启动的预装应用：系统入口、Finder 与关于本机不在内，其余都在', () => {
    const shown = applicationManifests(DESKTOP_APP_MANIFESTS).map(app => app.id);
    expect(shown).not.toContain('launchpad');
    expect(shown).not.toContain('trash');
    expect(shown).not.toContain('finder');
    expect(shown).not.toContain('about');
    expect(shown).toEqual(expect.arrayContaining(['saltline', 'vscode', 'textedit', 'safari', 'settings']));
    for (const id of shown) expect(DESKTOP_APP_MANIFESTS[id].showInApplications).toBe(true);
    expect(shown).toHaveLength(Object.values(DESKTOP_APP_MANIFESTS).filter(app => app.showInApplications).length);
  });

  it('默认 Dock 的入口与顺序与硬编码数组时期一致（ADESK-US-205 阶段 C 的对照基线）', () => {
    expect(defaultDockApps(DESKTOP_APP_MANIFESTS)).toEqual({
      apps: [
        'finder',
        'launchpad',
        'safari',
        'mail',
        'messages',
        'maps',
        'photos',
        'notes',
        'calendar',
        'music',
        'terminal',
        'vscode',
        'calculator',
        'settings'
      ],
      trailing: ['trash']
    });
  });

  it('Finder 与系统入口固定在 Dock 里不可移除，其余固定项可以移除', () => {
    const fixed = Object.values(DESKTOP_APP_MANIFESTS).filter(app => app.defaultPinned && !app.dockRemovable);
    expect(fixed.map(app => app.id)).toEqual(['finder', 'launchpad', 'trash']);
  });

  it('包标识是稳定的反向域名，且互不重复；系统入口没有包标识', () => {
    const bundles = Object.values(DESKTOP_APP_MANIFESTS).flatMap(app => (app.kind === 'system' ? [] : [app.bundleId]));
    expect(new Set(bundles).size).toBe(bundles.length);
    for (const bundle of bundles) expect(bundle).toMatch(/^io\.aiao\.desktop\.[a-z0-9-]+$/);
    expect(DESKTOP_APP_MANIFESTS.settings.bundleId).toBe('io.aiao.desktop.system-settings');
    expect(DESKTOP_APP_MANIFESTS.saltline.entry).toBe('saltline.html');
  });

  it('展示与 Dock 位置不合规的登记逐项报出', () => {
    const problems = validateManifests(
      table(
        entry('twinA', { bundleId: 'io.example.same' }),
        entry('twinB', { bundleId: 'io.example.same' }),
        entry('badbundle', { bundleId: 'Not A Bundle' }),
        entry('badscope', { installScope: 'managed' }),
        entry('unordered', { defaultPinned: true }),
        entry('stray', { dockOrder: 3 }),
        entry('clash1', { defaultPinned: true, dockOrder: 7 }),
        entry('clash2', { defaultPinned: true, dockOrder: 7 }),
        entry('trailer', { defaultPinned: true, dockOrder: 7, dockZone: 'trailing' }),
        entry('zoneless', { dockZone: 'middle' }),
        entry('nohtml', { kind: 'builtin', web: undefined, runtime: 'bundled-html' }),
        entry('weirdhtml', { kind: 'builtin', web: undefined, runtime: 'bundled-html', entry: '../x.html' }),
        entry('strayentry', { kind: 'builtin', web: undefined, entry: 'x.html' }),
        entry('weirdruntime', { kind: 'builtin', web: undefined, runtime: 'remote-web' }),
        {
          id: 'sys',
          name: 'Sys',
          icon: 'x',
          kind: 'system',
          showInApplications: true,
          defaultPinned: false,
          dockRemovable: true
        },
        entry('flags', { showInApplications: 'yes', defaultPinned: 1, dockRemovable: 'no' })
      )
    );
    expect(problems).toEqual([
      'badbundle.bundleId：必须是形如 io.aiao.desktop.name 的反向域名标识',
      'badscope.installScope：只能是 preinstalled',
      'unordered.dockOrder：默认固定在 Dock 的应用必须登记整数顺序',
      'stray.dockOrder：没有默认固定在 Dock 就不该登记顺序',
      'zoneless.dockZone：只能是 apps 或 trailing',
      'nohtml.entry：同源 HTML 应用必须登记相对入口（例如 saltline.html）',
      'weirdhtml.entry：同源 HTML 应用必须登记相对入口（例如 saltline.html）',
      'strayentry.entry：只有 bundled-html 应用才有入口',
      'weirdruntime.runtime：内置应用只能是 builtin-component 或 bundled-html',
      'sys.showInApplications：系统入口不进 Applications',
      'sys.dockRemovable：系统入口不能从 Dock 移除',
      'flags.showInApplications：必须是布尔值',
      'flags.defaultPinned：必须是布尔值',
      'flags.dockRemovable：必须是布尔值',
      'flags.dockOrder：默认固定在 Dock 的应用必须登记整数顺序',
      'twinB.bundleId：与 twinA 重复',
      'clash2.dockOrder：与 clash1 在同一区域内重复'
    ]);
  });
});

describe('启动台与聚焦搜索的应用顺序', () => {
  it('LAUNCH_ORDER 恰好是全部非系统入口：登记了应用却忘了排进去（能打开但启动台里没有）会在这里失败', () => {
    const launchable = Object.values(DESKTOP_APP_MANIFESTS)
      .filter(app => app.kind !== 'system')
      .map(app => app.id);
    expect([...LAUNCH_ORDER].sort()).toEqual([...launchable].sort());
    expect(new Set(LAUNCH_ORDER).size).toBe(LAUNCH_ORDER.length);
  });
});

describe('清单的 capabilities（ADESK-US-206，默认拒绝）', () => {
  /** 一个集成应用：浏览器权限（allow）与清单能力（capabilities）各自给定。 */
  const web = (id: string, allow: readonly string[], capabilities?: unknown) =>
    entry(id, {
      ...webOnly({ allow }),
      ...(capabilities === undefined ? { capabilities: undefined } : { capabilities })
    });

  it('Aiao Code 只声明它现在实际用到的能力：窗口，以及与 allow 一致的剪贴板读写', () => {
    expect(DESKTOP_APP_MANIFESTS.vscode.capabilities).toEqual(['window', 'clipboard:read', 'clipboard:write']);
    expect(grantedCapabilities(DESKTOP_APP_MANIFESTS.vscode)).toEqual(['window', 'clipboard:read', 'clipboard:write']);
  });

  it('清单可声明的能力名与 Orbit 的能力协议逐项一致（桌面首屏不引入 Orbit 的桌面能力模块，靠这条断言防漂移）', () => {
    expect([...APP_CAPABILITIES]).toEqual([...DESKTOP_CAPABILITIES]);
  });

  it('没声明就是没授予：内置应用、系统入口与没有 capabilities 字段的应用都拿不到任何能力', () => {
    expect(grantedCapabilities(DESKTOP_APP_MANIFESTS.calculator)).toEqual([]);
    expect(grantedCapabilities(DESKTOP_APP_MANIFESTS.launchpad)).toEqual([]);
    expect(grantedCapabilities(web('plain', []) as unknown as DesktopAppManifest)).toEqual([]);
    const everything = Object.values(DESKTOP_APP_MANIFESTS).flatMap(app => grantedCapabilities(app));
    expect(new Set(everything)).toEqual(new Set(['window', 'clipboard:read', 'clipboard:write']));
  });

  it('capabilities 不合规逐项报出：不是数组、不认识的能力、重复、写外观没有同时读外观、系统入口不能声明', () => {
    const problems = validateManifests(
      table(
        web('shape', [], 'window'),
        web('unknown', [], ['teleport']),
        web('twice', [], ['window', 'window']),
        web('writer', [], ['appearance:write']),
        {
          id: 'sys',
          name: 'Sys',
          icon: 'x',
          kind: 'system',
          showInApplications: false,
          defaultPinned: false,
          dockRemovable: false,
          capabilities: ['window']
        },
        entry('builtin', { kind: 'builtin', web: undefined, capabilities: ['menu', 'appearance', 'appearance:write'] })
      )
    );
    expect(problems).toEqual([
      'shape.capabilities：必须是数组',
      'unknown.capabilities：teleport 不在允许清单（window、menu、app、appearance、appearance:write、notification、clipboard:read、clipboard:write、filesystem:read、filesystem:write）',
      'twice.capabilities：window 重复',
      'writer.capabilities：appearance:write 必须同时声明 appearance（写入是在读取之上另外授予的）',
      'sys.capabilities：系统入口不开窗口，不能声明能力'
    ]);
  });

  describe('两层权限一致（AC#15）：登记表 allow 与清单 capabilities 对 clipboard 的声明', () => {
    const pairs = [
      ['clipboard-read', 'clipboard:read'],
      ['clipboard-write', 'clipboard:write']
    ] as const;

    it('两层一致的两种情形通过：都授、都不授', () => {
      for (const [permission, capability] of pairs) {
        expect(validateManifests(table(web('both', [permission], [capability])))).toEqual([]);
        expect(validateManifests(table(web('neither', ['fullscreen'], ['window'])))).toEqual([]);
      }
      expect(
        validateManifests(
          table(web('all', ['clipboard-read', 'clipboard-write'], ['clipboard:read', 'clipboard:write']))
        )
      ).toEqual([]);
    });

    it('只授一层的登记逐项报出应用与能力，桌面启动即失败', () => {
      for (const [permission, capability] of pairs) {
        expect(validateManifests(table(web('browseronly', [permission], ['window'])))).toEqual([
          `browseronly.capabilities：登记表 allow 授予了 ${permission}，但清单 capabilities 没有声明 ${capability}（两层必须一致）`
        ]);
        expect(validateManifests(table(web('manifestonly', ['fullscreen'], [capability])))).toEqual([
          `manifestonly.web.allow：清单 capabilities 声明了 ${capability}，但登记表 allow 没有授予 ${permission}（两层必须一致）`
        ]);
      }
      expect(validateManifests(table(web('swapped', ['clipboard-read'], ['clipboard:write'])))).toEqual([
        'swapped.capabilities：登记表 allow 授予了 clipboard-read，但清单 capabilities 没有声明 clipboard:read（两层必须一致）',
        'swapped.web.allow：清单 capabilities 声明了 clipboard:write，但登记表 allow 没有授予 clipboard-write（两层必须一致）'
      ]);
      expect(() => assertManifests(table(web('lopsided', ['clipboard-write'], [])))).toThrow(
        /应用登记表不合规[\s\S]*lopsided\.capabilities[\s\S]*clipboard-write[\s\S]*clipboard:write/
      );
    });

    it('没有浏览器权限层的应用（内置、同源 HTML）声明剪贴板能力不受这条一致性约束', () => {
      const builtin = entry('plain', {
        kind: 'builtin',
        web: undefined,
        capabilities: ['clipboard:read', 'clipboard:write']
      });
      expect(validateManifests(table(builtin))).toEqual([]);
    });
  });
});
