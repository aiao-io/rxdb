/** 地名搜索会发送搜索词，说明页里必须列出对应主机。 */
const NAMED_HOSTS = ['nominatim.openstreetmap.org'];

/** 触发方式的两种取值：打开就请求，或用户操作后才请求。 */
const TRIGGERS = ['on-open', 'on-action'];

/**
 * 在页面里执行：这块内容里有没有会向外网取资源的东西——加载资源的元素、指向外网的地址、外网的背景图。
 * 说明页只该有文字；这是静态的结构检查，不看网络时序（桌面自己的天气请求要等本地库就绪后才发出，
 * 落在哪一刻不定，所以不拿「期间有没有外网请求」当判据）。
 */
function reachesOutside(root) {
  const elements = [root, ...root.querySelectorAll('*')];
  const remote = /(?:https?:)?\/\/[^\s'")]+/;
  const loaders = root.querySelectorAll('img, iframe, video, audio, source, object, embed, link, script');
  const addresses = elements.flatMap(element =>
    ['src', 'href', 'srcset', 'poster', 'data', 'style'].map(name => element.getAttribute(name) ?? '')
  );
  const backgrounds = elements.map(element => getComputedStyle(element).backgroundImage);
  return loaders.length > 0 || [...addresses, ...backgrounds].some(value => remote.test(value));
}

/**
 * 外网内容说明（ADESK-US-007）：「关于本机」里的 External Content 页列出清单里的每个外网主机，
 * Safari 直接加载原站，不再请求阅读代理；外网全拦截时说明页照样打得开。
 *
 * e2e 不 import web 的源码，所以不在这里写主机清单：主机列表从页面的行里读出来，
 * 数量对照页面容器的 `data-external-count`（它绑定的是源码里的清单条数），点名会发送搜索词的地名服务。
 * 依赖的页面钩子：
 * - 关于本机：`.win[data-app="about"]` 里的 `[data-external-content-open]`（标题栏按钮）；
 * - 说明页：`[data-external-content]`（`data-external-count`）、`[data-external-host]`（`data-external-trigger`，
 *   行内 `b`、`[data-external-purpose]`、`[data-external-sends]`、`[data-external-apps]`）、`[data-external-notice]`；
 * - Safari：`.win[data-app="safari"]` 里的 `[data-url]`、`iframe.sf-frame` 与“Open in Browser”链接。
 * 外网请求由会话统一拦截，页面错误由运行器统一判定。
 */
export const externalContent = {
  name: 'external-content',
  description: '外网内容说明：关于本机里的说明页逐项列出外网主机，Safari 直接访问网站，外网全拦截下说明页可达',
  keys: [
    'externalContent.pageListsEveryHost',
    'externalContent.safariHintShown',
    'externalContent.reachableOffline',
    'safari.noReader',
    'safari.liveWebsite',
    'safari.formsWork',
    'safari.navigation',
    'safari.credentialless',
    'safari.isolationPreserved',
    'safari.externalBrowserLink'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, shows } = session.helpers;
    await session.openDesktop();
    await closeAll();

    /* 从 Apple 菜单进「关于本机」，再点标题栏的 External Content。 */
    await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
    await page.locator('#layer-menu .pop .mi', { hasText: 'About This Mac' }).click();
    const aboutWin = win('about');
    await aboutWin.waitFor();
    await aboutWin.locator('[data-external-content-open]').click();
    const content = aboutWin.locator('[data-external-content]');
    const visible = await shows(content);
    const rows =
      visible ?
        await content.locator('[data-external-host]').evaluateAll(nodes =>
          nodes.map(node => ({
            host: node.getAttribute('data-external-host') ?? '',
            label: node.querySelector('b')?.textContent?.trim() ?? '',
            trigger: node.getAttribute('data-external-trigger') ?? '',
            purpose: node.querySelector('[data-external-purpose]')?.textContent?.trim() ?? '',
            sends: node.querySelector('[data-external-sends]')?.textContent?.trim() ?? '',
            apps: node.querySelector('[data-external-apps]')?.textContent?.trim() ?? ''
          }))
        )
      : [];
    const notices = visible ? await content.locator('[data-external-notice]').allTextContents() : [];
    const declared = visible ? Number(await content.getAttribute('data-external-count')) : -1;
    const selfContained = visible && !(await content.evaluate(reachesOutside));

    const hosts = rows.map(row => row.host);
    const pageListsEveryHost =
      visible &&
      rows.length > 0 &&
      rows.length === declared &&
      new Set(hosts).size === hosts.length &&
      NAMED_HOSTS.every(host => hosts.includes(host)) &&
      !hosts.includes('r.jina.ai') &&
      rows.every(
        row => row.label === row.host && row.purpose && row.sends && row.apps && TRIGGERS.includes(row.trigger)
      ) &&
      notices.some(text => /\bIP\b/.test(text));
    const reachableOffline = visible && rows.length > 0 && selfContained;

    const safari = await verifySafari(session);
    const safariHintShown = await shows(win('safari').getByText('Page not loading? Open it in your browser.'));
    return { externalContent: { pageListsEveryHost, safariHintShown, reachableOffline }, safari };
  }
};

