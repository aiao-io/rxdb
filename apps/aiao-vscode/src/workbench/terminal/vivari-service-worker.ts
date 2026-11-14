/**
 * vivari 预览 Service Worker 里放行 `/@fs/` 的规则：根绝对路径的 `/@fs/…` 请求，只有 Referer 就是
 * `/preview/<端口>/` 页面本身才转进 VM，其余一律放行给网络。它是给 vivari 自己的 studio 开发服务器写的
 * （内核 Worker 的 `/@fs/` 模块），构建后的宿主源上不会有这类请求，却误伤了预览：Vite 客户端 `/@vite/client`
 * 静态导入的 `/@fs/…/env.mjs` 以客户端模块为 Referer，被放行成 404，客户端整体加载失败，
 * Angular 开发服务器发出的重载通知没有页面接收，保存后预览不刷新。
 */
const FS_BYPASS_RULE =
  '  if (url.pathname.startsWith("/@fs/") && !referrerIsPreview(event.request.referrer)) return;\n';

/**
 * 去掉 {@link FS_BYPASS_RULE}：之后 `/@fs/` 请求和其他根绝对请求一样，由发起文档是否在 `/preview/<端口>/` 下
 * 决定转进 VM 还是放行。上游改了写法（找不到或出现多处）就报错，由人核对新版 sw.js 后再更新补丁。
 */
export function patchPreviewServiceWorker(source: string): string {
  const found = source.split(FS_BYPASS_RULE).length - 1;
  if (found !== 1)
    throw new Error(
      `vivari 的 sw.js 里 /@fs/ 放行规则出现了 ${found} 处（预期 1 处）：上游改了写法，核对新版后再更新补丁`
    );
  return source.replace(FS_BYPASS_RULE, '');
}
