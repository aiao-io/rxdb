import { existsSync, globSync, readFileSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

import { contentTypes, outputRoot, startDesktopServer } from './desktop-server.mjs';

/** 替身应用用 Orbit 客户端的正式构建握手（e2e 目标先构建 orbit）。 */
const orbitDist = resolve(import.meta.dirname, '../../../../packages/orbit/dist');
const STANDIN_ORIGIN = 'https://vscode.aiao.io';

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
  ['saltline', '几猫3A大作'],
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

const productionScripts = globSync('**/*.js', { cwd: outputRoot });
const devtoolsBundled = productionScripts.filter(file =>
  /@aiao\/rxdb-devtools|__AIAO_RXDB_DEVTOOLS__/.test(readFileSync(join(outputRoot, file), 'utf8'))
);
if (devtoolsBundled.length > 0) throw new Error(`生产构建包含 RxDB DevTools：${devtoolsBundled.join(', ')}`);

const desktop = await startDesktopServer();
const origin = desktop.origin;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/* 只验证本地行为：外网资源（壁纸、地图瓦片、天气）一律拦掉，结果稳定。 */
await context.route(
  url => !url.href.startsWith(origin),
  route => route.abort()
);

/**
 * 替身应用（ADESK-US-202）：顶替集成应用 Aiao Code 的入口 https://vscode.aiao.io/，按真实的接入契约
 * 返回 COEP 与 CORP，并用 Orbit 客户端握手。`standinMode`：standard 保留桌面的标题栏；transparent 隐藏桌面的
 * 标题栏、自己画红黄绿与拖动区（ADESK-US-204）；fail 启动时自报失败；offline 入口请求失败。
 */
let standinMode = 'standard';
const standinPage = mode => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Aiao Code stand-in</title></head>
  <body style="margin: 0; font: 14px system-ui">
    <header data-standin-bar data-orbit-drag-region style="display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px">
      <button data-standin-window="close">×</button>
      <button data-standin-window="minimize">−</button>
      <button data-standin-window="maximize">+</button>
      <span style="margin-left: 24px">Stand-in</span>
      <button data-standin-noop style="margin-left: 16px">noop</button>
    </header>
    <textarea data-standin-input style="width: 90%; height: 120px"></textarea>
    <script type="module">
      import { connectOrbitClient } from './__standin/orbit/client.js';
      import { getCurrentWindow } from './__standin/orbit/window.js';
      const client = await connectOrbitClient();
      const appWindow = getCurrentWindow(client);
      const state = { id: crypto.randomUUID(), visibility: [], window: [] };
      window.standin = state;
      client.onVisibilityChange(visible => state.visibility.push(visible));
      appWindow.onStateChange(next => state.window.push(next));
      const actions = { close: () => appWindow.close(), minimize: () => appWindow.minimize(), maximize: () => appWindow.toggleMaximize() };
      for (const button of document.querySelectorAll('[data-standin-window]'))
        button.addEventListener('click', () => actions[button.dataset.standinWindow]());
      /* 跨源 iframe 没有用户激活时不能自己抢焦点；等桌面把焦点交过来再落到输入框。 */
      addEventListener('focus', () => document.querySelector('[data-standin-input]').focus());
      ${mode === 'transparent' ? 'appWindow.trackDragRegions(document); await appWindow.setDecorations(false);' : ''}
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
    noInlineScripts: [...document.scripts].every(script => script.src !== ''),
    noDevtools: !('__AIAO_RXDB_DEVTOOLS__' in window)
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
  /* 应用没有隐藏装饰（标准窗口、不支持透明窗口的旧版本）：就绪后仍是桌面的标题栏。 */
  integratedApp.standardKeepsChrome = await shows(vscodeWin.locator('.tb .tl'));
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
  standinMode = 'standard';
  await vscodeWin.locator('[data-webapp-retry]').click();
  integratedApp.retryRecovers = await appears(webappIn('ready'), 15_000);

  /* 应用自报启动失败：窗口显示应用给出的原因。 */
  await closeAll();
  standinMode = 'fail';
  await page.locator('#dock .di[data-app="vscode"]').click();
  integratedApp.appFailureShowsReason =
    (await appears(webappIn('failed'), 10_000)) &&
    ((await vscodeWin.locator('[data-webapp-reason]').textContent()) ?? '').includes('stand-in failed on purpose');
  standinMode = 'standard';

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
      .waitForFunction(
        () => !document.querySelector('#dock .di[data-app="vscode"]')?.classList.contains('run'),
        undefined,
        {
          timeout: 3_000
        }
      )
      .then(
        () => true,
        () => false
      ));

  /* 透明窗口（ADESK-US-204）：替身隐藏桌面的标题栏，自己画红黄绿与拖动区，按钮调用桌面的窗口接口。 */
  await closeAll();
  standinMode = 'transparent';
  const standinWindow = async () => (await standinFrame()?.evaluate(() => window.standin?.window.at(-1))) ?? {};
  const zoomed = () => vscodeWin.evaluate(node => node.classList.contains('zoomed'));
  const barPoint = async () => {
    const bar = await standinFrame().locator('[data-standin-bar]').boundingBox();
    return { x: bar.x + bar.width - 80, y: bar.y + bar.height / 2 };
  };
  await page.locator('#dock .di[data-app="vscode"]').click();
  const transparentWindow = { chromeWhileLoading: await shows(vscodeWin.locator('.tb .tl')) };
  await appears(webappIn('ready'), 15_000);
  transparentWindow.chromeHiddenWhenReady =
    (await disappears(vscodeWin.locator('.tb'), 3_000)) &&
    (await appears(vscodeWin.locator('[data-webapp-drag]'), 3_000)) &&
    (await standinFrame().locator('[data-standin-bar]').boundingBox()).y - (await vscodeWin.boundingBox()).y < 2;
  transparentWindow.appKnowsDecorations = await standinFrame()
    .waitForFunction(() => window.standin?.window.at(-1)?.decorations === false, undefined, { timeout: 3_000 })
    .then(
      () => true,
      () => false
    );

  /* 按住替身标题栏空白处拖动：窗口跟着走；最后一步放慢，松手不滑行。 */
  const beforeDrag = await vscodeWin.boundingBox();
  const grab = await barPoint();
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x - 120, grab.y + 80, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.move(grab.x - 119, grab.y + 80);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterDrag = await vscodeWin.boundingBox();
  transparentWindow.dragMovesWindow =
    Math.abs(beforeDrag.x - 119 - afterDrag.x) <= 3 && Math.abs(beforeDrag.y + 80 - afterDrag.y) <= 3;

  /* 按住标题栏里的按钮拖：挖空处归应用，窗口不动。 */
  const noop = await standinFrame().locator('[data-standin-noop]').boundingBox();
  await page.mouse.move(noop.x + noop.width / 2, noop.y + noop.height / 2);
  await page.mouse.down();
  await page.mouse.move(noop.x - 100, noop.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterHole = await vscodeWin.boundingBox();
  transparentWindow.buttonsAreNotDragArea = afterHole.x === afterDrag.x && afterHole.y === afterDrag.y;

  /* 双击空白处缩放；替身的绿色按钮还原。 */
  const doubleClickAt = await barPoint();
  await page.mouse.dblclick(doubleClickAt.x, doubleClickAt.y);
  await page.waitForTimeout(500);
  transparentWindow.doubleClickZooms = await zoomed();
  await standinFrame().locator('[data-standin-window="maximize"]').click();
  await page.waitForTimeout(500);
  transparentWindow.maximizeButtonToggles = !(await zoomed()) && (await standinWindow()).maximized === false;

  /* 切到别的窗口再点回来：替身收到失去与回到前台。 */
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  await page.waitForTimeout(300);
  const blurred = (await standinWindow()).focused === false;
  const back = await barPoint();
  await page.mouse.click(back.x, back.y);
  await page.waitForTimeout(300);
  transparentWindow.focusStateReachesApp = blurred && (await standinWindow()).focused === true;
  await win('calculator').locator('.tl .c').click();
  await page.waitForTimeout(300);

  /* 替身的黄色按钮最小化，从 Dock 还原；红色按钮关闭。 */
  await standinFrame().locator('[data-standin-window="minimize"]').click();
  await page.waitForTimeout(700);
  transparentWindow.minimizeButtonMinimizes = await vscodeWin.evaluate(node => node.style.visibility === 'hidden');
  await page.locator('#dock .di[data-app="vscode"]').click();
  await page.waitForTimeout(900);
  await standinFrame().locator('[data-standin-window="close"]').click();
  transparentWindow.closeButtonCloses = await disappears(vscodeWin, 3_000);
  standinMode = 'standard';

  /*
   * 几猫3A大作（ADESK-US-103）：随桌面发布的单文件游戏，在同源 iframe 里运行。无头 Chromium 只有软件 WebGL，
   * 真游戏开着时整页每秒约一帧，所以窗口这一侧用替身页顶替 /saltline.html，最后单独启动一次真游戏。
   */
  await closeAll();
  const gameUrl = `${origin}/saltline.html`;
  let gameStandin = true;
  await context.route(
    url => url.href === gameUrl,
    route =>
      gameStandin ?
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': contentTypes['.html'], 'Cross-Origin-Embedder-Policy': 'require-corp' },
          body: `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>Saltline stand-in</title></head>
  <body style="margin: 0; height: 100vh; background: #0b0d0f">
    <script>
      window.standin = { id: crypto.randomUUID(), keys: '', presses: 0 };
      addEventListener('keydown', event => (window.standin.keys += event.key));
      addEventListener('pointerdown', () => (window.standin.presses += 1));
    </script>
  </body>
</html>`
        })
      : route.continue()
  );
  const gameWin = win('saltline');
  const gameElement = gameWin.locator('[data-saltline-frame]');
  const gameFrame = () => page.frames().find(frame => frame.url() === gameUrl);
  const gameState = async () => (await gameFrame()?.evaluate(() => window.standin)) ?? {};
  const gameLoaded = (previous = null) =>
    page
      .waitForFunction(
        id => {
          const standin = document.querySelector('[data-saltline-frame]')?.contentWindow?.standin;
          return Boolean(standin) && standin.id !== id;
        },
        previous,
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );
  const game = {};

  await launch('几猫3A大作');
  game.launchpadOpens = (await appears(gameElement)) && (await gameLoaded());
  game.titleBar =
    (await shows(gameWin.locator('.tb .tl'))) &&
    (await gameWin.locator('.tb .title').textContent())?.trim() === '几猫3A大作' &&
    (await page.locator('#menubar .mb-item.app').textContent())?.trim() === '几猫3A大作';
  game.sameOriginFrame = await gameElement.evaluate(
    (frame, url) =>
      frame.src === url &&
      frame.contentWindow?.location.origin === location.origin &&
      !frame.hasAttribute('sandbox') &&
      frame.getAttribute('allow') === 'fullscreen; gamepad',
    gameUrl
  );
  /* 授予的权限在游戏文档里生效（无头 Chromium 不支持指针锁定，那一项在真 Chrome 上验收）。 */
  game.fullscreenAllowed = await gameElement.evaluate(frame => frame.contentDocument?.fullscreenEnabled === true);

  /* 打开即可用键盘：游戏文档加载完就拿到键盘焦点。 */
  const focusedOnOpen = await page
    .waitForFunction(() => document.activeElement?.matches('[data-saltline-frame]'), undefined, { timeout: 3_000 })
    .then(
      () => true,
      () => false
    );
  await page.keyboard.type('wasd');
  game.keyboardOnOpen = focusedOnOpen && (await gameState()).keys === 'wasd';

  /* 后台窗口：盖激活层，点一下只激活窗口、不送进游戏；之后的按键与点击都送到游戏。 */
  await page.locator('#dock .di[data-app="calculator"]').click();
  await win('calculator').waitFor();
  await page.waitForTimeout(300);
  game.shieldWhenBehind = (await gameWin.locator('[data-saltline-shield]').count()) === 1;
  const gameBox = await gameElement.boundingBox();
  await page.mouse.click(gameBox.x + 40, gameBox.y + gameBox.height - 40);
  await page.waitForTimeout(300);
  game.clickActivates =
    (await gameWin.evaluate(node => node.classList.contains('front'))) &&
    (await page.locator('#menubar .mb-item.app').textContent())?.trim() === '几猫3A大作' &&
    (await gameState()).presses === 0;
  await page.keyboard.type('x');
  await page.mouse.click(gameBox.x + 80, gameBox.y + gameBox.height - 80);
  await page.waitForTimeout(200);
  const afterActivate = await gameState();
  game.inputReachesGame = afterActivate.keys === 'wasdx' && afterActivate.presses === 1;

  /* 缩放：按住右下角把手，经过游戏画面往里拖，窗口尺寸跟着指针走。 */
  const beforeGameResize = await gameWin.boundingBox();
  const gameCorner = await gameWin.locator('.rz-se').boundingBox();
  await page.mouse.move(gameCorner.x + gameCorner.width / 2, gameCorner.y + gameCorner.height / 2);
  await page.mouse.down();
  await page.mouse.move(gameCorner.x + gameCorner.width / 2 - 200, gameCorner.y + gameCorner.height / 2 - 150, {
    steps: 12
  });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const afterGameResize = await gameWin.boundingBox();
  game.resizeTracksPointer =
    Math.abs(beforeGameResize.width - 200 - afterGameResize.width) <= 4 &&
    Math.abs(beforeGameResize.height - 150 - afterGameResize.height) <= 4;

  /* 关闭即销毁游戏文档；再打开是新文档。 */
  const openedGame = afterActivate.id;
  await gameWin.locator('.tl .c').click();
  await page.waitForTimeout(400);
  game.closeRemovesFrame = (await page.locator('[data-saltline-frame]').count()) === 0;
  await launch('几猫3A大作');
  game.reopensFresh = await gameLoaded(openedGame);

  /* 聚焦搜索按名称找得到。游戏拿着键盘焦点时桌面快捷键不生效，先关掉窗口。 */
  await closeAll();
  await page.keyboard.press('Meta+Space');
  await page.waitForFunction(() => document.activeElement?.matches('#spot [data-sq]'));
  await page.keyboard.type('3A');
  game.spotlightLists = await shows(page.locator('#spot .r', { hasText: '几猫3A大作' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* 真游戏：随桌面发布的入口在桌面的跨源隔离下启动到标题画面，没有启动错误。 */
  gameStandin = false;
  await launch('几猫3A大作');
  const realGame = await page
    .waitForFunction(
      () => {
        const view = document.querySelector('[data-saltline-frame]')?.contentWindow;
        return view?.__ready === true || Boolean(view?.__fatal);
      },
      undefined,
      { timeout: 120_000, polling: 1_000 }
    )
    .then(
      () =>
        gameFrame().evaluate(() => ({
          ready: window.__ready,
          fatal: window.__fatal,
          errors: window.__errors.length,
          isolated: window.crossOriginIsolated,
          screen: document.querySelector('.menu')?.dataset.screen
        })),
      () => ({})
    );
  game.realGameBoots =
    realGame.ready === true &&
    realGame.fatal === null &&
    realGame.errors === 0 &&
    realGame.isolated === true &&
    realGame.screen === 'title';
  await closeAll();
  gameStandin = true;

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
    transparentWindow,
    game,
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
    Object.values(finalChecks.transparentWindow).some(check => !check) ||
    Object.values(finalChecks.game).some(check => !check) ||
    Object.values(finalChecks).some(check => check === false);
  if (failed) throw new Error(`Smoke checks failed: ${JSON.stringify(finalChecks)}`);
  console.log(JSON.stringify(finalChecks));
} finally {
  await browser.close();
  desktop.close();
}
