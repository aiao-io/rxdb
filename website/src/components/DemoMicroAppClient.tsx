import {
  emitHostRoute,
  emitHostTheme,
  HOST_THEME_ATTRIBUTE,
  HostRouteSync,
  normalizeRoutePath,
  parseResolvedTheme,
  rewriteShadowCss,
  subscribeSubRoute,
  subscribeThemeRequest,
  type ResolvedTheme
} from '@modules/wujie';
import { useHistory, useLocation } from '@docusaurus/router';
import { useColorMode } from '@docusaurus/theme-common';
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactElement } from 'react';
import WujieReact from 'wujie-react';

import type { DemoMicroAppProps } from './DemoMicroApp';

const bus = WujieReact.bus;

/** 官方 d.ts 把 props 收成 `{}`，运行时 `startApp` 会展开这些字段。 */
interface WujieReactProps {
  name: string;
  url: string;
  width: string;
  height: string;
  alive: boolean;
  props: { theme: ResolvedTheme; route: string };
  attrs: { title: string; allow?: string };
  plugins: Array<{ cssLoader: (code: string) => string }>;
  afterMount?: () => void;
  activated?: () => void;
}

const WujieApp = WujieReact as unknown as ComponentType<WujieReactProps>;

function readHostTheme(): ResolvedTheme {
  return parseResolvedTheme(document.documentElement.getAttribute(HOST_THEME_ATTRIBUTE));
}

const shadowCssPlugins = [{ cssLoader: rewriteShadowCss }];

/** 宿主 `/demos/vue/todo` → 子应用 `/todo`；`basePath` 缺省时恒为 `/`。 */
function toSubRoute(pathname: string, basePath: string | undefined): string {
  if (!basePath || !pathname.startsWith(basePath)) return '/';
  return normalizeRoutePath(pathname.slice(basePath.length));
}

/** 子应用 `/todo` → 宿主 `/demos/vue/todo`。 */
function toHostPath(basePath: string, subRoute: string): string {
  return subRoute === '/' ? basePath : `${basePath}${subRoute}`;
}

/**
 * 仅在浏览器里加载的无界宿主。由 {@link DemoMicroApp} 通过 `BrowserOnly` 引入。
 *
 * 主题双向同步，两个方向都由宿主落地：
 *
 * - **外 → 内**：子应用只能把 `data-theme` 写到 Shadow 内的 `<html>` 上，够不到承载底色的
 *   `<wujie-app>` 宿主元素，所以这里由宿主直接给它打 `data-theme`，配合
 *   {@link rewriteShadowCss} 补出的 `:host([data-theme=X])` 规则让底色跟着主题走。
 * - **内 → 外**：子应用里切主题时发 `subscribeThemeRequest` 监听的请求事件，宿主转成
 *   Docusaurus 的 `setColorMode`。走独立事件名，不与下发通道共用，避免绕成回环。
 *
 * 路由同步同理：初始路径搭 `props.route` 进子应用，之后的变化走 bus；子应用回传的路径
 * 由 {@link HostRouteSync} 过闸后 `replace` 进 Docusaurus 地址栏。传了 `basePath` 才接线。
 */
export default function DemoMicroAppClient({ name, url, title, allow, basePath }: DemoMicroAppProps): ReactElement {
  const [theme, setTheme] = useState<ResolvedTheme>(readHostTheme);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setColorMode } = useColorMode();
  const { pathname } = useLocation();
  const history = useHistory();
  // 初始主题跟着 `props.theme` 进子应用（subscribeHostTheme 先读 props 再订阅 bus），
  // 子应用起来之前 bus 上没有订阅者，抢跑的 $emit 只会换来无界的「事件订阅数量为空」告警。
  // 所以这里只广播**变化**。
  const emittedTheme = useRef<ResolvedTheme>(theme);

  const subRoute = toSubRoute(pathname, basePath);
  // 挂载那一刻的路径，随 props.route 进子应用；之后的变化走 bus（理由同主题）
  const initialRoute = useRef<string>(subRoute);
  const routeSync = useRef<HostRouteSync>(new HostRouteSync());
  // 两端最后一次达成一致的路径。宿主自己回写地址栏引起的变化不该再打回子应用
  const agreedRoute = useRef<string>(subRoute);

  /**
   * 上闸保护一条期望路径。
   *
   * 根路径不上闸：宿主停在 `/demos/vue` 时本就没有要保护的深链，此时上闸只会把子应用
   * 自己的首个路由（以及 TTL 窗口内用户的第一次点击）一并挡掉。
   */
  const expectRoute = useCallback((route: string) => {
    if (route !== '/') routeSync.current.expect(route);
  }, []);

  /** 子应用（重新）挂载时重置闸门：TTL 得从它真正开始跑的那一刻算起，而不是宿主挂载时。 */
  const armRouteSync = useCallback(() => expectRoute(agreedRoute.current), [expectRoute]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sync = () => {
      const next = readHostTheme();
      setTheme(next);
      if (emittedTheme.current !== next) {
        emittedTheme.current = next;
        emitHostTheme(bus, next);
      }
      const shadowHost = container.querySelector('wujie-app');
      if (shadowHost && shadowHost.getAttribute(HOST_THEME_ATTRIBUTE) !== next) {
        shadowHost.setAttribute(HOST_THEME_ATTRIBUTE, next);
      }
    };
    sync();

    const themeObserver = new MutationObserver(sync);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [HOST_THEME_ATTRIBUTE]
    });

    // `<wujie-app>` 由异步的 startApp 插入，挂载时还不存在，出现时得补一次。
    // Shadow DOM 不透出内部变更，这里只会被宿主元素本身的插入触发。
    const mountObserver = new MutationObserver(sync);
    mountObserver.observe(container, { childList: true, subtree: true });

    return () => {
      themeObserver.disconnect();
      mountObserver.disconnect();
    };
  }, []);

  // 子应用里切主题 → 带动整个文档站。走 setColorMode 而不是直接改属性：
  // 直接 setAttribute 会被 Docusaurus 的 colorMode 状态覆盖，也不会持久化。
  useEffect(() => subscribeThemeRequest(next => setColorMode(next), bus), [setColorMode]);

  // 宿主 → 子：浏览器前进后退、或站内跳到另一个 demo 路径时推给子应用
  useEffect(() => {
    if (!basePath || subRoute === agreedRoute.current) return;
    agreedRoute.current = subRoute;
    expectRoute(subRoute);
    emitHostRoute(bus, name, subRoute);
  }, [basePath, expectRoute, name, subRoute]);

  // 子 → 宿主：子应用内部导航回写地址栏。
  //
  // 走 Docusaurus 的 history 而不是裸 `replaceState`：后者不更新 react-router 的内部 location，
  // `useLocation()` 会一直停在旧路径，之后宿主侧的路由判断全部基于陈旧值。
  // 用 replace 不用 push：子应用的返回栈由无界代理的 iframe history 维护，宿主再 push 会双份。
  useEffect(() => {
    if (!basePath) return;
    armRouteSync();
    return subscribeSubRoute(
      name,
      route => {
        if (!routeSync.current.accept(route)) return;
        agreedRoute.current = route;
        const next = toHostPath(basePath, route);
        if (next !== window.location.pathname) history.replace(next);
      },
      bus
    );
  }, [armRouteSync, basePath, history, name]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <WujieApp
        name={name}
        url={url}
        width='100%'
        height='100%'
        alive
        props={{ theme, route: initialRoute.current }}
        attrs={allow ? { allow, title } : { title }}
        plugins={shadowCssPlugins}
        afterMount={armRouteSync}
        activated={armRouteSync}
      />
    </div>
  );
}
