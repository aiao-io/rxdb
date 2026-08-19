import { emitHostTheme, parseResolvedTheme, type ResolvedTheme } from '@aiao/utils';
import { useEffect, useState, type ComponentType, type ReactElement } from 'react';
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
  return parseResolvedTheme(document.documentElement.getAttribute('data-theme'));
}

/**
 * 把 daisyUI `:root` 变量改写到 `:host`。
 *
 * 无界 Shadow DOM 里 `document.documentElement` 指向 shadow 子节点，
 * `:root` 仍会打到真实 document，必须去掉而不能写成 `:host, :root`。
 */
function rewriteRootToHost(code: string): string {
  return code.replaceAll(':root', ':host');
}

export { rewriteRootToHost };

const shadowCssPlugins = [
  {
    cssLoader: (code: string) => rewriteRootToHost(code)
  }
];

/**
 * 仅在浏览器里加载的无界宿主。由 {@link DemoMicroApp} 通过 `BrowserOnly` 引入。
 */
export default function DemoMicroAppClient({ name, url, title, allow }: DemoMicroAppProps): ReactElement {
  const [theme, setTheme] = useState<ResolvedTheme>(readHostTheme);

  useEffect(() => {
    const sync = () => {
      const next = readHostTheme();
      setTheme(next);
      emitHostTheme(bus, next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
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
  );
}
