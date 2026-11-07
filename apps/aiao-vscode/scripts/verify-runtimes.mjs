// US-409 运行时对比基准：按「运行方式 × 内置模板」逐格测耗时、改动生效延迟、内存与下载量，写入 benchmarks/。
// 用法：node scripts/verify-runtimes.mjs [--url=http://localhost:4320/ | --production]
//        [--runtimes=esbuild-wasm,webcontainer,vivari,nodepod] [--templates=vanilla,react,vue,angular] [--repeat=3]
//        [--channel=chrome] [--out=benchmarks/browser-workbench-runtimes.json]
// vivari、nodepod 需要运行时宿主服务：--production 时脚本自己起（要先构建 runtime-hosts），--url 时要求已在运行。
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { cpus, loadavg, platform } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { assertRuntimeHost, isHostedRuntime, runtimeHostFor, startRuntimeHost } from './runtime-host-server.mjs';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = (name, fallback) => (argument(name) ?? fallback).split(',').filter(Boolean);
const runtimes = list('runtimes', 'esbuild-wasm,webcontainer');
const templates = list('templates', 'vanilla,react,vue,angular');
const repeat = Number(argument('repeat') ?? 3);
const channel = argument('channel');
const browserMarker = `--aiao-runtimes-bench=${process.pid}`;

const fixtures = {
  vanilla: { path: 'src/label.ts', heading: '本地 TypeScript 模板', port: 5173 },
  react: { path: 'src/main.tsx', heading: '本地 React 模板', port: 5173 },
  vue: { path: 'src/App.vue', heading: '本地 Vue 模板', port: 5173 },
  angular: { path: 'src/app.html', heading: 'Angular workspace', port: 4200 }
};

async function serveProduction() {
  const directory = resolve(import.meta.dirname, '../dist/browser');
  const files = new Map();
  const walk = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else files.set(file.slice(directory.length), file);
    }
  };
  await walk(directory);
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.wasm': 'application/wasm'
  };
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const file = files.get(path === '/' ? '/index.html' : path);
      if (!file) return void response.writeHead(404).end();
      response.writeHead(200, {
        'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  // 固定来源：vivari 宿主只接受部署配置（src/runtime-hosts/hosts.ts）里的工作台来源
  await new Promise(done => server.listen(4330, 'localhost', done));
  return { server, url: 'http://localhost:4330/' };
}

/** 独立源运行时的宿主源按工作台来源取自部署配置：--production 时自己起宿主服务，--url 时要求它已在运行。 */
async function prepareHosts(url, hosted) {
  const hosts = hosted.map(runtime => runtimeHostFor(runtime, url));
  if (production) return startRuntimeHost();
  await Promise.all(hosts.map(assertRuntimeHost));
  return undefined;
}

const production = process.argv.includes('--production') ? await serveProduction() : undefined;
const baseURL = production?.url ?? argument('url') ?? 'http://localhost:4320/';
const hosted = runtimes.filter(isHostedRuntime);
const runtimeHost = hosted.length ? await prepareHosts(baseURL, hosted) : undefined;
const output = resolve(import.meta.dirname, '..', argument('out') ?? 'benchmarks/browser-workbench-runtimes.json');
const browser = await chromium.launch({
  headless: true,
  ...(channel ? { channel } : {}),
  // measureUserAgentSpecificMemory 默认要等下一次 GC，打开立即测量；第二个参数只用来在进程表里认出这个浏览器
  args: ['--enable-blink-features=ForceEagerMeasureMemory', browserMarker]
});

/**
 * 基准浏览器整棵进程树的 RSS 合计（渲染、GPU、网络等子进程）。跨源 iframe 与 Worker 里的运行时内存
 * 不进页面级测量，只能在进程层面看；共享页会重复计数，只用于同口径横向比较。
 */
function browserRssBytes() {
  if (platform() === 'win32') return null;
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' })
    .split('\n')
    .map(line => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, pid, ppid, rss, command]) => ({ pid: Number(pid), ppid: Number(ppid), rss: Number(rss) * 1024, command }));
  const root = rows.find(row => row.command.includes(browserMarker) && !row.command.includes('--type='));
  if (!root) return null;
  const children = Map.groupBy(rows, row => row.ppid);
  let total = 0;
  const pending = [root];
  while (pending.length) {
    const row = pending.pop();
    total += row.rss;
    pending.push(...(children.get(row.pid) ?? []));
  }
  return total;
}

const since = start => Math.round(performance.now() - start);
/** 去掉终端转义序列（CSI 到结束字节、OSC 到 BEL）；不把控制字符写进正则（no-control-regex）。 */
function plain(text) {
  let result = '';
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '\u001b') {
      result += text[index];
      continue;
    }
    if (text[index + 1] === ']') {
      const bell = text.indexOf('\u0007', index);
      index = bell < 0 ? text.length : bell;
      continue;
    }
    if (text[index + 1] !== '[') continue;
    index += 2;
    while (index < text.length && !/[@-~]/.test(text[index])) index++;
  }
  return result;
}

