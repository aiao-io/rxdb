import { grantCapabilities } from '../harness/capabilities.mjs';
import { surgery } from '../harness/database.mjs';
import { diskCount, diskRow, diskText, filePanel, standinCalls, traced, until } from '../harness/host-calls.mjs';

/** Aiao Code 的清单能力加上 notification 与 filesystem：只在本检查组的浏览器上下文里改写构建产物，清单源码不动。 */
const CAPABILITIES = [
  'window',
  'clipboard:read',
  'clipboard:write',
  'notification',
  'filesystem:read',
  'filesystem:write'
];
const VERSION = /^\d+:\d+$/;

/**
 * 文件能力与桌面的打开 / 保存面板（ADESK-US-206 阶段 D，AC#12、#16、#17）：用替身应用顶替 Aiao Code，
 * 在正式构建上操作真实的面板与虚拟磁盘。Aiao Code 的清单保持最小化，成功路径靠改写本上下文里加载的主脚本授予
 * `filesystem:read` / `filesystem:write`（见 `harness/capabilities.mjs`，改写不到唯一一处就直接抛错）；未声明时的拒绝在
 * `host-capabilities` 组里用没改写的构建验证。
 *
 * **关于 AC#17 迟到消息的诚实说明**：Orbit 实例销毁即关端口、移除 iframe，旧实例的迟到消息物理上到不了宿主，所以这里只验证
 * 不变量——面板随窗口关闭、请求以 `WINDOW_CLOSED` 结束（关闭动画的 200 毫秒里实例还活着，替身把结果转告桌面页）、磁盘不变，
 * 并证明旧实例确实够不到（它的 frame 已分离）。「迟到的 save 被丢弃」本身由单测用假 Orbit 实例模拟旧实例的迟到回调来证明
 * （`remote-app-session.spec.ts`、`app-context.spec.ts`）。
 *
 * **关于键盘**：只用 Tab、方向键、Enter 与 Esc 的检查用 Playwright 的键盘接口，它经浏览器的输入管线派发可信的键盘事件，
 * 但不是真实键盘设备；读屏与真实设备上的行为不在这里证明。
 */
