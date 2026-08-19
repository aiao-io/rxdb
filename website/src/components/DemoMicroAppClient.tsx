import {
  emitHostTheme,
  HOST_THEME_ATTRIBUTE,
  parseResolvedTheme,
  rewriteShadowCss,
  subscribeThemeRequest,
  type ResolvedTheme
} from '@aiao/utils';
import { useColorMode } from '@docusaurus/theme-common';
import { useEffect, useRef, useState, type ComponentType, type ReactElement } from 'react';
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
  props: { theme: ResolvedTheme };
  attrs: { title: string; allow?: string };
  plugins: Array<{ cssLoader: (code: string) => string }>;
}

const WujieApp = WujieReact as unknown as ComponentType<WujieReactProps>;

function readHostTheme(): ResolvedTheme {
  return parseResolvedTheme(document.documentElement.getAttribute(HOST_THEME_ATTRIBUTE));
}

const shadowCssPlugins = [{ cssLoader: rewriteShadowCss }];

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
 */
export default function DemoMicroAppClient({ name, url, title, allow }: DemoMicroAppProps): ReactElement {
  const [theme, setTheme] = useState<ResolvedTheme>(readHostTheme);
  const containerRef = useRef<HTMLDivElement>(null);
  const { setColorMode } = useColorMode();
  // 初始主题跟着 `props.theme` 进子应用（subscribeHostTheme 先读 props 再订阅 bus），
  // 子应用起来之前 bus 上没有订阅者，抢跑的 $emit 只会换来无界的「事件订阅数量为空」告警。
  // 所以这里只广播**变化**。
  const emittedTheme = useRef<ResolvedTheme>(theme);

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

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <WujieApp
        name={name}
        url={url}
        width='100%'
        height='100%'
        alive
        props={{ theme }}
        attrs={allow ? { allow, title } : { title }}
        plugins={shadowCssPlugins}
      />
    </div>
  );
}
