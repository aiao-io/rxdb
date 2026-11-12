import { createOrbit, type OrbitInstance } from '@aiao/orbit';
import { useHistory, useLocation } from '@docusaurus/router';
import { useColorMode } from '@docusaurus/theme-common';
import {
  emitHostRoute,
  emitHostTheme,
  HOST_THEME_ATTRIBUTE,
  HostRouteSync,
  normalizeRoutePath,
  parseResolvedTheme,
  subscribeSubRoute,
  subscribeThemeRequest,
  type ResolvedTheme
} from '@modules/orbit';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { DemoMicroAppProps } from './DemoMicroApp';

function readHostTheme(): ResolvedTheme {
  return parseResolvedTheme(document.documentElement.getAttribute(HOST_THEME_ATTRIBUTE));
}

function toSubRoute(pathname: string, basePath: string | undefined): string {
  if (!basePath || !pathname.startsWith(basePath)) return '/';
  return normalizeRoutePath(pathname.slice(basePath.length));
}

function toHostPath(basePath: string, subRoute: string): string {
  return subRoute === '/' ? basePath : `${basePath}${subRoute}`;
}

/** 仓内运行内核的文档站宿主，保留主题、深链和浏览器前进后退协议。 */
export default function DemoMicroAppClient({ name, url, title, allow, basePath }: DemoMicroAppProps): ReactElement {
  const [theme, setTheme] = useState<ResolvedTheme>(readHostTheme);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const instance = useRef<OrbitInstance | undefined>(undefined);
  const runtime = useMemo(
    () =>
      createOrbit({
        allowedOrigins: [new URL(url, location.href).origin],
        onError: failure => setError(failure instanceof Error ? failure.message : '演示运行失败')
      }),
    [url]
  );
  const bus = runtime.bus;
  const { setColorMode } = useColorMode();
  const { pathname } = useLocation();
  const history = useHistory();
  const subRoute = toSubRoute(pathname, basePath);
  const current = useRef({ theme, route: subRoute });
  current.current = { theme, route: subRoute };
  const routeSync = useRef(new HostRouteSync());
  const agreedRoute = useRef(subRoute);
  const emittedTheme = useRef(theme);
  const expectRoute = useCallback((route: string) => {
    if (route !== '/') routeSync.current.expect(route);
  }, []);
  const armRouteSync = useCallback(() => expectRoute(agreedRoute.current), [expectRoute]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setError(undefined);
    const app = runtime.createApp({
      appId: name,
      instanceId: name,
      version: 'workspace',
      url,
      title,
      allow,
      props: current.current
    });
    instance.current = app;
    let active = true;
    void app
      .mount(container)
      .then(() => {
        if (active) armRouteSync();
      })
      .catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : '演示启动失败');
      });
    return () => {
      active = false;
      app.destroy();
      instance.current = undefined;
    };
  }, [runtime, name, url, title, allow, attempt, armRouteSync]);

  useEffect(() => {
    const sync = () => {
      const next = readHostTheme();
      setTheme(next);
      if (emittedTheme.current !== next) {
        emittedTheme.current = next;
        emitHostTheme(bus, next);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [HOST_THEME_ATTRIBUTE] });
    return () => observer.disconnect();
  }, [bus]);

  useEffect(() => {
    const app = instance.current;
    if (app && app.snapshot.state !== 'failed') app.setProps({ theme, route: subRoute });
  }, [theme, subRoute]);
  useEffect(() => subscribeThemeRequest(next => setColorMode(next), bus), [bus, setColorMode]);

  useEffect(() => {
    if (!basePath || subRoute === agreedRoute.current) return;
    agreedRoute.current = subRoute;
    expectRoute(subRoute);
    emitHostRoute(bus, name, subRoute);
  }, [basePath, bus, expectRoute, name, subRoute]);

  // 子 → 宿主：子应用内部导航回写地址栏。
  //
  // 走 Docusaurus 的 history 而不是裸 `replaceState`：后者不更新 react-router 的内部 location，
  // `useLocation()` 会一直停在旧路径，之后宿主侧的路由判断全部基于陈旧值。
  // 用 replace 不用 push：子应用的返回栈由无界代理的 iframe history 维护，宿主再 push 会双份。
  //
  // 回传一律交给闸门的 receive：等待期里被挡下的不一定是首屏回弹，也可能是用户已经完成的导航，
  // 由闸门在期望路径到期后补写，否则地址栏会一直停在旧页。卸载时作废待补写的回传。
  useEffect(() => {
    if (!basePath) return;
    const sync = routeSync.current;
    armRouteSync();
    const stop = subscribeSubRoute(
      name,
      route =>
        sync.receive(route, path => {
          agreedRoute.current = path;
          const next = toHostPath(basePath, path);
          if (next !== window.location.pathname) history.replace(next);
        }),
      bus
    );
    return () => {
      stop();
      sync.cancel();
    };
  }, [armRouteSync, basePath, bus, history, name]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {error && (
        <div role='alert' style={{ position: 'absolute', inset: 0, padding: 24 }}>
          <p>{error}</p>
          <button type='button' onClick={() => setAttempt(value => value + 1)}>
            重新加载演示
          </button>
        </div>
      )}
    </div>
  );
}