export const hostFilesystem = {
  name: 'host-filesystem',
  description: '文件能力：打开 / 保存面板、凭证保存与版本比对、取消与窗口关闭、键盘操作',
  standins: ['aiao-code'],
  keys: [
    'hostFilesystem.panelSemantics',
    'hostFilesystem.panelIsModal',
    'hostFilesystem.escCancels',
    'hostFilesystem.openSelectReturnsContent',
    'hostFilesystem.openGivesNothingElse',
    'hostFilesystem.openCancelIsSilent',
    'hostFilesystem.saveChoosesLocationAndName',
    'hostFilesystem.saveCancelWritesNothing',
    'hostFilesystem.overwriteNeedsConfirmation',
    'hostFilesystem.overwriteCannotBeSkippedByApp',
    'hostFilesystem.acceptIsDisplayFilterOnly',
    'hostFilesystem.tooLargeFileIsDisabled',
    'hostFilesystem.secondRequestIsBusy',
    'hostFilesystem.panelTimeIsNotTimed',
    'hostFilesystem.handleSaveWritesBack',
    'hostFilesystem.saveWithoutHandleAsksUser',
    'hostFilesystem.changedFileIsRejected',
    'hostFilesystem.renamedFileIsRejectedAndNotRecreated',
    'hostFilesystem.deletedFileIsRejectedAndNotRecreated',
    'hostFilesystem.handleInvalidAfterWindowClosed',
    'hostFilesystem.panelClosesWithWindow',
    'hostFilesystem.requestEndsWithWindowClosed',
    'hostFilesystem.lateSaveNeverWrites',
    'hostFilesystem.keyboardOpen',
    'hostFilesystem.keyboardSaveAndReplace',
    'hostFilesystem.staleListingNeverOverwrites',
    'hostFilesystem.escInsideReplaceReturnsToBrowse',
    'hostFilesystem.tabStaysInsidePanel',
    'hostFilesystem.focusReturnsToWindow'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, appears, disappears } = session.helpers;
    const calls = standinCalls(session);
    const { call, begin, outcome, lateCall } = calls;
    const panel = filePanel(page);
    const vscodeWin = win('vscode');
    const hostFilesystem = traced('host-filesystem');

    await grantCapabilities(session, CAPABILITIES);
    await session.openDesktop();
    await closeAll();

    /** 从 Dock 打开 Aiao Code 并等到应用就绪、替身完成握手。 */
    const openAiaoCode = async () => {
      session.aiaoCode.mode = 'standard';
      await page.locator('#dock .di[data-app="vscode"]').click();
      await appears(vscodeWin.locator('.webapp[data-webapp-state="ready"]'), 15_000);
      await until(page, async () => (await calls.frameHandle())?.evaluate(() => window.standin?.instance));
    };
    const closeAiaoCode = async () => {
      await vscodeWin.locator('.tl .c').click();
      await disappears(page.locator('.win[data-app="vscode"]'), 5_000);
    };
    const panelOpens = async () => {
      await panel.panel.waitFor({ state: 'visible', timeout: 10_000 });
      await page.waitForFunction(() => {
        const dialog = document.querySelector('[data-file-panel]');
        const selector = dialog?.getAttribute('data-mode') === 'save' ? '[data-fp-name]' : '[data-fp-list]';
        return dialog?.querySelector(selector) === document.activeElement;
      });
      return true;
    };
    const panelCloses = () => disappears(panel.panel, 5_000);
    const toast = () => page.evaluate(() => document.querySelector('#toast.on')?.textContent?.trim() ?? '');
    const notice = () => vscodeWin.locator('[data-webapp-notice]').count();
    const nameIs = async (wanted, within = 3_000) =>
      (await until(page, async () => (await panel.names()).includes(wanted), within)) === true;
    /** 方向键之后界面异步更新：等选中项变成 `wanted`。 */
    const activeIs = async wanted => (await until(page, async () => (await panel.active()) === wanted, 3_000)) === true;
    /** 面板里回到主目录再进 Desktop（面板一开始在 Documents）。 */
    const goToDesktop = async () => {
      await panel.up.click();
      await panel.row('Desktop').dblclick();
      await until(page, async () => (await panel.location()).endsWith('Desktop'));
    };
    /** 打开面板里选定 Desktop 上名为 `name` 的文件并确认。 */
    const pickOnDesktop = async name => {
      await goToDesktop();
      await panel.row(name).click();
      await panel.confirm.click();
    };
    const stamp = file => ({ size: file?.size, modified: file?.modified });
    const unchanged = async (name, before) =>
      JSON.stringify(stamp(await diskRow(session, name))) === JSON.stringify(stamp(before));
    const hour = () => new Date(Date.now() + 3_600_000).toISOString();

    await openAiaoCode();

    /* ───── AC#12：面板的角色与名称、模态、Esc 取消 ───── */
    const semanticsId = await begin('filesystem.open', { accept: ['.md', '.txt'] });
    await panelOpens();
    const semantics = await panel.panel.evaluate(node => ({
      role: node.getAttribute('role'),
      modal: node.getAttribute('aria-modal'),
      label: node.getAttribute('aria-label') ?? '',
      owner: node.dataset.owner,
      mode: node.dataset.mode,
      negativeTabindex: node.querySelectorAll('[tabindex="-1"]').length,
      list: node.querySelector('[data-fp-list]')?.getAttribute('role'),
      listTabindex: node.querySelector('[data-fp-list]')?.getAttribute('tabindex'),
      described: Boolean(
        document.getElementById(node.getAttribute('aria-describedby') ?? '')?.textContent?.includes('Aiao Code')
      )
    }));
    hostFilesystem.panelSemantics =
      semantics.role === 'dialog' &&
      semantics.modal === 'true' &&
      semantics.label.includes('Aiao Code') &&
      semantics.owner === 'vscode' &&
      semantics.mode === 'open' &&
      semantics.list === 'listbox' &&
      semantics.listTabindex === '0' &&
      semantics.described &&
      semantics.negativeTabindex === 0;
    /* 模态：应用窗口的中心点上方最先命中的是面板的遮罩，不是应用的 iframe。 */
    const content = await vscodeWin.locator('.webapp').boundingBox();
    hostFilesystem.panelIsModal = await page.evaluate(
      point => document.elementsFromPoint(point.x, point.y)[0]?.closest('[data-file-panel-scrim]') !== null,
      { x: content.x + 40, y: content.y + content.height - 40 }
    );
    await page.keyboard.press('Escape');
    const escaped = await outcome(semanticsId);
    hostFilesystem.escCancels = escaped?.ok === false && escaped.code === 'USER_CANCELLED' && (await panelCloses());

    /* ───── AC#12：打开——用户选定一次 ───── */
    const writingBefore = await diskRow(session, 'on-restraint.md');
    const openId = await begin('filesystem.open', { accept: ['.md'] });
    await panelOpens();
    await panel.row('Writing').dblclick();
    await nameIs('on-restraint.md');
    await panel.row('on-restraint.md').click();
    await panel.confirm.click();
    const opened = await outcome(openId);
    hostFilesystem.openSelectReturnsContent =
      opened?.ok === true &&
      opened.value.name === 'on-restraint.md' &&
      opened.value.mime === 'text/markdown' &&
      opened.value.text.startsWith('# On restraint') &&
      opened.value.bytesLength === opened.value.size &&
      opened.value.size === writingBefore.size &&
      typeof opened.value.handle === 'string' &&
      VERSION.test(opened.value.version) &&
      (await panelCloses());
    /* 应用拿到的只有选定的那一个文件的内容、凭证与版本，没有路径、目录列表或别的文件。 */
    hostFilesystem.openGivesNothingElse =
      JSON.stringify(Object.keys(opened?.value ?? {}).sort()) ===
      JSON.stringify(['bytesLength', 'handle', 'mime', 'name', 'size', 'text', 'version']);

    /* ───── AC#12：打开——取消一次：USER_CANCELLED，桌面不弹错误，磁盘不变 ───── */
    const cancelOpenId = await begin('filesystem.open', {});
    await panelOpens();
    await panel.cancel.click();
    const cancelledOpen = await outcome(cancelOpenId);
    await page.waitForTimeout(300);
    hostFilesystem.openCancelIsSilent =
      cancelledOpen?.ok === false &&
      cancelledOpen.code === 'USER_CANCELLED' &&
      (await panelCloses()) &&
      (await notice()) === 0 &&
      (await toast()) === '' &&
      (await unchanged('on-restraint.md', writingBefore));

    /* ───── AC#12：保存——选位置与文件名；取消一次不写盘 ───── */
    const saveId = await begin('filesystem.save', { suggestedName: 'hostcap-a.txt', text: 'alpha v1' });
    await panelOpens();
    const prefilled = await panel.name.inputValue();
    await goToDesktop();
    const absentBeforeConfirm = (await diskCount(session, 'hostcap-a.txt')) === 0;
    await panel.confirm.click();
    const saved = await outcome(saveId);
    const savedRow = await diskRow(session, 'hostcap-a.txt');
    hostFilesystem.saveChoosesLocationAndName =
      prefilled === 'hostcap-a.txt' &&
      absentBeforeConfirm &&
      saved?.ok === true &&
      saved.value.name === 'hostcap-a.txt' &&
      VERSION.test(saved.value.version) &&
      typeof saved.value.handle === 'string' &&
      savedRow?.folder === 'Desktop' &&
      (await diskText(session, 'hostcap-a.txt')) === 'alpha v1' &&
      (await panelCloses());
    const handleA = saved?.value?.handle;

    const cancelSaveId = await begin('filesystem.save', {
      suggestedName: 'hostcap-cancelled.txt',
      text: 'never written'
    });
    await panelOpens();
    await goToDesktop();
    await panel.cancel.click();
    const cancelledSave = await outcome(cancelSaveId);
    hostFilesystem.saveCancelWritesNothing =
      cancelledSave?.ok === false &&
      cancelledSave.code === 'USER_CANCELLED' &&
      (await diskCount(session, 'hostcap-cancelled.txt')) === 0 &&
      (await notice()) === 0 &&
      (await panelCloses());

    /* ───── AC#12：保存——目标已存在时要用户确认覆盖，应用不能跳过 ───── */
    const overwriteId = await begin('filesystem.save', { suggestedName: 'hostcap-a.txt', text: 'alpha v2' });
    await panelOpens();
    await goToDesktop();
    await panel.confirm.click();
    const asked = await panel.replace.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    );
    const stillOld = (await diskText(session, 'hostcap-a.txt')) === 'alpha v1';
    const pendingWhileAsking = (await page.evaluate(id => window.__standinResults[id], overwriteId)) === undefined;
    await panel.cancel.click();
    const backToBrowse =
      (await until(page, async () => (await panel.replace.count()) === 0)) === true &&
      (await panel.panel.count()) === 1;
    await panel.confirm.click();
    await panel.replace.waitFor({ state: 'visible', timeout: 3_000 });
    await panel.confirm.click();
    const replaced = await outcome(overwriteId);
    hostFilesystem.overwriteNeedsConfirmation =
      asked &&
      stillOld &&
      pendingWhileAsking &&
      backToBrowse &&
      replaced?.ok === true &&
      (await diskText(session, 'hostcap-a.txt')) === 'alpha v2' &&
      (await panelCloses());
    /* 应用没有办法跳过确认：请求里不存在「覆盖」之类的字段，原始请求里带上也被宿主拒绝，磁盘不变。 */
    const instance = await (await calls.frame()).evaluate(() => window.standin.instance);
    const forced = await (
      await calls.frame()
    ).evaluate(
      id =>
        window.standin.raw('desktop.filesystem.save', {
          instanceId: id,
          args: { suggestedName: 'hostcap-a.txt', bytes: 'Zm9yY2Vk', overwrite: true },
          requestId: 'force-1'
        }),
      instance
    );
    hostFilesystem.overwriteCannotBeSkippedByApp =
      forced.ok === true &&
      forced.value.ok === false &&
      forced.value.code === 'INVALID_ARGUMENT' &&
      (await panel.panel.count()) === 0 &&
      (await diskText(session, 'hostcap-a.txt')) === 'alpha v2';

    /* ───── AC#12：accept 只做显示过滤；超过大小上限的文件禁用选择并说明原因；同一时刻只开一个面板 ───── */
    const acceptId = await begin('filesystem.open', { accept: ['.txt'] });
    await panelOpens();
    await goToDesktop();
    const shown = await panel.names();
    hostFilesystem.acceptIsDisplayFilterOnly =
      shown.includes('prasenx.txt') &&
      shown.includes('hostcap-a.txt') &&
      shown.includes('Projects') &&
      !shown.includes('Interface Guidelines.pdf') &&
      !shown.some(name => name.endsWith('.png')) &&
      ((await panel.filter.textContent()) ?? '').includes('.txt');
    await panel.cancel.click();
    await outcome(acceptId);

    await surgery(session, db =>
      db.shell.execute(`UPDATE "desktop$desktop_file" SET size = 600000 WHERE name = 'shadow-notes.md'`)
    );
    /* 库是从旁边改的（另一条连接），本标签页的目录树在页面回到前台时才整树重读：模拟这一下。 */
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(500);
    const largeId = await begin('filesystem.open', {});
    await panelOpens();
    await panel.row('Writing').dblclick();
    await nameIs('shadow-notes.md');
    const largeRow = panel.row('shadow-notes.md');
    /* 禁用的行用户照样点得到（只是选了也不能确认）：跳过 Playwright 对 aria-disabled 的「可操作」检查。 */
    await largeRow.click({ force: true });
    const smallDisabled = await panel.row('on-restraint.md').getAttribute('aria-disabled');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    hostFilesystem.tooLargeFileIsDisabled =
      (await largeRow.getAttribute('aria-disabled')) === 'true' &&
      (await largeRow.locator('[data-fp-reason]').textContent())?.includes('Too large') === true &&
      smallDisabled === null &&
      (await panel.confirm.isDisabled()) &&
      (await panel.panel.count()) === 1 &&
      (await page.evaluate(id => window.__standinResults[id], largeId)) === undefined;
    await panel.cancel.click();
    await outcome(largeId);

    const busyFirst = await begin('filesystem.open', {});
    await panelOpens();
    const busyOpen = await call('filesystem.open', {});
    const busySave = await call('filesystem.save', { suggestedName: 'hostcap-busy.txt', text: 'x' });
    hostFilesystem.secondRequestIsBusy =
      busyOpen.ok === false &&
      busyOpen.code === 'BUSY' &&
      busySave.ok === false &&
      busySave.code === 'BUSY' &&
      (await panel.panel.count()) === 1 &&
      (await diskCount(session, 'hostcap-busy.txt')) === 0;
    await panel.cancel.click();
    await outcome(busyFirst);

    /* 超时只计宿主处理请求的时间：用户在面板里停留的时间不计入（应用等应答的兜底是 7 秒，宿主处理时限是 5 秒）。 */
    const dwellId = await begin('filesystem.open', {});
    await panelOpens();
    await page.waitForTimeout(8_000);
    const stillWaiting =
      (await panel.panel.count()) === 1 &&
      (await page.evaluate(id => window.__standinResults[id], dwellId)) === undefined;
    await panel.row('Writing').dblclick();
    await nameIs('on-restraint.md');
    await panel.row('on-restraint.md').click();
    await panel.confirm.click();
    const afterDwell = await outcome(dwellId);
    hostFilesystem.panelTimeIsNotTimed =
      stillWaiting && afterDwell?.ok === true && afterDwell.value.name === 'on-restraint.md';

    /* ───── AC#16：带凭证的保存 ───── */
    const reopenId = await begin('filesystem.open', {});
    await panelOpens();
    await pickOnDesktop('hostcap-a.txt');
    const reopened = await outcome(reopenId);
    const grant = reopened?.value;
    const writeBack = await call('filesystem.save', {
      handle: grant?.handle,
      expectedVersion: grant?.version,
      suggestedName: 'ignored-name.txt',
      text: 'alpha v3'
    });
    hostFilesystem.handleSaveWritesBack =
      reopened?.ok === true &&
      reopened.value.text === 'alpha v2' &&
      reopened.value.handle !== handleA &&
      writeBack.ok === true &&
      writeBack.value.handle === grant.handle &&
      writeBack.value.name === 'hostcap-a.txt' &&
      writeBack.value.version !== grant.version &&
      VERSION.test(writeBack.value.version) &&
      (await panel.panel.count()) === 0 &&
      (await diskText(session, 'hostcap-a.txt')) === 'alpha v3' &&
      (await diskCount(session, 'ignored-name.txt')) === 0;
    const handleA2 = grant?.handle;
    const versionA2 = writeBack?.value?.version;

    const otherId = await begin('filesystem.save', { suggestedName: 'hostcap-b.txt', text: 'bravo' });
    await panelOpens();
    await goToDesktop();
    const bAbsentWhileAsking = (await diskCount(session, 'hostcap-b.txt')) === 0;
    await page.waitForTimeout(500);
    const bStillAbsent = (await diskCount(session, 'hostcap-b.txt')) === 0;
    await panel.confirm.click();
    const savedB = await outcome(otherId);
    hostFilesystem.saveWithoutHandleAsksUser =
      bAbsentWhileAsking &&
      bStillAbsent &&
      savedB?.ok === true &&
      savedB.value.handle !== handleA2 &&
      (await diskText(session, 'hostcap-b.txt')) === 'bravo' &&
      (await diskText(session, 'hostcap-a.txt')) === 'alpha v3';

    /* 文件在别处被改动（修改时间变了）：FILE_CHANGED，不写入。 */
    await surgery(session, db =>
      db.shell.execute(`UPDATE "desktop$desktop_file" SET modified_at = ? WHERE name = 'hostcap-a.txt'`, [hour()])
    );
    const changedRow = await diskRow(session, 'hostcap-a.txt');
    const changed = await call('filesystem.save', {
      handle: handleA2,
      expectedVersion: versionA2,
      suggestedName: 'hostcap-a.txt',
      text: 'alpha v4 (should not be written)'
    });
    hostFilesystem.changedFileIsRejected =
      changed.ok === false &&
      changed.code === 'FILE_CHANGED' &&
      (await diskText(session, 'hostcap-a.txt')) === 'alpha v3' &&
      JSON.stringify(stamp(await diskRow(session, 'hostcap-a.txt'))) === JSON.stringify(stamp(changedRow)) &&
      (await panel.panel.count()) === 0;

    /* 文件被改名：FILE_NOT_FOUND，不写入，也不在原路径新建。 */
    await surgery(session, db =>
      db.shell.execute(`UPDATE "desktop$desktop_file" SET name = 'hostcap-a-renamed.txt' WHERE name = 'hostcap-a.txt'`)
    );
    const renamed = await call('filesystem.save', {
      handle: handleA2,
      suggestedName: 'hostcap-a.txt',
      text: 'alpha v5 (should not be written)'
    });
    hostFilesystem.renamedFileIsRejectedAndNotRecreated =
      renamed.ok === false &&
      renamed.code === 'FILE_NOT_FOUND' &&
      (await diskCount(session, 'hostcap-a.txt')) === 0 &&
      (await diskText(session, 'hostcap-a-renamed.txt')) === 'alpha v3';

    /* 文件被删除：FILE_NOT_FOUND，不写入，也不在原路径新建。 */
    const openBId = await begin('filesystem.open', {});
    await panelOpens();
    await pickOnDesktop('hostcap-b.txt');
    const openedB = await outcome(openBId);
    await surgery(session, db => db.shell.execute(`DELETE FROM "desktop$desktop_file" WHERE name = 'hostcap-b.txt'`));
    const deleted = await call('filesystem.save', {
      handle: openedB?.value?.handle,
      expectedVersion: openedB?.value?.version,
      suggestedName: 'hostcap-b.txt',
      text: 'bravo v2 (should not be written)'
    });
    hostFilesystem.deletedFileIsRejectedAndNotRecreated =
      openedB?.ok === true &&
      deleted.ok === false &&
      deleted.code === 'FILE_NOT_FOUND' &&
      (await diskCount(session, 'hostcap-b.txt')) === 0;

    /* 关闭窗口之后再用旧凭证：HANDLE_INVALID，磁盘不变。 */
    const makeDId = await begin('filesystem.save', { suggestedName: 'hostcap-d.txt', text: 'delta' });
    await panelOpens();
    await goToDesktop();
    await panel.confirm.click();
    const savedD = await outcome(makeDId);
    await closeAiaoCode();
    await openAiaoCode();
    const afterClose = await call('filesystem.save', {
      handle: savedD?.value?.handle,
      expectedVersion: savedD?.value?.version,
      suggestedName: 'hostcap-d.txt',
      text: 'delta v2 (should not be written)'
    });
    hostFilesystem.handleInvalidAfterWindowClosed =
      savedD?.ok === true &&
      afterClose.ok === false &&
      afterClose.code === 'HANDLE_INVALID' &&
      (await diskText(session, 'hostcap-d.txt')) === 'delta' &&
      (await panel.panel.count()) === 0;

    /* ───── AC#17：面板开着时关闭应用窗口 ───── */
    const closeOpenId = await begin('filesystem.open', {});
    await panelOpens();
    await calls.start('closer-1', 'window.close');
    const goneOpen = await disappears(page.locator('.win[data-app="vscode"]'), 5_000);
    const closedOpen = await outcome(closeOpenId);
    hostFilesystem.panelClosesWithWindow = goneOpen && (await panelCloses()) && (await panel.panel.count()) === 0;
    hostFilesystem.requestEndsWithWindowClosed = closedOpen?.ok === false && closedOpen.code === 'WINDOW_CLOSED';

    await openAiaoCode();
    const oldFrame = await calls.frame();
    const closeSaveId = await begin('filesystem.save', { suggestedName: 'hostcap-late.txt', text: 'late' });
    await panelOpens();
    await goToDesktop();
    await calls.start('closer-2', 'window.close');
    await disappears(page.locator('.win[data-app="vscode"]'), 5_000);
    const closedSave = await outcome(closeSaveId);
    const late = await lateCall(oldFrame, () =>
      window.standin.call('filesystem.save', { suggestedName: 'hostcap-late.txt', text: 'late' })
    );
    await page.waitForTimeout(500);
    hostFilesystem.lateSaveNeverWrites =
      closedSave?.ok === false &&
      closedSave.code === 'WINDOW_CLOSED' &&
      late === 'undeliverable' &&
      (await diskCount(session, 'hostcap-late.txt')) === 0 &&
      (await panel.panel.count()) === 0;

    /* ───── AC#17：只用 Tab、方向键、Enter 与 Esc ───── */
    await openAiaoCode();
    const keyOpenId = await begin('filesystem.open', { accept: ['.md'] });
    await panelOpens();
    const startsOnList = (await panel.focused()) === 'list';
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const onWriting = await activeIs('Writing');
    await page.keyboard.press('Enter');
    await until(page, async () => (await panel.location()).endsWith('Writing'));
    await page.keyboard.press('ArrowDown');
    const onFirstFile = await activeIs('on-restraint.md');
    await page.keyboard.press('Enter');
    const keyOpened = await outcome(keyOpenId);
    hostFilesystem.keyboardOpen =
      startsOnList &&
      onWriting &&
      onFirstFile &&
      keyOpened?.ok === true &&
      keyOpened.value.name === 'on-restraint.md' &&
      (await panelCloses());

    await page.evaluate(() => {
      window.__filePanelKeys = [];
      /* 模拟目录树活查询滞后：已落盘的文件尚未出现在面板列表里。 */
      const schedule = window.setInterval;
      window.__restoreFileListTimer = () => {
        window.setInterval = schedule;
      };
      window.setInterval = (handler, delay, ...args) =>
        schedule.call(window, handler, delay === 30 ? 3000 : delay, ...args);
      const record = event => {
        if (!['Enter', 'Escape', 'Tab'].includes(event.key)) return;
        window.__filePanelKeys.push({
          type: event.type,
          key: event.key,
          target: event.target.outerHTML.slice(0, 250),
          value: event.target.value,
          location: document.querySelector('[data-fp-path]')?.textContent,
          replace: Boolean(document.querySelector('[data-fp-replace]')),
          panel: Boolean(document.querySelector('[data-file-panel]'))
        });
      };
      document.addEventListener('keydown', record, true);
      document.addEventListener('keyup', record, true);
    });
    const keySaveFirst = await begin('filesystem.save', { suggestedName: 'hostcap-kb.txt', text: 'k1' });
    await panelOpens();
    const nameFocused = (await panel.focused()) === 'name';
    await page.keyboard.press('Enter');
    const firstSaved = await outcome(keySaveFirst);
    await page.evaluate(() => window.__restoreFileListTimer());
    const staleSave = await begin('filesystem.save', { suggestedName: 'hostcap-kb.txt', text: 'k2' });
    await panelOpens();
    if ((await panel.row('hostcap-kb.txt').count()) !== 0)
      throw new Error('未能建立目录列表滞后于已提交保存的前置条件');
    await page.keyboard.press('Enter');
    const staleOutcome = await outcome(staleSave);
    hostFilesystem.staleListingNeverOverwrites =
      firstSaved?.ok === true &&
      staleOutcome?.ok === false &&
      staleOutcome.code === 'FILE_CHANGED' &&
      (await diskText(session, 'hostcap-kb.txt')) === 'k1' &&
      (await panelCloses());

    const keySaveSecond = await begin('filesystem.save', { suggestedName: 'hostcap-kb.txt', text: 'k2' });
    await panelOpens();
    await panel.row('hostcap-kb.txt').waitFor({ state: 'visible', timeout: 10_000 });
    await page.keyboard.press('Enter');
    const replaceShown = await panel.replace.waitFor({ state: 'visible', timeout: 3_000 }).then(
      () => true,
      () => false
    );
    const cancelDefault = (await until(page, async () => (await panel.focused()) === 'cancel')) === true;
    /* 覆盖确认里 Esc 先退回保存面板（不是取消整个请求）。 */
    await page.keyboard.press('Escape');
    const backToSave =
      (await until(page, async () => (await panel.replace.count()) === 0)) === true &&
      (await panel.panel.count()) === 1 &&
      (await page.evaluate(id => window.__standinResults[id], keySaveSecond)) === undefined;
    hostFilesystem.escInsideReplaceReturnsToBrowse = replaceShown && backToSave;
    if (!backToSave) {
      const state = await page.evaluate(
        ([first, second]) => ({
          first: window.__standinResults[first],
          second: window.__standinResults[second],
          keys: window.__filePanelKeys,
          focus: document.activeElement?.outerHTML,
          panel: document.querySelector('[data-file-panel]')?.innerText
        }),
        [keySaveFirst, keySaveSecond]
      );
      throw new Error(`Esc 没有退回保存面板：${JSON.stringify(state)}`);
    }
    await page.waitForFunction(
      () => {
        const dialog = document.querySelector('[data-file-panel]');
        return (
          dialog &&
          !dialog.querySelector('[data-fp-replace]') &&
          dialog.querySelector('[data-fp-name]') === document.activeElement
        );
      },
      undefined,
      { timeout: 5_000 }
    );
    await page.keyboard.press('Enter');
    await panel.replace.waitFor({ state: 'visible', timeout: 3_000 }).catch(async error => {
      const state = await page.evaluate(() => ({
        focus: document.activeElement?.outerHTML,
        panel: document.querySelector('[data-file-panel]')?.innerText,
        name: document.querySelector('[data-fp-name]')?.value,
        replace: Boolean(document.querySelector('[data-fp-replace]'))
      }));
      throw new Error(`${error.message}；覆盖确认状态：${JSON.stringify(state)}`);
    });
    await until(page, async () => (await panel.focused()) === 'cancel');
    await page.keyboard.press('Tab');
    const onReplace = (await panel.focused()) === 'confirm';
    await page.keyboard.press('Enter');
    const secondSaved = await outcome(keySaveSecond);
    hostFilesystem.keyboardSaveAndReplace =
      nameFocused &&
      firstSaved?.ok === true &&
      cancelDefault &&
      onReplace &&
      secondSaved?.ok === true &&
      (await diskText(session, 'hostcap-kb.txt')) === 'k2' &&
      (await diskRow(session, 'hostcap-kb.txt'))?.folder === 'Documents';

    const trapId = await begin('filesystem.open', {});
    await panelOpens();
    const forward = [];
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Tab');
      forward.push(await panel.focused());
    }
    const backward = [];
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Shift+Tab');
      backward.push(await panel.focused());
    }
    hostFilesystem.tabStaysInsidePanel =
      forward.every(Boolean) && backward.every(Boolean) && new Set(forward).size >= 3 && new Set(backward).size >= 3;
    await page.keyboard.press('Escape');
    const trapCancelled = await outcome(trapId);
    await panelCloses();
    /* 关闭之后焦点回到发起请求的窗口：桌面页上它是 Aiao Code 窗口里的 iframe 外壳，应用文档拿到焦点。 */
    const focusInWindow = await until(page, () =>
      page.evaluate(() => document.activeElement?.closest('.win[data-app="vscode"]') !== null)
    );
    const appFocused = await until(page, async () => (await calls.frame()).evaluate(() => document.hasFocus()));
    hostFilesystem.focusReturnsToWindow =
      trapCancelled?.ok === false &&
      trapCancelled.code === 'USER_CANCELLED' &&
      focusInWindow === true &&
      appFocused === true;

    return { hostFilesystem };
  }
};
