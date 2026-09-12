import { expect, relaunchDemoPage, test } from './fixtures';

/** 每条用例用独立标题，避免 `demoPage` fixture 重进页面时读到上一条的残留。 */
const uniqueTitle = (label: string): string => `${label}-${Date.now().toString(36)}`;

/**
 * 通过真实 UI 走一遍 Todo 的增删改查。
 *
 * 与适配器单测的分工：单测验 SQL 与 VFS，这里验**整条链路**——
 * Taro 渲染 → 小程序事件 → RxDB Repository → wa-sqlite → wx.getFileSystemManager 落盘 →
 * 响应式查询推回 UI。任何一环断掉，这里都会红。
 */
test.describe('Todo CRUD', () => {
  test('新增的 Todo 出现在列表里', async ({ demoPage }) => {
    const title = uniqueTitle('新增');
    const before = await demoPage.todoTitles();

    await demoPage.addTodo(title);

    const after = await demoPage.todoTitles();
    expect(after).toContain(title);
    expect(after).toHaveLength(before.length + 1);
  });

  test('勾选后条目保持在列表里，不会被过滤掉', async ({ demoPage }) => {
    const title = uniqueTitle('勾选');
    await demoPage.addTodo(title);
    const index = (await demoPage.todoTitles()).indexOf(title);
    expect(index).toBeGreaterThanOrEqual(0);

    await demoPage.toggleTodoAt(index);

    expect(await demoPage.todoTitles()).toContain(title);
  });

  test('删除后条目从列表里消失', async ({ demoPage }) => {
    const title = uniqueTitle('删除');
    await demoPage.addTodo(title);
    const index = (await demoPage.todoTitles()).indexOf(title);
    expect(index).toBeGreaterThanOrEqual(0);

    await demoPage.removeTodoAt(index);

    expect(await demoPage.todoTitles()).not.toContain(title);
  });

  test('新增的 Todo 在重进页面后仍然存在', async ({ demoPage, miniProgram }) => {
    const title = uniqueTitle('重进');
    await demoPage.addTodo(title);

    // 重进页面会走完整的 dispose → openMiniProgramRxdbDemo，读的是落盘后的库
    const reopened = await relaunchDemoPage(miniProgram);

    expect(await reopened.todoTitles()).toContain(title);
  });
});
