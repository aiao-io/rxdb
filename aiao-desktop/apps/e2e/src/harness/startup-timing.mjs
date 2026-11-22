import { chromium } from 'playwright';
import { startDesktopServer } from '../desktop-server.mjs';

const network = { latency: 30, downloadThroughput: 1_250_000, uploadThroughput: 1_250_000, offline: false };

async function sample(browser, origin) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  try {
    await context.route(
      url => url.origin !== origin,
      route => route.abort()
    );
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', network);
    await page.goto(`${origin}/?boot=0`, { waitUntil: 'commit' });
    const ready = await page.waitForFunction(() => {
      const finder = document.querySelector('.win[data-app="finder"] .finder-layout');
      return finder?.getBoundingClientRect().width && document.querySelector('#dock .di') && performance.now();
    });
    return Math.round(await ready.jsonValue());
  } finally {
    await context.close();
  }
}

/** 两份正式构建交替先后顺序，每次使用空数据库与新的浏览器上下文。 */
export async function compareStartup(baselineRoot, currentRoot) {
  const baseline = await startDesktopServer({ root: baselineRoot });
  const current = await startDesktopServer({ root: currentRoot });
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  try {
    const samples = { baseline: [], current: [] };
    const origins = { baseline: baseline.origin, current: current.origin };
    for (let round = 0; round < 5; round++) {
      const order = round % 2 === 0 ? ['baseline', 'current'] : ['current', 'baseline'];
      for (const name of order) samples[name].push(await sample(browser, origins[name]));
    }
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    return {
      browser: browser.version(),
      network,
      gpu: false,
      method:
        '从 navigationStart 到首个可见 Finder 内容与 Dock 图标。跳过开机动画，禁用 HTTP 缓存与 Service Worker，拦截外网，五轮取中位数，保留全部样本。',
      samplesMs: samples,
      medianMs: { baseline: median(samples.baseline), current: median(samples.current) }
    };
  } finally {
    await browser.close();
    await Promise.all([baseline.close(), current.close()]);
  }
}
