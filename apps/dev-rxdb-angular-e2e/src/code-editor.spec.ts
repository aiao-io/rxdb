import { expect, test } from '@playwright/test';

test.describe('Code Editor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/code-editor');
    await expect(page.getByTestId('code-editor')).toBeVisible();
  });

  /**
   * P1-2：原用例是 `expect(page.locator('app-code-editor')).toBeVisible()` ——
   * **与 beforeEach 里那一行逐字相同**，等于把前置条件又断言了一遍。
   * 而全文件此前**没有任何编辑器就绪断言**：CodeMirror 挂载失败时，
   * `<app-code-editor>` 这个宿主元素照样可见，用例照样绿。
   *
   * 改为断言编辑器真的起来了：CodeMirror 6 会在宿主里渲染 `.cm-editor` /
   * `.cm-content`，并且这里传的是 `language="sql"` 的初始内容。
   */
  test('CodeMirror 编辑器挂载并渲染出初始内容', async ({ page }) => {
    const content = page.getByTestId('code-editor').getByRole('textbox');
    await expect(content).toBeVisible();
    await expect(content).toContainText('CREATE TABLE');
  });

  /**
   * CEA-002：语法高亮整体消失 —— 文本能编辑、行号还在，只是全成一个颜色。
   * 上面那条用例全程是绿的：`.cm-content` 照样可见、照样非空，
   * 少的是**装饰**（token `<span>`），不是内容。
   *
   * 根因在依赖解析而非组件：`@codemirror/language` 被装了一份自己的嵌套
   * `@codemirror/view`，页面里于是同时存在两份 view。`syntaxHighlighting()` 返回的
   * `treeHighlighter` 是 A 份的 `ViewPlugin`，注册进 A 份的 `viewPlugin` facet；
   * 组件 new 出来的 `EditorView` 是 B 份，只读 B 份的 facet —— 插件永远不被实例化，
   * 装饰集为空，控制台**一声不吭**。
   *
   * 三端 spec 里的单元测试守的是 node_modules 布局；这条守的是**打包产物**：
   * Vite optimizeDeps 会把嵌套副本内联进 `@codemirror/language` 的 chunk，
   * 那是单元测试看不到的一层。
   */
  test('SQL 关键字渲染出带颜色的高亮 token', async ({ page }) => {
    const tokens = page.getByTestId('code-editor').getByRole('textbox').locator('span[class]');
    await expect(tokens.first()).toBeVisible({ timeout: 15000 });

    // 光有 span 还不够：得确认它们真的被染成了不同的颜色，
    // 否则一份「全部 token 都是 currentColor」的样式回归照样能骗过 count 断言。
    const colors = await tokens.evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).color))]);
    expect(colors.length).toBeGreaterThan(1);

    await expect(tokens.filter({ hasText: /^CREATE$/ })).toHaveCount(1);
  });
});
