/** 预装应用包的磁盘保护（ADESK-US-205 阶段 B）：Finder 与终端结论一致，包在所有写路径下保持不变。 */
export const applicationsProtection = {
  name: 'applications-protection',
  description:
    '预装应用受保护：Finder 移进废纸篓被拒绝、终端的删除/移动/改名/改包内文件被撤销并提示、用户放进包里的文件不受影响',
  keys: [
    'applicationsProtection.packagesCarryAppId',
    'applicationsProtection.finderRefusesMoveToTrash',
    'applicationsProtection.finderRefusalExplains',
    'applicationsProtection.emptyTrashCannotRemovePackage',
    'applicationsProtection.terminalDeleteIsReverted',
    'applicationsProtection.terminalMoveIsReverted',
    'applicationsProtection.terminalSubItemEditIsReverted',
    'applicationsProtection.terminalAncestorDeleteIsReverted',
    'applicationsProtection.terminalExplainsTheRevert',
    'applicationsProtection.revertedPackageStillOpens',
    'applicationsProtection.userFileInsidePackageIsNotProtected'
  ],
  async run(session) {
    const { page } = session;
    const { win, closeAll, appears, xtermText, runInShell, openTerminal } = session.helpers;
    await session.openDesktop();
    const result = {};
    const toast = page.locator('#toast');
    const toastText = async () => ((await toast.textContent()) ?? '').trim();

    /* Finder：预装的包「移进废纸篓」被拒绝，原因写清楚，清空废纸篓也动不了它。 */
    await closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    const finder = win('finder').last();
    await finder.locator('[data-place="Applications"]').click();
    const item = finder.locator('.fitem[data-name="几猫3A大作.app"]');
    await item.waitFor();
    await item.click({ button: 'right' });
    await page.locator('#layer-menu .pop .mi', { hasText: 'Move to Trash' }).click();
    await page.waitForFunction(
      () => document.querySelector('#toast')?.textContent?.includes('preinstalled'),
      undefined,
      {
        timeout: 5_000
      }
    );
    const refusal = await toastText();
    result.finderRefusesMoveToTrash = (await item.count()) === 1;
    result.finderRefusalExplains = refusal.includes('can’t be moved to the Trash') && refusal.includes('preinstalled');
    await page.locator('#dock .di[data-app="trash"]').click({ button: 'right' });
    await page.locator('#layer-menu .pop .mi', { hasText: 'Empty Trash' }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    result.emptyTrashCannotRemovePackage = (await item.count()) === 1;

    /* 终端：先确认包里写着应用标识（按标识回到清单，不是按显示名）。 */
    await closeAll();
    await openTerminal();
    let probes = 0;
    /** 在终端里列目录：每次用新的标记，输出里读得到才算数，免得把屏幕上早先的文字当成结果。 */
    const listing = async path => {
      const label = `LS${++probes}`;
      const printed = await runInShell(
        `node -e "console.log('${label}:' + require('fs').readdirSync('${path}').join('|') + ':END')"`,
        new RegExp(`${label}:[^']*?:END`)
      );
      return printed ? (new RegExp(`${label}:([^']*?):END`).exec(await xtermText())?.[1] ?? '') : null;
    };
    result.packagesCarryAppId = await runInShell(
      `node -e "console.log('ID:' + require('fs').readFileSync('/Applications/Calculator.app/Contents/Info.plist', 'utf8').split('AiaoAppId</key>')[1].split('<string>')[1].split('</string>')[0])"`,
      /ID:calculator/
    );

    /* 终端里 rm / mv 预装包：先成功，下一次扫描（最长约 3.3 秒）发现并撤销，桌面给出提示。 */
    const reverted = async (command, path, expected) => {
      await runInShell(command);
      await page.waitForTimeout(4_500);
      return ((await listing(path)) ?? '').split('|').includes(expected);
    };
    result.terminalDeleteIsReverted = await reverted(
      'rm -r /Applications/Calculator.app',
      '/Applications/Calculator.app/Contents',
      'Info.plist'
    );
    result.terminalExplainsTheRevert = (await toastText()).includes('reverted');
    result.terminalMoveIsReverted = await reverted(
      'mv /Applications/Notes.app /Applications/Notes-moved.app',
      '/Applications/Notes.app/Contents',
      'Info.plist'
    );
    result.terminalSubItemEditIsReverted = await reverted(
      'rm /Applications/Preview.app/Contents/Info.plist',
      '/Applications/Preview.app/Contents',
      'Info.plist'
    );
    result.terminalAncestorDeleteIsReverted = await reverted('rm -r /Applications', '/Applications', 'Calculator.app');

    /* 撤销之后的包仍能打开；用户放进包里的文件不在保护范围内，删得掉。 */
    await runInShell('open -a Calculator');
    result.revertedPackageStillOpens = await appears(win('calculator'), 10_000);
    await runInShell('echo mine > /Applications/Maps.app/Contents/user-note.txt');
    await page.waitForTimeout(4_500);
    const written = ((await listing('/Applications/Maps.app/Contents')) ?? '').split('|').includes('user-note.txt');
    await runInShell('rm /Applications/Maps.app/Contents/user-note.txt');
    await page.waitForTimeout(4_500);
    const remaining = ((await listing('/Applications/Maps.app/Contents')) ?? 'unreadable').split('|');
    result.userFileInsidePackageIsNotProtected =
      written && !remaining.includes('user-note.txt') && remaining.includes('Info.plist');

    return { applicationsProtection: result };
  }
};
