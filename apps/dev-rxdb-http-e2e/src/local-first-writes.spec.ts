/**
 * Local-first 写入：离线可写 + 联网后自动回推。
 *
 * @remarks
 * 这条链路是 US-020 D5「不为 QueryCache 做乐观离线写」的**反转**，所以验收必须落在
 * 用户看得见的三件事上，缺一条都算没做到：
 *
 * 1. 断网时 `create` 不报错，新行**当场出现在列表里**；
 * 2. 顶栏的同步状态如实说出「离线 / 待推 1 条」——不是静默排队；
 * 3. 网一通，**不需要任何用户动作**，待推归零且那一行真的躺在后端库里。
 *
 * 第 3 条的判据故意打到后端的 `by-ids` 上而不是看页面：页面上的行来自本地缓存，
 * 它在「回推压根没发生」时长得一模一样。只有后端自己承认收到了，才算同步完成。
 *
 * 与 `offline-fallback.spec.ts` 是一对：那条证明**读**能降级，这条证明**写**能排队。
 * 两条共用同一个对照实验形状——远端拒绝（409）绝不能被当成离线。
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { API_BASE_URL } from './env';
import { expectRowCount, openDemo, resetDemo, SEED_ROW_COUNT, setFault, setOffline } from './support';

/** 后端 `POST recipes/by-ids` 的返回形状（裸数组，见 `recipes-store.ts` 的 `findByIds`）。 */
interface RecipeRow {
  id: string;
  title: string;
  status: string;
  price: number;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 直接问后端要几行。
 *
 * @remarks
 * 走协议路由而不是 `__control/*`：要证明的是「那一行进了业务表」，而不是
 * 「控制端点愿意这么说」。这个路由不带 `Authorization` 也放行（缺失允许、畸形才 401）。
 */
const fetchRowsByIds = async (request: APIRequestContext, ids: readonly string[]): Promise<RecipeRow[]> => {
  const response = await request.post(`${API_BASE_URL}/recipes/by-ids`, { data: { ids } });
  expect(response.status(), 'POST recipes/by-ids').toBe(200);
  return (await response.json()) as RecipeRow[];
};

/** 列表里标题为 `title` 的那一行的 id。同名多行会失败——用例都用唯一标题。 */
const readRowIdByTitle = async (page: Page, title: string): Promise<string> => {
  const row = page.locator(`tr[data-row-id]`).filter({ hasText: title });
  await expect(row).toHaveCount(1);
  const id = await row.getAttribute('data-row-id');
  expect(id, `行 ${title} 没有 data-row-id`).not.toBeNull();
  return id as string;
};

/** 填一次新建表单并提交。 */
const createRecipe = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId('draft-title').fill(title);
  await page.getByTestId('draft-price').fill('42');
  await page.getByTestId('create').click();
};

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('离线新建：本地当场可见、状态如实报离线待推，联网后自动回推到后端', async ({ page, request }) => {
  await openDemo(page);
  // 先把种子灌进本地行缓存：没有这一步，离线时列表本来就是空的，「本地可见」证明不了什么。
  await expectRowCount(page, SEED_ROW_COUNT);
  await expect(page.getByTestId('sync-online')).toHaveText('在线');
  await expect(page.getByTestId('sync-pending')).toHaveText('0');

  await setOffline(request, true);

  const title = 'local-first-offline-create';
  await createRecipe(page, title);

  // 1) 写没有失败，行当场出现在本地列表里。
  await expect(page.getByTestId('write-error')).toHaveCount(0);
  await expectRowCount(page, SEED_ROW_COUNT + 1);
  const rowId = await readRowIdByTitle(page, title);

  // 2) 状态面板如实说出「离线 + 待推 1 条」，而不是假装写成功了。
  //    这一格同时也是「后端还没收到」的判据：离线闸门连 e2e 自己的 `by-ids` 探针都
  //    照掐 socket，隔着它问不出后端有没有那一行，而待推计数本来就只数还没送达的那些。
  await expect(page.getByTestId('sync-online')).toHaveText('离线', { timeout: 30_000 });
  await expect(page.getByTestId('sync-pending')).toHaveText('1', { timeout: 30_000 });

  await setOffline(request, false);

  // 3) 不点任何按钮：退避节拍自己会重试，回推成功后待推归零、状态翻回在线。
  await expect(page.getByTestId('sync-pending')).toHaveText('0', { timeout: 90_000 });
  await expect(page.getByTestId('sync-online')).toHaveText('在线', { timeout: 30_000 });

  // 判据落在后端自己的库上：同一个 id，同样的内容。
  const persisted = await fetchRowsByIds(request, [rowId]);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({ id: rowId, title, price: 42 });
});

test('对照：远端拒绝（409）的写照常上抛，不进出站队列', async ({ page, request }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  await setFault(request, 409);
  await createRecipe(page, 'local-first-rejected-create');

  await expect(page.getByTestId('write-error')).toBeVisible({ timeout: 30_000 });
  // 409 是一个**成功送达**的响应。把它当离线排队，用户会以为改动还在路上，
  // 而实际上远端永远不会接受它。
  await expect(page.getByTestId('sync-pending')).toHaveText('0');
  await expect(page.getByTestId('sync-online')).toHaveText('在线');

  await setFault(request, null);
});
