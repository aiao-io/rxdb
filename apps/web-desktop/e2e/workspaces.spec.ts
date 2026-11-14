import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { readState as snapshot } from './state.js';

async function enter(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
}

async function settings(page: Page) {
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const frame = page.frameLocator('iframe[title="设置"]');
  await frame.getByRole('button', { name: '▤ 工作区', exact: true }).click();
  return frame;
}

async function createWorkspace(frame: FrameLocator, name: string) {
  await frame.getByLabel('新工作区名称').fill(name);
  await frame.getByRole('button', { name: '创建工作区', exact: true }).click();
  await expect(frame.locator('.workspace-setting').filter({ hasText: name })).toBeVisible();
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-107/AC1：工作区命名排序不重载草稿，刷新恢复名称、顺序和设置位置`, async ({ page }) => {
    await enter(page, mode);
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    const editorWindow = page.locator('[data-app-id="editor"]');
    const id = await editorWindow.getAttribute('data-instance-id');
    const editor = editorWindow.locator('iframe').contentFrame();
    await editor.getByLabel('文件名', { exact: true }).fill('排序笔记.txt');
    await editor.getByLabel('文档内容').fill('排序期间的草稿');
    const frame = await settings(page);
    await expect(frame.getByRole('button', { name: '删除并迁移窗口', exact: true })).toBeDisabled();
    await expect(frame.getByText(/至少保留一个工作区/)).toBeVisible();
    await createWorkspace(frame, '写作');
    await createWorkspace(frame, '参考');
    await frame
      .locator('.workspace-setting')
      .filter({ hasText: '参考' })
      .getByRole('button', { name: '重命名', exact: true })
      .click();
    await page.getByLabel('名称', { exact: true }).fill('资料');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await frame.getByRole('button', { name: '前移工作区 资料', exact: true }).click();
    await expect(frame.getByRole('button', { name: '前移工作区 资料', exact: true })).toBeEnabled();
    await frame.getByRole('button', { name: '前移工作区 资料', exact: true }).click();
    await expect(frame.getByRole('button', { name: '前移工作区 资料', exact: true })).toBeDisabled();
    await frame.getByRole('button', { name: '后移工作区 资料', exact: true }).click();
    await frame.getByRole('button', { name: '前移工作区 资料', exact: true }).click();
    await expect(page.locator('.workspace-switcher button')).toHaveText(['资料', '工作区 1', '写作']);
    await expect(frame.getByRole('button', { name: '后移工作区 写作', exact: true })).toBeDisabled();
    await expect(editorWindow).toHaveAttribute('data-instance-id', id!);
    await expect(editor.getByLabel('文档内容')).toHaveValue('排序期间的草稿');
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(editor.getByRole('status')).toContainText('已保存');
    await page.getByRole('button', { name: '打开 设置', exact: true }).click();
    await expect
      .poll(async () => (await snapshot(page)).workspaces.map(workspace => workspace.name))
      .toEqual(['资料', '工作区 1', '写作']);
    await page.reload();
    await expect(page.locator('.workspace-switcher button')).toHaveText(['资料', '工作区 1', '写作']);
    await expect(frame.locator('.workspace-setting strong')).toHaveText(['资料', '工作区 1', '写作']);
    await expect(editor.getByLabel('文档内容')).toHaveValue('排序期间的草稿');
  });

  test(`${mode} DESKTOP-US-107/AC2/3/4/5/6：跨区定位复用单实例，取消删除不迁移，确认保留最小化和脏内容`, async ({
    page
  }) => {
    await enter(page, mode);
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    const editorWindow = page.locator('[data-app-id="editor"]');
    const editor = editorWindow.locator('iframe').contentFrame();
    await editor.getByLabel('文件名', { exact: true }).fill('迁移草稿.txt');
    await editor.getByLabel('文档内容').fill('工作区迁移不能丢失');
    const editorId = await editorWindow.getAttribute('data-instance-id');
    await editorWindow.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
    const frame = await settings(page);
    const settingsId = await page.locator('[data-app-id="settings"]').getAttribute('data-instance-id');
    await createWorkspace(frame, '写作');
    const writingId = (await snapshot(page)).workspaces.find(workspace => workspace.name === '写作')!.id;
    await page.getByRole('button', { name: '窗口概览', exact: true }).click();
    await page.getByRole('combobox', { name: /^移动 迁移草稿\.txt.*到工作区$/ }).selectOption(writingId);
    await page.getByLabel('移动 设置 到工作区', { exact: true }).selectOption(writingId);
    await page.getByRole('button', { name: '关闭窗口概览', exact: true }).click();
    await expect(page.locator('[data-app-id="settings"]')).toBeHidden();
    await page.getByRole('button', { name: '打开 设置', exact: true }).click();
    await expect(
      page.locator('.workspace-switcher').getByRole('button', { name: '写作', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-app-id="settings"]')).toHaveAttribute('data-instance-id', settingsId!);
    await expect(page.locator('[data-app-id="settings"]')).toHaveCount(1);
    const writing = frame.locator('.workspace-setting').filter({ hasText: '写作' });
    await writing.getByRole('button', { name: '删除并迁移窗口', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(writing).toBeVisible();
    await expect
      .poll(async () => (await snapshot(page)).session.find(win => win.appId === 'editor')?.workspaceId)
      .toBe(writingId);
    await writing.getByRole('button', { name: '删除并迁移窗口', exact: true }).click();
    await page.getByLabel('迁移到', { exact: true }).selectOption('first');
    await page.getByRole('button', { name: '确认', exact: true }).click();
    await expect(writing).toHaveCount(0);
    await expect
      .poll(async () => (await snapshot(page)).session.find(win => win.appId === 'editor'))
      .toMatchObject({ workspaceId: 'first', state: 'minimized' });
    await expect(editorWindow).toBeHidden();
    await expect(frame.getByRole('button', { name: '删除并迁移窗口', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    await expect(editorWindow).toHaveAttribute('data-instance-id', editorId!);
    await expect(editor.getByLabel('文档内容')).toHaveValue('工作区迁移不能丢失');
    await expect(editorWindow.getByLabel('未保存', { exact: true })).toBeVisible();
    await expect(page.locator('.workspace-switcher button')).toHaveText(['工作区 1']);
  });
}
