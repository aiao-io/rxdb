import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect as playwrightExpect } from 'playwright/test';
import { assertRuntimeHost, isHostedRuntime, runtimeHostFor, startRuntimeHost } from './runtime-host-server.mjs';

const expect = playwrightExpect.configure({ timeout: 30000 });

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
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
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
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*'
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  // 固定来源：vivari 宿主只接受部署配置（src/runtime-hosts/hosts.ts）里的工作台来源
  await new Promise(resolve => server.listen(4330, 'localhost', resolve));
  return { server, url: 'http://localhost:4330/?workbench-verify=1' };
}

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
// --runtime=vivari|nodepod：同一套断言跑另一种运行方式（US-409）；--templates= 只跑部分模板的「运行」
const runtime = argument('runtime');
const templates = (argument('templates') ?? 'vanilla,react,vue,angular').split(',');
const production = process.argv.includes('--production') ? await serveProduction() : undefined;
const baseURL = new URL(production?.url ?? argument('url') ?? 'http://localhost:4320/');
if (runtime) baseURL.searchParams.set('runtime', runtime);
const url = baseURL.href;
const hosted = runtime !== undefined && isHostedRuntime(runtime);
const runtimeHost =
  !hosted ? undefined
  : production ? await startRuntimeHost()
  : await assertRuntimeHost(runtimeHostFor(runtime, url));
const reportPath = resolve(import.meta.dirname, '..', argument('out') ?? 'benchmarks/browser-workbench-terminal.json');
const report = {
  format: 'aiao.workbench.terminal',
  version: 1,
  url,
  runtime: runtime ?? 'webcontainer',
  status: 'failed',
  checks: [],
  errors: []
};
report.cancelledRequests = [];
// --channel=chrome：本机没装 Playwright 自带的浏览器时改用系统 Chrome
const channel = process.argv.find(value => value.startsWith('--channel='))?.slice(10);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
const context = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
const page = await context.newPage();
page.setDefaultTimeout(30000);
report.consoleErrors = [];
page.on('pageerror', error => report.errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000));
});
page.on('requestfailed', request => {
  const failure = request.failure()?.errorText;
  const entry = `${request.url()}: ${failure}`;
  if (failure === 'net::ERR_ABORTED') report.cancelledRequests.push(entry);
  else report.errors.push(entry);
});
const root = page.getByRole('region', { name: '浏览器开发工作台', exact: true });
const terminal = root.locator('[data-log="terminal"]');
const screen = terminal.locator('.xterm-rows:visible');
/**
 * Ctrl+C 后回到提示符：jsh 回显 `^C` 再给 `❯`；vivari 的 sh 中断前台命令时不回显 `^C`，直接给 `project$`；
 * Nodepod 的终端回显 `^C` 再给 `nodepod:/project$`。
 */
const interruptedPrompt =
  runtime === 'vivari' ? /project\$\s*$/
  : runtime === 'nodepod' ? /\^C[\s\S]*\$\s*$/
  : /\^C[\s\S]*❯\s*$/;
/** 服务预览的文档：vivari 的预览在宿主源的容器页里再嵌一层，Nodepod 直接嵌宿主源上的预览。 */
const serviceFrame = port => {
  const outer = page.frameLocator(`iframe[title="项目服务 :${port}"]`);
  return runtime === 'vivari' ? outer.frameLocator('iframe') : outer;
};
const input = terminal.getByRole('textbox', { name: '终端输入', exact: true }).filter({ visible: true });
const command = async text => {
  await input.focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
};
const checked = name => {
  report.checks.push(name);
  console.log(`Passed: ${name}`);
};
report.failures = [];

const status = terminal.locator('[data-terminal-status]');
/** Shell 回到提示符；等不到时得到 false。 */
const promptBack = timeout =>
  expect
    .poll(async () => interruptedPrompt.test(await screen.innerText()), { timeout })
    .toBe(true)
    .then(
      () => true,
      () => false
    );

/**
 * 断言失败后恢复终端，返回用到的办法：先 Ctrl+C 中断前台命令；运行时没有回应时停止再启动终端；
 * 停止也没有回应时重新加载工作台（恢复同一项目），换一个新的运行时。
 */
