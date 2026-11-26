import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { switchIdentity } from './support/identity';
import { openSidePanel, pull, push, syncRound } from './support/workbench';

const isRemoteE2E = process.env['REMOTE_E2E'] === 'true';

function uniqueTitle(): string {
  return `remote-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface MutationTableOps {
  data?: Record<string, unknown>[];
}

interface MutationRequestBody {
  p_upserts?: MutationTableOps[];
  p_updates?: MutationTableOps[];
}

/** 取请求体某个写数组里所有实体行 */
function rowsOf(ops: MutationTableOps[] | undefined): Record<string, unknown>[] {
  return (ops ?? []).flatMap(op => op.data ?? []);
}

/**
 * 打开 Todo 页并匿名登录，等到能拉取：本地库已经按匿名会话的身份打开
 *
 * @param url - 手动新建的浏览器上下文不继承配置里的 `baseURL`，要传绝对地址
 *
 * @remarks
 * 没有会话时应用是访客（epic-015：公开数据给 anon，不靠匿名账号），访客的 Todo 只存本地。
 * Todo 的日志同步只对登录身份开放，所以先点页面上的「匿名登录」：登录之后页面重新加载，打开匿名用户自己的库。
 */
async function openTodoPage(target: Page, url = '/todo'): Promise<void> {
  await target.goto(url, { timeout: 60_000, waitUntil: 'domcontentloaded' });
  await target.getByTestId('todo-visitor-notice').getByRole('button', { name: '匿名登录' }).click({ timeout: 60_000 });
  await expect(target.getByTestId('identity-title')).toHaveText('匿名用户', { timeout: 60_000 });
  await expect(target.getByTestId('sync-pull')).toBeEnabled({ timeout: 60_000 });
}

/**
 * 这个浏览器上下文按会话身份应当打开的库名（US-035）
 *
 * @remarks
 * 在测试进程里独立算一遍：会话里的用户 id + 项目 URL 的 origin，取 SHA-256 的前 16 位，
 * 与 `getRxDBIdentityDatabaseName('dev-rxdb-supabase', identity)` 同一口径。
 */
async function expectedDatabaseName(target: Page): Promise<string> {
  const userId = await target.evaluate(() => {
    const key = Object.keys(localStorage).find(name => /^sb-.+-auth-token$/.test(name));
    const stored = key === undefined ? null : localStorage.getItem(key);
    if (stored === null) return null;
    return (JSON.parse(stored) as { user?: { id?: string } }).user?.id ?? null;
  });
  expect(userId).toBeTruthy();
  const projectUrl = process.env['VITE_SUPABASE_URL'];
  if (!projectUrl) throw new Error('VITE_SUPABASE_URL is required to compute the expected database name');
  const scope = new URL(projectUrl).origin;
  const key = createHash('sha256')
    .update(JSON.stringify(['rxdb-identity', 1, scope, userId]))
    .digest('hex');
  return `dev-rxdb-supabase-${key.slice(0, 16)}`;
}

/** 这个浏览器上下文的本地存储里出现过的名字：OPFS 的全部条目与 IndexedDB 的库名 */
function storedNames(target: Page): Promise<string[]> {
  return target.evaluate(async () => {
    type Entry = { kind: 'file' | 'directory' };
    type Directory = Entry & { entries(): AsyncIterable<[string, Entry]> };
    const names: string[] = [];
    const walk = async (directory: Directory, prefix: string): Promise<void> => {
      for await (const [name, handle] of directory.entries()) {
        names.push(`${prefix}${name}`);
        if (handle.kind === 'directory') await walk(handle as Directory, `${prefix}${name}/`);
      }
    };
    await walk((await navigator.storage.getDirectory()) as unknown as Directory, '');
    const databases = await indexedDB.databases();
    return [...names, ...databases.map(database => database.name ?? '')];
  });
}

if (isRemoteE2E) {
  test.describe('Supabase remote sync', () => {
    // 安全提示不再在每个页面顶部占一整行：收成顶栏上的图标，点开才显示，按 Esc 收起；访客只读，不写远端
    test('shows the remote security notice from the header icon', async ({ page }) => {
      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      const toggle = page.getByRole('button', { name: /远端同步已连接/u });
      const notice = page.getByRole('dialog', { name: '远端同步已连接' });
      await expect(toggle).toBeVisible({ timeout: 60_000 });
      await expect(notice).toBeHidden();

      await toggle.click();
      await expect(notice).toContainText('未分区的日志同步');
      await expect(notice).toContainText('createdBy');

      await page.keyboard.press('Escape');
      await expect(notice).toBeHidden();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    // US-035 AC#10：两个浏览器上下文各自匿名登录，各自打开按自己会话身份算出的库
    test('opens a separate local database per anonymous session in each browser context', async ({ browser, page }) => {
      await openTodoPage(page);
      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await openTodoPage(secondPage);

        const first = await expectedDatabaseName(page);
        const second = await expectedDatabaseName(secondPage);
        expect(first).not.toBe(second);

        const firstStored = await storedNames(page);
        const secondStored = await storedNames(secondPage);
        expect(firstStored.some(name => name.includes(first))).toBe(true);
        expect(secondStored.some(name => name.includes(second))).toBe(true);
        expect(firstStored.some(name => name.includes(second))).toBe(false);
      } finally {
        await secondContext.close();
      }
    });

    test('pushes a Todo through Supabase and pulls it into another browser context', async ({ browser, page }) => {
      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationRequests.push(request.url());
        }
      });

      await openTodoPage(page);

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();

      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      await push(page);

      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await openTodoPage(secondPage, new URL('/todo', page.url()).href);
        await pull(secondPage);

        await expect(secondPage.getByTestId('todo-item').filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      await item.getByRole('button', { name: '删除' }).click();
      await expect(item).toHaveCount(0);
      await push(page);
      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(1);
    });

    test('pushes a completion toggle as an UPDATE and another context pulls it as completed', async ({
      browser,
      page
    }) => {
      const mutationBodies: MutationRequestBody[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationBodies.push(request.postDataJSON() as MutationRequestBody);
        }
      });

      await openTodoPage(page);

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();

      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      await push(page);
      await expect.poll(() => mutationBodies.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      const inserted = rowsOf(mutationBodies[0]?.p_upserts).find(row => row['title'] === title);
      expect(inserted).toBeDefined();
      const todoId = inserted?.['id'];

      await item.getByRole('checkbox').check();
      await expect(item.getByRole('checkbox')).toBeChecked();
      await push(page);
      await expect.poll(() => mutationBodies.length, { timeout: 30_000 }).toBeGreaterThan(1);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      // 勾选只改了 completed，必须走 p_updates；p_upserts 里不能再出现这个实体
      const toggle = mutationBodies[1];
      expect(rowsOf(toggle?.p_updates).map(row => row['id'])).toContain(todoId);
      expect(rowsOf(toggle?.p_upserts).map(row => row['id'])).not.toContain(todoId);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await openTodoPage(secondPage, new URL('/todo', page.url()).href);
        await pull(secondPage);

        // 已完成的行按 completed 升序排在所有进行中的行之后：共用栈里进行中的行一多，它就落在
        // 虚拟列表渲染的窗口之外。切到「已完成」再找，不依赖栈里攒了多少数据
        await secondPage.getByTestId('todo-tab-completed').click();
        const pulledItem = secondPage.getByTestId('todo-item').filter({ hasText: title });
        await expect(pulledItem).toBeVisible({ timeout: 30_000 });
        await expect(pulledItem.getByRole('checkbox')).toBeChecked();
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      await item.getByRole('button', { name: '删除' }).click();
      await expect(item).toHaveCount(0);
      await push(page);
      await expect.poll(() => mutationBodies.length, { timeout: 30_000 }).toBeGreaterThan(2);
    });

    // US-218 AC#16：用 `gone`（RX001）而非 `denied`——参考 `todos` 表未开 RLS、demo 无登录（spec US5 批准的偏离）
    test('lists a gone rejection in the panel when updating a Todo another context deleted', async ({
      browser,
      page
    }) => {
      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationRequests.push(request.url());
        }
      });

      await openTodoPage(page);

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();
      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      await push(page);
      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await openTodoPage(secondPage, new URL('/todo', page.url()).href);
        await pull(secondPage);
        const pulledItem = secondPage.getByTestId('todo-item').filter({ hasText: title });
        await expect(pulledItem).toBeVisible({ timeout: 30_000 });

        // A 删除并推送：远端行没了
        await item.getByRole('button', { name: '删除' }).click();
        await expect(item).toHaveCount(0);
        await push(page);
        await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(1);

        // B 不拉取，直接勾选完成并推送：UPDATE 打到已不存在的行
        await pulledItem.getByRole('checkbox').check();
        const result = await push(secondPage);

        // US-230 AC#8：被拒不让整轮失败——结果行写「被拒 1 条」，同步中心开关上出现标记，被拒的推送列在同步中心里
        await expect(result).toContainText('被拒 1 条');
        await expect(secondPage.getByTestId('sync-center-rejections')).toHaveText('1');
        const panel = (await openSidePanel(secondPage, 'sync')).getByTestId('sync-rejections-panel');
        const rejection = panel.getByRole('listitem');
        await expect(rejection).toHaveCount(1, { timeout: 30_000 });
        await expect(rejection).toContainText('UPDATE');
        await expect(rejection).toContainText('已被删除（RX001）');
        await expect(panel).not.toContainText('最近没有被远端拒绝的推送');
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }
    });

    // US-230 AC#10：会话在别的标签页换了身份，本页还开着上一个身份的库：拉取被身份守卫拦下，一个请求都不发，
    // 结果行写明身份不匹配并给「重新加载」。两个标签页共用浏览器里的会话，本地库经 SharedWorker 共用
    test('blocks a pull after another tab switched identity and offers a reload', async ({ context, page }) => {
      await openTodoPage(page);
      const other = await context.newPage();
      await other.goto(new URL('/todo', page.url()).href, { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(other.getByTestId('identity-title')).toHaveText('匿名用户', { timeout: 60_000 });
      // 等页面连上远端、渲染出来再切：连接还在建立时切换身份会先断开它，那次进入页面就失败了
      await expect(other.getByTestId('sync-pull')).toBeEnabled({ timeout: 60_000 });

      // 另一个标签页退出成访客：浏览器里的会话没了，本页还开着匿名用户的库
      await switchIdentity(other, 'visitor', '访客', 'todo-title');
      await expect(page.getByTestId('session-moved')).toBeVisible({ timeout: 30_000 });

      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/rest/v1/rpc/rxdb_mutations')) mutationRequests.push(request.url());
      });
      const result = await syncRound(page, 'pull');
      await expect(result).toHaveAttribute('role', 'alert');
      await expect(result).toContainText('拉取失败：身份不匹配');
      expect(mutationRequests).toEqual([]);

      await result.getByTestId('toast-action').click();
      await expect(page.getByTestId('identity-title')).toHaveText('访客', { timeout: 60_000 });
    });

    test('does not pull a locally created Todo that was never pushed', async ({ browser, page }) => {
      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationRequests.push(request.url());
        }
      });

      await openTodoPage(page);

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();
      await expect(page.getByTestId('todo-item').filter({ hasText: title })).toBeVisible();

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await openTodoPage(secondPage, new URL('/todo', page.url()).href);
        // 先等这次拉取真的结算再断言「没拉到」：点击之前目标行与错误提示本来就都不存在，
        // 不等结算的话，迟到的失败、迟到带回来的行都看不见，用例靠初态就绿了。
        // `pull` 等顶栏同步组的轮数加一、结果行写「拉取完成」，即这一轮已经走完
        const changeLog = secondPage.waitForResponse(
          response => /\/rest\/v1\/(rxdb_change\b|rpc\/rxdb_pull_changes)/.test(response.url()),
          { timeout: 30_000 }
        );
        await pull(secondPage);
        expect((await changeLog).ok(), '拉取远端变更日志的请求失败').toBe(true);

        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
        await expect(secondPage.getByTestId('todo-item').filter({ hasText: title })).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      expect(mutationRequests).toHaveLength(0);
    });
  });
}
