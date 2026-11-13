import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const outputRoot = resolve(process.cwd(), '../../../dist/aiao-desktop/apps/web/browser');
/** 替身应用用 Orbit 客户端的正式构建握手（e2e 目标先构建 orbit）。 */
const orbitDist = resolve(process.cwd(), '../../../packages/orbit/dist');
const STANDIN_ORIGIN = 'https://vscode.aiao.io';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};

/** 启动台里的应用：[应用 id, 显示名]。 */
const APPS = [
  ['finder', 'Finder'],
  ['safari', 'Safari'],
  ['mail', 'Mail'],
  ['messages', 'Messages'],
  ['maps', 'Maps'],
  ['photos', 'Photos'],
  ['facetime', 'FaceTime'],
  ['calendar', 'Calendar'],
  ['contacts', 'Contacts'],
  ['reminders', 'Reminders'],
  ['notes', 'Notes'],
  ['freeform', 'Freeform'],
  ['voice', 'Voice Memos'],
  ['appstore', 'App Store'],
  ['podcasts', 'Podcasts'],
  ['music', 'Music'],
  ['tv', 'TV'],
  ['books', 'Books'],
  ['stocks', 'Stocks'],
  ['weather', 'Weather'],
  ['clock', 'Clock'],
  ['terminal', 'Terminal'],
  ['activity', 'Activity Monitor'],
  ['diskutil', 'Disk Utility'],
  ['fontbook', 'Font Book'],
  ['calculator', 'Calculator'],
  ['textedit', 'TextEdit'],
  ['preview', 'Preview'],
  ['settings', 'System Settings']
];

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = normalize(join(outputRoot, relativePath));
  if (!filePath.startsWith(`${outputRoot}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  });
  createReadStream(filePath).pipe(response);
});

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Failed to start the smoke test server');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* 只验证本地行为：外网资源（壁纸、地图瓦片、天气）一律拦掉，结果稳定。 */
await context.route(
  url => !url.href.startsWith(origin),
  route => route.abort()
);

/**
 * 替身应用（ADESK-US-202）：顶替集成应用 Aiao Code 的入口 https://vscode.aiao.io/，按真实的接入契约
 * 返回 COEP 与 CORP，并用 Orbit 客户端握手。`standinMode` 切换就绪、自报失败与离线三种情形。
 */
let standinMode = 'ready';
const standinPage = mode => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Aiao Code stand-in</title></head>
  <body style="margin: 0; font: 14px system-ui">
    <textarea data-standin-input style="width: 90%; height: 120px"></textarea>
    <script type="module">
      import { connectOrbitClient } from './__standin/orbit/client.js';
      const client = await connectOrbitClient();
      const state = { id: crypto.randomUUID(), visibility: [] };
      window.standin = state;
      client.onVisibilityChange(visible => state.visibility.push(visible));
      /* 跨源 iframe 没有用户激活时不能自己抢焦点；等桌面把焦点交过来再落到输入框。 */
      addEventListener('focus', () => document.querySelector('[data-standin-input]').focus());
      ${mode === 'fail' ? "client.fail('stand-in failed on purpose');" : 'setTimeout(() => client.ready(), 600);'}
    </script>
  </body>
</html>`;
await context.route(`${STANDIN_ORIGIN}/**`, route => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/__standin/orbit/')) {
    const filePath = normalize(join(orbitDist, url.pathname.slice('/__standin/orbit/'.length)));
    if (!filePath.startsWith(`${orbitDist}/`) || !existsSync(filePath)) return route.fulfill({ status: 404 });
    return route.fulfill({
      path: filePath,
      headers: { 'Content-Type': contentTypes['.js'], 'Cross-Origin-Resource-Policy': 'cross-origin' }
    });
  }
  if (standinMode === 'offline') return route.abort('internetdisconnected');
  return route.fulfill({
    status: 200,
    headers: {
      'Content-Type': contentTypes['.html'],
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    },
    body: standinPage(standinMode)
  });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(message.text()))
    errors.push(message.text());
});

