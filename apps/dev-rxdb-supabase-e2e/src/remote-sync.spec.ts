import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

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

/** 打开 Todo 页，等到能拉取：匿名会话已经建好，本地库已经按会话身份打开 */
async function openTodoPage(target: Page): Promise<void> {
  await target.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
  await expect(target.getByRole('button', { name: 'Pull' })).toBeEnabled({ timeout: 60_000 });
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

      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      const securityNotice = page.getByRole('alert');
      await expect(securityNotice).toContainText('匿名登录', { timeout: 60_000 });
      await expect(securityNotice).toContainText('createdBy');

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();

      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      const push = page.getByRole('button', { name: 'Push' });
      await expect(push).toBeEnabled();
      await push.click();

      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await secondPage.goto(new URL('/todo', page.url()).href, {
          timeout: 60_000,
          waitUntil: 'domcontentloaded'
        });
        const pull = secondPage.getByRole('button', { name: 'Pull' });
        await expect(pull).toBeEnabled({ timeout: 60_000 });
        await pull.click();

        await expect(secondPage.getByTestId('todo-item').filter({ hasText: title })).toBeVisible({ timeout: 30_000 });
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      await item.getByRole('button', { name: '删除' }).click();
      await expect(item).toHaveCount(0);
      await expect(push).toBeEnabled();
      await push.click();
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

      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('alert')).toContainText('匿名登录', { timeout: 60_000 });

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();

      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      const push = page.getByRole('button', { name: 'Push' });
      await expect(push).toBeEnabled();
      await push.click();
      await expect.poll(() => mutationBodies.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      const inserted = rowsOf(mutationBodies[0]?.p_upserts).find(row => row['title'] === title);
      expect(inserted).toBeDefined();
      const todoId = inserted?.['id'];

      await item.getByRole('checkbox').check();
      await expect(item.getByRole('checkbox')).toBeChecked();
      await expect(push).toBeEnabled();
      await push.click();
      await expect.poll(() => mutationBodies.length, { timeout: 30_000 }).toBeGreaterThan(1);
      await expect(page.locator('.alert-error')).toHaveCount(0);

      // 勾选只改了 completed，必须走 p_updates；p_upserts 里不能再出现这个实体
      const toggle = mutationBodies[1];
      expect(rowsOf(toggle?.p_updates).map(row => row['id'])).toContain(todoId);
      expect(rowsOf(toggle?.p_upserts).map(row => row['id'])).not.toContain(todoId);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await secondPage.goto(new URL('/todo', page.url()).href, {
          timeout: 60_000,
          waitUntil: 'domcontentloaded'
        });
        const pull = secondPage.getByRole('button', { name: 'Pull' });
        await expect(pull).toBeEnabled({ timeout: 60_000 });
        await pull.click();

        const pulledItem = secondPage.getByTestId('todo-item').filter({ hasText: title });
        await expect(pulledItem).toBeVisible({ timeout: 30_000 });
        await expect(pulledItem.getByRole('checkbox')).toBeChecked();
        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      await item.getByRole('button', { name: '删除' }).click();
      await expect(item).toHaveCount(0);
      await expect(push).toBeEnabled();
      await push.click();
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

      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('alert')).toContainText('匿名登录', { timeout: 60_000 });

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();
      const item = page.getByTestId('todo-item').filter({ hasText: title });
      await expect(item).toBeVisible();
      const push = page.getByRole('button', { name: 'Push' });
      await expect(push).toBeEnabled();
      await push.click();
      await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await secondPage.goto(new URL('/todo', page.url()).href, {
          timeout: 60_000,
          waitUntil: 'domcontentloaded'
        });
        const pull = secondPage.getByRole('button', { name: 'Pull' });
        await expect(pull).toBeEnabled({ timeout: 60_000 });
        await pull.click();
        const pulledItem = secondPage.getByTestId('todo-item').filter({ hasText: title });
        await expect(pulledItem).toBeVisible({ timeout: 30_000 });

        // A 删除并推送：远端行没了
        await item.getByRole('button', { name: '删除' }).click();
        await expect(item).toHaveCount(0);
        await expect(push).toBeEnabled();
        await push.click();
        await expect.poll(() => mutationRequests.length, { timeout: 30_000 }).toBeGreaterThan(1);

        // B 不拉取，直接勾选完成并推送：UPDATE 打到已不存在的行
        await pulledItem.getByRole('checkbox').check();
        const secondPush = secondPage.getByRole('button', { name: 'Push' });
        await expect(secondPush).toBeEnabled();
        await secondPush.click();

        // 被拒不让整轮失败：没有错误提示，面板列出一条 gone
        const panel = secondPage.getByTestId('sync-rejections-panel');
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

    test('does not pull a locally created Todo that was never pushed', async ({ browser, page }) => {
      const mutationRequests: string[] = [];
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().includes('/rest/v1/rpc/rxdb_mutations')) {
          mutationRequests.push(request.url());
        }
      });

      await page.goto('/todo', { timeout: 60_000, waitUntil: 'domcontentloaded' });
      const securityNotice = page.getByRole('alert');
      await expect(securityNotice).toContainText('匿名登录', { timeout: 60_000 });

      const title = uniqueTitle();
      await page.getByRole('textbox', { name: '添加新任务' }).fill(title);
      await page.getByRole('button', { name: '添加', exact: true }).click();
      await expect(page.getByTestId('todo-item').filter({ hasText: title })).toBeVisible();

      const secondContext = await browser.newContext();
      try {
        const secondPage = await secondContext.newPage();
        await secondPage.goto(new URL('/todo', page.url()).href, {
          timeout: 60_000,
          waitUntil: 'domcontentloaded'
        });
        const pull = secondPage.getByRole('button', { name: 'Pull' });
        await expect(pull).toBeEnabled({ timeout: 60_000 });
        // 先等这次 Pull 真的结算再断言「没拉到」：点击之前目标行与错误提示本来就都不存在，
        // 不等结算的话，迟到的失败、迟到带回来的行都看不见，用例靠初态就绿了。
        // Pull 期间按钮禁用（$syncPending），读到变更日志的应答之后再等它恢复，即这次 Pull 已经走完。
        const changeLog = secondPage.waitForResponse(
          response => /\/rest\/v1\/(rxdb_change\b|rpc\/rxdb_pull_changes)/.test(response.url()),
          { timeout: 30_000 }
        );
        await pull.click();
        expect((await changeLog).ok(), '拉取远端变更日志的请求失败').toBe(true);
        await expect(pull).toBeEnabled({ timeout: 30_000 });

        await expect(secondPage.locator('.alert-error')).toHaveCount(0);
        await expect(secondPage.getByTestId('todo-item').filter({ hasText: title })).toHaveCount(0);
      } finally {
        await secondContext.close();
      }

      expect(mutationRequests).toHaveLength(0);
    });
  });
}
