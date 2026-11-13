import { standinProbe } from '../harness/standin.mjs';

/** 替身页里的实例已经握手：拿到桌面给它的实例 ID。 */
const NOT_YET = Symbol('not yet');

/**
 * 应用生命周期与统一系统能力（ADESK-US-206 阶段 C，D-18）：用替身应用顶替 Aiao Code，核对
 * 就绪超时与重试创建新实例（AC#3）、能力默认拒绝与窗口里的可见原因（AC#8）、窗口操作与菜单栏（AC#9）、
 * 协议版本不兼容（AC#10）、关闭与重试后旧实例的迟到消息（AC#14、#18）。
 *
 * **关于 AC#14、#18 的诚实说明**：Orbit 实例销毁或失败时端口关闭、iframe 移除，旧实例**物理上**发不出迟到的 ready 或 RPC，
 * 所以这里只验证时间线上的不变量——窗口不重现、Dock 状态不变、新实例不被误判就绪、标题不变——并证明旧实例确实够不到
 * （它的 frame 已分离，对它求值只会失败）。「按实例 ID 丢弃」本身由单测覆盖：`application-runtime.spec.ts`、
 * `remote-app-session.spec.ts`（假的 Orbit 实例模拟旧实例的迟到回调）与 Orbit 包的 `desktop.spec.ts`。
 *
 * **关于 AC#9**：Aiao Code 的清单按它现在实际用到的能力最小化声明（window 与剪贴板），没有声明 menu，所以对真实产物
 * 只能验证「未声明时 `menu.set` 被拒绝、菜单栏仍是标准菜单」与菜单栏随前台窗口切换；登记菜单成功、命令回调与关闭后解绑
 * 由单测覆盖（`app-context.spec.ts`）与 Orbit 的浏览器用例（真实 iframe）。
 *
 * 超时用 Playwright 的 `page.clock` 快进，不真等 60 秒。
 */