const win = id => page.locator(`.win[data-app="${id}"]:not(.closing)`);
const closeAll = async () => {
  for (let guard = 0; guard < 40; guard++) {
    const close = page.locator('.win:not(.closing) .tl .c');
    if ((await close.count()) === 0) return;
    await close.first().dispatchEvent('click');
    await page.waitForTimeout(240);
  }
};
const launch = async name => {
  await page.locator('#dock .di[data-app="launchpad"]').click();
  await page.waitForSelector('#lpad:not(.out) [data-lq]');
  await page.locator('#lpad [data-lq]').fill(name);
  await page.locator('#lpad [data-lq]').press('Enter');
};
/** 等元素可见；弹出层先隐藏测量、下一帧才定位显示。 */
const shows = locator =>
  locator.waitFor({ state: 'visible', timeout: 3_000 }).then(
    () => true,
    () => false
  );
const xtermText = () =>
  page.evaluate(() => document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? '');
/** 在终端里输入一条命令；给了 `expect` 就等输出里出现它。 */
const runInShell = async (command, expect) => {
  await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
  if (!expect) return true;
  return page
    .waitForFunction(
      source =>
        new RegExp(source).test(document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? ''),
      expect.source,
      { timeout: 15_000 }
    )
    .then(
      () => true,
      () => false
    );
};
/** 桌面图标来自 ~/Desktop：id 是 `file:<文件名>`。 */
const desktopIcon = name => page.locator(`.dicon[data-id="file:${name}"]`);
const appears = (locator, timeout = 10_000) =>
  locator.waitFor({ state: 'attached', timeout }).then(
    () => true,
    () => false
  );
const disappears = (locator, timeout = 10_000) =>
  locator.waitFor({ state: 'detached', timeout }).then(
    () => true,
    () => false
  );

