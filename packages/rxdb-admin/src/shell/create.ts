import { createAdminI18n, translateAdmin } from '../i18n/index.js';
import { deriveLayout } from '../layout/layout-state.js';
import { buildBreadcrumb, menuTitleOf, type MenuNode } from '../layout/menu.js';
import { ShellUi } from '../layout/ui-state.js';
import { createMediaQueryStore, type MatchMedia } from '../media.js';
import { PaletteController } from '../palette/controller.js';
import { defaultPreferences } from '../preferences/defaults.js';
import { buildDrawerModel } from '../preferences/drawer-model.js';
import { applyPatch } from '../preferences/merge.js';
import { BUILTIN_PREFERENCE_ITEMS, deriveConstraints, extensionToItem } from '../preferences/schema/index.js';
import { PreferencesStore, type PreferencesHost } from '../preferences/store.js';
import { detectPlatform } from '../shortcuts/combo.js';
import { ShortcutRegistry } from '../shortcuts/registry.js';
import { createWebStorage } from '../storage.js';
import { Store, derive, type ReadableStore } from '../store.js';
import { tabKeyOf } from '../tabs/tabs-ops.js';
import { TabsStore } from '../tabs/tabs-store.js';
import { computeRootAttributes, computeThemeStyle } from '../theme/style.js';
import { createSystemDarkStore } from '../theme/system-theme.js';
import { nextThemeName, pickThemes, resolveThemeName, themeDisplayName } from '../theme/themes.js';
import { FullscreenController } from '../widgets/fullscreen.js';
import { LockController } from '../widgets/lock.js';
import { formatInTimezone, resolveTimezone, timezoneOptions } from '../widgets/timezone.js';
import { resolveWatermarkContent, watermarkBackground } from '../widgets/watermark.js';
import { visibleWidgets } from '../widgets/widget-order.js';
import { builtinCommands, commandSource, menuSource, registerBuiltinShortcuts } from './builtins.js';
import { computeLayoutVars, createRootBinding } from './root-binding.js';
import type { AdminShell, AdminShellOptions, ShellCommand } from './types.js';

const DEFAULT_PREFIX = 'aiao.admin';
const DEFAULT_BREAKPOINT = 768;

const hostListeners = (win: Window): PreferencesHost => ({
  addEventListener: (type, listener) => win.addEventListener(type, listener as unknown as EventListener),
  removeEventListener: (type, listener) => win.removeEventListener(type, listener as unknown as EventListener)
});

const localeLabel = (locale: string): string =>
  new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;

/**
 * 创建后台外壳运行时。
 *
 * @remarks
 * 外壳与路由库、UI 框架无关：应用在路由变化后调用 `syncRoute`，在 `navigate` 回调里调用路由器。
 * 创建后调用 `attach()` 绑定浏览器（建议在首次渲染之前，避免主题闪烁）。
 * @param options - 外壳选项。
 * @returns 外壳运行时。
 */
