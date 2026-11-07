import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { MenuNode } from '../../layout/menu.js';
import { createTestShell } from '../../testing.js';
import { pickThemes } from '../../theme/themes.js';

const menu: MenuNode<string>[] = [
  {
    id: 'entities',
    label: '实体',
    children: [
      { id: 'asset', label: '资产', route: '/entities/assets/Asset' },
      { id: 'category', label: '资产分类', route: '/entities/assets/AssetCategory' }
    ]
  },
  { id: 'search', label: '搜索', route: '/search' }
];

const create = (overrides: Parameters<typeof createTestShell<string>>[0] = {}, windowOptions = {}) =>
  createTestShell<string>({ menu, brand: { title: '工作台' }, ...overrides }, windowOptions);

describe('createAdminShell', () => {
  it.each(['Mars/Base', 'Asia/NotAZone'])('导入非法时区 %s 后仍能读取偏好抽屉和格式化时间', timezone => {
    const { shell } = create();
    try {
      expect(shell.preferences.importJson(JSON.stringify({ app: { timezone } }))).toEqual({ ok: true });
      expect(shell.preferences.value.app.timezone).toBe('');
      expect(() => shell.drawer.value).not.toThrow();
      expect(() => shell.formatDate(new Date())).not.toThrow();
    } finally {
      shell.destroy();
    }
  });

  it('导入不在常用选项里的有效时区仍保留原值', () => {
    const { shell } = create();
    try {
      shell.preferences.importJson(JSON.stringify({ app: { timezone: 'Indian/Mahe' } }));
      expect(shell.preferences.value.app.timezone).toBe('Indian/Mahe');
      expect(() => shell.drawer.value).not.toThrow();
      expect(() => shell.formatDate(new Date())).not.toThrow();
    } finally {
      shell.destroy();
    }
  });

  it('品牌与首页标题按宿主目录翻译，已有页面标题保留当前语言品牌', async () => {
    const i18n = new I18n({
      locale: 'zh-Hans',
      catalogs: [
        { locale: 'zh-Hans', namespace: 'app', messages: { brand: '工作台', title: '数据工作台' } },
        { locale: 'en', namespace: 'app', messages: { brand: 'Workbench', title: 'Data workbench' } }
      ]
    });
    const { shell, fakeDocument } = create({
      i18n,
      brand: { title: '工作台', titleKey: 'brand', documentTitleKey: 'title' }
    });
    shell.attach();
    try {
      expect(fakeDocument.document.title).toBe('数据工作台');
      await i18n.setLocale('en');
      expect(shell.brandTitle).toBe('Workbench');
      expect(fakeDocument.document.title).toBe('Data workbench');
      shell.syncRoute('/search');
      expect(fakeDocument.document.title).toBe('搜索 · Workbench');
    } finally {
      shell.destroy();
      i18n.destroy();
    }
  });

  describe('路由同步与页签', () => {
    it('返回不在菜单中的首页后取消页签高亮，关闭快捷键不再操作旧页面', () => {
      const { shell, fakeWindow, navigated } = create();
      shell.attach();
      try {
        shell.syncRoute('/search');
        shell.syncRoute('/');
        expect(shell.tabs.value.activeKey).toBeNull();
        fakeWindow.press({ key: 'w', code: 'KeyW', altKey: true });
        expect(shell.tabs.value.tabs.map(tab => tab.key)).toEqual(['/search']);
        expect(navigated).toEqual([]);
        shell.syncRoute('/search?query=asset');
        expect(shell.tabs.value.activeKey).toBe('/search');
        expect(shell.tabs.value.tabs[0].url).toBe('/search?query=asset');
      } finally {
        shell.destroy();
      }
    });

    it('菜单里的页面打开页签并以菜单标题命名；不在菜单里的地址不开页签', () => {
      const { shell } = create();
      shell.syncRoute('/entities/assets/Asset');
      shell.syncRoute('/unknown');
      expect(shell.currentUrl.value).toBe('/unknown');
      expect(shell.tabs.value.tabs.map(tab => tab.title)).toEqual(['资产']);
    });

    it('路由变化收起移动端抽屉', () => {
      const { shell } = create();
      shell.ui.setDrawer(true);
      shell.syncRoute('/search');
      expect(shell.ui.value.drawerOpen).toBe(false);
    });

    it('关闭当前页签：跳到最近访问的页签；关闭最后一个回到首页', () => {
      const { shell, navigated } = create({ homeUrl: '/start' });
      shell.syncRoute('/search');
      shell.syncRoute('/entities/assets/Asset');
      shell.closeTab('/entities/assets/Asset');
      expect(navigated).toEqual(['/search']);
      shell.syncRoute('/search');
      shell.closeTab('/search');
      expect(navigated).toEqual(['/search', '/start']);
    });

    it('关闭非当前页签不触发跳转', () => {
      const { shell, navigated } = create();
      shell.syncRoute('/search');
      shell.syncRoute('/entities/assets/Asset');
      shell.closeTab('/search');
      expect(navigated).toEqual([]);
    });

    it('closeOthers / closeLeft / closeRight / closeAll / activate / 新窗口', () => {
      const { shell, navigated, fakeWindow } = create();
      shell.syncRoute('/entities/assets/Asset');
      shell.syncRoute('/entities/assets/AssetCategory');
      shell.syncRoute('/search');
      shell.closeLeftTabs('/entities/assets/AssetCategory');
      expect(shell.tabs.value.tabs.map(tab => tab.key)).toEqual(['/entities/assets/AssetCategory', '/search']);
      shell.activateTab('/entities/assets/AssetCategory');
      expect(navigated.at(-1)).toBe('/entities/assets/AssetCategory');
      shell.activateTab('/missing');
      expect(navigated).toHaveLength(1);
      shell.openTabInNewWindow('/search');
      shell.openTabInNewWindow('/missing');
      expect(fakeWindow.opened).toEqual(['/search']);
      shell.closeRightTabs('/entities/assets/AssetCategory');
      expect(shell.tabs.value.tabs).toHaveLength(1);
      shell.closeOtherTabs('/entities/assets/AssetCategory');
      shell.syncRoute('/entities/assets/AssetCategory');
      shell.closeAllTabs();
      expect(navigated.at(-1)).toBe('/');
    });

    it('setMenu 更新菜单并按新标题重命名已有页签', () => {
      const { shell } = create();
      shell.syncRoute('/search');
      shell.setMenu([{ id: 'search', label: 'Search', route: '/search' }]);
      expect(shell.tabs.value.tabs[0].title).toBe('Search');
      expect(shell.menu.value).toHaveLength(1);
    });
  });

  describe('快捷键', () => {
    it('Ctrl+K 切换命令面板，Ctrl+, 打开偏好抽屉，Alt+L 锁屏', () => {
      const { shell, fakeWindow } = create();
      shell.attach();
      expect(fakeWindow.press({ key: 'k', ctrlKey: true }).prevented).toBe(true);
      expect(shell.palette.value.open).toBe(true);
      fakeWindow.press({ key: 'k', ctrlKey: true });
      expect(shell.palette.value.open).toBe(false);
      fakeWindow.press({ key: ',', ctrlKey: true });
      expect(shell.ui.value.preferencesOpen).toBe(true);
      fakeWindow.press({ key: '¬', code: 'KeyL', altKey: true });
      expect(shell.lock.locked.value).toBe(true);
    });

    it('锁屏期间内置快捷键全部不响应', () => {
      const { shell, fakeWindow } = create();
      shell.attach();
      shell.lock.lock();
      fakeWindow.press({ key: 'k', ctrlKey: true });
      fakeWindow.press({ key: ',', ctrlKey: true });
      expect(shell.palette.value.open).toBe(false);
      expect(shell.ui.value.preferencesOpen).toBe(false);
    });

    it('mac 上 Cmd+K 生效，Ctrl+K 不生效', () => {
      const { shell, fakeWindow } = create({}, { platform: 'MacIntel' });
      shell.attach();
      fakeWindow.press({ key: 'k', ctrlKey: true });
      expect(shell.palette.value.open).toBe(false);
      fakeWindow.press({ key: 'k', metaKey: true });
      expect(shell.palette.value.open).toBe(true);
    });

    it('Ctrl+B 桌面折叠侧栏，移动端开关抽屉', () => {
      const { shell, fakeWindow } = create();
      shell.attach();
      fakeWindow.press({ key: 'b', ctrlKey: true });
      expect(shell.preferences.value.sidebar.collapsed).toBe(true);
      fakeWindow.press({ key: 'b', ctrlKey: true });
      expect(shell.preferences.value.sidebar.collapsed).toBe(false);
      fakeWindow.setMobile(true);
      fakeWindow.press({ key: 'b', ctrlKey: true });
      expect(shell.ui.value.drawerOpen).toBe(true);
      expect(shell.preferences.value.sidebar.collapsed).toBe(false);
    });

    it('Alt+W 关闭当前页签', () => {
      const { shell, fakeWindow, navigated } = create();
      shell.attach();
      shell.syncRoute('/search');
      shell.syncRoute('/entities/assets/Asset');
      fakeWindow.press({ key: '∑', code: 'KeyW', altKey: true });
      expect(shell.tabs.value.tabs.map(tab => tab.key)).toEqual(['/search']);
      expect(navigated).toEqual(['/search']);
    });

    it('内置快捷键出现在注册列表里并可单独关闭', () => {
      const { shell, fakeWindow } = create();
      shell.attach();
      expect(shell.shortcuts.list.value.map(info => info.id)).toEqual([
        'palette',
        'preferences',
        'lock',
        'toggleSidebar',
        'closeTab'
      ]);
      shell.shortcuts.setEnabled('palette', false);
      fakeWindow.press({ key: 'k', ctrlKey: true });
      expect(shell.palette.value.open).toBe(false);
    });

    it('detach 之后不再响应键盘', () => {
      const { shell, fakeWindow } = create();
      const detach = shell.attach();
      detach();
      expect(fakeWindow.listenerCount('keydown')).toBe(0);
      fakeWindow.press({ key: 'k', ctrlKey: true });
      expect(shell.palette.value.open).toBe(false);
    });
  });

  describe('命令面板', () => {
    it('内置菜单来源：副标题是分组，选择后跳转并记录最近使用', async () => {
      const { shell, navigated } = create();
      shell.palette.open();
      shell.palette.setQuery('资产分类');
      const entry = shell.palette.value.groups[0].entries[0];
      expect(entry.item.label).toBe('资产分类');
      expect(entry.item.sublabel).toBe('实体');
      await shell.palette.select();
      expect(navigated).toEqual(['/entities/assets/AssetCategory']);
    });

    it('内置命令：切换主题 / 打开偏好 / 折叠侧栏', async () => {
      const { shell } = create();
      shell.palette.open();
      shell.palette.setQuery('切换主题');
      await shell.palette.select();
      expect(shell.preferences.value.theme.name).toBe('light');
      shell.palette.open();
      shell.palette.setQuery('打开偏好');
      await shell.palette.select();
      expect(shell.ui.value.preferencesOpen).toBe(true);
    });

    it('英文关键词也能命中中文命令', () => {
      const { shell } = create();
      shell.palette.open();
      shell.palette.setQuery('fullscreen');
      expect(shell.palette.value.groups.flatMap(group => group.entries).map(entry => entry.item.id)).toContain(
        'command:fullscreen'
      );
    });

    it('应用注册的命令出现在面板里，id 重复立即报错，注销后消失', async () => {
      const { shell } = create();
      const run = vi.fn();
      const unregister = shell.registerCommand({ id: 'sync', label: '立即同步', run });
      expect(() => shell.registerCommand({ id: 'sync', label: 'x', run })).toThrow(/already registered/);
      shell.palette.open();
      shell.palette.setQuery('立即同步');
      await shell.palette.select();
      expect(run).toHaveBeenCalledOnce();
      unregister();
      shell.palette.open();
      shell.palette.setQuery('立即同步');
      expect(shell.palette.value.total).toBe(0);
    });

    it('没有菜单时菜单来源为空', () => {
      const { shell } = create({ menu: [] });
      shell.palette.open();
      shell.palette.setQuery('资产');
      expect(shell.palette.value.groups.map(group => group.id)).not.toContain('menu');
    });
  });

  describe('attach：绑定浏览器', () => {
    it('写入主题、过渡名与布局变量，随偏好变化，detach 后清除', () => {
      const { shell, fakeDocument } = create();
      const detach = shell.attach();
      expect(fakeDocument.attributes.get('data-theme')).toBe('light');
      expect(fakeDocument.attributes.get('data-transition')).toBe('fade-slide');
      expect(fakeDocument.styles.get('--admin-sidebar-width')).toBe('240px');
      expect(fakeDocument.styles.get('--admin-header-height')).toBe('56px');
      shell.preferences.update({
        theme: { name: 'dark', colorPrimary: '#7c3aed', fontSize: 18 },
        app: { compact: true }
      });
      expect(fakeDocument.attributes.get('data-theme')).toBe('dark');
      expect(fakeDocument.attributes.get('data-compact')).toBe('true');
      expect(fakeDocument.styles.get('--color-primary')).toBe('#7c3aed');
      expect(fakeDocument.styles.get('font-size')).toBe('18px');
      expect(fakeDocument.styles.get('--admin-header-height')).toBe('44px');
      shell.preferences.update({ theme: { colorPrimary: '' } });
      expect(fakeDocument.styles.has('--color-primary')).toBe(false);
      detach();
      expect(fakeDocument.attributes.size).toBe(0);
      expect(fakeDocument.styles.size).toBe(0);
    });

    it('文档语言随外壳语言同步，detach 后恢复宿主原来的值', async () => {
      const { shell, fakeDocument } = create();
      fakeDocument.attributes.set('lang', 'zh-CN');
      const detach = shell.attach();
      expect(fakeDocument.attributes.get('lang')).toBe('zh-Hans');
      shell.preferences.update({ app: { locale: 'en' } });
      await vi.waitFor(() => expect(fakeDocument.attributes.get('lang')).toBe('en'));
      detach();
      expect(fakeDocument.attributes.get('lang')).toBe('zh-CN');
    });

    it('宿主文档原本没有 lang 时，detach 后移除外壳写入的 lang', () => {
      const { shell, fakeDocument } = create();
      const detach = shell.attach();
      expect(fakeDocument.attributes.get('lang')).toBe('zh-Hans');
      detach();
      expect(fakeDocument.attributes.has('lang')).toBe(false);
    });

    it('attach 幂等', () => {
      const { shell, fakeWindow } = create();
      const first = shell.attach();
      expect(shell.attach()).toBe(first);
      expect(fakeWindow.listenerCount('keydown')).toBe(1);
    });

    it('system 主题跟随系统明暗', () => {
      const { shell, fakeDocument, fakeWindow } = create();
      shell.attach();
      expect(fakeDocument.attributes.get('data-theme')).toBe('light');
      fakeWindow.setSystemDark(true);
      expect(fakeDocument.attributes.get('data-theme')).toBe('dark');
      expect(shell.theme.isDark.value).toBe(true);
      shell.theme.set('light');
      expect(fakeDocument.attributes.get('data-theme')).toBe('light');
      expect(shell.theme.isDark.value).toBe(false);
    });

    it('动态标题：当前页面的菜单标题 + 应用名；关闭后恢复原标题', () => {
      const { shell, fakeDocument } = create();
      shell.attach();
      expect(fakeDocument.document.title).toBe('App');
      shell.syncRoute('/search');
      expect(fakeDocument.document.title).toBe('搜索 · 工作台');
      shell.syncRoute('/unknown');
      expect(fakeDocument.document.title).toBe('App');
      shell.syncRoute('/search');
      shell.preferences.update({ app: { dynamicTitle: false } });
      expect(fakeDocument.document.title).toBe('App');
    });

    it('语言偏好应用到运行时；空串不干预', async () => {
      const { shell } = create();
      shell.attach();
      expect(shell.i18n.locale).toBe('zh-Hans');
      shell.preferences.update({ app: { locale: 'en' } });
      await vi.waitFor(() => expect(shell.i18n.locale).toBe('en'));
      expect(shell.t('prefs.title')).toBe('Preferences');
      shell.preferences.update({ app: { locale: '' } });
      expect(shell.i18n.locale).toBe('en');
    });

    it('语言切换后已有页签标题随菜单重新解析', async () => {
      const { shell } = create();
      shell.attach();
      shell.syncRoute('/search');
      shell.setMenu([{ id: 'search', label: 'Search', route: '/search' }]);
      expect(shell.tabs.value.tabs[0].title).toBe('Search');
      await shell.i18n.setLocale('en');
      expect(shell.tabs.value.tabs[0].title).toBe('Search');
    });

    it('没有宿主（SSR）时 attach 不抛错', () => {
      const shell = createTestShell({ host: {} }).shell;
      expect(() => shell.attach()()).not.toThrow();
    });
  });

  describe('派生状态', () => {
    it('layout 随偏好、视口和菜单变化', () => {
      const { shell, fakeWindow } = create();
      expect(shell.layout.value.mode).toBe('sidebar-nav');
      expect(shell.layout.value.showSidebar).toBe(true);
      fakeWindow.setMobile(true);
      expect(shell.isMobile.value).toBe(true);
      expect(shell.layout.value.sidebarDrawer).toBe(true);
      shell.setMenu([]);
      expect(shell.layout.value.showSidebar).toBe(false);
    });

    it('内容最大化隐藏顶栏', () => {
      const { shell } = create();
      shell.ui.toggleMaximize();
      expect(shell.layout.value.showHeader).toBe(false);
    });

    it('面包屑可带首页项', () => {
      const { shell } = create();
      shell.syncRoute('/entities/assets/Asset');
      expect(shell.breadcrumb.value.map(item => item.label)).toEqual(['实体', '资产']);
      shell.preferences.update({ breadcrumb: { showHome: true } });
      expect(shell.breadcrumb.value.map(item => item.label)).toEqual(['首页', '实体', '资产']);
    });

    it('顶栏部件按顺序并去掉隐藏项', () => {
      const { shell } = create();
      expect(shell.widgets.value[0]).toBe('search');
      shell.preferences.update({ widget: { hidden: ['lock', 'timezone'] } });
      expect(shell.widgets.value).not.toContain('lock');
      expect(shell.widgets.value).not.toContain('timezone');
    });

    it('水印：启用后用默认文案（应用名），显式内容优先', () => {
      const { shell } = create();
      expect(shell.watermark.value).toBe('');
      shell.preferences.update({ app: { watermark: true } });
      expect(decodeURIComponent(shell.watermark.value)).toContain('工作台');
      shell.preferences.update({ app: { watermarkContent: '机密' } });
      expect(decodeURIComponent(shell.watermark.value)).toContain('机密');
    });

    it('时区：偏好优先，空串回退浏览器；formatDate 按时区格式化', () => {
      const { shell } = create();
      shell.preferences.update({ app: { timezone: 'Asia/Tokyo' } });
      expect(shell.timezone.value).toBe('Asia/Tokyo');
      expect(
        shell.formatDate(new Date('2026-01-15T00:00:00Z'), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      ).toBe('09:00');
      shell.preferences.update({ app: { timezone: '' } });
      expect(shell.timezone.value).toMatch(/\S/);
    });

    it('抽屉模型：随偏好变化，写入回到偏好；语言选项来自运行时', () => {
      const { shell } = create();
      const compact = shell.drawer.value[0].sections.flatMap(s => s.rows).find(row => row.path === 'app.compact');
      expect(compact?.value).toBe(false);
      compact?.set(true);
      expect(shell.preferences.value.app.compact).toBe(true);
      const locale = shell.drawer.value
        .flatMap(tab => tab.sections)
        .flatMap(section => section.rows)
        .find(row => row.path === 'app.locale');
      expect(locale?.control).toMatchObject({ kind: 'select' });
      expect((locale?.control as { options: { value: string; label: string }[] }).options.map(o => o.value)).toEqual([
        '',
        'en',
        'zh-Hans'
      ]);
    });

    it('扩展偏好出现在「拓展」页签并写入 extension', () => {
      const { shell } = create({
        extensions: [
          { key: 'tablePageSize', type: 'number', defaultValue: 20, min: 10, max: 100, step: 10, label: '每页行数' }
        ]
      });
      const row = shell.drawer.value[4].sections[0].rows[0];
      expect(row).toMatchObject({ label: '每页行数', value: 20 });
      row.set(50);
      expect(shell.preferences.value.extension['tablePageSize']).toBe(50);
    });

    it('text 修订号随语言变化', async () => {
      const { shell } = create();
      const before = shell.text.value;
      const listener = vi.fn();
      shell.text.subscribe(listener);
      await shell.i18n.setLocale('en');
      expect(shell.text.value).toBeGreaterThan(before);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('主题控制', () => {
    it('cycle：system → 浅色 → 深色 → system', () => {
      const { shell } = create();
      const seen = [shell.preferences.value.theme.name];
      for (let i = 0; i < 3; i += 1) {
        shell.theme.cycle();
        seen.push(shell.preferences.value.theme.name);
      }
      expect(seen).toEqual(['system', 'light', 'dark', 'system']);
    });

    it('label：浅色 / 深色 / 跟随系统走翻译，其余主题首字母大写', () => {
      const { shell } = create({ themes: pickThemes(['light', 'dark', 'cupcake']) });
      expect(shell.theme.label('system')).toBe('跟随系统');
      expect(shell.theme.label('dark')).toBe('深色');
      expect(shell.theme.label('cupcake')).toBe('Cupcake');
      expect(shell.theme.options.map(theme => theme.name)).toEqual(['light', 'dark', 'cupcake']);
    });

    it('偏好里不在可选主题内的名字被清洗回 system', () => {
      const { shell } = create();
      shell.preferences.setPath('theme.name', 'cupcake');
      expect(shell.preferences.value.theme.name).toBe('system');
    });
  });

  describe('存储与生命周期', () => {
    it('storagePrefix 隔离同源多应用的键', () => {
      const { shell, local } = create({ storagePrefix: 'my.app' });
      shell.preferences.update({ app: { compact: true } });
      shell.preferences.flush();
      shell.lock.lock();
      expect(local.getItem('my.app.preferences')).not.toBeNull();
      expect(local.getItem('my.app.lock')).toBe('1');
      expect(local.getItem('aiao.admin.preferences')).toBeNull();
    });

    it('应用默认值覆盖包内默认值', () => {
      const { shell } = create({ defaults: { app: { layout: 'header-nav' }, footer: { enable: true } } });
      expect(shell.preferences.value.app.layout).toBe('header-nav');
      expect(shell.layout.value.showFooter).toBe(true);
    });

    it('migrateLegacy 在首次使用时并入旧键', () => {
      const { shell } = create({ migrateLegacy: () => ({ sidebar: { collapsed: true } }) });
      expect(shell.preferences.value.sidebar.collapsed).toBe(true);
    });

    it('destroy 落盘并移除全部监听', () => {
      const { shell, fakeWindow, local } = create();
      shell.attach();
      shell.preferences.update({ app: { compact: true } });
      shell.destroy();
      expect(local.getItem('aiao.admin.preferences')).not.toBeNull();
      expect(fakeWindow.listenerCount('keydown')).toBe(0);
      expect(fakeWindow.listenerCount('storage')).toBe(0);
      expect(fakeWindow.listenerCount('pagehide')).toBe(0);
    });

    it('初始地址：显式传入优先，其次窗口地址', () => {
      expect(create({ initialUrl: '/search' }).shell.currentUrl.value).toBe('/search');
      expect(create({}, { pathname: '/entities/assets/Asset' }).shell.currentUrl.value).toBe('/entities/assets/Asset');
    });
  });
});
