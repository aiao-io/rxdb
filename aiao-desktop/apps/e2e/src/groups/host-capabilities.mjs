import { grantCapabilities } from '../harness/capabilities.mjs';
import { desktopLimits, filePanel, standinCalls, traced, until } from '../harness/host-calls.mjs';

/** Aiao Code 的清单能力加上 notification 与 filesystem：只在本检查组的浏览器上下文里改写构建产物，清单源码不动。 */
const CAPABILITIES = [
  'window',
  'clipboard:read',
  'clipboard:write',
  'notification',
  'filesystem:read',
  'filesystem:write'
];
/** 1×1 的 PNG：通知的内联图片。 */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * 通知、剪贴板与未授权的写入（ADESK-US-206 阶段 D，AC#11）：用替身应用顶替 Aiao Code。
 *
 * - **没改写的构建**（Aiao Code 的最小清单：window 与剪贴板读写）：未声明的 notification、filesystem 与 appearance 写入被稳定拒绝，
 *   窗口里有一句可见原因；WebKit 的宿主读取在入口禁用并持续说明原因，其余引擎的读取由浏览器权限决定（不授权时 `BROWSER_PERMISSION_DENIED`，Playwright 的 `grantPermissions`
 *   之后读到系统剪贴板的内容），写入要求用户手势：点一下应用的 iframe 之后写成功，空闲 5 秒以上（用户激活过期）再写被拒绝，宿主不替用户写。
 * - **改写清单的构建**（见 `harness/capabilities.mjs`）：通知出现在通知中心、归属调用方、同一应用的去重键覆盖旧条目、频率上限、
 *   不随窗口关闭撤回、单条与全部清除、键盘可操作、刷新后不保留（状态只在内存里）。
 *
 * 剪贴板的内容核对（`clipboardHoldsWrittenText`、`clipboardUnchangedAfterDenial`）与读取成功路径（`clipboardReadAfterGrant`）要读系统剪贴板，
 * Chromium 申请读写权限，WebKit 只申请它支持的读取权限，Firefox 使用浏览器自己的权限机制。
 * 授权与内容核对分别断言；宿主能直接读取不代表应用经过 Orbit 的读取已经成功。
 * 键盘检查用 Playwright 的键盘接口（可信的输入事件，不是真实键盘设备）。
 */