async function verifySafari(session) {
  const { context, page } = session;
  const { win, closeAll, shows } = session.helpers;
  const first = 'https://www.baidu.com/';
  const second = 'https://news.example.test/story?from=safari';
  const navigations = [];
  const requests = [];
  context.on('request', request => requests.push(request.url()));
  await context.addCookies([{ name: 'existing-session', value: 'private', url: first }]);
  await context.route(
    url => ['www.baidu.com', 'news.example.test'].includes(url.hostname),
    async route => {
      const request = route.request();
      if (request.isNavigationRequest()) navigations.push({ url: request.url(), headers: await request.allHeaders() });
      await route.fulfill({
        contentType: 'text/html',
        body: '<h1>Live website</h1><form action="/s"><label>Search web<input name="wd"></label><button>Search</button></form>'
      });
    }
  );
  await closeAll();
  await page.locator('#dock .di[data-app="safari"]').click();
  const safari = win('safari');
  const address = safari.locator('[data-url]');
  const open = async url => {
    await address.fill(url);
    await address.press('Enter');
  };
  const pagesBefore = context.pages().length;
  await open(first);
  const result = {
    noReader: (await safari.locator('[data-reader], [data-reader-disclosure], .rdr').count()) === 0,
    liveWebsite: false,
    formsWork: false,
    navigation: false,
    credentialless: false,
    isolationPreserved: await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer === 'function'),
    externalBrowserLink: false
  };
  const frame = safari.locator('iframe.sf-frame');
  if (!(await shows(frame))) return result;
  const content = frame.contentFrame();
  await content.getByRole('heading', { name: 'Live website' }).waitFor();
  result.liveWebsite = (await frame.getAttribute('src')) === first && context.pages().length === pagesBefore;
  result.credentialless = (await frame.getAttribute('credentialless')) !== null && !navigations[0].headers.cookie;
  await content.getByRole('textbox', { name: 'Search web' }).fill('aiao desktop');
  const submitted = page.waitForRequest(request => new URL(request.url()).searchParams.get('wd') === 'aiao desktop');
  await content.getByRole('button', { name: 'Search', exact: true }).click();
  await submitted;
  await content.getByRole('heading', { name: 'Live website' }).waitFor();
  result.formsWork = navigations.some(entry => new URL(entry.url).searchParams.get('wd') === 'aiao desktop');
  await open(second);
  await content.getByRole('heading', { name: 'Live website' }).waitFor();
  await Promise.all([page.waitForRequest(first), safari.locator('[data-back]').click()]);
  const back = (await frame.getAttribute('src')) === first;
  await Promise.all([page.waitForRequest(second), safari.locator('[data-fwd]').click()]);
  const forward = (await frame.getAttribute('src')) === second;
  const beforeReload = navigations.filter(entry => entry.url === second).length;
  const reloaded = page.waitForRequest(second);
  await safari.locator('[data-reload]').click();
  await reloaded;
  await content.getByRole('heading', { name: 'Live website' }).waitFor();
  result.navigation = back && forward && navigations.filter(entry => entry.url === second).length > beforeReload;
  if (!result.navigation) console.error({ back, forward, beforeReload, urls: navigations.map(entry => entry.url) });
  const link = safari.getByRole('link', { name: 'Open in Browser', exact: true });
  const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await opened.waitForURL(second);
  result.externalBrowserLink = await opened.evaluate(() => window.opener === null);
  await opened.close();
  result.noReader &&= !requests.some(url => new URL(url).hostname === 'r.jina.ai');
  return result;
}
