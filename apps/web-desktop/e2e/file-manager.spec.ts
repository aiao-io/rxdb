import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import type { DesktopState } from '../src/core/types.js';
import { openFiles } from './import-support.js';
import { readState } from './state.js';

async function create(files: FrameLocator, name: string, kind: 'file' | 'directory' = 'directory') {
  await files.getByRole('button', { name: kind === 'directory' ? '新建文件夹' : '新建文件', exact: true }).click();
  await files.getByLabel('新建名称').fill(name);
  await files.getByRole('button', { name: '创建', exact: true }).click();
  await expect(files.getByRole('button', { name: `打开 ${name}`, exact: true })).toBeVisible();
}

async function importText(files: FrameLocator, name: string, text: string) {
  await files.getByLabel('导入本机文件').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(files.getByRole('button', { name: `打开 ${name}`, exact: true })).toBeVisible();
}

async function enterDirectory(files: FrameLocator, name: string) {
  await files.getByRole('button', { name: `打开 ${name}`, exact: true }).dblclick();
  await expect(files.locator('.file-content')).toHaveAttribute('aria-label', name);
  await expect(files.getByRole('button', { name: '导入文件', exact: true })).toBeEnabled();
}

async function clearError(files: FrameLocator) {
  await files.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click();
  await expect(files.getByRole('alert')).toHaveCount(0);
  await expect(files.getByRole('button', { name: '导入文件', exact: true })).toBeEnabled();
}

async function move(page: Page, files: FrameLocator, target: string) {
  await files.getByRole('button', { name: '移动到', exact: true }).click();
  await page.getByLabel('目录', { exact: true }).selectOption({ label: target });
  await page.getByRole('button', { name: '确认', exact: true }).click();
}