async function recoverShell() {
  await terminal.locator('[data-terminal-session="shell"]').click();
  await input.press('Control+c');
  if (await promptBack(10000)) {
    await page.waitForTimeout(500);
    return 'ctrl-c';
  }
  await terminal.getByRole('button', { name: '停止终端', exact: true }).click();
  const stopped = await expect(status)
    .toHaveText('尚未启动', { timeout: 15000 })
    .then(
      () => true,
      () => false
    );
  if (stopped) {
    await terminal.getByRole('button', { name: '启动终端', exact: true }).click();
  } else {
    // 与首次打开一样：重新加载后点顶栏终端图标打开面板并启动终端
    await page.reload();
    await expect(root).toBeVisible({ timeout: 60000 });
    await root.locator('.wb-title-actions [data-action="terminal"]').click();
  }
  await expect(status).toHaveText('运行中', { timeout: 120000 });
  return stopped ? 'restart' : 'reload';
}

/**
 * 逐项断言：失败记进 report.failures，恢复 Shell 后接着跑后面的断言——换一种运行方式验同一套断言时要看到全貌。
 * 恢复本身失败说明终端已不可用，直接结束。
 */
async function attempt(name, action) {
  try {
    await action();
    checked(name);
  } catch (cause) {
    const failure = {
      check: name,
      message: (cause instanceof Error ? cause.message : String(cause)).split('\n')[0]
    };
    report.failures.push(failure);
    console.log(`Failed: ${name}`);
    await page.screenshot({ path: `/tmp/aiao-terminal-${name}.png` });
    failure.recovery = await recoverShell();
  }
}

async function createProject(name, template = 'vanilla') {
  await root.getByRole('button', { name: '应用程序菜单', exact: true }).click();
  await root.getByRole('menuitem', { name: '新建项目', exact: true }).click();
  await page.getByRole('textbox', { name: '项目名称', exact: true }).fill(name);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('textbox', { name: '模板：vanilla / react / vue / angular', exact: true }).fill(template);
  await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click();
  await expect(root.locator('[data-slot="workspace-label"]')).toHaveText(name);
}

