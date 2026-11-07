/**
 * 运行时宿主页的托管配置（US-409）：本地静态服务（scripts/serve-runtime-hosts.mjs）与 Cloudflare Pages
 * （scripts/build-runtime-hosts.mjs 生成的 `_headers` / `_redirects`）发同一组响应头。
 * 不引入其他模块：这两个脚本由 Node 直接加载这个文件。
 */

/** 部署配置里一种运行时的线上宿主。 */
export interface DeployedRuntimeHost {
  /** 线上宿主源。 */
  readonly origin: string;
  /** 允许嵌入它的工作台来源。 */
  readonly parents: readonly string[];
}

/**
 * 宿主页的响应头：跨源隔离（内核要 SharedArrayBuffer）、允许工作台跨源嵌入并加载其中资源，
 * 且只许部署配置里的工作台来源嵌入。预览容器页还要嵌同源的 `/preview/<端口>/`，所以带上 `'self'`。
 */
export function runtimeHostHeaders(parents: readonly string[]): Readonly<Record<string, string>> {
  if (parents.length === 0) throw new Error('宿主源没有允许嵌入的工作台来源');
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': `frame-ancestors 'self' ${parents.join(' ')}`,
    'Service-Worker-Allowed': '/'
  };
}

/**
 * 部署配置（工作台来源 → 宿主源）里一种运行时的线上宿主：localhost 以外的宿主源。
 * 一种运行时只构建一份宿主产物，`frame-ancestors` 只能带一组嵌入来源，所以最多一个线上宿主源。
 */
export function deployedRuntimeHost(table: Readonly<Partial<Record<string, string>>>): DeployedRuntimeHost | undefined {
  const origins = [...new Set(Object.values(table))].filter(
    (origin): origin is string => !!origin && new URL(origin).hostname !== 'localhost'
  );
  if (origins.length > 1) throw new Error(`一种运行时配了多个线上宿主源：${origins.join('、')}`);
  const [origin] = origins;
  if (!origin) return undefined;
  return { origin, parents: Object.keys(table).filter(parent => table[parent] === origin) };
}

/**
 * Pages 的 `_headers`：全站发宿主响应头。带内容哈希的 `/assets/` 长缓存；`/vendor/` 的打包件地址固定、
 * 内容随 @vivari/core 版本变，显式要求每次重新验证：自定义域名上 zone 的浏览器缓存 TTL 会把 Pages 默认的
 * `max-age=0` 改成数小时，升级后回访的浏览器会继续用旧包。宿主页的入口脚本由构建加内容哈希，不在这里处理。
 */
export function pagesHeaders(parents: readonly string[]): string {
  const headers = Object.entries(runtimeHostHeaders(parents)).map(([name, value]) => `  ${name}: ${value}`);
  return [
    '# 由 scripts/build-runtime-hosts.mjs 按 src/runtime-hosts/hosts.ts 生成',
    '/*',
    ...headers,
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/vendor/*',
    '  Cache-Control: no-cache',
    ''
  ].join('\n');
}

/**
 * Pages 的 `_redirects`：Pages 默认把 `.html` 308 到无扩展名地址，宿主页与预览容器页由 iframe 直接导航，
 * 用 200 改写原样返回（工作台 `public/_redirects` 同理）。只接受源根下的页面。
 */
export function pagesRedirects(pages: readonly string[]): string {
  const rules = pages.map(page => {
    if (!/^\/[^/]+\.html$/.test(page) || page === '/index.html') throw new Error(`不是源根下的页面：${page}`);
    return `${page} ${page.slice(0, -'.html'.length)} 200`;
  });
  return ['# 由 scripts/build-runtime-hosts.mjs 生成', ...rules, ''].join('\n');
}
