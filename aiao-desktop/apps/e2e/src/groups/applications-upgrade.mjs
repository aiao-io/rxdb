import { surgery } from '../harness/database.mjs';

const FILES = '"desktop$desktop_file"';

/**
 * 旧版种子写出的 Info.plist（只有标识与名字，没有 AiaoAppId）：造出「此前发布的构建建的库」里的旧包。
 * 终端的 shell 不处理双引号里的反斜杠转义，所以文本里不能出现双引号。
 */
const legacyPlist = (name, identifier) =>
  `<plist><dict><key>CFBundleName</key><string>${name}</string><key>CFBundleIdentifier</key><string>${identifier}</string></dict></plist>`;

/**
 * 已有库的升级（ADESK-US-205 阶段 A，AC#3）：库里的 /Applications 是旧版种子写的——旧包没有 `AiaoAppId`、
 * 用户删过一个包、在另一个包里放过自己的文件、还有一个应用的位置被同名的非包条目占着。用夹具在真库上造出这个状态，
 * 再用当前构建打开：缺的包补出来、旧包按冻结名单被认领并补上标识、用户文件原样保留、同名条目不被覆盖也不阻塞启动
 * （Finder 说明，应用仍能从别的入口打开）、刷新后不重复补写。
 */
export const applicationsUpgrade = {
  name: 'applications-upgrade',
  description: '已有库升级：旧包认领、缺的包补回、用户文件保留、同名的非包条目让位并说明、刷新后不重复',
  standins: ['game'],
  keys: [
    'applicationsUpgrade.legacyPackagesAreClaimed',
    'applicationsUpgrade.deletedPackageIsRestored',
    'applicationsUpgrade.userFileInsidePackageIsKept',
    'applicationsUpgrade.sameNameFileKeptAsIs',
    'applicationsUpgrade.finderExplainsTheConflict',
    'applicationsUpgrade.conflictedAppStillOpens',
    'applicationsUpgrade.sameNameFileIsNotProtected',
    'applicationsUpgrade.packageReturnsOnceTheNameIsFree',
    'applicationsUpgrade.reloadDoesNotRewrite'
  ],
  async run(session) {
    const { page: initial } = session;
    const result = {};
    await initial.close();

    /* 1) 在终端里写两份旧格式的 Info.plist（真的文件体），再关掉桌面。 */
    let desktop = await session.openDesktopPage();
    let { page, helpers } = desktop;
    await helpers.closeAll();
    await helpers.openTerminal();
    await helpers.runInShell(
      `node -e "require('fs').writeFileSync('/Users/prasenjit/Desktop/legacy-mail.plist', '${legacyPlist('Mail', 'io.aiao.desktop.mail')}')"`
    );
    await helpers.runInShell(
      `node -e "require('fs').writeFileSync('/Users/prasenjit/Desktop/legacy-maps.plist', '${legacyPlist('Maps', 'io.aiao.desktop.maps')}')"`
    );
    await helpers.appears(helpers.desktopIcon('legacy-maps.plist'), 15_000);
    await helpers.appears(helpers.desktopIcon('legacy-mail.plist'), 15_000);
    await page.waitForTimeout(500);
    await page.close();

    /* 2) 改库：旧包换成旧格式的 Info.plist（共用那两份文件体）、删掉 Notes.app、在 Maps.app 里放用户文件、
     *    把 Clock.app 换成同名的普通文件。 */
    await surgery(session, async db => {
      const rows = (sql, bindings) => db.shell.rows(sql, bindings);
      const apps = (await rows(`SELECT id FROM ${FILES} WHERE name = 'Applications' AND "parentId" IS NULL`))[0][0];
      const plistOf = async name =>
        (
          await rows(
            `SELECT i.id, f.content_id, f.size FROM ${FILES} i
             JOIN ${FILES} c ON i."parentId" = c.id AND c.name = 'Contents'
             JOIN ${FILES} p ON c."parentId" = p.id AND p.name = ? AND p."parentId" = ?
             JOIN ${FILES} f ON f.name = ?
             WHERE i.name = 'Info.plist'`,
            [`${name}.app`, apps, `legacy-${name.toLowerCase()}.plist`]
          )
        )[0];
      for (const name of ['Mail', 'Maps']) {
        const [infoId, contentId, size] = await plistOf(name);
        await db.shell.execute(`UPDATE ${FILES} SET content_id = ?, size = ? WHERE id = ?`, [contentId, size, infoId]);
      }
      const [mapsContents] = (
        await rows(
          `SELECT c.id FROM ${FILES} c JOIN ${FILES} p ON c."parentId" = p.id AND p.name = 'Maps.app' AND p."parentId" = ?
           WHERE c.name = 'Contents'`,
          [apps]
        )
      )[0];
      const [, legacyBlob, legacySize] = await plistOf('Maps');
      const now = new Date().toISOString();
      await db.shell.execute(
        `INSERT INTO ${FILES} ("createdAt", "updatedAt", name, type, size, mime_type, content_id, modified_at, "parentId")
         VALUES (?, ?, 'my-notes.txt', 'file', ?, 'text/plain', ?, ?, ?)`,
        [now, now, legacySize, legacyBlob, now, mapsContents]
      );
      await db.shell.execute(`DELETE FROM ${FILES} WHERE name = 'Notes.app' AND "parentId" = ?`, [apps]);
      await db.shell.execute(`DELETE FROM ${FILES} WHERE name = 'Clock.app' AND "parentId" = ?`, [apps]);
      await db.shell.execute(
        `INSERT INTO ${FILES} ("createdAt", "updatedAt", name, type, size, mime_type, content_id, modified_at, "parentId")
         VALUES (?, ?, 'Clock.app', 'file', 0, 'text/plain', NULL, ?, ?)`,
        [now, now, now, apps]
      );
    });

    /* 3) 用当前构建打开：对账补齐、认领、保留。 */
    desktop = await session.openDesktopPage();
    ({ page, helpers } = desktop);
    const { win, closeAll, launch, appears, runInShell, openTerminal } = helpers;
    await closeAll();
    await openTerminal();
    const idOf = name =>
      `node -e "console.log('ID:' + require('fs').readFileSync('/Applications/${name}.app/Contents/Info.plist', 'utf8').split('AiaoAppId</key>')[1].split('<string>')[1].split('</string>')[0])"`;
    result.legacyPackagesAreClaimed =
      (await runInShell(idOf('Mail'), /ID:mail/)) && (await runInShell(idOf('Maps'), /ID:maps/));
    result.deletedPackageIsRestored = await runInShell(idOf('Notes'), /ID:notes/);
    result.userFileInsidePackageIsKept = await runInShell('ls /Applications/Maps.app/Contents', /my-notes\.txt/);
    result.sameNameFileKeptAsIs = await runInShell(
      `node -e "console.log('KIND:' + require('fs').statSync('/Applications/Clock.app').isDirectory())"`,
      /KIND:false/
    );
    await closeAll();

    await page.locator('#dock .di[data-app="finder"]').click();
    const finder = win('finder').last();
    await finder.locator('[data-place="Applications"]').click();
    await finder.locator('.fitem[data-name="Clock.app"]').waitFor();
    result.finderExplainsTheConflict = ((await finder.locator('[data-finder-note]').textContent()) ?? '').includes(
      'Clock.app'
    );
    await launch('Clock');
    result.conflictedAppStillOpens = await appears(win('clock'), 10_000);

    /* 同名的普通文件不受保护规则影响：可以移进废纸篓，之后下一次对账把真正的包补回来。 */
    await closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    const again = win('finder').last();
    await again.locator('[data-place="Applications"]').click();
    const conflicted = again.locator('.fitem[data-name="Clock.app"]');
    await conflicted.click({ button: 'right' });
    await page.locator('#layer-menu .pop .mi', { hasText: 'Move to Trash' }).click();
    result.sameNameFileIsNotProtected = await helpers.disappears(conflicted, 5_000);
    await page.waitForTimeout(600);
    const packagesBefore = await again.locator('.fitem').evaluateAll(nodes => nodes.map(node => node.dataset.name));
    await page.close();

    desktop = await session.openDesktopPage();
    ({ page, helpers } = desktop);
    await helpers.closeAll();
    await helpers.openTerminal();
    result.packageReturnsOnceTheNameIsFree = await helpers.runInShell(idOf('Clock'), /ID:clock/);
    await helpers.closeAll();
    await page.locator('#dock .di[data-app="finder"]').click();
    const last = helpers.win('finder').last();
    await last.locator('[data-place="Applications"]').click();
    try {
      await last.locator('.fitem[data-name$=".app"]').first().waitFor({ timeout: 8000 });
    } catch (error) {
      await page.screenshot({ path: 'tmp/ad/upgrade-debug.png' });
      console.error('DEBUG items', await last.locator('.fitem').evaluateAll(nodes => nodes.map(node => node.dataset.name)));
      console.error('DEBUG title', await last.locator('[data-title]').textContent());
      console.error('DEBUG note', await last.locator('[data-finder-note]').textContent().catch(() => null));
      throw error;
    }
    const packagesAfter = await last.locator('.fitem').evaluateAll(nodes => nodes.map(node => node.dataset.name));
    /* 重开后包的集合只多出 Clock.app，没有任何重复（对账幂等）。 */
    result.reloadDoesNotRewrite =
      new Set(packagesAfter).size === packagesAfter.length &&
      JSON.stringify([...packagesAfter].sort()) === JSON.stringify([...packagesBefore, 'Clock.app'].sort());

    return { applicationsUpgrade: result };
  }
};
