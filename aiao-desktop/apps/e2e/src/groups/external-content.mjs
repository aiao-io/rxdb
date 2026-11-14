/** D-04 点名的两处：Safari 阅读模式会发送用户输入的网址，地名搜索会发送搜索词，说明页里必须有这两行。 */
const NAMED_HOSTS = ['r.jina.ai', 'nominatim.openstreetmap.org'];

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
 * Safari 阅读模式的入口处提示网址会发给 r.jina.ai，外网全拦截时说明页照样打得开。
 *
 * e2e 不 import web 的源码，所以不在这里写主机清单：主机列表从页面的行里读出来，
 * 数量对照页面容器的 `data-external-count`（它绑定的是源码里的清单条数），只点名 D-04 要求的两处。
 * 依赖的页面钩子：
 * - 关于本机：`.win[data-app="about"]` 里的 `[data-external-content-open]`（标题栏按钮）；
 * - 说明页：`[data-external-content]`（`data-external-count`）、`[data-external-host]`（`data-external-trigger`，
 *   行内 `b`、`[data-external-purpose]`、`[data-external-sends]`、`[data-external-apps]`）、`[data-external-notice]`；
 * - Safari：`.win[data-app="safari"]` 里的 `[data-reader-disclosure]`。
 * 外网请求由会话统一拦截，页面错误由运行器统一判定。
 */
export const externalContent = {
  name: 'external-content',
  description: '外网内容说明：关于本机里的说明页逐项列出外网主机，Safari 阅读模式入口有提示，外网全拦截下说明页可达',
  keys: ['externalContent.pageListsEveryHost', 'externalContent.safariHintShown', 'externalContent.reachableOffline'],
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
      rows.every(
        row => row.label === row.host && row.purpose && row.sends && row.apps && TRIGGERS.includes(row.trigger)
      ) &&
      notices.some(text => /\bIP\b/.test(text));
    const reachableOffline = visible && rows.length > 0 && selfContained;

    /* Safari：打开就能看到阅读模式的提示，并点名 r.jina.ai。 */
    await closeAll();
    await page.locator('#dock .di[data-app="safari"]').click();
    const safariWin = win('safari');
    await safariWin.waitFor();
    const hint = safariWin.locator('[data-reader-disclosure]');
    const safariHintShown = (await shows(hint)) && ((await hint.textContent()) ?? '').includes('r.jina.ai');

    return { externalContent: { pageListsEveryHost, safariHintShown, reachableOffline } };
  }
};
