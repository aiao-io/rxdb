import { expect, test, type Page } from '@playwright/test';
import { readState } from './state.js';

async function savedEditor(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const id = await page.locator('[data-app-id="editor"]').first().getAttribute('data-instance-id');
  const window = page.locator(`[data-instance-id="${id}"]`);
  const editor = window.locator('iframe').contentFrame();
  await editor.getByLabel('文件名', { exact: true }).fill('原稿.txt');
  await editor.getByLabel('文档内容').fill('原始正文');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  return { window, editor, original: (await readState(page)).files[0] };
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-602/AC6 editor-history-save-as：撤销重做只改变当前实例，另存为生成独立文件且刷新保留原稿`, async ({
    page
  }) => {
    const { window, editor, original } = await savedEditor(page, mode);
    await editor.getByLabel('文档内容').fill('第一段草稿');
    await editor.getByLabel('文档内容').fill('第二段草稿 🌏');
    await expect(window).toHaveAttribute('aria-label', /未保存/);
    await window.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
    await page.getByRole('button', { name: '打开 文件', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const files = page.frameLocator('iframe[title="文件"]');
    await files.getByRole('button', { name: '打开 原稿.txt', exact: true }).click();
    await files.getByRole('button', { name: '在新窗口打开', exact: true }).click();
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(2);
    const secondId = await page.locator('[data-app-id="editor"]').nth(1).getAttribute('data-instance-id');
    const second = page.locator(`[data-instance-id="${secondId}"]`).locator('iframe').contentFrame();
    await expect(second.getByLabel('文档内容')).toHaveValue('原始正文');
    await expect(second.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '窗口概览', exact: true }).click();
    await page
      .locator('.overview-row')
      .filter({ has: page.getByText('原稿.txt · 未保存', { exact: true }) })
      .getByRole('button')
      .first()
      .click();
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue('第一段草稿');
    await expect(second.getByLabel('文档内容')).toHaveValue('原始正文');
    await editor.getByRole('button', { name: '重做', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue('第二段草稿 🌏');
    await expect(second.getByLabel('文档内容')).toHaveValue('原始正文');
    await editor.getByRole('button', { name: '另存为', exact: true }).click();
    await page.getByLabel('保存文件名', { exact: true }).fill('独立副本.md');
    await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
    await expect(editor.getByLabel('文件名', { exact: true })).toHaveValue('独立副本.md');
    await expect(window).not.toHaveAttribute('aria-label', /未保存/);
    const saved = (await readState(page)).files;
    expect(saved).toHaveLength(2);
    expect(saved.find(file => file.id === original.id)).toEqual(original);
    const copy = saved.find(file => file.name === '独立副本.md')!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.mime).toBe('text/markdown');
    expect(Buffer.from(copy.bytes, 'base64').toString('utf8')).toBe('第二段草稿 🌏');
    await expect.poll(async () => (await readState(page)).session.map(win => win.fileId)).toContain(copy.id);
    const session = (await readState(page)).session
      .filter(win => win.appId === 'editor')
      .map(win => ({ id: win.id, fileId: win.fileId }))
      .sort((a, b) => a.id.localeCompare(b.id));
    await page.reload();
    const reopenedCopy = page
      .getByRole('region', { name: '独立副本.md 窗口', exact: true })
      .locator('iframe')
      .contentFrame();
    const reopenedOriginal = page
      .getByRole('region', { name: '原稿.txt 窗口', exact: true })
      .locator('iframe')
      .contentFrame();
    await expect(reopenedCopy.getByLabel('文档内容')).toHaveValue('第二段草稿 🌏');
    await expect(reopenedOriginal.getByLabel('文档内容')).toHaveValue('原始正文');
    expect((await readState(page)).files).toEqual(saved);
    expect(
      (await readState(page)).session
        .filter(win => win.appId === 'editor')
        .map(win => ({ id: win.id, fileId: win.fileId }))
        .sort((a, b) => a.id.localeCompare(b.id))
    ).toEqual(session);
  });

  test(`${mode} DESKTOP-US-602/AC5 editor-save-quota：保存失败保持脏稿与旧版本，取消关闭后重试成功才提交`, async ({
    page
  }) => {
    const { window, editor, original } = await savedEditor(page, mode);
    const draft = '额度不足也不能丢失的中文草稿 🌏';
    await editor.getByLabel('文档内容').fill(draft);
    await expect(window).toHaveAttribute('aria-label', /未保存/);
    await page.evaluate(
      ({ id, bytes }) => {
        const put = IDBObjectStore.prototype.put;
        let refused = false;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          if (!refused && this.name === 'state' && key === `file:${id}` && value === bytes) {
            refused = true;
            throw new DOMException('模拟文档保存额度不足', 'QuotaExceededError');
          }
          return put.call(this, value, key);
        };
      },
      { id: original.id, bytes: Buffer.from(draft).toString('base64') }
    );
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('QUOTA');
    await expect(editor.getByLabel('文档内容')).toHaveValue(draft);
    await expect(window).toHaveAttribute('aria-label', /未保存/);
    expect((await readState(page)).files).toEqual([original]);
    await window.getByRole('button', { name: '关闭窗口 文本编辑器', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('未保存');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(editor.getByLabel('文档内容')).toHaveValue(draft);
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await expect(window).not.toHaveAttribute('aria-label', /未保存/);
    const committed = (await readState(page)).files;
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ id: original.id, revision: original.revision + 1 });
    expect(Buffer.from(committed[0].bytes, 'base64').toString('utf8')).toBe(draft);
    await page.reload();
    await expect(page.frameLocator('iframe[title="文本编辑器"]').getByLabel('文档内容')).toHaveValue(draft);
    expect((await readState(page)).files).toEqual(committed);
  });

  test(`${mode} DESKTOP-US-601/AC2 DESKTOP-US-602/AC3 editor-rename-move：取消保持原稿，重命名和跨目录移动后按原 ID 恢复并继续保存`, async ({
    page
  }) => {
    const { window, original } = await savedEditor(page, mode);
    await window.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
    await page.getByRole('button', { name: '打开 文件', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    const files = page.frameLocator('iframe[title="文件"]');
    await files.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await files.getByLabel('新建名称').fill('归档');
    await files.getByRole('button', { name: '创建', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 归档', exact: true })).toBeVisible();
    const before = (await readState(page)).files;
    await files.getByRole('button', { name: '打开 原稿.txt', exact: true }).click();
    await files.getByRole('button', { name: '重命名', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('取消的名称.txt');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await readState(page)).files).toEqual(before);
    await files.getByRole('button', { name: '重命名', exact: true }).click();
    await page.getByLabel('名称', { exact: true }).fill('改名后的笔记.txt');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 改名后的笔记.txt', exact: true })).toBeVisible();
    const renamed = (await readState(page)).files;
    await files.getByRole('button', { name: '移动到', exact: true }).click();
    await page.getByLabel('目录', { exact: true }).selectOption({ label: '归档' });
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect((await readState(page)).files).toEqual(renamed);
    await files.getByRole('button', { name: '移动到', exact: true }).click();
    await page.getByLabel('目录', { exact: true }).selectOption({ label: '归档' });
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 改名后的笔记.txt', exact: true })).toHaveCount(0);
    await files.getByRole('button', { name: '打开 归档', exact: true }).dblclick();
    await expect(files.getByRole('button', { name: '打开 改名后的笔记.txt', exact: true })).toBeVisible();
    const moved = await readState(page);
    const directory = moved.files.find(file => file.name === '归档')!;
    const document = moved.files.find(file => file.id === original.id)!;
    expect(moved.files).toHaveLength(2);
    expect(document).toMatchObject({ name: '改名后的笔记.txt', parentId: directory.id, bytes: original.bytes });
    const windowId = moved.session.find(win => win.fileId === original.id)!.id;
    await expect
      .poll(async () => (await readState(page)).session.find(win => win.appId === 'files')?.route)
      .toBe(`/folders/${encodeURIComponent(directory.id)}`);
    await page.reload();
    await expect(files.getByRole('button', { name: '打开 改名后的笔记.txt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(1);
    const editor = page.frameLocator('iframe[title="文本编辑器"]');
    await expect(editor.getByLabel('文件名', { exact: true })).toHaveValue('改名后的笔记.txt');
    await expect(editor.getByLabel('文档内容')).toHaveValue('原始正文');
    expect((await readState(page)).session.find(win => win.fileId === original.id)!.id).toBe(windowId);
    await editor.getByLabel('文档内容').fill('改名和移动后继续保存');
    await expect(page.getByRole('region', { name: '改名后的笔记.txt · 未保存 窗口', exact: true })).toBeVisible();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('region', { name: '改名后的笔记.txt 窗口', exact: true })).toBeVisible();
    const committed = (await readState(page)).files;
    expect(committed).toHaveLength(2);
    expect(committed.find(file => file.id === original.id)).toMatchObject({
      parentId: directory.id,
      revision: document.revision + 1,
      bytes: Buffer.from('改名和移动后继续保存').toString('base64')
    });
  });
}