try {
  await page.goto(`${origin}/?boot=0`, { waitUntil: 'load' });
  await win('finder').waitFor();

  const shell = await page.evaluate(() => ({
    stage: Boolean(document.querySelector('#stage')),
    menubar: Boolean(document.querySelector('#menubar')),
    dock: document.querySelectorAll('#dock .di').length === 15,
    /* 运行时已全部变成 Angular 组件：不再有全局入口，也不再往页面注入脚本。 */
    noRuntimeGlobals: ['WM', 'APPS', 'Pop', 'SYS', 'Bus', '__aiaoRuntimeBridge', '__aiaoTerminalBridge'].every(
      name => !(name in window)
    ),
    noInlineScripts: [...document.scripts].every(script => script.src !== '')
  }));

  /* Finder：双击文件夹进入，标题与路径栏跟着变。 */
  await win('finder').locator('.fitem[data-name="Documents"]').dblclick();
  await page.waitForTimeout(150);
  const finderNavigates = (await win('finder').locator('[data-title]').textContent())?.trim() === 'Documents';

  await closeAll();
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  for (const key of ['ac', 'n1', 'n2', 'add', 'n3', 'eq'])
    await win('calculator').locator(`.ck[data-k="${key}"]`).click();
  await page.waitForTimeout(80);
  const calculatorWorks = (await win('calculator').locator('.calc-out').textContent())?.replace(/\s/g, '') === '15';

  /* 菜单栏：Apple 菜单与前台应用菜单。 */
  await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
  const appleMenu = await shows(page.locator('#layer-menu .pop .mi', { hasText: 'About This Mac' }));
  await page.keyboard.press('Escape');
  const appMenu = (await page.locator('#menubar .mb-item.app').textContent())?.trim() === 'Calculator';

  /* 最小化进 Dock，再从 Dock 还原。 */
  await win('calculator').locator('.tl .m').click();
  await page.waitForTimeout(600);
  const minimized = await win('calculator').evaluate(node => node.style.visibility === 'hidden');
  await page.locator('#dock .di[data-app="calculator"]').click();
  await page.waitForTimeout(700);
  const restored = await win('calculator').evaluate(
    node => node.style.visibility === '' && !node.classList.contains('mini')
  );

  await closeAll();
  await page.locator('#dock .di[data-app="terminal"]').click();
  await page.waitForSelector('.win[data-app="terminal"] .xterm', { timeout: 15_000 });
  await page.waitForTimeout(1_500);
  await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type('echo VIVARI_SMOKE');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      /VIVARI_SMOKE[\s\S]*VIVARI_SMOKE/.test(
        document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? ''
      ),
    undefined,
    { timeout: 15_000 }
  );
  const terminalState = {
    crossOriginIsolated: await page.evaluate(() => window.crossOriginIsolated),
    xterm: (await page.locator('.win[data-app="terminal"] .xterm').count()) === 1,
    helperInput: (await page.locator('.win[data-app="terminal"] .xterm-helper-textarea').count()) === 1,
    vivariShell: (await xtermText()).includes('VIVARI_SMOKE')
  };

  /* 磁盘：目录树与元数据在本地 SQLite（库文件在 OPFS），文件体由 storage 插件放在 OPFS；终端看到同一块磁盘。 */
  const storage = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names = [];
    for await (const [name] of root.entries()) names.push(name);
    const blobDir = await (await root.getDirectoryHandle('aiao-desktop-files')).getDirectoryHandle('blobs');
    return { names, blobs: (await Array.fromAsync(blobDir.keys())).length };
  });
  const diskState = {
    sqliteInOpfs: storage.names.some(name => /^aiao-desktop@.*\.sqlite$/.test(name)),
    fileBodiesInOpfs: storage.blobs > 30,
    desktopFromFolder: (
      await Promise.all(
        ['Projects', 'prasenx.txt', 'Interface Guidelines.pdf', 'Screenshot 2026-07-27 at 4.34.11 PM.png'].map(name =>
          appears(desktopIcon(name))
        )
      )
    ).every(Boolean),
    shellStartsAtHome: await runInShell('pwd', /\/Users\/prasenjit/),
    shellReadsFile: await runInShell('cat Desktop/prasenx.txt', /Scratchpad\. Everything on this Mac/),
    shellListsDesktop: await runInShell('ls ~/Desktop', /Interface Guidelines\.pdf/)
  };
  await runInShell('echo smoke-from-terminal > ~/Desktop/terminal-note.txt');
  diskState.shellWritesDisk = await appears(desktopIcon('terminal-note.txt'));
  await runInShell(
    'touch ~/Desktop/touched.txt && mv ~/Desktop/touched.txt ~/Desktop/moved.txt && cp ~/Desktop/moved.txt ~/Desktop/copied.txt'
  );
  diskState.shellCommandsWork =
    (await appears(desktopIcon('moved.txt'))) &&
    (await appears(desktopIcon('copied.txt'))) &&
    (await desktopIcon('touched.txt').count()) === 0;
  await runInShell('open ~/Desktop/terminal-note.txt');
  diskState.openCommandOpensTextEdit = await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('.win[data-app="textedit"] [data-te-doc]')].some(doc =>
          doc.textContent.includes('smoke-from-terminal')
        ),
      undefined,
      { timeout: 10_000 }
    )
    .then(
      () => true,
      () => false
    );

  /* 桌面这边的改动推进终端：Finder 在桌面目录新建文件夹，终端里马上 ls 得到。 */
  await page.locator('#dock .di[data-app="finder"]').click();
  await win('finder').last().locator('[data-place="Desktop"]').click();
  await win('finder').last().locator('[data-more]').click();
  await page.locator('#layer-menu .pop .mi', { hasText: 'New Folder' }).click();
  diskState.finderFolderOnDesktop = await appears(desktopIcon('untitled folder'));
  diskState.shellSeesFinderChange = await runInShell('ls ~/Desktop', /untitled folder/);

  /* 打开真文件：TextEdit 显示文本内容，预览显示图片本身。 */
  await closeAll();
  await desktopIcon('prasenx.txt').dblclick();
  diskState.textEditShowsFile = await page
    .waitForFunction(
      () => document.querySelector('.win[data-app="textedit"] [data-te-doc]')?.textContent?.includes('cat prasenx.txt'),
      undefined,
      { timeout: 10_000 }
    )
    .then(
      () => true,
      () => false
    );
  await desktopIcon('Screenshot 2026-07-27 at 4.34.11 PM.png').dblclick();
  diskState.previewShowsImage = await page
    .waitForFunction(
      () => document.querySelector('.win[data-app="preview"] img[data-pv-image]')?.naturalWidth === 1440,
      undefined,
      { timeout: 10_000 }
    )
    .then(
      () => true,
      () => false
    );
  await closeAll();

  await page.locator('#dock .di[data-app="launchpad"]').click();
  await page.waitForSelector('#lpad');
  const launchpadOpens = (await page.locator('#lpad').count()) === 1;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(650);
  const launchpadCloses = (await page.locator('#lpad').count()) === 0;

  await page.keyboard.press('Meta+Space');
  await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
  await page.keyboard.type('calc');
  const spotlightFinds = await shows(page.locator('#spot .r.on', { hasText: 'Calculator' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  const notificationsOpen = await shows(page.locator('#nc .wgt').first());
  await page.locator('#menubar #mb-clock').dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  const notificationsClose = (await page.locator('#nc').count()) === 0;

  await closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  const notesWorks = (await win('notes').locator('input').count()) > 0;

  /* 集成应用（ADESK-US-201、ADESK-US-202）：替身应用顶替 vscode.aiao.io，外网照样全部拦截。 */
  await closeAll();
  const vscodeWin = win('vscode');
  const webappIn = state => vscodeWin.locator(`.webapp[data-webapp-state="${state}"]`);
  const standinFrame = () => page.frames().find(frame => frame.url().startsWith(`${STANDIN_ORIGIN}/`));
  const standin = async () =>
    (await standinFrame()?.evaluate(() => ({
      id: window.standin?.id,
      visibility: window.standin?.visibility.join(),
      text: document.querySelector('[data-standin-input]')?.value,
      isolated: window.crossOriginIsolated
    }))) ?? {};
  const integratedApp = {
    dockPinned: await page.evaluate(() => {
      const apps = [...document.querySelectorAll('#dock .di')].map(node => node.getAttribute('data-app'));
      return apps.indexOf('vscode') === apps.indexOf('terminal') + 1;
    })
  };

  await page.locator('#dock .di[data-app="vscode"]').click();
  integratedApp.showsLoading = await shows(webappIn('loading'));
  integratedApp.becomesReady = await appears(webappIn('ready'), 15_000);
  const opened = await standin();
  integratedApp.standinRendered = typeof opened.id === 'string';
  integratedApp.crossOriginIsolated = opened.isolated === true;
  integratedApp.iframePolicy = await vscodeWin.evaluate(node => {
    const frame = node.querySelector('aiao-orbit')?.shadowRoot?.querySelector('iframe');
    return (
      frame?.getAttribute('sandbox') === 'allow-scripts allow-same-origin allow-forms allow-downloads' &&
      frame.getAttribute('allow') === 'cross-origin-isolated; clipboard-read; clipboard-write'
    );
  });

  /* 最小化与还原：应用收到隐藏与显示，iframe 不重载，输入还在。 */
  await standinFrame().locator('[data-standin-input]').fill('typed-before-minimize');
  await vscodeWin.locator('.tl .m').click();
  await page.waitForTimeout(700);
  integratedApp.minimizeHides = (await standin()).visibility === 'false';
  await page.locator('#dock .di[data-app="vscode"]').click();
  await page.waitForTimeout(900);
  const restoredApp = await standin();
  integratedApp.restoreShows = restoredApp.visibility === 'false,true';
  integratedApp.restoreKeepsDocument = restoredApp.id === opened.id && restoredApp.text === 'typed-before-minimize';

  /* 后台窗口：盖激活层，点一下提到前台，键盘焦点交给应用。 */
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  await page.waitForTimeout(300);
  integratedApp.shieldWhenBehind = (await vscodeWin.locator('[data-webapp-shield]').count()) === 1;
  const content = await vscodeWin.locator('.webapp').boundingBox();
  await page.mouse.click(content.x + 40, content.y + content.height - 40);
  await page.waitForTimeout(300);
  integratedApp.clickActivates =
    (await vscodeWin.evaluate(node => node.classList.contains('front'))) &&
    (await page.locator('#menubar .mb-item.app').textContent())?.trim() === 'Aiao Code';
  await page.keyboard.type('xyz');
  await page.waitForTimeout(200);
  integratedApp.keyboardReachesApp = (await standin()).text?.endsWith('xyz') === true;

  /* 菜单打开时点进应用：菜单收起。 */
  await page.locator('#menubar .mb-item.apple').dispatchEvent('mousedown');
  const appleMenuOpen = await shows(page.locator('#layer-menu .pop .mi', { hasText: 'About This Mac' }));
  await page.mouse.click(content.x + content.width / 2, content.y + content.height / 2);
  await page.waitForTimeout(400);
  integratedApp.appClickClosesMenu = appleMenuOpen && (await page.locator('#layer-menu .pop').count()) === 0;

  /* 缩放：按住右下角把手，经过应用内容区往里拖，窗口尺寸跟着指针走。 */
  const beforeResize = await vscodeWin.boundingBox();
  const corner = await vscodeWin.locator('.rz-se').boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 - 200, corner.y + corner.height / 2 - 150, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterResize = await vscodeWin.boundingBox();
  integratedApp.resizeTracksPointer =
    Math.abs(beforeResize.width - 200 - afterResize.width) <= 4 &&
    Math.abs(beforeResize.height - 150 - afterResize.height) <= 4;

  /* 关闭释放 iframe；再打开是新文档。 */
  await vscodeWin.locator('.tl .c').click();
  await page.waitForTimeout(400);
  integratedApp.closeRemovesFrame = (await page.locator('aiao-orbit').count()) === 0;
  await page.locator('#dock .di[data-app="vscode"]').click();
  integratedApp.reopensFresh = (await appears(webappIn('ready'), 15_000)) && (await standin()).id !== opened.id;

  /* 离线：入口请求失败，窗口给出原因，桌面照常；恢复后重试即就绪。 */
  await closeAll();
  standinMode = 'offline';
  await page.locator('#dock .di[data-app="vscode"]').click();
  integratedApp.offlineShowsReason =
    (await appears(webappIn('failed'), 10_000)) &&
    ((await vscodeWin.locator('[data-webapp-reason]').textContent()) ?? '').includes('vscode.aiao.io didn’t connect');
  await page.locator('#dock .di[data-app="calculator"]').click();
  integratedApp.desktopUnaffected = await shows(win('calculator'));
  await win('calculator').locator('.tl .c').click();
  await page.waitForTimeout(400);
  standinMode = 'ready';
  await vscodeWin.locator('[data-webapp-retry]').click();
  integratedApp.retryRecovers = await appears(webappIn('ready'), 15_000);

  /* 应用自报启动失败：窗口显示应用给出的原因。 */
  await closeAll();
  standinMode = 'fail';
  await page.locator('#dock .di[data-app="vscode"]').click();
  integratedApp.appFailureShowsReason =
    (await appears(webappIn('failed'), 10_000)) &&
    ((await vscodeWin.locator('[data-webapp-reason]').textContent()) ?? '').includes('stand-in failed on purpose');
  standinMode = 'ready';

  /* 入口一致（ADESK-US-201）：启动台与聚焦搜索找得到，菜单栏显示应用名，退出关闭全部窗口。 */
  await closeAll();
  await launch('Aiao Code');
  integratedApp.launchpadOpens = await appears(webappIn('ready'), 15_000);
  await closeAll();
  await page.keyboard.press('Meta+Space');
  await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
  await page.keyboard.type('aiao');
  integratedApp.spotlightLists = await shows(page.locator('#spot .r', { hasText: 'Aiao Code' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('#dock .di[data-app="vscode"]').click();
  await appears(webappIn('ready'), 15_000);
  const appMenuTitle = page.locator('#menubar .mb-item.app');
  integratedApp.menubarName = (await appMenuTitle.textContent())?.trim() === 'Aiao Code';
  await appMenuTitle.dispatchEvent('mousedown');
  integratedApp.appMenuItems = (
    await Promise.all(
      ['About Aiao Code', 'Hide Aiao Code', 'Quit Aiao Code'].map(label =>
        shows(page.locator('#layer-menu .pop .mi', { hasText: label }))
      )
    )
  ).every(Boolean);
  await page.locator('#layer-menu .pop .mi', { hasText: 'Quit Aiao Code' }).click();
  integratedApp.quitCloses =
    (await disappears(vscodeWin, 3_000)) &&
    (await page
      .waitForFunction(() => !document.querySelector('#dock .di[data-app="vscode"]')?.classList.contains('run'), undefined, {
        timeout: 3_000
      })
      .then(
        () => true,
        () => false
      ));

  /* 每个应用都能从启动台打开，且不产生错误。 */
  const unopened = [];
  for (const [id, name] of APPS) {
    await closeAll();
    await launch(name);
    try {
      await win(id).waitFor({ timeout: 3_000 });
    } catch {
      unopened.push(id);
    }
  }
  await closeAll();
  const everyAppOpens = unopened.length === 0;

  /* 内置应用的数据也在库里：新建一条备忘录、一条提醒事项，刷新后还在。 */
  await closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  await win('notes').waitFor();
  await win('notes').locator('[data-new]').click();
  await page.waitForTimeout(300);
  await win('notes').locator('[data-doc]').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' smoke-note-body');
  await page.waitForTimeout(1_000);
  await closeAll();
  await launch('Reminders');
  await win('reminders').waitFor();
  await win('reminders').locator('[data-radd]').click();
  await win('reminders').locator('[data-rnew]').click();
  await page.keyboard.type('smoke-reminder');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await closeAll();

  /* 系统设置也在库里：用聚焦搜索切到深色外观，设置在停手 0.4 秒后写回。 */
  await page.keyboard.press('Meta+Space');
  await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
  await page.keyboard.type('dark mode');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 3_000 });
  await page.waitForTimeout(1_000);

  /* 刷新后改动还在（数据在本地 SQLite 与 OPFS 里）；磁盘工具抹掉后回到内置内容。 */
  await page.reload({ waitUntil: 'load' });
  await win('finder').waitFor();
  const persistence = {
    fileSurvivesReload: await appears(desktopIcon('terminal-note.txt')),
    folderSurvivesReload: await appears(desktopIcon('untitled folder')),
    settingsSurviveReload: await page
      .waitForFunction(() => document.documentElement.dataset.theme === 'dark', undefined, { timeout: 10_000 })
      .then(
        () => true,
        () => false
      )
  };
  const windowShowsText = (app, selector, text) =>
    page
      .waitForFunction(
        ([app, selector, text]) =>
          document.querySelector(`.win[data-app="${app}"] ${selector}`)?.textContent?.includes(text) ?? false,
        [app, selector, text],
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );
  await closeAll();
  await page.locator('#dock .di[data-app="notes"]').click();
  persistence.noteSurvivesReload = await windowShowsText('notes', '[data-items]', 'smoke-note-body');
  await closeAll();
  await launch('Reminders');
  persistence.reminderSurvivesReload = await windowShowsText('reminders', '[data-rlist]', 'smoke-reminder');
  await closeAll();
  await launch('Disk Utility');
  await win('diskutil').waitFor();
  await win('diskutil').locator('[data-duerase]').click();
  await page.locator('.pop [data-e]').click();
  persistence.eraseRestoresDisk =
    (await disappears(desktopIcon('terminal-note.txt'), 30_000)) && (await appears(desktopIcon('prasenx.txt'), 30_000));

  const finalChecks = {
    shell,
    finderNavigates,
    calculatorWorks,
    appleMenu,
    appMenu,
    minimized,
    restored,
    terminalState,
    diskState,
    launchpadOpens,
    launchpadCloses,
    spotlightFinds,
    notificationsOpen,
    notificationsClose,
    notesWorks,
    integratedApp,
    everyAppOpens,
    unopened,
    persistence
  };

  if (errors.length > 0) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  const failed =
    Object.values(finalChecks.shell).some(check => !check) ||
    Object.values(finalChecks.terminalState).some(check => !check) ||
    Object.values(finalChecks.diskState).some(check => !check) ||
    Object.values(finalChecks.persistence).some(check => !check) ||
    Object.values(finalChecks.integratedApp).some(check => !check) ||
    Object.values(finalChecks).some(check => check === false);
  if (failed) throw new Error(`Smoke checks failed: ${JSON.stringify(finalChecks)}`);
  console.log(JSON.stringify(finalChecks));
} finally {
  await browser.close();
  server.close();
}