export const appLifecycle = {
  name: 'app-lifecycle',
  description: '应用生命周期与系统能力：就绪超时与重试、能力默认拒绝与可见原因、窗口操作、协议版本、旧实例的迟到消息',
  standins: ['aiao-code'],
  keys: [
    'appLifecycle.timeoutShowsReason',
    'appLifecycle.otherWindowsUnaffected',
    'appLifecycle.failureResetsInstanceState',
    'appLifecycle.retryCreatesNewInstance',
    'appLifecycle.retryStaysLoadingUntilReady',
    'appLifecycle.oldInstanceUnreachable',
    'appLifecycle.lateTitleLeavesNewInstanceAlone',
    'appLifecycle.retryBecomesReady',
    'appLifecycle.closeWhileLoadingStaysClosed',
    'appLifecycle.closedWindowKeepsDockIdle',
    'appLifecycle.declaredWindowCapabilityWorks',
    'appLifecycle.undeclaredCapabilitiesDenied',
    'appLifecycle.deniedCallsHaveNoEffect',
    'appLifecycle.denialShowsReasonInWindow',
    'appLifecycle.invalidArgumentShowsReason',
    'appLifecycle.noticeFadesOut',
    'appLifecycle.bypassAttemptsFail',
    'appLifecycle.menubarFollowsForeground',
    'appLifecycle.deniedMenuKeepsStandardMenus',
    'appLifecycle.minimizeRestoreThroughApi',
    'appLifecycle.maximizeReachesLegacyEvents',
    'appLifecycle.closeThroughApi',
    'appLifecycle.closeUnbindsInstance',
    'appLifecycle.incompatibleProtocolShowsReason',
    'appLifecycle.incompatibleNeverReady',
    'appLifecycle.incompatibleAppReceivesNotice',
    'appLifecycle.incompatibleLeavesNoFrame'
  ],
  async run(session) {
    const { page, aiaoCode: standin } = session;
    const { win, closeAll, shows, appears, disappears } = session.helpers;
    const { frame: standinFrame, frameHandle: probeFrame, waitInFrame } = standinProbe(page);
    await session.openDesktop();
    await closeAll();
    /* 时间照常流逝，需要时用 fastForward 跳过 Orbit 的 60 秒就绪时限，不真等。 */
    await page.clock.install();

    const vscodeWin = win('vscode');
    const webappIn = state => vscodeWin.locator(`.webapp[data-webapp-state="${state}"]`);
    const titleText = async () => ((await vscodeWin.locator('[data-webapp-title]').textContent()) ?? '').trim();
    const reasonText = async () => ((await vscodeWin.locator('[data-webapp-reason]').textContent()) ?? '').trim();
    const noticeText = async () => ((await vscodeWin.locator('[data-webapp-notice]').textContent()) ?? '').trim();
    const dockRunning = () =>
      page.evaluate(() => document.querySelector('#dock .di[data-app="vscode"]')?.classList.contains('run') ?? false);
    const open = () => page.locator('#dock .di[data-app="vscode"]').click();
    /** 轮询到有值为止：替身页握手、事件到达都不是同步的。 */
    const settled = async (probe, timeout = 10_000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const value = await probe().catch(() => NOT_YET);
        if (value !== NOT_YET && value) return value;
        await page.waitForTimeout(100);
      }
      return undefined;
    };
    /** 替身页拿到的实例 ID（握手之后才有）。 */
    const instanceId = () => settled(async () => (await probeFrame())?.evaluate(() => window.standin?.instance));
    /** 经统一的能力接口在替身里发起一次调用，返回成功值或稳定错误码。 */
    const call = async (path, args = null) =>
      (await standinFrame()).evaluate(([name, value]) => window.standin.call(name, value), [path, args]);
    /** 对一个已分离的旧 frame 求值：浏览器里它已经没有执行上下文，迟到的消息物理上发不出去。 */
    const lateCall = (frame, action) =>
      frame.evaluate(action).then(
        () => 'delivered',
        () => 'undeliverable'
      );

    const appLifecycle = {};

    /* ───── AC#3：就绪超时 → 失败原因 → 重试创建新实例；其他窗口与桌面不进入失败状态 ───── */
    standin.mode = 'hold';
    await open();
    await appears(webappIn('loading'), 10_000);
    const firstInstance = await instanceId();
    const firstFrame = await standinFrame();
    const firstOrdinal = await firstFrame.evaluate(() => window.standin.ordinal);
    /* 第一个实例在加载中改了标题：失败与重试之后，窗口标题不能留着它。 */
    await call('window.setTitle', 'Stale title from the first instance');
    const titledByFirst = (await titleText()) === 'Stale title from the first instance';
    await page.clock.fastForward(61_000);
    appLifecycle.timeoutShowsReason =
      (await appears(webappIn('failed'), 10_000)) &&
      (await reasonText()).includes('didn’t finish starting within 60 seconds');
    appLifecycle.failureResetsInstanceState = titledByFirst && (await titleText()) === 'Aiao Code';

    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    appLifecycle.otherWindowsUnaffected =
      (await win('calculator').locator('[data-window-failure], [data-webapp-state="failed"]').count()) === 0 &&
      (await webappIn('failed').count()) === 1 &&
      (await page.locator('.win[data-app="finder"] [data-window-failure]').count()) === 0;
    await win('calculator').locator('.tl .c').click();
    await page.waitForTimeout(300);

    const documentsBefore = standin.documents;
    await vscodeWin.locator('[data-webapp-retry]').click();
    const loadingAgain = await appears(webappIn('loading'), 10_000);
    const secondInstance = await instanceId();
    const secondFrame = await standinFrame();
    appLifecycle.retryCreatesNewInstance =
      loadingAgain &&
      Boolean(firstInstance) &&
      Boolean(secondInstance) &&
      firstInstance !== secondInstance &&
      standin.documents === documentsBefore + 1 &&
      (await secondFrame.evaluate(() => window.standin.ordinal)) === firstOrdinal + 1 &&
      (await firstFrame.isDetached()) &&
      !(await secondFrame.isDetached());

    /* 旧实例的 ready 与 setTitle 再也发不出来：它的 frame 已分离。时间线上，新实例在放行前一直是加载中，标题没被旧实例动过。 */
    const lateReady = await lateCall(firstFrame, () => window.standin.release());
    const lateTitle = await lateCall(firstFrame, () =>
      window.standin.call('window.setTitle', 'Late title from the old instance')
    );
    await page.waitForTimeout(1_500);
    appLifecycle.oldInstanceUnreachable = lateReady === 'undeliverable' && lateTitle === 'undeliverable';
    appLifecycle.retryStaysLoadingUntilReady =
      (await webappIn('loading').count()) === 1 && (await webappIn('ready').count()) === 0;
    appLifecycle.lateTitleLeavesNewInstanceAlone = (await titleText()) === 'Aiao Code';

    await call('window.setTitle', 'Second instance title');
    const secondTitled = (await titleText()) === 'Second instance title';
    await secondFrame.evaluate(() => window.standin.release());
    appLifecycle.retryBecomesReady = (await appears(webappIn('ready'), 10_000)) && secondTitled;

    /* ───── AC#14：加载中关闭窗口，再放行旧实例的 ready ───── */
    await closeAll();
    await page.waitForTimeout(300);
    standin.mode = 'hold';
    await open();
    await appears(webappIn('loading'), 10_000);
    await instanceId();
    const closingFrame = await standinFrame();
    await vscodeWin.locator('.tl .c').click();
    /* 关闭动画的 200 毫秒里实例还活着：它迟到的 ready 到得了宿主，但窗口已在关闭，ready 被丢弃，窗口不会重新出现。 */
    await lateCall(closingFrame, () => window.standin.release());
    const gone = await disappears(page.locator('.win[data-app="vscode"]'), 3_000);
    /* 窗口移除、iframe 销毁之后，旧实例再也发不出任何消息。 */
    const lateRelease = await lateCall(closingFrame, () => window.standin.release());
    await page.waitForTimeout(1_200);
    appLifecycle.closeWhileLoadingStaysClosed =
      gone &&
      lateRelease === 'undeliverable' &&
      (await page.locator('.win[data-app="vscode"]').count()) === 0 &&
      (await page.locator('aiao-orbit').count()) === 0;
    appLifecycle.closedWindowKeepsDockIdle = !(await dockRunning());

    /* ───── AC#8：已声明与未声明的能力 ───── */
    standin.mode = 'standard';
    await open();
    await appears(webappIn('ready'), 15_000);
    await instanceId();
    const state = await call('window.getState');
    const titled = await call('window.setTitle', 'Report.md — Aiao Code');
    appLifecycle.declaredWindowCapabilityWorks =
      state.ok === true &&
      state.value.platform === 'macos' &&
      state.value.frame === 'transparent' &&
      state.value.minimized === false &&
      titled.ok === true &&
      (await titleText()) === 'Report.md — Aiao Code';

    const themeBefore = await page.evaluate(() => document.documentElement.dataset['theme']);
    const menuDenied = await call('menu.set', [{ label: 'File', items: [{ id: 'open', label: 'Open…' }] }]);
    appLifecycle.denialShowsReasonInWindow =
      (await shows(vscodeWin.locator('[data-webapp-notice]'))) &&
      (await noticeText()) === '“Aiao Code” isn’t allowed to use menu (menu.set).' &&
      (await vscodeWin.locator('[data-webapp-notice]').getAttribute('data-notice-code')) === 'CAPABILITY_DENIED';
    appLifecycle.noticeFadesOut = await (async () => {
      await page.clock.fastForward(6_000);
      return disappears(vscodeWin.locator('[data-webapp-notice]'), 3_000);
    })();
    const denials = [
      menuDenied,
      await call('app.open', 'calculator'),
      await call('app.focus'),
      await call('appearance.get'),
      await call('appearance.set', { appearance: 'dark' })
    ];
    appLifecycle.undeclaredCapabilitiesDenied = denials.every(
      result => result.ok === false && result.code === 'CAPABILITY_DENIED' && result.name === 'DesktopError'
    );
    await page.waitForTimeout(400);
    appLifecycle.deniedCallsHaveNoEffect =
      (await win('calculator').count()) === 0 &&
      (await page.evaluate(() => document.documentElement.dataset['theme'])) === themeBefore;

    const invalid = await call('window.setTitle', 'x'.repeat(300));
    appLifecycle.invalidArgumentShowsReason =
      invalid.ok === false &&
      invalid.code === 'INVALID_ARGUMENT' &&
      (await noticeText()) === '“Aiao Code” sent a request the desktop couldn’t accept (window.setTitle).' &&
      (await titleText()) === 'Report.md — Aiao Code';

    /* 不能经 parent DOM、任意 postMessage 或绕开 SDK 的原始请求越权。 */
    const attempts = await (
      await standinFrame()
    ).evaluate(async () => {
      const result = {};
      try {
        void window.parent.document.title;
        result.parentDom = 'readable';
      } catch (error) {
        result.parentDom = error.name;
      }
      const instance = window.standin.instance;
      parent.postMessage(
        { type: 'request', id: '1', method: 'desktop.app.quit', payload: { instanceId: instance, args: null } },
        '*'
      );
      parent.postMessage({ protocol: 'aiao.orbit:1', type: 'hello', channel: 'guess' }, '*');
      result.raw = await window.standin.raw('desktop.app.open', { instanceId: instance, args: 'calculator' });
      /* 方法表里没有的操作（桌面不提供列目录）是 UNKNOWN_METHOD；表里有、但清单没声明的文件能力是 CAPABILITY_DENIED（ADESK-US-206 阶段 D）。 */
      result.unknownMethod = await window.standin.raw('desktop.filesystem.list', { instanceId: instance, args: null });
      result.undeclaredFilesystem = await window.standin.raw('desktop.filesystem.open', {
        instanceId: instance,
        args: {},
        requestId: 'bypass-1'
      });
      result.legacyMenu = await window.standin.raw('menu.set', []);
      return result;
    });
    await page.waitForTimeout(400);
    appLifecycle.bypassAttemptsFail =
      attempts.parentDom === 'SecurityError' &&
      attempts.raw.ok === true &&
      attempts.raw.value.code === 'CAPABILITY_DENIED' &&
      attempts.unknownMethod.code === 'UNKNOWN_METHOD' &&
      attempts.undeclaredFilesystem.ok === true &&
      attempts.undeclaredFilesystem.value.code === 'CAPABILITY_DENIED' &&
      attempts.legacyMenu.code === 'UNKNOWN_METHOD' &&
      (await win('calculator').count()) === 0 &&
      (await webappIn('ready').count()) === 1;

    /* ───── AC#9：菜单栏随前台窗口切换；窗口操作经能力接口；关闭后实例解绑 ───── */
    const menuTitles = () =>
      page
        .locator('#mb-titles .mb-item')
        .allTextContents()
        .then(items => items.map(item => item.trim()));
    const frontApp = async () => ((await page.locator('#menubar .mb-item.app').textContent()) ?? '').trim();
    const standardTitles = ['Aiao Code', 'File', 'Edit', 'View', 'Window', 'Help'];
    appLifecycle.deniedMenuKeepsStandardMenus = JSON.stringify(await menuTitles()) === JSON.stringify(standardTitles);
    await page.locator('#dock .di[data-app="calculator"]').click();
    await win('calculator').waitFor();
    await page.waitForTimeout(300);
    const calculatorFront = await frontApp();
    const content = await vscodeWin.locator('.webapp').boundingBox();
    await page.mouse.click(content.x + 40, content.y + content.height - 40);
    await page.waitForTimeout(300);
    appLifecycle.menubarFollowsForeground = calculatorFront === 'Calculator' && (await frontApp()) === 'Aiao Code';
    await win('calculator').locator('.tl .c').dispatchEvent('click');
    await page.waitForTimeout(300);

    await call('window.minimize');
    await page.waitForTimeout(700);
    const hidden = await vscodeWin.evaluate(node => node.style.visibility === 'hidden');
    const minimizedState = await call('window.getState');
    await call('window.restore');
    await page.waitForTimeout(900);
    const shown = await vscodeWin.evaluate(node => node.style.visibility === '' && !node.classList.contains('mini'));
    const restoredState = await call('window.getState');
    appLifecycle.minimizeRestoreThroughApi =
      hidden && shown && minimizedState.value?.minimized === true && restoredState.value?.minimized === false;

    await call('window.toggleMaximize');
    await page.waitForTimeout(500);
    const zoomed = await vscodeWin.evaluate(node => node.classList.contains('zoomed'));
    const viaEnvelope = await waitInFrame(() =>
      window.standin.desktop.some(item => item.event === 'window' && item.state.maximized === true)
    );
    const viaLegacy = await waitInFrame(() => window.standin.window.at(-1)?.maximized === true);
    appLifecycle.maximizeReachesLegacyEvents = zoomed && viaEnvelope && viaLegacy;
    await call('window.toggleMaximize');
    await page.waitForTimeout(500);

    const closing = await standinFrame();
    const closed = await call('window.close');
    /* 窗口开始关闭后，能力上下文就解绑了：关闭动画里实例还活着，调用得到 WINDOW_CLOSED。 */
    const during = await closing
      .evaluate(() => window.standin.call('window.setTitle', 'after close'))
      .catch(() => ({ code: 'DETACHED' }));
    const removed = await disappears(page.locator('.win[data-app="vscode"]'), 3_000);
    await page.waitForTimeout(200);
    const after = await lateCall(closing, () => window.standin.call('window.setTitle', 'after removal'));
    appLifecycle.closeThroughApi = closed.ok === true && removed && !(await dockRunning());
    appLifecycle.closeUnbindsInstance =
      ['WINDOW_CLOSED', 'DETACHED'].includes(during.code) &&
      after === 'undeliverable' &&
      (await page.locator('aiao-orbit').count()) === 0;

    /* ───── AC#10：应用声明的协议版本高于桌面支持的版本 ───── */
    await closeAll();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      /* 替身收到宿主的不兼容通知后会转告桌面页（各引擎都收得到；Firefox 不把跨源 iframe 的控制台消息交给 Playwright）。 */
      window.__notices = [];
      addEventListener('message', event => {
        if (event.data?.standinNotice) window.__notices.push(event.data.standinNotice);
      });
      window.__states = [];
      new MutationObserver(() => {
        for (const node of document.querySelectorAll('.win[data-app="vscode"] .webapp[data-webapp-state]')) {
          const value = node.getAttribute('data-webapp-state');
          if (window.__states.at(-1) !== value) window.__states.push(value);
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-webapp-state']
      });
    });
    standin.mode = 'future';
    await open();
    const incompatible = await appears(webappIn('failed'), 15_000);
    const incompatibleReason = incompatible ? await reasonText() : '';
    await page.waitForTimeout(300);
    const states = await page.evaluate(() => window.__states);
    appLifecycle.incompatibleProtocolShowsReason =
      incompatible &&
      incompatibleReason.includes('needs a newer Aiao Desktop') &&
      incompatibleReason.includes('v99') &&
      incompatibleReason.includes('v1');
    appLifecycle.incompatibleNeverReady = states.length > 0 && !states.includes('ready') && states.at(-1) === 'failed';
    const notices =
      (await settled(async () => (await page.evaluate(() => window.__notices)).length === 1)) ?
        await page.evaluate(() => window.__notices)
      : [];
    appLifecycle.incompatibleAppReceivesNotice =
      notices.length === 1 &&
      notices[0].type === 'incompatible' &&
      notices[0].supported === 1 &&
      notices[0].requested === 99 &&
      notices[0].message.includes('aiao.orbit:99');
    appLifecycle.incompatibleLeavesNoFrame = (await page.locator('aiao-orbit').count()) === 0;

    return { appLifecycle };
  }
};
