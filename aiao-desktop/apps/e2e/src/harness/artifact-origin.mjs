/**
 * 用与集成应用同站、不同源的 HTTPS 地址转送本地产物，保持生产部署的来源关系。
 * Firefox 驱动无法操作跨站隔离 iframe；转送不改产物、应用来源、隔离头或浏览器安全设置。
 *
 * @param {import('playwright').BrowserContext} context
 * @param {string} sourceOrigin 本地产物服务器的来源
 * @param {string} appOrigin 集成应用的来源
 */
export async function installArtifactOrigin(context, sourceOrigin, appOrigin) {
  const address = new URL(appOrigin);
  address.hostname = `desktop-smoke-${new URL(sourceOrigin).port}.${address.hostname}`;
  const origin = address.origin;
  const resourceUrl = requestUrl => {
    const request = new URL(requestUrl);
    if (request.origin !== origin) throw new Error(`请求不属于被测桌面：${request.origin}`);
    return `${sourceOrigin}${request.pathname}${request.search}`;
  };
  await context.route(
    url => url.origin === origin,
    async route => {
      const response = await route.fetch({ url: resourceUrl(route.request().url()) });
      await route.fulfill({ response });
    }
  );
  return { origin, resourceUrl };
}