async function storedKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('orbit-desktop', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction('state', 'readonly');
          const keys = tx.objectStore('state').getAllKeys();
          tx.oncomplete = () => {
            database.close();
            resolve(keys.result.map(String).sort());
          };
          tx.onabort = () => {
            database.close();
            reject(tx.error);
          };
        };
      })
  );
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-601/AC1/4 file-manager-keyboard-search：真实空态、目录内搜索和原生键盘选择可用`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    await expect(files.getByRole('heading', { name: '为你的想法留个位置', exact: true })).toBeVisible();
    await expect(files.getByRole('status')).toContainText('浏览器内桌面存储');
    await expect(files.locator('.app-sidebar')).toContainText('不等同于本机磁盘。');
    await create(files, '同名.txt', 'file');
    await create(files, '键盘目录');
    await files.getByRole('button', { name: '打开 键盘目录', exact: true }).focus();
    await files.getByRole('button', { name: '打开 键盘目录', exact: true }).press('Enter');
    await expect(files.locator('.file-content')).toHaveAttribute('aria-label', '键盘目录');
    await expect(files.getByRole('button', { name: '导入文件', exact: true })).toBeEnabled();
    await importText(files, '同名.txt', '子目录正文');
    await importText(files, '第二项.txt', '键盘选择');
    await importText(files, '第三项.txt', '第三项');
    await files.getByLabel('搜索当前目录').fill('同名');
    await expect(files.locator('tbody tr')).toHaveCount(1);
    await expect(files.getByRole('row').filter({ hasText: '同名.txt' })).toContainText(
      `${Buffer.byteLength('子目录正文')} B`
    );
    await files.getByLabel('搜索当前目录').fill('不存在');
    await expect(files.getByRole('heading', { name: '没有找到文件', exact: true })).toBeVisible();
    await expect(files.getByText('尝试其他名称，搜索仅限当前目录。', { exact: true })).toBeVisible();
    await files.getByLabel('搜索当前目录').fill('');
    await expect(files.locator('tbody tr')).toHaveCount(3);
    const rows = files.locator('tbody tr');
    await rows.nth(0).getByRole('button').focus();
    await rows.nth(0).getByRole('button').press('Tab');
    await expect(rows.nth(1).getByRole('button')).toBeFocused();
    await rows.nth(1).getByRole('button').press('Space');
    await expect(rows.nth(1)).toHaveAttribute('data-selected', 'true');
    await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
    await expect(files.locator('tbody tr')).toHaveCount(2);
    await expect(files.getByRole('button', { name: '打开 第二项.txt', exact: true })).toHaveCount(0);
    const state = await readState(page);
    const directory = state.files.find(file => file.name === '键盘目录')!;
    expect(state.files.filter(file => file.name === '同名.txt').map(file => file.parentId)).toEqual([
      null,
      directory.id
    ]);
  });

  test(`${mode} DESKTOP-US-601/AC3 file-manager-invalid-tree：非法名称与目录移入自身或后代均拒绝，原字节和树保持不变`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    await importText(files, '保留.txt', '不能被非法操作破坏的正文');
    const before = (await readState(page)).files;
    for (const name of ['../越界.txt', '反\\向.txt', '..', '   ']) {
      await files.getByRole('button', { name: '新建文件', exact: true }).click();
      await files.getByLabel('新建名称').fill(name);
      await files.getByRole('button', { name: '创建', exact: true }).click();
      await expect(files.getByRole('alert')).toContainText('INVALID');
      expect((await readState(page)).files).toEqual(before);
      await files.getByRole('button', { name: '取消', exact: true }).click();
      await clearError(files);
    }
    await create(files, '父目录');
    await enterDirectory(files, '父目录');
    await create(files, '子目录');
    await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 父目录', exact: true })).toBeVisible();
    const tree = (await readState(page)).files;
    for (const target of ['父目录', '子目录']) {
      await files.getByRole('button', { name: '打开 父目录', exact: true }).click();
      await move(page, files, target);
      await expect(files.getByRole('alert')).toContainText('INVALID');
      await expect(files.getByRole('alert')).toContainText('目录不能移入自身或子目录');
      expect((await readState(page)).files).toEqual(tree);
      await clearError(files);
    }
    await page.reload();
    await expect(files.getByRole('button', { name: '打开 保留.txt', exact: true })).toBeVisible();
    expect((await readState(page)).files).toEqual(tree);
  });

  test(`${mode} DESKTOP-US-601/AC2 file-manager-name-conflict：新建、重命名和移动重名都拒绝覆盖，显式改名后才移动`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    await importText(files, '源.txt', '源文件正文');
    await importText(files, '已有.txt', '已有正文');
    await create(files, '目标目录');
    await enterDirectory(files, '目标目录');
    await importText(files, '源.txt', '目标中的原文件');
    await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 已有.txt', exact: true })).toBeVisible();
    const before = (await readState(page)).files;
    await files.getByRole('button', { name: '新建文件', exact: true }).click();
    await files.getByLabel('新建名称').fill('已有.txt');
    await files.getByRole('button', { name: '创建', exact: true }).click();
    await expect(files.getByRole('alert')).toContainText('EXISTS');
    expect((await readState(page)).files).toEqual(before);
    await files.getByRole('button', { name: '取消', exact: true }).click();
    await clearError(files);
    await files.getByRole('button', { name: '打开 源.txt', exact: true }).click();
    await files.getByRole('button', { name: '重命名', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('已有.txt');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(files.getByRole('alert')).toContainText('EXISTS');
    expect((await readState(page)).files).toEqual(before);
    await clearError(files);
    await move(page, files, '目标目录');
    await expect(files.getByRole('alert')).toContainText('EXISTS');
    expect((await readState(page)).files).toEqual(before);
    await clearError(files);
    await files.getByRole('button', { name: '重命名', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('独立.txt');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 独立.txt', exact: true })).toBeVisible();
    await move(page, files, '目标目录');
    await expect(files.getByRole('button', { name: '打开 独立.txt', exact: true })).toHaveCount(0);
    await enterDirectory(files, '目标目录');
    await expect(files.locator('tbody tr')).toHaveCount(2);
    const after = (await readState(page)).files;
    expect(after).toHaveLength(4);
    const source = before.find(file => file.parentId === null && file.name === '源.txt')!;
    const directory = before.find(file => file.name === '目标目录')!;
    expect(after.find(file => file.id === source.id)).toMatchObject({
      name: '独立.txt',
      parentId: directory.id,
      bytes: source.bytes
    });
    for (const file of before.filter(file => file.id !== source.id))
      expect(after.find(value => value.id === file.id)).toEqual(file);
  });

  test(`${mode} DESKTOP-US-601/AC5 DESKTOP-US-401/AC1/3 file-manager-scope：授权说明可识别文件，单窗口授权不跨文件和运行实例`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    await importText(files, '允许.txt', '已授权文档');
    await importText(files, '其他.txt', '未经授权不能读取的正文');
    const before = (await readState(page)).files;
    const allowed = before.find(file => file.name === '允许.txt')!;
    const other = before.find(file => file.name === '其他.txt')!;
    await files.getByRole('button', { name: '打开 允许.txt', exact: true }).click();
    await files.getByRole('button', { name: '在新窗口打开', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('文本编辑器');
    await expect(dialog).toContainText('来源：http://127.0.0.1:4300');
    await expect(dialog).toContainText('能力：文件访问');
    await expect(dialog).toContainText('范围：文件「我的文件/允许.txt」');
    await expect(dialog).toContainText('仅本次允许只用于当前应用窗口的这次运行，退出或刷新后失效。');
    await expect(dialog).not.toContainText(allowed.id);
    await page.getByRole('button', { name: '仅本次允许', exact: true }).click();
    const originalId = await page.locator('[data-app-id="editor"]').getAttribute('data-instance-id');
    const originalWindow = page.locator(`[data-instance-id="${originalId}"]`);
    const originalEditor = originalWindow.locator('iframe').contentFrame();
    await expect(originalEditor.getByLabel('文档内容')).toHaveValue('已授权文档');
    expect((await readState(page)).grants.filter(grant => grant.appId === 'editor')).toMatchObject([
      { scope: allowed.id, instanceId: originalId }
    ]);
    for (const [index, file] of [other, allowed].entries()) {
      await page.getByRole('button', { name: '打开 文件', exact: true }).click();
      await files.getByRole('button', { name: `打开 ${file.name}`, exact: true }).click();
      await files.getByRole('button', { name: '在新窗口打开', exact: true }).click();
      await expect(dialog).toContainText(`范围：文件「我的文件/${file.name}」`);
      await page.getByRole('button', { name: '拒绝', exact: true }).click();
      await expect(page.locator('[data-app-id="editor"]')).toHaveCount(index + 2);
      const deniedId = await page
        .locator('[data-app-id="editor"]')
        .nth(index + 1)
        .getAttribute('data-instance-id');
      const denied = page.locator(`[data-instance-id="${deniedId}"]`).locator('iframe').contentFrame();
      await expect(denied.getByRole('alert')).toContainText('DENIED');
      await expect(denied.getByLabel('文档内容')).toHaveValue('');
      expect((await readState(page)).files).toEqual(before);
      expect((await readState(page)).grants.filter(grant => grant.appId === 'editor')).toMatchObject([
        { scope: allowed.id, instanceId: originalId }
      ]);
    }
    await page.getByRole('button', { name: '窗口概览', exact: true }).click();
    await page
      .locator('.overview-row')
      .filter({ has: page.getByText('允许.txt', { exact: true }) })
      .getByRole('button')
      .first()
      .click();
    await originalEditor.getByLabel('文档内容').fill('允许实例仍可保存');
    await expect(originalWindow).toHaveAttribute('aria-label', /未保存/);
    await originalEditor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(originalEditor.getByRole('status')).toContainText('已保存');
    expect((await readState(page)).files.find(file => file.id === other.id)).toEqual(other);
    expect((await readState(page)).files.find(file => file.id === allowed.id)).toMatchObject({
      bytes: Buffer.from('允许实例仍可保存').toString('base64'),
      revision: allowed.revision + 1
    });
  });

  for (const { operation, failure } of [
    { operation: 'create', failure: 'quota' },
    { operation: 'create', failure: 'abort' },
    { operation: 'move', failure: 'quota' },
    { operation: 'move', failure: 'abort' }
  ] as const) {
    test(`${mode} DESKTOP-US-601/AC6 file-manager-${operation}-${failure}：写入失败保持完整旧数据和物理键，刷新后重试成功`, async ({
      page
    }) => {
      const files = await openFiles(page, mode);
      await importText(files, '保留.txt', '写入失败不能破坏的字节 🌏');
      await create(files, '目标目录');
      const before = (await readState(page)).files;
      const directory = before.find(file => file.name === '目标目录')!;
      const original = before.find(file => file.name === '保留.txt')!;
      const keys = await storedKeys(page);
      await page.evaluate(
        ({ operation, failure, targetId, fileId }) => {
          const put = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
            const data = (value as { data?: DesktopState } | null)?.data;
            const changing =
              operation === 'create' ?
                data?.files.some(file => file.name === '待提交.txt')
              : data?.files.some(file => file.id === fileId && file.parentId === targetId);
            if (this.name === 'state' && key === 'desktop' && changing && failure === 'quota')
              throw new DOMException('模拟文件管理写入额度不足', 'QuotaExceededError');
            const request = put.call(this, value, key);
            if (this.name === 'state' && key === 'desktop' && changing && failure === 'abort')
              request.addEventListener('success', () => this.transaction.abort(), { once: true });
            return request;
          };
        },
        { operation, failure, targetId: directory.id, fileId: original.id }
      );
      if (operation === 'create') {
        await files.getByRole('button', { name: '新建文件', exact: true }).click();
        await files.getByLabel('新建名称').fill('待提交.txt');
        await files.getByRole('button', { name: '创建', exact: true }).click();
      } else {
        await files.getByRole('button', { name: '打开 保留.txt', exact: true }).click();
        await move(page, files, '目标目录');
      }
      await expect(files.getByRole('alert')).toContainText(failure === 'quota' ? 'QUOTA' : 'STORAGE');
      expect((await readState(page)).files).toEqual(before);
      expect(await storedKeys(page)).toEqual(keys);
      await page.reload();
      await expect(files.getByRole('button', { name: '打开 保留.txt', exact: true })).toBeVisible();
      expect((await readState(page)).files).toEqual(before);
      expect(await storedKeys(page)).toEqual(keys);
      if (operation === 'create') {
        await create(files, '待提交.txt', 'file');
        expect((await readState(page)).files).toHaveLength(3);
      } else {
        await files.getByRole('button', { name: '打开 保留.txt', exact: true }).click();
        await move(page, files, '目标目录');
        await expect(files.getByRole('button', { name: '打开 保留.txt', exact: true })).toHaveCount(0);
        const saved = (await readState(page)).files;
        expect(saved).toHaveLength(2);
        expect(saved.find(file => file.id === original.id)).toMatchObject({
          parentId: directory.id,
          bytes: original.bytes
        });
      }
    });
  }
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-601/AC4 file-manager-import-search：导入期间更改搜索，晚到完成只刷新当前位置`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    await files.locator('main').evaluate(() => {
      const control = window as Window & { releaseImportRead?: () => void; importReadStarted?: boolean };
      let release: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      control.releaseImportRead = () => release();
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        const result = read.call(this);
        if (this.name !== '目标.txt') return result;
        control.importReadStarted = true;
        return Promise.all([result, gate]).then(([bytes]) => bytes);
      };
    });
    await files.getByLabel('导入本机文件').setInputFiles([
      { name: '目标.txt', mimeType: 'text/plain', buffer: Buffer.from('匹配内容') },
      { name: '其他.txt', mimeType: 'text/plain', buffer: Buffer.from('其他内容') }
    ]);
    await expect
      .poll(() => files.locator('main').evaluate(() => (window as Window & { importReadStarted?: boolean }).importReadStarted))
      .toBe(true);
    await files.getByLabel('搜索当前目录').fill('目标');
    await expect(files.getByLabel('搜索当前目录')).toHaveValue('目标');
    await files.locator('main').evaluate(() => (window as Window & { releaseImportRead?: () => void }).releaseImportRead?.());
    await expect(files.getByRole('status')).toContainText('已处理 2 个文件');
    await expect(files.getByRole('button', { name: '打开 目标.txt', exact: true })).toBeVisible();
    await expect(files.getByRole('button', { name: '打开 其他.txt', exact: true })).toHaveCount(0);
    await files.getByLabel('搜索当前目录').fill('');
    await expect(files.locator('tbody tr')).toHaveCount(2);
    const stored = (await readState(page)).files;
    expect(stored.map(file => [file.name, file.bytes]).sort()).toEqual(
      [
        ['目标.txt', Buffer.from('匹配内容').toString('base64')],
        ['其他.txt', Buffer.from('其他内容').toString('base64')]
      ].sort()
    );
  });
}