/** 读某个 iframe（vivari 的预览在容器页里面再嵌一层）当前文档里第一个 h1；正在导航时得到空串。 */
async function frameHeading(page, selector) {
  const handle = await page.$(selector);
  const frame = await handle?.contentFrame();
  if (!frame) return '';
  for (const candidate of [frame, ...frame.childFrames()]) {
    const heading = await candidate.evaluate(() => document.querySelector('h1')?.textContent ?? '').catch(() => '');
    if (heading) return heading;
  }
  return '';
}

/** 已经记进 errors 的步骤失败，外层不再重复记录。 */
class StepFailure extends Error {}

async function until(check, timeout, step = 100) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (await check()) return since(start);
    await new Promise(done => setTimeout(done, step));
  }
  throw new Error(`等待超时 ${timeout}ms`);
}

async function measureCell(runtime, template, round) {
  const fixture = fixtures[template];
  const local = '.wb-preview-content iframe';
  const service = `iframe[title="项目服务 :${fixture.port}"]`;
  const node = runtime !== 'esbuild-wasm';
  const cell = { runtime, template, round, loadavg: loadavg()[0], steps: {}, errors: [] };
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  cell.rssBeforeBytes = browserRssBytes();
  const page = await context.newPage();
  let downloaded = 0;
  // 用浏览器上下文级事件：页面级事件看不到 Service Worker（工作台 ngsw、运行时宿主）发出的请求
  context.on('requestfinished', request => {
    void request.sizes().then(
      sizes => {
        // 大小未知（blob、srcdoc、Service Worker 合成的响应）时 Playwright 给 -1
        downloaded += Math.max(0, sizes.responseBodySize);
      },
      () => undefined
    );
  });
  await page.addInitScript(() => {
    const Original = WritableStream;
    window.__terminal = [];
    window.WritableStream = class extends Original {
      constructor(sink, strategy) {
        if (sink && Object.getPrototypeOf(sink) === Object.prototype && typeof sink.write === 'function') {
          const write = sink.write;
          sink = {
            ...sink,
            write(chunk, controller) {
              if (typeof chunk === 'string') window.__terminal.push(chunk);
              return write.call(this, chunk, controller);
            }
          };
        }
        super(sink, strategy);
      }
    };
  });
  const step = async (name, action) => {
    try {
      cell.steps[name] = await action();
    } catch (cause) {
      const message = `${name}: ${cause instanceof Error ? cause.message : String(cause)}`;
      cell.errors.push(message);
      throw new StepFailure(message, { cause });
    }
  };
  try {
    await page.goto(`${baseURL}?runtime=${runtime}`);
    const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
    await root.waitFor({ timeout: 60000 });
    await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
    await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(`${runtime}-${template}-${round}`);
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill(template);
    const created = performance.now();
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
    await step('localPreviewMs', () =>
      until(async () => (await frameHeading(page, local)) === fixture.heading, 120000).then(() => since(created))
    );
    await root.locator('[data-slot="save-status"]').filter({ hasText: '已保存' }).waitFor({ timeout: 60000 });

    const status = root.locator('[data-log="terminal"] [data-terminal-status]');
    const target = node ? service : local;
    // 下载量从点「运行」开始算，不含打开工作台本身的资源
    cell.appLoadBytes = downloaded;
    downloaded = 0;
    const runAt = performance.now();
    let renders = 0;
    const countRender = frame => {
      if (frame.url() === 'about:srcdoc') renders += 1;
    };
    page.on('framenavigated', countRender);
    await root.locator('.wb-title-actions [data-action="run"]').click();
    if (node) {
      const phases = {};
      await step('runToPageMs', () =>
        until(async () => {
          const text = (await status.textContent()) ?? '';
          if (/安装依赖/.test(text)) phases.installStartMs ??= since(runAt);
          if (/项目运行中/.test(text)) phases.serverStartMs ??= since(runAt);
          // 安装或启动失败时不必等满超时
          if (/项目已停止|项目启动失败|终端错误/.test(text)) throw new Error(`项目没有起来：${text}`);
          return (await frameHeading(page, service)) === fixture.heading;
        }, 300000).then(() => since(runAt))
      );
      Object.assign(cell.steps, phases);
      const output = plain((await page.evaluate(() => window.__terminal.join(''))) ?? '');
      cell.steps.installSummary = output.match(/Done in [\d.]+m?s|added \d+ packages[^\n]*/)?.[0] ?? null;
      cell.steps.devServerSummary =
        output.match(/ready in \d+ ms|bundle generation complete\. \[[\d.]+ seconds\]/)?.[0] ?? null;
    } else {
      await step('runToPageMs', () =>
        until(async () => renders > 0 && (await frameHeading(page, local)) === fixture.heading, 120000).then(() =>
          since(runAt)
        )
      );
    }
    page.off('framenavigated', countRender);

    const marker = `${fixture.heading} edited`;
    await root
      .locator('.wb-file')
      .and(page.getByTitle(fixture.path, { exact: true }))
      .click();
    const editor = root.getByRole('textbox', { name: '项目源码', exact: true });
    await editor.locator('.cm-line').first().waitFor();
    const source = (await editor.locator('.cm-line').allTextContents()).join('\n');
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(source.replace(fixture.heading, marker));
    const savedAt = performance.now();
    await page.keyboard.press('ControlOrMeta+S');
    await step('editToUpdateMs', () =>
      until(async () => (await frameHeading(page, target)) === marker, 60000).then(() => since(savedAt))
    );

    if (node) {
      await page.locator('[data-terminal-session-view="project"] .xterm').click();
      const stopAt = performance.now();
      await page.keyboard.press('Control+c');
      await step('stopMs', () =>
        status
          .filter({ hasText: '项目已停止' })
          .waitFor({ timeout: 30000 })
          .then(() => since(stopAt))
      );
      // 停止后服务窗口仍显示旧页面：先给旧文档打标记，只认新加载的文档
      const stale = await (await page.$(service))?.contentFrame();
      await stale?.evaluate(() => {
        window.__aiaoStale = true;
      });
      const rerunAt = performance.now();
      await root.locator('.wb-title-actions [data-action="run"]').click();
      await step('rerunToPageMs', () =>
        until(async () => {
          const frame = await (await page.$(service))?.contentFrame();
          const fresh = await frame?.evaluate(() => !window.__aiaoStale).catch(() => false);
          return Boolean(fresh) && (await frameHeading(page, service)) === marker;
        }, 300000).then(() => since(rerunAt))
      );
    }
    // 按归属范围汇总，便于判断跨源 iframe / Worker 里的运行时内存是否计入
    const memory = await page
      .evaluate(async () => {
        const result = await performance.measureUserAgentSpecificMemory();
        const byScope = {};
        for (const entry of result.breakdown)
          for (const attribution of entry.attribution)
            byScope[attribution.scope] = (byScope[attribution.scope] ?? 0) + entry.bytes;
        return { bytes: result.bytes, byScope };
      })
      .catch(() => null);
    cell.steps.pageMemoryBytes = memory?.bytes ?? null;
    cell.pageMemoryByScope = memory?.byScope ?? null;
    cell.steps.browserRssBytes = browserRssBytes();
  } catch (cause) {
    // 步骤失败已记进 errors；步骤之外的失败（页面操作、选择器）也要记下，再继续下一格
    if (!(cause instanceof StepFailure)) cell.errors.push(cause instanceof Error ? cause.message : String(cause));
  } finally {
    cell.runDownloadedBytes = downloaded;
    await context.close();
  }
  return cell;
}

