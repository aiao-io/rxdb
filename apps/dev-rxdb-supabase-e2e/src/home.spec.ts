import { test as base, expect } from '@playwright/test';

function uniqueTitle(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 这些用例断的是绝对数量（`data-loaded-count === '100'`、删除后 `toHaveCount(0)`），
 * 只有在应用完全不连远端时才成立。这条自动 fixture 守住那个前提：
 *
 * - 指向 baseURL 之外的 http(s) 请求 = 应用连上了 Supabase（或别的远端）。
 * - `/@vite/` 请求 = 拿到的是 dev server 而不是构建产物，而 dev server 会把工作区
 *   `.env` 的 `VITE_SUPABASE_*` 注进 `import.meta.env`（正是本套件此前 flaky 的原因）。
 *
 * `expect` 在 request 回调里抛不出来，所以先收集违规、用例结束后再断言。
 * 指向已部署环境（`BASE_URL`）时不适用：远端配置由部署方决定。
 */
const test = base.extend<{ localOnly: void }>({
  localOnly: [
    async ({ page, baseURL }, use) => {
      if (process.env['BASE_URL'] || !baseURL) {
        await use();
        return;
      }
      const violations: string[] = [];
      page.on('request', request => {
        const url = request.url();
        if (!/^https?:\/\//u.test(url)) return;
        if (!url.startsWith(baseURL)) violations.push(`foreign request: ${url}`);
        else if (url.includes('/@vite/')) violations.push(`dev server, not the build: ${url}`);
      });
      // P2-4：`page.on('request')` **收不到 WebSocket 握手**（那要 `page.on('websocket')`），
      // 而 `ws:` / `wss:` 也不匹配上面的 `^https?://`。
      // Supabase Realtime 走的正是 WebSocket —— 一旦有人给这个 demo 接上 realtime 订阅，
      // 这条 local-only 守卫会毫无反应地放行。补上这一路。
      page.on('websocket', ws => {
        const url = ws.url();
        if (!url.startsWith(baseURL.replace(/^http/u, 'ws'))) violations.push(`foreign websocket: ${url}`);
      });
      await use();
      expect(violations, 'app must run fully local').toEqual([]);
    },
    { auto: true }
  ]
});

test.describe('Supabase local-first app', () => {
  /**
   * P2-5：原实现只断 `app-home` 可见 —— 组件挂上就绿，**bootstrap 之后的任何事都没被验证**。
   *
   * 必须写明这条的可断言余地有多小：`home.page.html` 的全部内容就是一个字 `home`，
   * 页面上没有别的稳定文案可用。所以这里补的是**另外两件同样重要、且真的能断的事**：
   * 路由确实停在 /home（没被 `**` 兜底重定向走），以及 RxDB 连接没把整页顶掉。
   */
  test('renders the home route', async ({ page }) => {
    await page.goto('/home');

    await expect(page.locator('app-home')).toBeVisible();
    await expect(page).toHaveURL(/\/home$/u);
    await expect(page.locator('app-home')).toContainText('home');
    // Angular 的未捕获错误会把 <app-root> 清空；这里确认应用外壳仍在
    await expect(page.locator('app-root')).toBeVisible();
  });

  test('supports local Todo CRUD without Supabase configuration', async ({ page }) => {
    const title = uniqueTitle('local-crud');
    const editedTitle = `${title}-edited`;

    await page.goto('/todo');
    // P2-3：原先是 `getByRole('heading', { name: 'Todos' }).first()` —— 页面上有两个同名标题
    // （sticky h2 与主 h1），`.first()` 依赖的是 DOM 顺序这种实现细节。改用页面自己声明的 testid。
    await expect(page.getByTestId('todo-title')).toBeVisible();

    await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
    await page.getByRole('button', { name: '添加', exact: true }).click();

    // 原先是 `cdk-virtual-scroll-viewport li` —— 把 CDK 的实现细节当选择器。
    const item = page.getByTestId('todo-item').filter({ hasText: title });
    await expect(item).toBeVisible();

    const checkbox = item.getByRole('checkbox');
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    await item.getByRole('button', { name: '编辑' }).click();
    // 原先是页面级的 `input.todo-input`（按 CSS 类、不限定行）。
    //
    // 注意**不能**改成 `item.getByTestId(...)`：进入编辑态后标题从文本变成 input 的 value，
    // 而 `filter({ hasText })` 匹配的是文本内容 —— `item` 会立刻不再命中该行。
    // 页面同时只允许一行处于编辑态（`#editingTodoId` 是单值 signal），
    // 所以这里用页面级定位，但**把那个不变量显式断言出来**，而不是默默依赖它。
    const editInput = page.getByTestId('todo-edit-input');
    await expect(editInput).toHaveCount(1);
    await editInput.fill(editedTitle);
    await page.getByRole('button', { name: '保存' }).click();

    const editedItem = page.getByTestId('todo-item').filter({ hasText: editedTitle });
    await expect(editedItem).toBeVisible();
    await editedItem.getByRole('button', { name: '删除' }).click();
    await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);
  });

  test('runs on wa-sqlite and keeps local data across reload', async ({ page }) => {
    const title = uniqueTitle('wa-sqlite-persistence');

    await page.goto('/todo');
    await expect(page.locator('html')).toHaveAttribute('data-rxdb-local-adapter', 'wa-sqlite');

    await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.getByTestId('todo-item').filter({ hasText: title })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-rxdb-local-adapter', 'wa-sqlite');
    await expect(page.getByTestId('todo-item').filter({ hasText: title })).toBeVisible();
  });

  test('loads the next cursor page when the viewport reaches the bottom', async ({ page }) => {
    const oldestTitle = uniqueTitle('cursor-load-more');

    await page.goto('/todo-cursor');
    await page.getByRole('textbox', { name: 'What needs to be done?' }).fill(oldestTitle);
    await page.getByRole('button', { name: 'Add Todo' }).click();
    await expect(page.getByText(oldestTitle, { exact: true })).toBeVisible();

    const addBatchButton = page.getByRole('button', { name: 'add 100', exact: true });
    await addBatchButton.click();
    await expect(addBatchButton).toBeEnabled({ timeout: 30_000 });

    const viewport = page.getByTestId('todo-cursor-viewport');

    // P2-2：页大小从页面自己声明的 `data-page-size` 读，不再抄一个魔数 `'100'`。
    // 原先那个 100 来自 `InfiniteScrollingList` 内部的 `inputOptions.limit ?? 100` ——
    // **断的是库的默认值**，库改默认这个 demo 的测试就会因为无关的事变红。
    const pageSize = Number(await viewport.getAttribute('data-page-size'));
    expect(pageSize).toBeGreaterThan(0);
    await expect(viewport).toHaveAttribute('data-loaded-count', String(pageSize));

    // P2-1：这里原先是 `expect(page.getByText(oldestTitle)).toHaveCount(0)`。
    // 列表是 `*cdkVirtualFor`，**视窗外的行根本不渲染** ——
    // count 为 0 既可能是"它不在已加载的这一页"，也可能只是"它在页内但滚出了视窗"。
    // 两种情况都为 0，这条断言区分不了任何东西，是空断言。
    //
    // 真正要证明的是"最早那条落在第一页之外"，而它的**可证形式是正向的**：
    // 滚到底触发下一页加载后，它应该出现在已加载集合里。
    await viewport.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
    await expect
      .poll(async () => Number(await viewport.getAttribute('data-loaded-count')), { timeout: 15_000 })
      .toBeGreaterThan(pageSize);

    // 加载了第二页之后，最早那条必须真的在数据里 —— 用 `data-loaded-count` 之外的
    // 独立证据交叉验证游标翻页确实往回取到了它。
    await viewport.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
    await expect(page.getByText(oldestTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
