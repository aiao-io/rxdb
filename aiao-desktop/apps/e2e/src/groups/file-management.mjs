import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { diskText, traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const text = '文件往返 🌏\nsecond line';
const binary = Buffer.from([0, 255, 128, 1, 0, 42]);
const payload = (name, buffer) => ({ name, mimeType: 'application/octet-stream', buffer });

/** 一份压缩内容流的真实 PDF 1.4（种子里的文本 PDF 之外，验证 pdf.js 的通用解析）。 */
const realPdf = () => {
  const stream = 'BT /F1 18 Tf 72 720 Td (Real compressed PDF) Tj ET';
  const compressed = deflateSync(Buffer.from(stream, 'latin1'));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${object}`;
    body += i === 4 ? `${compressed.toString('latin1')}\nendstream\nendobj\n` : 'endobj\n';
  });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
};

export const fileManagement = {
  name: 'file-management',
  description: 'Finder 改名、复制、导入下载、打开方式、持久废纸篓恢复与键盘路径',
  keys: [
    'fileManagement.dropsOnDesktop',
    'fileManagement.desktopInlineRename',
    'fileManagement.desktopMoveToTrash',
    'fileManagement.desktopTrashAnimatesOnce',
    'fileManagement.desktopUndoMoveToTrash',
    'fileManagement.desktopFileDragToTrash',
    'fileManagement.desktopFolderDrag',
    'fileManagement.desktopFileDragToFinderFolder',
    'fileManagement.desktopFolderDragToTrash',
    'fileManagement.finderFileDragToTrash',
    'fileManagement.finderFileDragToTrashWindow',
    'fileManagement.trashFinderDragToFolderWindow',
    'fileManagement.dropsOnDesktopFolder',
    'fileManagement.dropsOnFolder',
    'fileManagement.dropsOnSidebar',
    'fileManagement.importCaseVariantGetsNewName',
    'fileManagement.renameRejectsCaseVariantOfSibling',
    'fileManagement.caseOnlyRenameKeepsContent',
    'fileManagement.dropsOnVisibleColumn',
    'fileManagement.rejectsReadOnlyDrops',
    'fileManagement.importPreservesBytes',
    'fileManagement.importKeepsExistingNames',
    'fileManagement.readFailureKeepsBatchAndExistingData',
    'fileManagement.renameValidatesAndPreservesContent',
    'fileManagement.renameCancellationAndKeyboardFocus',
    'fileManagement.duplicateIsIndependent',
    'fileManagement.folderCopyKeepsNestedAndEmptyEntries',
    'fileManagement.listVirtualScroll',
    'fileManagement.multiSelection',
    'fileManagement.finderMarqueeSelection',
    'fileManagement.clipboardCopyPaste',
    'fileManagement.dragCopy',
    'fileManagement.dragMove',
    'fileManagement.springFolderIcon',
    'fileManagement.columnVirtualScroll',
    'fileManagement.columnWidthDrag',
    'fileManagement.columnActionsUseExactPath',
    'fileManagement.galleryActionsAndDuplicateShortcut',
    'fileManagement.openWithOpensSelectedFile',
    'fileManagement.getInfoShowsPanel',
    'fileManagement.openWithAlwaysSetsDefault',
    'fileManagement.getInfoChangeAllSetsDefault',
    'fileManagement.safariOpensHtml',
    'fileManagement.previewRendersPdf',
    'fileManagement.trashOpensInIconView',
    'fileManagement.finderOpensAlongsideTrash',
    'fileManagement.trashOriginSurvivesReloadAndRename',
    'fileManagement.restoreKeepsCollidingFile',
    'fileManagement.missingOriginRequiresExplicitFolder',
    'fileManagement.legacyTrashCanChooseFolder',
    'fileManagement.trashShortcutMovesItem',
    'fileManagement.emptyTrashRequiresConfirmation',
    'fileManagement.otherTabSeesChanges'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('file-management');
    await session.openDesktop();
    await helpers.closeAll();
    const desktop = page.locator('#desktop');
    const dragDesktopIcon = async (sourceName, target) => {
      const source = desktop.locator(`[data-id="file:${sourceName}"]`);
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) throw new Error(`Cannot measure desktop drag ${sourceName}`);
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
      await page.mouse.up();
    };
    const watchDesktopDrag = async id => {
      await page.evaluate(id => {
        const desktopSurface = document.querySelector('#desktop');
        const node = [...(desktopSurface?.querySelectorAll('[data-id]') ?? [])].find(
          candidate => candidate.getAttribute('data-id') === id
        );
        if (!desktopSurface || !node) throw new Error(`Cannot watch desktop drag ${id}`);
        const states = [];
        const record = () => {
          if (!desktopSurface.contains(node)) {
            states.push({ detached: true });
            observer.disconnect();
            return;
          }
          states.push({
            moving: node.classList.contains('moving'),
            opacity: getComputedStyle(node).opacity
          });
        };
        const observer = new MutationObserver(record);
        observer.observe(node, { attributes: true, attributeFilter: ['class', 'style'] });
        observer.observe(desktopSurface, { childList: true, subtree: true });
        globalThis.__desktopDragTrace = { node, observer, states };
        record();
      }, id);
    };
    const readDesktopDrag = async () =>
      page.evaluate(() => {
        const trace = globalThis.__desktopDragTrace;
        if (!trace) throw new Error('Desktop drag trace was not started');
        if (!trace.states.at(-1)?.detached && !document.documentElement.contains(trace.node)) {
          trace.states.push({ detached: true });
        }
        trace.observer.disconnect();
        delete globalThis.__desktopDragTrace;
        return trace.states;
      });
    const assertNoDesktopFlash = trace => {
      const movingStates = trace.filter(state => state.moving);
      expect(movingStates.length).toBeGreaterThan(0);
      expect(movingStates.every(state => state.opacity === '0')).toBe(true);
      expect(trace.at(-1)?.detached).toBe(true);
    };
    const trashDockIcon = page.locator('#dock .di[data-app="trash"]');
    await desktop.drop({ files: payload('from-desktop.txt', Buffer.from(text)) }, { timeout: 5_000 });
    const desktopFile = desktop.locator('[data-id="file:from-desktop.txt"]');
    await expect(desktopFile).toBeVisible();
    result.dropsOnDesktop = (await diskText(session, 'from-desktop.txt')) === text;
    /* 桌面新建文件夹后直接打字（像 macOS）：输入框自动出现并全选「untitled folder」，回车落盘。 */
    await desktop.click({ button: 'right', position: { x: 420, y: 420 } });
    await page.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
    const desktopRename = desktop.locator('[data-rename-input]');
    await expect(desktopRename).toBeFocused();
    await desktopRename.fill('inline-renamed-folder');
    await desktopRename.press('Enter');
    await expect(desktop.locator('[data-id="file:inline-renamed-folder"]')).toBeVisible();
    result.desktopInlineRename = true;
    const trashDesktopFile = async () => {
      await desktopFile.click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Move to Trash', exact: true }).click();
      await expect(desktopFile).toHaveCount(0);
    };
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const exitTrace = await desktopFile.evaluateHandle(icon => {
      const fades = new Set();
      let minOpacity = 1;
      let flashed = false;
      const sample = () => {
        if (!icon.isConnected) return;
        const opacity = Number(getComputedStyle(icon).opacity);
        flashed ||= opacity > minOpacity + 0.01;
        minOpacity = Math.min(minOpacity, opacity);
        for (const animation of icon.getAnimations()) {
          if (animation.effect?.getKeyframes().some(frame => frame.opacity !== undefined)) fades.add(animation);
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return () => ({ fades: fades.size, flashed });
    });
    await trashDesktopFile();
    result.desktopMoveToTrash = true;
    const { fades, flashed } = await exitTrace.evaluate(read => read());
    result.desktopTrashAnimatesOnce = fades === 1 && !flashed;
    await exitTrace.dispose();
    await page.keyboard.press('Meta+z');
    await expect(desktopFile).toBeVisible();
    result.desktopUndoMoveToTrash = (await diskText(session, 'from-desktop.txt')) === text;
    await trashDesktopFile();
    await desktop.drop({ files: payload('drag-trash.txt', Buffer.from(text)) });
    await expect(desktop.locator('[data-id="file:drag-trash.txt"]')).toBeVisible();
    await desktop.drop(
      { files: payload('desktop-to-finder.txt', Buffer.from(text)) },
      { position: { x: 420, y: 420 } }
    );
    await expect(desktop.locator('[data-id="file:desktop-to-finder.txt"]')).toBeVisible();
    await dragDesktopIcon('drag-trash.txt', trashDockIcon);
    await expect(desktop.locator('[data-id="file:drag-trash.txt"]')).toHaveCount(0);
    result.desktopFileDragToTrash = true;
    const desktopFolderIds = async () =>
      desktop
        .locator('[data-id^="file:untitled folder"]')
        .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')).filter(Boolean));
    const newDesktopFolder = async () => {
      const before = await desktopFolderIds();
      await desktop.click({ button: 'right', position: { x: 420, y: 420 } });
      await page.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
      await expect.poll(async () => (await desktopFolderIds()).length).toBe(before.length + 1);
      const created = (await desktopFolderIds()).find(id => !before.includes(id));
      if (!created) throw new Error('New desktop folder was not created');
      return created.slice('file:'.length);
    };
    const sourceFolder = await newDesktopFolder();
    const targetFolder = await newDesktopFolder();
    await watchDesktopDrag(`file:${sourceFolder}`);
    await dragDesktopIcon(sourceFolder, desktop.locator(`[data-id="file:${targetFolder}"]`));
    await expect(desktop.locator(`[data-id="file:${sourceFolder}"]`)).toHaveCount(0);
    assertNoDesktopFlash(await readDesktopDrag());
    result.desktopFolderDrag = true;
    const lowerFolder = await newDesktopFolder();
    const upperFolder = await newDesktopFolder();
    await desktop.drop({ files: payload('desktop-to-lower-folder.txt', Buffer.from(text)) });
    const lower = desktop.locator(`[data-id="file:${lowerFolder}"]`);
    const lowerBox = await lower.boundingBox();
    const file = desktop.locator('[data-id="file:desktop-to-lower-folder.txt"]');
    const fileBox = await file.boundingBox();
    if (!lowerBox || !fileBox) throw new Error('Cannot measure overlapping desktop folders');
    await page.evaluate(
      ({ upperId, lowerId }) => {
        const lowerNode = document.querySelector(`[data-id="${lowerId}"]`);
        const upperNode = document.querySelector(`[data-id="${upperId}"]`);
        if (!lowerNode || !upperNode) throw new Error('Cannot find overlapping desktop folders');
        const lowerBox = lowerNode.getBoundingClientRect();
        upperNode.style.left = `${lowerBox.left + 20}px`;
        upperNode.style.top = `${lowerBox.top + 20}px`;
      },
      { lowerId: `file:${lowerFolder}`, upperId: `file:${upperFolder}` }
    );
    const exposed = { x: lowerBox.x + 5, y: lowerBox.y + 5 };
    await page.mouse.move(fileBox.x + fileBox.width / 2, fileBox.y + fileBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(exposed.x, exposed.y, { steps: 12 });
    await expect.poll(() => lower.evaluate(node => node.classList.contains('drop-target'))).toBe(true);
    const raisedZIndex = await lower.evaluate(node => getComputedStyle(node).zIndex);
    expect(raisedZIndex).toBe('851');
    await page.mouse.move(lowerBox.x + lowerBox.width / 2, lowerBox.y + lowerBox.height / 2);
    await page.mouse.up();
    await expect(file).toHaveCount(0);
    await page.mouse.dblclick(exposed.x, exposed.y);
    await expect(page.locator('.win.front[data-app="finder"]:not(.closing) [data-title]')).toHaveText(lowerFolder);
    await expect(
      page.locator(
        `.win.front[data-app="finder"]:not(.closing) [role="option"][data-name="desktop-to-lower-folder.txt"]`
      )
    ).toBeVisible();
    await helpers.closeAll();
    await desktop.locator(`[data-id="file:${targetFolder}"]`).dblclick();
    await expect(page.locator('.win.front[data-app="finder"]:not(.closing) [data-title]')).toHaveText(targetFolder);
    await expect(
      page.locator(
        `.win.front[data-app="finder"]:not(.closing) [role="option"][data-name=${JSON.stringify(sourceFolder)}]`
      )
    ).toBeVisible();
    await watchDesktopDrag('file:desktop-to-finder.txt');
    await dragDesktopIcon(
      'desktop-to-finder.txt',
      page.locator(
        `.win.front[data-app="finder"]:not(.closing) [role="option"][data-name=${JSON.stringify(sourceFolder)}]`
      )
    );
    await expect(desktop.locator('[data-id="file:desktop-to-finder.txt"]')).toHaveCount(0);
    assertNoDesktopFlash(await readDesktopDrag());
    await page
      .locator(`.win.front[data-app="finder"]:not(.closing) [role="option"][data-name=${JSON.stringify(sourceFolder)}]`)
      .dblclick();
    await expect(page.locator('.win.front[data-app="finder"]:not(.closing) [data-title]')).toHaveText(sourceFolder);
    await expect(
      page.locator('.win.front[data-app="finder"]:not(.closing) [data-name="desktop-to-finder.txt"]')
    ).toBeVisible();
    result.desktopFileDragToFinderFolder = true;
    /* 双击桌面文件夹会新开 Finder 窗口；等开窗动画与首屏内容落定再点它自己的侧栏，避免点到动画中的坐标。 */
    await page.waitForTimeout(1_200);
    await page.locator('.win.front[data-app="finder"]:not(.closing) [data-place="Desktop"]').click();
    await dragDesktopIcon(targetFolder, trashDockIcon);
    await expect(desktop.locator(`[data-id="file:${targetFolder}"]`)).toHaveCount(0);
    result.desktopFolderDragToTrash = true;
    await desktop.locator('[data-id="file:Projects"]').drop({
      files: payload('from-desktop-folder.txt', Buffer.from(text))
    });
    await expect.poll(() => diskText(session, 'from-desktop-folder.txt')).toBe(text);
    await desktop.locator('[data-id="hd"]').drop({ files: payload('rejected.txt', Buffer.from(text)) });
    await expect(desktop.locator('[data-id="file:rejected.txt"]')).toHaveCount(0);
    await helpers.launch('Finder');
    const finder = () => page.locator('.win.front[data-app="finder"]:not(.closing)');
    const item = name => finder().locator(`[role="option"][data-name=${JSON.stringify(name)}]`);
    const place = async name => {
      /* 侧栏条目是 cdk-drag：开窗动画期间按下，条目会在指针下移动、越过 CDK 的拖动阈值，把点击变成拖拽。
         等前台窗口存在且开窗动画结束（opening 类清除）再点，点击才是点击。 */
      await expect(finder()).toBeVisible();
      await expect(finder()).not.toHaveClass(/opening/);
      await finder()
        .locator(`[data-place=${JSON.stringify(name)}]`)
        .click();
    };
    const menu = async (name, command, keyboard = false) => {
      await expect(item(name)).toBeVisible();
      if (keyboard) {
        await item(name).focus();
        await page.keyboard.press('Shift+F10');
      } else await item(name).click({ button: 'right' });
      await page.getByRole('menuitem', { name: command, exact: true }).click();
    };
    const edit = async command => {
      await page.getByRole('menubar').getByRole('menuitem', { name: 'Edit', exact: true }).click();
      await page
        .getByRole('menu', { name: 'Edit', exact: true })
        .getByRole('menuitem', { name: command, exact: true })
        .click();
    };
    const dialog = () => page.locator('app-file-operation-dialog [role="dialog"]');
    const renameInput = () => finder().locator('[data-rename-input]');
    const rename = async (from, to) => {
      await menu(from, 'Rename', true);
      const input = renameInput();
      await expect(input).toBeFocused();
      await input.fill(to);
      await input.press('Enter');
      await expect(item(to)).toBeVisible();
    };
    const importFiles = async files => {
      await finder().locator('[data-body]').drop({ files });
      await expect(item(files[0].name)).toBeVisible();
    };
    const downloaded = async name => {
      const event = page.waitForEvent('download');
      await menu(name, 'Download File');
      const download = await event;
      expect(download.suggestedFilename()).toBe(name);
      return readFile(await download.path());
    };
    const trash = async name => {
      await menu(name, 'Move to Trash');
      await expect(item(name)).toHaveCount(0);
    };
    /** 废纸篓窗口的定位器：打开后按窗口 id 绑定（aria-label 跟着标题走，导航后就不再是 Trash）。 */
    let trashWin = null;
    const openTrash = async () => {
      await page.locator('#dock .di[data-app="trash"]').click();
      const byTitle = page.locator('.win[data-app="finder"]:not(.closing)[aria-label="Trash"]');
      await expect(byTitle).toBeVisible();
      /* 两个 Finder 窗口并存时，另一个窗口可能正被还原抢前台：等废纸篓窗自己的开窗动画结束，
         点它的标题确定它是前台，本段后续操作都按窗口 id 定位，不依赖 .win.front。 */
      await expect(byTitle).not.toHaveClass(/opening/);
      const id = await byTitle.getAttribute('id');
      trashWin = page.locator(`#${id}`);
      await trashWin.locator('[data-title]').click();
      await expect(finder()).toHaveAttribute('id', id);
    };
    await openTrash();
    result.trashOpensInIconView =
      (await trashWin.getByRole('button', { name: 'Icons', exact: true }).getAttribute('aria-pressed')) === 'true';
    await expect(trashWin.locator('[data-trash-header]')).toBeVisible();
    await expect(trashWin.getByRole('button', { name: 'Empty Trash', exact: true })).toHaveText('Empty');
    await expect(trashWin.locator('[role="option"][data-name="from-desktop.txt"]')).toBeVisible();
    await trashWin.locator('[data-place="Desktop"]').click();
    await expect(trashWin.getByRole('button', { name: /^Import/ })).toHaveCount(0);
    await trashWin.locator('[role="option"][data-name="Projects"]').drop({ files: payload('from-folder.txt', Buffer.from(text)) });
    await trashWin.locator('[role="option"][data-name="Projects"]').dblclick();
    await expect(trashWin.locator('[role="option"][data-name="from-desktop-folder.txt"]')).toBeVisible();
    await expect(trashWin.locator('[role="option"][data-name="from-folder.txt"]')).toBeVisible();
    result.dropsOnDesktopFolder = (await diskText(session, 'from-desktop-folder.txt')) === text;
    result.dropsOnFolder = (await diskText(session, 'from-folder.txt')) === text;

    await finder()
      .locator('[data-place="Downloads"]')
      .drop({ files: payload('from-sidebar.txt', Buffer.from(text)) });
    await expect(finder().locator('[data-title]')).toHaveText('Projects');
    await place('Downloads');
    await expect(item('from-sidebar.txt')).toBeVisible();
    result.dropsOnSidebar = (await diskText(session, 'from-sidebar.txt')) === text;

    /* 同级只差大小写的名字算同名，与库里归一化的唯一索引同口径（像 macOS）：拖入追加序号，改名被拒，原文件不动。 */
    await finder()
      .locator('[data-body]')
      .drop({ files: payload('FROM-SIDEBAR.txt', Buffer.from('cased')) });
    await expect(item('FROM-SIDEBAR 2.txt')).toBeVisible();
    result.importCaseVariantGetsNewName =
      (await item('FROM-SIDEBAR.txt').count()) === 0 &&
      (await diskText(session, 'from-sidebar.txt')) === text &&
      (await diskText(session, 'FROM-SIDEBAR 2.txt')) === 'cased';
    await menu('FROM-SIDEBAR 2.txt', 'Rename', true);
    await renameInput().fill('From-Sidebar.TXT');
    await renameInput().press('Enter');
    await expect(page.locator('#toast')).toContainText('already exists');
    await renameInput().press('Escape');
    await expect(renameInput()).toHaveCount(0);
    result.renameRejectsCaseVariantOfSibling =
      (await item('FROM-SIDEBAR 2.txt').count()) === 1 && (await diskText(session, 'from-sidebar.txt')) === text;
    await rename('FROM-SIDEBAR 2.txt', 'from-sidebar 2.txt');
    result.caseOnlyRenameKeepsContent =
      (await item('FROM-SIDEBAR 2.txt').count()) === 0 && (await diskText(session, 'from-sidebar 2.txt')) === 'cased';

    await place('Macintosh HD');
    await item('System').drop({ files: payload('rejected.txt', Buffer.from(text)) });
    await expect(item('rejected.txt')).toHaveCount(0);
    await item('System').dblclick();
    await expect(item('rejected.txt')).toHaveCount(0);
    result.rejectsReadOnlyDrops = (await diskText(session, 'rejected.txt')) === undefined;

    await place('Desktop');
    await importFiles([
      payload('roundtrip.txt', Buffer.from(text)),
      payload('binary.bin', binary),
      payload('empty.dat', Buffer.alloc(0))
    ]);
    result.importPreservesBytes =
      (await downloaded('roundtrip.txt')).equals(Buffer.from(text)) &&
      (await downloaded('binary.bin')).equals(binary) &&
      (await downloaded('empty.dat')).length === 0;
    await importFiles([payload('roundtrip.txt', Buffer.from('other'))]);
    await expect(item('roundtrip 2.txt')).toBeVisible();
    result.importKeepsExistingNames =
      (await diskText(session, 'roundtrip.txt')) === text && (await diskText(session, 'roundtrip 2.txt')) === 'other';

    await page.evaluate(() => {
      window.__originalFileReader = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        return this.name === 'unreadable.txt' ?
            Promise.reject(new Error('Unable to read test file'))
          : window.__originalFileReader.call(this);
      };
    });
    await finder()
      .locator('[data-body]')
      .drop({
        files: [payload('readable.txt', Buffer.from('readable')), payload('unreadable.txt', Buffer.from('unreadable'))]
      });
    await expect(page.locator('#toast')).toContainText('Unable to read test file');
    await page.evaluate(() => {
      File.prototype.arrayBuffer = window.__originalFileReader;
      delete window.__originalFileReader;
    });
    result.readFailureKeepsBatchAndExistingData =
      (await item('readable.txt').count()) === 0 &&
      (await item('unreadable.txt').count()) === 0 &&
      (await diskText(session, 'roundtrip.txt')) === text;

    const second = await session.openDesktopPage();
    await second.helpers.closeAll();
    await second.helpers.launch('Finder');
    await second.helpers.win('finder').last().locator('[data-place="Desktop"]').click();
    await page.bringToFront();
    await menu('roundtrip.txt', 'Rename', true);
    await renameInput().fill('bad/name');
    await renameInput().press('Enter');
    await expect(page.locator('#toast')).toContainText('name');
    await renameInput().fill('renamed.txt');
    await renameInput().press('Enter');
    await expect(item('renamed.txt')).toBeVisible();
    result.renameValidatesAndPreservesContent =
      (await item('roundtrip.txt').count()) === 0 && (await diskText(session, 'renamed.txt')) === text;
    await expect(second.helpers.win('finder').locator('[data-name="renamed.txt"]')).toBeVisible();
    result.otherTabSeesChanges = true;
    await second.page.close();
    await menu('renamed.txt', 'Rename', true);
    await expect(renameInput()).toBeFocused();
    await renameInput().press('Escape');
    await expect(renameInput()).toHaveCount(0);
    result.renameCancellationAndKeyboardFocus =
      (await item('renamed.txt').count()) === 1 &&
      (await item('renamed.txt').evaluate(node => node === document.activeElement));
    await menu('renamed.txt', 'Duplicate');
    await expect(item('renamed copy.txt')).toBeVisible();
    await menu('renamed.txt', 'Open With…');
    await dialog().getByRole('button', { name: 'Open', exact: true }).click();
    await expect(helpers.win('textedit').locator('[data-te-doc]')).toHaveText(text);
    result.openWithOpensSelectedFile = true;
    await helpers.win('textedit').locator('[data-te-doc]').fill('edited original');
    await helpers.win('textedit').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(helpers.win('textedit').getByRole('status')).toContainText('Saved');
    await helpers.win('textedit').locator('.tl .c').click();
    result.duplicateIsIndependent = (await diskText(session, 'renamed copy.txt')) === text;

    /* ADESK-US-212：显示简介、打开方式、Safari 打开 html、Preview 按页渲染 PDF。 */
    const infoPanel = () => page.locator('app-info-panel [data-info-panel]');
    const closeWin = async app => helpers.win(app).locator('.tl .c').click();
    await place('Desktop');

    /* html 默认交给 Safari：双击在沙盒框里渲染文件内容。 */
    await item('Projects').dblclick();
    await expect(item('desktop-web')).toBeVisible();
    await item('desktop-web').dblclick();
    await expect(item('index.html')).toBeVisible();
    await item('index.html').dblclick();
    const safari = helpers.win('safari');
    await expect(safari.locator('iframe[data-sf-file]')).toBeVisible();
    await expect(safari.locator('iframe[data-sf-file]')).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(safari.locator('[data-url]')).toHaveValue(/index\.html$/);
    const htmlFrame = safari.locator('iframe[data-sf-file]').contentFrame();
    const htmlTitle = await htmlFrame.locator('title').evaluate(node => node.textContent);
    /* 沙盒边界：框内脚本运行在不透明来源，够不到桌面（D-28 的唯一防线，回归守护）。 */
    const frameOrigin = await htmlFrame.locator('html').evaluate(() => window.origin);
    const parentReach = await htmlFrame.locator('html').evaluate(() => {
      try {
        void parent.document.title;
        return 'reachable';
      } catch {
        return 'blocked';
      }
    });
    result.safariOpensHtml = htmlTitle === 'desktop-web' && frameOrigin === 'null' && parentReach === 'blocked';
    await closeWin('safari');
    await expect(safari).toHaveCount(0);

    /* Open With… 勾选 Always Open With：所选应用成为默认，另一个 html 双击即生效。 */
    await menu('index.html', 'Open With…');
    await dialog().locator('select').selectOption('textedit');
    await dialog().getByRole('checkbox').check();
    await dialog().getByRole('button', { name: 'Open', exact: true }).click();
    await expect(helpers.win('textedit').locator('[data-te-doc]')).toContainText('desktop-web');
    await closeWin('textedit');
    await place('Desktop');
    await item('Projects').dblclick();
    await expect(item('aurora-synth')).toBeVisible();
    await item('aurora-synth').dblclick();
    await expect(item('index.html')).toBeVisible();
    await item('index.html').dblclick();
    await expect(helpers.win('textedit').locator('[data-te-doc]')).toContainText('aurora-synth');
    await closeWin('textedit');
    /* 刷新后关联仍在：再开一个 html 依旧走 TextEdit（AC4）。 */
    await page.reload({ waitUntil: 'load' });
    await helpers.restored();
    /* 恢复出的 Finder 还在开窗动画，等它落定再点侧栏（与首次启动后的等待同理）。 */
    await page.waitForTimeout(1_200);
    await place('Desktop');
    await item('Projects').dblclick();
    await expect(item('desktop-web')).toBeVisible();
    await item('desktop-web').dblclick();
    await expect(item('index.html')).toBeVisible();
    await item('index.html').dblclick();
    await expect(helpers.win('textedit').locator('[data-te-doc]')).toContainText('desktop-web');
    await closeWin('textedit');
    result.openWithAlwaysSetsDefault = true;

    /* 简介面板的 Change All… 改回 Safari，双击验证默认已回。 */
    await place('Desktop');
    await item('Projects').dblclick();
    await expect(item('desktop-web')).toBeVisible();
    await item('desktop-web').dblclick();
    await expect(item('index.html')).toBeVisible();
    await item('index.html').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Get Info', exact: true }).click();
    await expect(infoPanel()).toBeVisible();
    await expect(infoPanel().locator('[data-ip-app]')).toHaveValue('textedit');
    await infoPanel().locator('[data-ip-app]').selectOption('safari');
    /* 无 Zone 应用：变更检测下一帧才刷新下拉的信号，等值落定再点 Change All。 */
    await expect(infoPanel().locator('[data-ip-app]')).toHaveValue('safari');
    await infoPanel().locator('[data-ip-change-all]').click();
    await expect(page.locator('#toast')).toContainText('will now open with Safari');
    await expect(infoPanel()).toHaveCount(0);
    await item('index.html').dblclick();
    await expect(helpers.win('safari').locator('iframe[data-sf-file]')).toBeVisible();
    await closeWin('safari');
    result.getInfoChangeAllSetsDefault = true;

    /* 菜单栏 ⌘I：选中条目后打开简介，面板显示元数据与打开方式，axe 无违规，Esc 关闭。 */
    await place('Desktop');
    await expect(item('renamed.txt')).toBeVisible();
    await item('renamed.txt').focus();
    await page.keyboard.press('Meta+i');
    await expect(infoPanel()).toBeVisible();
    const renamedPanel = infoPanel();
    await expect(renamedPanel).toContainText('renamed.txt');
    await expect(renamedPanel).toContainText('Plain text');
    await expect(renamedPanel).toContainText('/Desktop');
    await expect(renamedPanel.locator('[data-ip-app]')).toHaveValue('textedit');
    const panelAxe = await new AxeBuilder({ page }).include('app-info-panel').analyze();
    await page.keyboard.press('Escape');
    await expect(infoPanel()).toHaveCount(0);
    /* 未选中条目时 ⌘I 显示当前文件夹（Desktop）的简介，没有打开方式区（AC2）。 */
    await finder()
      .locator('[data-body]')
      .click({ position: { x: 10, y: 240 } });
    await page.keyboard.press('Meta+i');
    await expect(infoPanel()).toBeVisible();
    const desktopPanel = infoPanel();
    await expect(desktopPanel).toContainText('Desktop');
    await expect(desktopPanel).toContainText('Folder');
    await expect(desktopPanel.locator('[data-ip-open-with]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(infoPanel()).toHaveCount(0);
    result.getInfoShowsPanel = panelAxe.violations.length === 0;

    /* PDF：内置指南按页渲染；导入的真实 PDF（FlateDecode）同样能渲染。 */
    await item('Interface Guidelines.pdf').dblclick();
    const preview = helpers.win('preview');
    await expect(preview.locator('[data-pv-canvas]')).toBeVisible();
    await expect(preview.locator('[data-pv-nav]')).toContainText(/1 of \d+/);
    const guidelinesWidth = await preview.locator('[data-pv-canvas]').evaluate(canvas => canvas.width);
    await closeWin('preview');
    await importFiles([payload('real.pdf', realPdf())]);
    await item('real.pdf').dblclick();
    await expect(helpers.win('preview').locator('[data-pv-canvas]')).toBeVisible();
    await expect(helpers.win('preview').locator('[data-pv-failed]')).toHaveCount(0);
    await expect(helpers.win('preview').locator('[data-pv-nav]')).toHaveText('1 of 1');
    result.previewRendersPdf =
      guidelinesWidth > 0 &&
      (await helpers
        .win('preview')
        .locator('[data-pv-canvas]')
        .evaluate(canvas => canvas.width)) > 0;
    await closeWin('preview');
    await menu('real.pdf', 'Move to Trash');

    await finder().locator('[data-more]').click();
    await page.getByRole('menuitem', { name: /New Folder/ }).click();
    await expect(renameInput()).toBeFocused();
    await renameInput().fill('nested');
    await renameInput().press('Enter');
    await expect(item('nested')).toBeVisible();
    await item('nested').dblclick();
    await importFiles([
      payload('child.txt', Buffer.from(text)),
      payload('empty', Buffer.alloc(0)),
      payload('bytes.bin', binary)
    ]);
    await importFiles([payload('finder-dock-trash.txt', Buffer.from(text))]);
    await item('finder-dock-trash.txt').dragTo(trashDockIcon);
    await expect(item('finder-dock-trash.txt')).toHaveCount(0);
    await openTrash();
    await expect(item('finder-dock-trash.txt')).toBeVisible();
    result.finderFileDragToTrash = true;
    const dockTrashFinderId = await finder().getAttribute('id');
    await finder().locator('[data-w="close"]').click();
    await expect(page.locator(`#${dockTrashFinderId}`)).toHaveCount(0);
    await page.keyboard.press('Meta+Shift+n');
    await place('Desktop');
    await menu('nested', 'Duplicate');
    await item('nested copy').dblclick();
    const nestedBytes = (await downloaded('bytes.bin')).equals(binary) && (await downloaded('empty')).length === 0;
    await item('untitled folder').dblclick();
    await expect(finder().locator('[data-title]')).toHaveText('untitled folder');
    await expect(finder().getByRole('option')).toHaveCount(0);
    result.folderCopyKeepsNestedAndEmptyEntries = nestedBytes && (await finder().getByRole('option').count()) === 0;

    await place('Desktop');
    await page.keyboard.press('Meta+n');
    await place('Desktop');
    await item('nested').dblclick();
    await importFiles([payload('finder-window-trash.txt', Buffer.from(text))]);
    const sourceFinderId = await finder().getAttribute('id');
    const sourceFinder = page.locator(`#${sourceFinderId}`);
    const sourceItem = sourceFinder.locator('[data-name="finder-window-trash.txt"]');
    const sourceBoxBeforeMove = await sourceFinder.boundingBox();
    const sourceTitleBox = await sourceFinder.locator('[data-title]').boundingBox();
    if (!sourceBoxBeforeMove || !sourceTitleBox) throw new Error('Source Finder window is not measurable');
    await page.mouse.move(sourceTitleBox.x + sourceTitleBox.width / 2, sourceTitleBox.y + sourceTitleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      sourceTitleBox.x + sourceTitleBox.width / 2 - 220,
      sourceTitleBox.y + sourceTitleBox.height / 2,
      { steps: 8 }
    );
    await page.mouse.up();
    await openTrash();
    const trashFinder = finder();
    const trashFinderId = await trashFinder.getAttribute('id');
    const trashTitleBox = await trashFinder.locator('[data-title]').boundingBox();
    if (!trashFinderId || !trashTitleBox) throw new Error('Trash Finder is not measurable');
    const trashFinderWindow = page.locator(`#${trashFinderId}`);
    await page.mouse.move(trashTitleBox.x + trashTitleBox.width / 2, trashTitleBox.y + trashTitleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(trashTitleBox.x + trashTitleBox.width / 2 + 200, trashTitleBox.y + trashTitleBox.height / 2, {
      steps: 8
    });
    await page.mouse.up();
    const sourceBoxAfterMove = await sourceFinder.boundingBox();
    if (!sourceBoxAfterMove) throw new Error('Moved Source Finder window is not measurable');
    await page.mouse.click(sourceBoxAfterMove.x + 80, sourceBoxAfterMove.y + 18);
    const sourceItemBox = await sourceItem.boundingBox();
    const trashBodyBox = await trashFinderWindow.locator('[data-body]').boundingBox();
    if (!sourceItemBox || !trashBodyBox) throw new Error('Finder drag targets are not measurable');
    const viewportWidth = await page.evaluate(() => innerWidth);
    const sourcePoint = {
      x: sourceItemBox.x + sourceItemBox.width / 2,
      y: sourceItemBox.y + sourceItemBox.height / 2
    };
    const dropPoint = {
      x: Math.min(trashBodyBox.x + trashBodyBox.width - 40, viewportWidth - 20),
      y: trashBodyBox.y + Math.min(80, trashBodyBox.height / 2)
    };
    await page.mouse.move(sourcePoint.x, sourcePoint.y);
    await page.mouse.down();
    await page.mouse.move(sourcePoint.x + 20, sourcePoint.y + 20, { steps: 4 });
    await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 16 });
    await page.mouse.up();
    await expect(sourceItem).toHaveCount(0);
    const trashPath = await surgery(session, db =>
      db.shell.rows(
        `WITH RECURSIVE chain(id, name, parent_id) AS (
          SELECT "id", "name", "parentId" FROM "desktop$desktop_file" WHERE "name" = ?
          UNION ALL
          SELECT parent."id", parent."name", parent."parentId"
          FROM "desktop$desktop_file" parent
          JOIN chain child ON child."parent_id" = parent."id"
        )
        SELECT "name" FROM chain`,
        ['finder-window-trash.txt']
      )
    );
    if (!trashPath.some(([name]) => name === '.Trash'))
      throw new Error(`Unexpected Finder drop path: ${JSON.stringify(trashPath)}`);
    await expect(trashFinderWindow.locator('[data-name="finder-window-trash.txt"]')).toBeVisible();
    result.finderFileDragToTrashWindow = true;

    const trashItem = trashFinderWindow.locator('[data-name="finder-window-trash.txt"]');
    const trashTitle = trashFinderWindow.locator('[data-title]');
    const targetBody = sourceFinder.locator('[data-body]');
    const trashTitleBeforeReverseDrag = await trashTitle.boundingBox();
    const trashItemBox = await trashItem.boundingBox();
    const targetBodyBox = await targetBody.boundingBox();
    if (!trashTitleBeforeReverseDrag || !trashItemBox || !targetBodyBox)
      throw new Error('Reverse Finder drag targets are not measurable');
    await page.mouse.click(
      trashTitleBeforeReverseDrag.x + trashTitleBeforeReverseDrag.width / 2,
      trashTitleBeforeReverseDrag.y + trashTitleBeforeReverseDrag.height / 2
    );
    await expect(trashFinderWindow).toHaveClass(/front/);
    await page.mouse.move(trashItemBox.x + trashItemBox.width / 2, trashItemBox.y + trashItemBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(trashItemBox.x + 20, trashItemBox.y + 20, { steps: 4 });
    await page.mouse.move(targetBodyBox.x + 40, targetBodyBox.y + targetBodyBox.height - 40, { steps: 16 });
    await page.waitForTimeout(800);
    await expect(trashTitle).toHaveText('Trash');
    await expect(sourceFinder.locator('[data-title]')).toHaveText('nested');
    await expect(sourceFinder).toHaveClass(/front/);
    await page.mouse.up();
    await expect(trashItem).toHaveCount(0);
    await expect(sourceFinder.locator('[data-name="finder-window-trash.txt"]')).toBeVisible();
    result.trashFinderDragToFolderWindow = true;

    await place('Desktop');
    await importFiles([
      payload('clipboard-source.txt', Buffer.from(text)),
      payload('drag-copy.txt', Buffer.from(text)),
      payload('drag-move.txt', Buffer.from(text))
    ]);
    await expect(item('drag-copy.txt')).toBeVisible();
    await expect(item('drag-move.txt')).toBeVisible();
    await finder().getByRole('button', { name: 'List', exact: true }).click();
    await expect(finder().locator('.fv-list-scroll')).toHaveCount(1);
    result.listVirtualScroll = true;
    await item('clipboard-source.txt').click();
    await item('drag-copy.txt').click({ modifiers: ['Meta'] });
    await expect(finder().locator('[role=option][aria-selected="true"]')).toHaveCount(2);
    result.multiSelection = true;

    await finder().getByRole('button', { name: 'Icons', exact: true }).click();
    await item('clipboard-source.txt').click();
    const marqueeBody = finder().locator('[data-body]');
    const marqueeTargets = await Promise.all([
      item('clipboard-source.txt').boundingBox(),
      item('drag-copy.txt').boundingBox()
    ]);
    const marqueeBodyBox = await marqueeBody.boundingBox();
    if (!marqueeBodyBox || marqueeTargets.some(box => !box))
      throw new Error('Finder marquee targets are not measurable');
    const measuredTargets = marqueeTargets.filter(Boolean);
    const marqueeLeft = Math.min(...measuredTargets.map(box => box.x)) - 8;
    const marqueeTop = Math.min(...measuredTargets.map(box => box.y)) - 8;
    const marqueeRight = Math.max(...measuredTargets.map(box => box.x + box.width)) + 2;
    const marqueeBottom = Math.max(...measuredTargets.map(box => box.y + box.height)) + 8;
    await page.mouse.move(
      Math.max(marqueeBodyBox.x + 2, marqueeLeft),
      Math.min(marqueeBodyBox.y + marqueeBodyBox.height - 2, marqueeBottom)
    );
    await page.mouse.down();
    await page.mouse.move(marqueeRight, marqueeTop, { steps: 8 });
    await page.mouse.up();
    await expect(finder().locator('[role=option][aria-selected="true"]')).not.toHaveCount(0);
    result.finderMarqueeSelection =
      (await item('clipboard-source.txt').getAttribute('aria-selected')) === 'true' &&
      (await item('drag-copy.txt').getAttribute('aria-selected')) === 'true';
    await item('drag-copy.txt').click();

    const springSource = item('drag-copy.txt');
    const springTarget = item('nested');
    const springSourceBox = await springSource.boundingBox();
    const springTargetBox = await springTarget.boundingBox();
    if (!springSourceBox || !springTargetBox) throw new Error('Spring folder targets are not measurable');
    await page.mouse.move(
      springSourceBox.x + springSourceBox.width / 2,
      springSourceBox.y + springSourceBox.height / 2
    );
    await page.mouse.down();
    try {
      await page.mouse.move(
        springTargetBox.x + springTargetBox.width / 2,
        springTargetBox.y + springTargetBox.height / 2,
        {
          steps: 12
        }
      );
      await expect.poll(() => springTarget.locator('.art [data-icon]').getAttribute('data-icon')).toBe('g-folder-open');
      result.springFolderIcon = true;
    } finally {
      await page.mouse.move(
        springSourceBox.x + springSourceBox.width / 2,
        springSourceBox.y + springSourceBox.height / 2
      );
      await page.mouse.up();
    }

    await item('clipboard-source.txt').click();
    await edit('Copy');
    await item('nested').dblclick();
    await edit('Paste');
    await expect(item('clipboard-source.txt')).toBeVisible();
    const clipboardCopyKeptBytes = (await downloaded('clipboard-source.txt')).equals(Buffer.from(text));
    await item('clipboard-source.txt').focus();
    await edit('Cut');
    await place('Desktop');
    await edit('Paste');
    await expect(item('clipboard-source 2.txt')).toBeVisible();
    await item('nested').dblclick();
    await expect(item('clipboard-source.txt')).toHaveCount(0);
    await place('Desktop');
    await expect(item('clipboard-source 2.txt')).toBeVisible();
    result.clipboardCopyPaste = clipboardCopyKeptBytes;

    await page.keyboard.down('Alt');
    await item('drag-copy.txt').dragTo(item('nested'));
    await page.keyboard.up('Alt');
    await expect(item('drag-copy.txt')).toBeVisible();
    await item('nested').dblclick();
    await expect(finder().locator('[data-title]')).toHaveText('nested');
    await expect(item('drag-copy.txt')).toBeVisible();
    await place('Desktop');
    result.dragCopy = (await diskText(session, 'drag-copy.txt')) === text;

    await expect(item('drag-move.txt')).toBeVisible();
    await item('drag-move.txt').dragTo(item('nested'));
    await expect(item('drag-move.txt')).toHaveCount(0);
    await item('nested').dblclick();
    await expect(finder().locator('[data-title]')).toHaveText('nested');
    await expect(item('drag-move.txt')).toBeVisible();
    await place('Desktop');
    result.dragMove = true;

    await finder().getByRole('button', { name: 'Columns', exact: true }).click();
    await item('nested copy').click();
    const columnViewports = finder().locator('.fv-col cdk-virtual-scroll-viewport.col');
    await expect(columnViewports).toHaveCount(2);
    result.columnVirtualScroll = true;
    const columnDivider = finder().locator('.finder-column-divider').first();
    const oldColumnWidth = await columnDivider.getAttribute('aria-valuenow');
    const dividerBox = await columnDivider.boundingBox();
    if (!dividerBox) throw new Error('Finder column divider is not measurable');
    await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(dividerBox.x + dividerBox.width / 2 + 40, dividerBox.y + 20);
    await page.mouse.up();
    await expect(columnDivider).not.toHaveAttribute('aria-valuenow', oldColumnWidth);
    result.columnWidthDrag = true;
    const column = finder().getByRole('listbox', { name: 'nested copy', exact: true });
    await column.drop({ files: payload('from-column.txt', Buffer.from(text)) });
    await expect(column.locator('[data-name="from-column.txt"]')).toBeVisible();
    result.dropsOnVisibleColumn = (await diskText(session, 'from-column.txt')) === text;
    await rename('child.txt', 'column-child.txt');
    result.columnActionsUseExactPath = (await downloaded('column-child.txt')).equals(Buffer.from(text));
    await place('Desktop');
    await finder().getByRole('button', { name: 'Gallery', exact: true }).click();
    await item('renamed.txt').focus();
    await page.keyboard.press('Meta+d');
    await expect(item('renamed copy 2.txt')).toBeVisible();
    await menu('renamed copy 2.txt', 'Rename');
    await renameInput().fill('gallery-copy.txt');
    await renameInput().press('Enter');
    await expect(item('gallery-copy.txt')).toBeVisible();
    result.galleryActionsAndDuplicateShortcut = (await diskText(session, 'gallery-copy.txt')) === 'edited original';
    await finder().getByRole('button', { name: 'Icons', exact: true }).click();
    await trash('renamed.txt');
    await openTrash();
    await rename('renamed.txt', 'trash-renamed.txt');
    await page.reload({ waitUntil: 'load' });
    await helpers.restored();
    await openTrash();
    await menu('trash-renamed.txt', 'Put Back');
    await expect(item('trash-renamed.txt')).toHaveCount(0);
    await place('Desktop');
    result.trashOriginSurvivesReloadAndRename = (await downloaded('renamed.txt')).equals(
      Buffer.from('edited original')
    );
    await trash('renamed.txt');
    await importFiles([payload('renamed.txt', Buffer.from('collision'))]);
    await openTrash();
    await menu('renamed.txt', 'Put Back');
    await expect(item('renamed.txt')).toHaveCount(0);
    await place('Desktop');
    result.restoreKeepsCollidingFile =
      (await diskText(session, 'renamed.txt')) === 'collision' &&
      (await diskText(session, 'renamed 2.txt')) === 'edited original';

    await item('nested').dblclick();
    await trash('child.txt');
    await place('Desktop');
    await rename('nested', 'moved-parent');
    await openTrash();
    await menu('child.txt', 'Put Back');
    await expect(
      page.locator('[role="status"]').filter({ hasText: 'destination folder no longer exists' })
    ).toBeVisible();
    await menu('child.txt', 'Restore to Folder…', true);
    await expect(dialog().getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog()).toHaveCount(0);
    await expect(item('child.txt')).toBeVisible();
    await menu('child.txt', 'Restore to Folder…');
    await dialog()
      .getByRole('combobox', { name: 'Destination folder' })
      .selectOption(JSON.stringify(['Users', 'stevejobs', 'Desktop']));
    await dialog().getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    result.missingOriginRequiresExplicitFolder = (await diskText(session, 'child.txt')) === text;

    await place('Desktop');
    await trash('binary.bin');
    await surgery(session, db =>
      db.shell.execute('UPDATE "desktop$desktop_file" SET "original_path" = NULL WHERE "name" = ?', ['binary.bin'])
    );
    await openTrash();
    await menu('binary.bin', 'Restore to Folder…');
    await dialog().getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(dialog()).toHaveCount(0);
    await place('Desktop');
    result.legacyTrashCanChooseFolder = (await downloaded('binary.bin')).equals(binary);

    await importFiles([payload('shortcut-trash.txt', Buffer.from(text))]);
    await item('shortcut-trash.txt').focus();
    await page.keyboard.press('Meta+Backspace');
    await expect(item('shortcut-trash.txt')).toHaveCount(0);
    await openTrash();
    await expect(item('shortcut-trash.txt')).toBeVisible();
    result.trashShortcutMovesItem =
      (await page.locator('#dock .di[data-app="trash"] [data-icon="app-trash-full"]').count()) === 1;

    const emptyTrash = finder().locator('[data-trash-empty]');
    await expect(emptyTrash).toBeEnabled();
    await emptyTrash.click();
    const emptyDialog = page.getByRole('alertdialog');
    await expect(emptyDialog).toBeVisible();
    await emptyDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(emptyDialog).toHaveCount(0);
    const remainsAfterCancel = await item('shortcut-trash.txt').count();
    await emptyTrash.click();
    await emptyDialog.getByRole('button', { name: 'Empty Trash', exact: true }).click();
    await expect(emptyDialog).toHaveCount(0);
    await expect(item('shortcut-trash.txt')).toHaveCount(0);
    await expect(finder().locator('[data-trash-status]')).toHaveText('0 items');
    result.emptyTrashRequiresConfirmation = remainsAfterCancel === 1;

    await helpers.closeAll();
    await page.locator('#dock .di[data-app="trash"]').click();
    const trashWindow = await finder().getAttribute('id');
    await expect(finder().locator('[data-title]')).toHaveText('Trash');
    await page.locator('#dock .di[data-app="finder"]').click();
    await expect(finder()).not.toHaveAttribute('id', trashWindow);
    result.finderOpensAlongsideTrash =
      (await page.locator('.win[data-app="finder"]:not(.closing)').count()) === 2 &&
      (await finder().locator('[data-title]').textContent()) !== 'Trash';

    return { fileManagement: result };
  }
};