export function createAdminShell<TIcon = unknown>(options: AdminShellOptions<TIcon>): AdminShell<TIcon> {
  const win = options.host ? options.host.window : (globalThis as { window?: Window }).window;
  const doc = options.host ? options.host.document : (globalThis as { document?: Document }).document;
  const prefix = options.storagePrefix ?? DEFAULT_PREFIX;
  const local = options.storage?.local ?? createWebStorage('local', win ?? {});
  const session = options.storage?.session ?? createWebStorage('session', win ?? {});
  const themes = options.themes ?? pickThemes(['light', 'dark']);
  const extensions = options.extensions ?? [];
  const items = [...BUILTIN_PREFERENCE_ITEMS, ...extensions.map(extensionToItem)];
  const homeUrl = options.homeUrl ?? '/';
  const brandTitle = options.brand?.title ?? 'Admin';
  const i18n = options.i18n ?? createAdminI18n();
  const t = (key: string, params?: Record<string, unknown>): string => translateAdmin(i18n, key, params);

  const preferences = new PreferencesStore({
    storage: local,
    storageKey: `${prefix}.preferences`,
    defaults: applyPatch(defaultPreferences, options.defaults),
    constraints: deriveConstraints(
      BUILTIN_PREFERENCE_ITEMS,
      themes.map(theme => theme.name)
    ),
    extensions,
    ...(options.migrateLegacy ? { migrateLegacy: options.migrateLegacy } : {}),
    ...(win ? { host: hostListeners(win) } : {})
  });
  const ui = new ShellUi();
  const menu = new Store<readonly MenuNode<TIcon>[]>(options.menu ?? []);
  const currentUrl = new Store(options.initialUrl ?? win?.location?.pathname ?? homeUrl);
  const matchMedia: MatchMedia | undefined = win?.matchMedia?.bind(win);
  const viewport = createMediaQueryStore(
    matchMedia,
    `(max-width: ${options.mobileBreakpoint ?? DEFAULT_BREAKPOINT}px)`
  );
  const systemDark = createSystemDarkStore(matchMedia);
  const text: ReadableStore<number> = {
    get value() {
      return i18n.changes$.value;
    },
    changes$: i18n.changes$,
    subscribe(listener) {
      let first = true;
      const subscription = i18n.changes$.subscribe(value => {
        if (first) first = false;
        else listener(value);
      });
      return () => subscription.unsubscribe();
    }
  };

  const layout = derive([preferences, viewport.store, ui, menu], (prefs, isMobile, uiState, nodes) =>
    deriveLayout({ prefs, isMobile, maximized: uiState.maximized, hasMenu: nodes.length > 0 })
  );
  const resolvedTheme = derive([preferences, systemDark.store], (prefs, dark) =>
    resolveThemeName(prefs.theme.name, dark, themes)
  );
  const isDark = derive([resolvedTheme], name => themes.find(theme => theme.name === name)?.dark ?? false);
  const breadcrumb = derive([menu, currentUrl, preferences, text], (nodes, url, prefs) =>
    buildBreadcrumb(
      nodes,
      url,
      prefs.breadcrumb.showHome ? { id: 'home', label: t('layout.home'), route: homeUrl } : undefined
    )
  );
  const widgets = derive([preferences], prefs => visibleWidgets(prefs.widget));
  const timezone = derive([preferences], prefs => resolveTimezone(prefs.app.timezone));
  const watermark = derive([preferences, text], prefs =>
    prefs.app.watermark ? watermarkBackground(resolveWatermarkContent(prefs.app.watermarkContent, brandTitle)) : ''
  );
  const drawer = derive([preferences, text], prefs =>
    buildDrawerModel({
      prefs,
      items,
      translate: key => t(key),
      write: (path, value) => preferences.setPath(path, value),
      sources: {
        themes: [],
        locales: [
          { value: '', labelKey: 'prefs.option.app.locale.system' },
          ...i18n.availableLocales.map(locale => ({ value: locale, label: localeLabel(locale) }))
        ],
        timezones: timezoneOptions(prefs.app.timezone, new Date())
      }
    })
  );

  const tabs = new TabsStore({
    config: derive([preferences], prefs => ({
      persist: prefs.tabbar.persist,
      maxCount: prefs.tabbar.maxCount,
      visitHistory: prefs.tabbar.visitHistory
    })),
    storages: { session, local },
    storageKey: `${prefix}.tabs`
  });
  const shortcuts = new ShortcutRegistry({ preferences, platform: detectPlatform(win?.navigator) });
  const palette = new PaletteController({ preferences, storage: local, recentsKey: `${prefix}.palette.recents` });
  const lock = new LockController({
    storage: local,
    stateKey: `${prefix}.lock`,
    passwordKey: `${prefix}.lock.password`,
    ...(options.lockHasher ? { hasher: options.lockHasher } : {}),
    ...(win ? { host: hostListeners(win) } : {})
  });
  const fullscreen = new FullscreenController(doc);
  const customCommands = new Map<string, ShellCommand>();

  const closeOutcome = (next: string | null | undefined): void => {
    if (next !== undefined) options.navigate(next ?? homeUrl);
  };

  const shell: AdminShell<TIcon> = {
    preferences,
    ui,
    menu,
    currentUrl,
    layout,
    isMobile: viewport.store,
    breadcrumb,
    widgets,
    drawer,
    watermark,
    timezone,
    text,
    brandTitle,
    homeUrl,
    i18n,
    theme: {
      options: themes,
      resolved: resolvedTheme,
      isDark,
      darkName: (themes.find(theme => theme.name === 'dark') ?? themes.find(theme => theme.dark))?.name,
      set: name => preferences.setPath('theme.name', name),
      cycle: () => shell.theme.set(nextThemeName(preferences.value.theme.name, themes)),
      label: name => themeDisplayName(name, key => t(key))
    },
    shortcuts,
    tabs,
    palette,
    lock,
    fullscreen,
    t,
    syncRoute: url => {
      currentUrl.set(url);
      const title = menuTitleOf(menu.value, url);
      if (title !== undefined) tabs.open(url, title);
      ui.setDrawer(false);
    },
    navigate: url => options.navigate(url),
    setMenu: nodes => {
      menu.set(nodes);
      tabs.retitle(url => menuTitleOf(nodes, url));
    },
    registerCommand: command => {
      if (customCommands.has(command.id)) throw new Error(`Command "${command.id}" is already registered`);
      customCommands.set(command.id, command);
      return () => void customCommands.delete(command.id);
    },
    activateTab: key => {
      const tab = tabs.value.tabs.find(candidate => candidate.key === key);
      if (tab) options.navigate(tab.url);
    },
    closeTab: key => closeOutcome(tabs.close(key)),
    closeOtherTabs: key => closeOutcome(tabs.closeOthers(key)),
    closeLeftTabs: key => closeOutcome(tabs.closeLeft(key)),
    closeRightTabs: key => closeOutcome(tabs.closeRight(key)),
    closeAllTabs: () => closeOutcome(tabs.closeAll()),
    openTabInNewWindow: key => {
      const tab = tabs.value.tabs.find(candidate => candidate.key === tabKeyOf(key));
      if (tab) win?.open(tab.url, '_blank', 'noopener');
    },
    toggleSidebar: () => {
      if (viewport.store.value) ui.toggleDrawer();
      else {
        ui.setHoverExpanded(false);
        preferences.setPath('sidebar.collapsed', !preferences.value.sidebar.collapsed);
      }
    },
    formatDate: (date, formatOptions) => formatInTimezone(date, timezone.value, formatOptions, i18n.locale),
    attach: () => attach(),
    destroy: () => destroy()
  };

  palette.registerSource(menuSource(shell));
  palette.registerSource(commandSource(() => [...builtinCommands(shell), ...customCommands.values()]));
  const unregisterShortcuts = registerBuiltinShortcuts(shell);

  let detach: (() => void) | undefined;
  function attach(): () => void {
    if (detach) return detach;
    const offs: Array<() => void> = [];
    if (win) offs.push(shortcuts.attach(win));
    if (doc) offs.push(bindDocument(doc));
    offs.push(bindLocale(), bindTabTitles());
    detach = () => {
      for (const off of offs) off();
      detach = undefined;
    };
    return detach;
  }

  function bindDocument(document: Document): () => void {
    const root = document.documentElement;
    const binding = createRootBinding(root);
    const originalTitle = document.title;
    const originalLang = root.getAttribute('lang');
    const render = (): void => {
      const prefs = preferences.value;
      binding.apply(computeRootAttributes(prefs, resolvedTheme.value), {
        ...computeThemeStyle(prefs),
        ...computeLayoutVars(layout.value)
      });
      const label = prefs.app.dynamicTitle ? menuTitleOf(menu.value, currentUrl.value) : undefined;
      document.title = label === undefined ? originalTitle : `${label} · ${brandTitle}`;
      // 页面语言随外壳语言走，读屏软件才会用对应语音朗读（WCAG 3.1.1）
      root.setAttribute('lang', i18n.locale);
    };
    render();
    const stores = [preferences, resolvedTheme, layout, menu, currentUrl, text];
    const offs = stores.map(store => (store as ReadableStore<unknown>).subscribe(render));
    return () => {
      for (const off of offs) off();
      binding.clear();
      document.title = originalTitle;
      if (originalLang === null) root.removeAttribute('lang');
      else root.setAttribute('lang', originalLang);
    };
  }

  function bindLocale(): () => void {
    const apply = (): void => {
      const { locale } = preferences.value.app;
      if (locale !== '' && locale !== i18n.locale) void i18n.setLocale(locale);
    };
    apply();
    return preferences.subscribe(apply);
  }

  function bindTabTitles(): () => void {
    return text.subscribe(() => tabs.retitle(url => menuTitleOf(menu.value, url)));
  }

  function destroy(): void {
    detach?.();
    unregisterShortcuts();
    preferences.destroy();
    tabs.destroy();
    lock.destroy();
    fullscreen.destroy();
    viewport.stop();
    systemDark.stop();
  }

  return shell;
}