export const hostCapabilities = {
  name: 'host-capabilities',
  description: '通知、剪贴板与未授权的写入：权限与用户手势、通知中心的归属与限额、未声明的能力被拒绝',
  standins: ['aiao-code'],
  keys: [
    'hostCapabilities.undeclaredNotificationDenied',
    'hostCapabilities.undeclaredFilesystemDenied',
    'hostCapabilities.unauthorizedAppearanceWriteDenied',
    'hostCapabilities.denialShowsReasonInWindow',
    'hostCapabilities.clipboardReadCapabilityMatchesBrowser',
    'hostCapabilities.clipboardReadRestrictionExplainedAtEntry',
    'hostCapabilities.clipboardReadRestrictionPersists',
    'hostCapabilities.clipboardReadDeniedWithoutPermission',
    'hostCapabilities.clipboardWriteWithGesture',
    'hostCapabilities.clipboardHoldsWrittenText',
    'hostCapabilities.clipboardReadAfterGrant',
    'hostCapabilities.clipboardWriteWithoutGestureDenied',
    'hostCapabilities.clipboardUnchangedAfterDenial',
    'hostCapabilities.clipboardDenialIsForTheAppOnly',
    'hostCapabilities.notificationAppearsInCentre',
    'hostCapabilities.notificationAttributedToCaller',
    'hostCapabilities.notificationSpoofRejected',
    'hostCapabilities.notificationDedupeReplaces',
    'hostCapabilities.notificationInvalidIconRejected',
    'hostCapabilities.notificationSurvivesWindowClose',
    'hostCapabilities.notificationKeyboardOperable',
    'hostCapabilities.notificationClearAll',
    'hostCapabilities.notificationRateLimited',
    'hostCapabilities.notificationIconsShown',
    'hostCapabilities.notificationNotKeptAcrossReload'
  ],
  async run(session) {
    const { page, context, origin } = session;
    const { win, closeAll, appears, disappears } = session.helpers;
    const calls = standinCalls(session);
    const { call } = calls;
    const panel = filePanel(page);
    const vscodeWin = win('vscode');
    const limits = await desktopLimits();
    const hostCapabilities = traced('host-capabilities');

    const openAiaoCode = async () => {
      session.aiaoCode.mode = 'standard';
      await page.locator('#dock .di[data-app="vscode"]').click();
      await appears(vscodeWin.locator('.webapp[data-webapp-state="ready"]'), 15_000);
      await until(page, async () => (await calls.frameHandle())?.evaluate(() => window.standin?.instance));
    };
    const noticeText = async () =>
      (
        (await vscodeWin
          .locator('[data-webapp-notice]')
          .textContent()
          .catch(() => '')) ?? ''
      ).trim();
    const theme = () => page.evaluate(() => document.documentElement.dataset['theme']);
    const hostClipboard = () => page.evaluate(() => navigator.clipboard.readText().catch(error => `ERR ${error.name}`));
    const centre = {
      open: async () => {
        await page.locator('#menubar #mb-clock').click();
        await page.locator('#nc').waitFor();
        await page.waitForTimeout(450);
      },
      close: async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(450);
      },
      notes: () => page.locator('[data-nc-note]'),
      texts: () =>
        page.locator('[data-nc-note]').evaluateAll(nodes =>
          nodes.map(node => ({
            app: node.querySelector('[data-nc-app]')?.textContent?.trim(),
            appId: node.getAttribute('data-app'),
            title: node.querySelector('[data-nc-title]')?.textContent?.trim(),
            body: node.querySelector('[data-nc-body]')?.textContent?.trim(),
            time: node.querySelector('[data-nc-time]')?.textContent?.trim(),
            icon: node.querySelector('.art use')?.getAttribute('href'),
            dedupe: node.getAttribute('data-dedupe')
          }))
        ),
      count: async () => await page.locator('[data-nc-note]').count()
    };
    const waitCount = async wanted =>
      (await until(page, async () => (await centre.count()) === wanted, 3_000)) === true;

    await session.openDesktop();
    await closeAll();
    await openAiaoCode();

    /* ───── 没改写的构建：Aiao Code 的最小清单。未声明的能力稳定被拒绝，窗口里有一句可见原因 ───── */
    const themeBefore = await theme();
    const denied = result =>
      result.ok === false && result.code === 'CAPABILITY_DENIED' && result.name === 'DesktopError';
    const notifyDenied = await call('notification.post', { title: 'Hello', body: 'World' });
    hostCapabilities.undeclaredNotificationDenied = denied(notifyDenied);
    hostCapabilities.denialShowsReasonInWindow =
      (await until(page, async () => (await noticeText()).includes('notification.post'), 3_000)) === true &&
      (await noticeText()) === '“Aiao Code” isn’t allowed to use notification (notification.post).' &&
      (await vscodeWin.locator('[data-webapp-notice]').getAttribute('data-notice-code')) === 'CAPABILITY_DENIED';
    const openDenied = await call('filesystem.open', {});
    const saveDenied = await call('filesystem.save', { suggestedName: 'a.txt', text: 'x' });
    const handleDenied = await call('filesystem.save', { handle: 'made-up', suggestedName: 'a.txt', text: 'x' });
    hostCapabilities.undeclaredFilesystemDenied =
      denied(openDenied) && denied(saveDenied) && denied(handleDenied) && (await panel.panel.count()) === 0;
    const appearanceDenied = await call('appearance.set', { appearance: 'dark' });
    await page.waitForTimeout(300);
    hostCapabilities.unauthorizedAppearanceWriteDenied =
      denied(appearanceDenied) && denied(await call('appearance.get')) && (await theme()) === themeBefore;
    await page.waitForTimeout(4_800);

    /* ───── 剪贴板：WebKit 在握手前禁用宿主读取，其余引擎由浏览器权限决定 ───── */
    const readRestricted = session.engine === 'webkit';
    const readDenial = readRestricted ? 'CAPABILITY_DENIED' : 'BROWSER_PERMISSION_DENIED';
    const advertised = await (await calls.frame()).evaluate(() => window.standin.capabilities);
    const restriction = vscodeWin.locator('[data-webapp-restriction][data-disabled-capability="clipboard:read"]');
    hostCapabilities.clipboardReadCapabilityMatchesBrowser =
      advertised.includes('clipboard:read') === !readRestricted && advertised.includes('clipboard:write');
    hostCapabilities.clipboardReadRestrictionExplainedAtEntry =
      readRestricted ?
        (await restriction.isVisible()) &&
        /clipboard reading.*disabled.*Safari.*WebKit/i.test(await restriction.innerText())
      : (await restriction.count()) === 0;
    const readWithoutPermission = await call('clipboard.readText');
    hostCapabilities.clipboardReadDeniedWithoutPermission =
      readWithoutPermission.ok === false && readWithoutPermission.code === readDenial;
    /* WebKit 只支持读取授权，写入依赖用户手势；Firefox 使用自己的权限机制。 */
    const permissions = session.engine === 'webkit' ? ['clipboard-read'] : ['clipboard-read', 'clipboard-write'];
    const granted = await context.grantPermissions(permissions, { origin }).then(
      () => true,
      error => error
    );
    if (granted !== true && session.engine !== 'firefox') throw granted;
    /* 一次真实的点击落在应用的 iframe 里：跨源 iframe 里的点击把用户激活传给宿主页面。 */
    const content = await vscodeWin.locator('.webapp').boundingBox();
    await page.mouse.click(content.x + 200, content.y + 120);
    const written = await call('clipboard.writeText', 'hello from the stand-in');
    hostCapabilities.clipboardWriteWithGesture = written.ok === true;
    /* 内容读回来核对：页面脚本读取系统剪贴板需要浏览器授权。 */
    hostCapabilities.clipboardHoldsWrittenText = (await hostClipboard()) === 'hello from the stand-in';
    await page.mouse.click(content.x + 200, content.y + 120);
    const readBack = await call('clipboard.readText');
    if (!readBack.ok) console.error('剪贴板读取诊断', JSON.stringify({ permissions, granted, readBack }));
    hostCapabilities.clipboardReadAfterGrant = readBack.ok === true && readBack.value === 'hello from the stand-in';
    /* 没有用户手势：在应用里排一个 6.5 秒之后的写入（排它的那一刻带来的激活 5 秒后过期），期间不再有任何输入。 */
    await (
      await calls.frame()
    ).evaluate(() => {
      setTimeout(() => window.standin.start('late-write', 'clipboard.writeText', 'written without a gesture'), 6_500);
    });
    await page.waitForTimeout(8_000);
    const lateWrite = await page.evaluate(() => window.__standinResults['late-write']);
    hostCapabilities.clipboardWriteWithoutGestureDenied =
      lateWrite?.ok === false && lateWrite.code === 'BROWSER_PERMISSION_DENIED';
    hostCapabilities.clipboardUnchangedAfterDenial = (await hostClipboard()) === 'hello from the stand-in';
    hostCapabilities.clipboardReadRestrictionPersists =
      readRestricted ?
        (await restriction.isVisible()) && !advertised.includes('clipboard:read')
      : (await restriction.count()) === 0;
    /* 浏览器层的拒绝只回给应用：窗口里不弹提示条，桌面不替应用说话。 */
    hostCapabilities.clipboardDenialIsForTheAppOnly =
      (await vscodeWin.locator('[data-webapp-notice]').count()) === 0 && lateWrite.code === 'BROWSER_PERMISSION_DENIED';

    /* ───── 改写清单的构建：通知 ───── */
    await grantCapabilities(session, CAPABILITIES);
    await session.reloadDesktop();
    await closeAll();
    await openAiaoCode();

    const first = await call('notification.post', { title: 'Build finished', body: 'main is green', dedupeKey: 'ci' });
    await centre.open();
    const [note] = await centre.texts();
    hostCapabilities.notificationAppearsInCentre =
      first.ok === true &&
      typeof first.value.id === 'string' &&
      (await centre.count()) === 1 &&
      note?.title === 'Build finished' &&
      note.body === 'main is green' &&
      /^\d{1,2}:\d{2}\s?[AP]M$/.test(note.time ?? '');
    /* 条目归属调用方：显示的是登记表里的名称与图标，不是应用自己填的。 */
    hostCapabilities.notificationAttributedToCaller =
      note?.app === 'Aiao Code' && note.appId === 'vscode' && note.icon === '#app-aiao-code';
    await centre.close();

    /* 应用想冒名（在请求里夹带来源字段）：被宿主拒绝，通知中心没有多出条目。 */
    const instance = await (await calls.frame()).evaluate(() => window.standin.instance);
    const spoof = await (
      await calls.frame()
    ).evaluate(
      id =>
        window.standin.raw('desktop.notification.post', {
          instanceId: id,
          args: { title: 'Security alert', body: 'Your Mac is at risk', appId: 'mail', sender: 'Mail' }
        }),
      instance
    );
    await centre.open();
    hostCapabilities.notificationSpoofRejected =
      spoof.ok === true &&
      spoof.value.ok === false &&
      spoof.value.code === 'INVALID_ARGUMENT' &&
      (await centre.count()) === 1;
    await centre.close();

    /* 同一应用相同的去重键覆盖旧条目；没有去重键的叠加。 */
    await call('notification.post', { title: 'Build finished (retry)', body: 'main is green again', dedupeKey: 'ci' });
    await call('notification.post', { title: 'Another note', body: 'no dedupe key' });
    await centre.open();
    const afterDedupe = await centre.texts();
    hostCapabilities.notificationDedupeReplaces =
      afterDedupe.length === 2 &&
      afterDedupe.filter(entry => entry.dedupe === 'ci').length === 1 &&
      afterDedupe.some(entry => entry.title === 'Build finished (retry)') &&
      !afterDedupe.some(entry => entry.title === 'Build finished');
    await centre.close();

    /* 图标只能是登记的图标或内联图片：别的写法与网址被拒绝，不进通知中心。 */
    const badIcons = await Promise.all(
      ['app-nonexistent', 'https://evil.example/x.png', 'javascript:alert(1)'].map(icon =>
        call('notification.post', { title: 'Bad icon', body: '', icon })
      )
    );
    await centre.open();
    hostCapabilities.notificationInvalidIconRejected =
      badIcons.every(result => result.ok === false && result.code === 'INVALID_ARGUMENT') &&
      (await centre.count()) === 2;
    await centre.close();

    /* 已提交的通知不随窗口关闭撤回。 */
    await vscodeWin.locator('.tl .c').click();
    await disappears(page.locator('.win[data-app="vscode"]'), 5_000);
    await centre.open();
    hostCapabilities.notificationSurvivesWindowClose =
      (await centre.count()) === 2 && (await centre.texts()).every(entry => entry.appId === 'vscode');

    /* 键盘可操作：Tab 从「Clear All」走到第一条的清除按钮，Enter 清除它。 */
    await page.locator('[data-nc-clear-all]').focus();
    await page.keyboard.press('Tab');
    const onClear = await page.evaluate(() => ({
      focused: document.activeElement?.matches('[data-nc-clear]') ?? false,
      label: document.activeElement?.getAttribute('aria-label') ?? ''
    }));
    await page.keyboard.press('Enter');
    hostCapabilities.notificationKeyboardOperable =
      onClear.focused && onClear.label.startsWith('Clear notification from Aiao Code') && (await waitCount(1));
    await page.locator('[data-nc-clear-all]').click();
    hostCapabilities.notificationClearAll =
      (await waitCount(0)) && (await page.locator('[data-nc-clear-all]').count()) === 0;
    await centre.close();

    /* 频率上限：同一应用每分钟最多 perMinute 条（前面已经提交了 3 条被接收的），超限是 RATE_LIMITED，不进通知中心。 */
    await openAiaoCode();
    const accepted = [];
    let limited;
    for (let index = 0; index < limits.notification.perMinute + 3 && !limited; index++) {
      const icon =
        index === 0 ? 'app-mail'
        : index === 1 ? PNG
        : undefined;
      const result = await call('notification.post', { title: `Burst ${index}`, body: 'x', ...(icon ? { icon } : {}) });
      if (result.ok) accepted.push(index);
      else limited = result;
    }
    await centre.open();
    hostCapabilities.notificationRateLimited =
      limited?.ok === false &&
      limited.code === 'RATE_LIMITED' &&
      accepted.length === limits.notification.perMinute - 3 &&
      (await centre.count()) === accepted.length;
    const shapes = await page.evaluate(() => ({
      images: document.querySelectorAll('[data-nc-note] img[data-nc-image]').length,
      symbols: document.querySelectorAll('[data-nc-note] svg.pic').length
    }));
    hostCapabilities.notificationIconsShown = shapes.images === 1 && shapes.symbols === 1;
    await centre.close();

    /* 状态只在内存里（每个标签页自己的）：刷新后不保留。 */
    await session.reloadDesktop();
    await centre.open();
    hostCapabilities.notificationNotKeptAcrossReload =
      (await centre.count()) === 0 && (await page.locator('[data-nc-clear-all]').count()) === 0;
    await centre.close();

    return { hostCapabilities };
  }
};