try {
  report.browser = browser.version();
  await page.goto(url);
  await expect(root).toBeVisible({ timeout: 60000 });
  const overlay = page.locator('vite-error-overlay');
  if (await overlay.count())
    throw new Error(
      await overlay.evaluate(
        element => element.shadowRoot?.querySelector('.message')?.textContent ?? element.textContent
      )
    );
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await createProject('Terminal verification');
  await root.locator('.wb-title-actions [data-action="terminal"]').click();
  await expect(terminal.locator('[data-terminal-status]')).toHaveText('运行中', { timeout: 120000 });
  await attempt('node-shell-and-package-managers', async () => {
    await command('node -e "console.log(\'AIAO_NODE_OK\',process.version)"');
    await expect(screen).toContainText(/AIAO_NODE_OK\s+v\d+/);
    await command('npm --version && echo AIAO_NPM_OK');
    await expect
      .poll(async () =>
        (await screen.locator(':scope > div').allTextContents()).some(line => line.trim() === 'AIAO_NPM_OK')
      )
      .toBe(true);
    await command('pnpm --version && echo AIAO_PNPM_OK');
    await expect
      .poll(async () =>
        (await screen.locator(':scope > div').allTextContents()).some(line => line.trim() === 'AIAO_PNPM_OK')
      )
      .toBe(true);
  });

  await attempt('bidirectional-files-and-terminal-deletion', async () => {
    await command("node -e \"require('node:fs').writeFileSync('terminal-created.txt','from shell')\"");
    const file = root.locator('.wb-file[title="terminal-created.txt"]');
    await expect(file).toBeVisible();
    await file.click();
    const editor = root
      .locator('[data-editor-path="terminal-created.txt"]')
      .getByRole('textbox', { name: '项目源码', exact: true });
    await expect(editor).toContainText('from shell');
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('from editor');
    await page.keyboard.press('ControlOrMeta+S');
    await expect(root.locator('[data-slot="save-status"]')).toContainText('已保存');
    await command("node -p \"require('node:fs').readFileSync('terminal-created.txt','utf8')\"");
    await expect(screen).toContainText('from editor');
    await command('rm terminal-created.txt');
    await expect(file).toHaveCount(0);
  });

  await attempt('npm-and-pnpm-installation-output', async () => {
    await command(
      "npm install is-number@7.0.0 --ignore-scripts --no-audit --no-fund && node -e \"console.log('AIAO_NPM_INSTALLED_'+require('is-number')('42'))\""
    );
    await expect(screen).toContainText('AIAO_NPM_INSTALLED_true', { timeout: 120000 });
    await command(
      "pnpm add is-odd@3.0.1 --ignore-scripts && node -e \"console.log('AIAO_PNPM_INSTALLED_'+require('is-odd')(3))\""
    );
    await expect(screen).toContainText('AIAO_PNPM_INSTALLED_true', { timeout: 120000 });
    await page.screenshot({ path: '/tmp/aiao-terminal-installation.png' });
  });

  await attempt('server-preview-and-control-c', async () => {
    await command(
      "node -e \"require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>AIAO_SERVER_OK</h1>')}).listen(5173)\""
    );
    const preview = serviceFrame(5173);
    await expect(preview.locator('body')).toHaveText('AIAO_SERVER_OK', { timeout: 60000 });
    await page.screenshot({ path: '/tmp/aiao-terminal-verification.png' });
    await input.press('Control+c');
    // 中断后会重绘提示符，重绘期间输入会被行编辑器打乱光标；等新提示符出现再输入
    await expect.poll(async () => interruptedPrompt.test(await screen.innerText())).toBe(true);
    await page.waitForTimeout(500);
    await command("node -e \"console.log('AIAO_AFTER_'+'INTERRUPT')\"");
    await expect(screen).toContainText('AIAO_AFTER_INTERRUPT');
  });
  for (const [template, heading, port] of [
    ['vanilla', '本地 TypeScript 模板', 5173],
    ['react', '本地 React 模板', 5173],
    ['vue', '本地 Vue 模板', 5173],
    ['angular', 'Angular workspace', 4200]
  ].filter(([template]) => templates.includes(template))) {
    await createProject(`Project run ${template}`, template);
    const run = root.locator('.wb-title-actions [data-action="run"]');
    const app = serviceFrame(port);
    await attempt(`top-run-${template}-install-start-preview-control-c`, async () => {
      await run.click();
      await expect(screen).toContainText('pnpm install', { timeout: 120000 });
      await expect(app.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 180000 });
      const counter = template === 'angular' ? 'Count:' : '次数';
      await app.getByRole('button', { name: `${counter} 0`, exact: true }).click();
      await expect(app.getByRole('button', { name: `${counter} 1`, exact: true })).toBeVisible();
      const runningOutput = await screen.innerText();
      await run.click();
      await expect(run).toBeEnabled();
      await expect(root.locator('.wb-server-preview')).toHaveCount(1);
      await expect.poll(() => screen.innerText()).toBe(runningOutput);
      await input.press('Control+c');
      await expect(terminal.locator('[data-terminal-status]')).toContainText('项目已停止', { timeout: 30000 });
      await terminal.locator('[data-terminal-session="shell"]').click();
      await command(
        `node -e "fetch('http://localhost:${port}').then(()=>console.log('AIAO_SERVICE_STILL_RUNNING')).catch(()=>console.log('AIAO_SERVICE_'+'STOPPED'))"`
      );
      await expect(screen).toContainText('AIAO_SERVICE_STOPPED');
    });
    if (template !== 'vanilla') continue;
    await attempt('top-run-restart-after-control-c', async () => {
      const previousPreview = await root.locator(`iframe[title="项目服务 :${port}"]`).elementHandle();
      await run.click();
      await expect
        .poll(async () => previousPreview?.evaluate(frame => frame.isConnected).catch(() => false), {
          timeout: 120000
        })
        .toBe(false);
      await expect(app.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 120000 });
      await input.press('Control+c');
      await expect(terminal.locator('[data-terminal-status]')).toContainText('项目已停止', { timeout: 30000 });
    });
  }
  // US-409 AC#5 / AC#7：宿主跨源隔离、宿主的 Service Worker 不顶掉工作台的 ngsw、服务预览碰不到工作台
  // （项目停止后服务预览仍显示最后的页面，按它的源检查即可）
  if (hosted)
    await attempt('runtime-host-isolation', async () => {
      const hostOrigin = runtimeHostFor(runtime, url);
      const hostFrame = page.frames().find(frame => frame.url() === `${hostOrigin}/`);
      assert.ok(hostFrame, `找不到 ${runtime} 宿主 iframe`);
      const host = await hostFrame.evaluate(async () => ({
        isolated: crossOriginIsolated,
        sharedArrayBuffer: typeof SharedArrayBuffer,
        serviceWorker: (await navigator.serviceWorker.getRegistration('/'))?.scope ?? null
      }));
      assert.deepEqual(host, { isolated: true, sharedArrayBuffer: 'function', serviceWorker: `${hostOrigin}/` });
      if (production) {
        const workbenchWorker = await page.evaluate(
          async () => (await navigator.serviceWorker.ready).active?.scriptURL ?? null
        );
        assert.equal(workbenchWorker, `${new URL(url).origin}/ngsw-worker.js`);
      }
      // 宿主源上除了内核宿主页与 vivari 的预览容器页，剩下的就是服务预览文档
      const preview = page
        .frames()
        .find(
          frame =>
            frame !== hostFrame &&
            frame.url().startsWith(`${hostOrigin}/`) &&
            !frame.url().startsWith(`${hostOrigin}/preview-frame.html`)
        );
      assert.ok(preview, `找不到 ${runtime} 服务预览`);
      const access = await preview.evaluate(() => {
        const blocked = action => {
          try {
            action();
            return 'allowed';
          } catch (error) {
            return error.name;
          }
        };
        return {
          origin: location.origin,
          workbenchDocument: blocked(() => top.document.title),
          workbenchStorage: blocked(() => top.localStorage.length)
        };
      });
      assert.deepEqual(access, {
        origin: hostOrigin,
        workbenchDocument: 'SecurityError',
        workbenchStorage: 'SecurityError'
      });
    });
  await createProject('Terminal isolated verification');
  await attempt('project-switch-process-and-filesystem-isolation', async () => {
    await expect(root.locator('.wb-server-preview')).toHaveCount(0);
    await root.locator('.wb-title-actions [data-action="terminal"]').click();
    await expect(terminal.locator('[data-terminal-status]')).toHaveText('运行中', { timeout: 120000 });
    await command("node -e \"console.log('AIAO_NEW_PROJECT_'+!require('node:fs').existsSync('node_modules/is-odd'))\"");
    await expect(screen).toContainText('AIAO_NEW_PROJECT_true');
  });
  await attempt('process-and-preview-cleanup', async () => {
    await terminal.getByRole('button', { name: '停止终端', exact: true }).click();
    await expect(terminal.locator('[data-terminal-status]')).toHaveText('尚未启动');
    await expect(root.locator('.wb-server-preview')).toHaveCount(0);
  });
  const clean = !report.failures.length && !report.errors.length && !report.consoleErrors.length;
  report.status = clean ? 'passed' : 'failed';
  if (!clean) process.exitCode = 1;
} catch (cause) {
  report.failure = cause instanceof Error ? cause.message : String(cause);
  report.terminal = await screen.innerText().catch(() => terminal.locator('[data-terminal-status]').textContent());
  await page.screenshot({ path: '/tmp/aiao-terminal-verification.png' }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  // 顶层键按字母序写出，与仓库 prettier 的 sort-json 一致
  const sorted = Object.fromEntries(Object.entries(report).toSorted(([left], [right]) => left.localeCompare(right)));
  await writeFile(reportPath, `${JSON.stringify(sorted, null, 2)}\n`);
  await browser.close();
  if (production) await new Promise(resolve => production.server.close(resolve));
  runtimeHost?.kill();
  console.log(JSON.stringify(report, null, 2));
}