const median = values => {
  const sorted = values.filter(value => typeof value === 'number').toSorted((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};

const report = {
  format: 'aiao.workbench.runtimes',
  version: 1,
  url: baseURL,
  browser: browser.version(),
  environment: { platform: platform(), cpus: cpus().length, model: cpus()[0]?.model },
  startedAt: new Date().toISOString(),
  runtimes,
  templates,
  repeat,
  cells: [],
  summary: []
};
try {
  for (const runtime of runtimes)
    for (const template of templates) {
      for (let round = 1; round <= repeat; round++) {
        const cell = await measureCell(runtime, template, round);
        report.cells.push(cell);
        console.log(JSON.stringify({ runtime, template, round, steps: cell.steps, errors: cell.errors }));
      }
      const cells = report.cells.filter(cell => cell.runtime === runtime && cell.template === template);
      const metrics = [
        'localPreviewMs',
        'runToPageMs',
        'installStartMs',
        'serverStartMs',
        'editToUpdateMs',
        'stopMs',
        'rerunToPageMs',
        'pageMemoryBytes',
        'browserRssBytes'
      ];
      report.summary.push({
        runtime,
        template,
        passed: cells.filter(cell => cell.errors.length === 0).length,
        total: cells.length,
        ...Object.fromEntries(metrics.map(metric => [metric, median(cells.map(cell => cell.steps[metric]))])),
        appLoadBytes: median(cells.map(cell => cell.appLoadBytes)),
        runDownloadedBytes: median(cells.map(cell => cell.runDownloadedBytes)),
        loadavg: median(cells.map(cell => cell.loadavg))
      });
    }
} finally {
  report.finishedAt = new Date().toISOString();
  await mkdir(resolve(output, '..'), { recursive: true });
  // 顶层键按字母序写出，与仓库 prettier 的 sort-json 一致；写完仍需 prettier 格式化后再提交
  const sorted = Object.fromEntries(Object.entries(report).toSorted(([left], [right]) => left.localeCompare(right)));
  await writeFile(output, `${JSON.stringify(sorted, null, 2)}\n`);
  await browser.close();
  if (production) await new Promise(done => production.server.close(done));
  runtimeHost?.kill();
  console.table(report.summary);
}
